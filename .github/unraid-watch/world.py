"""Test support: a fake GitHub, and a small upstream world the watcher can be run against."""
import hashlib
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock
from urllib.parse import urlencode

import report
import watch
from github import API as HOST
from github import GitHub

ME = 'me/plugin'
BOT = {'login': 'github-actions[bot]'}
API, WEB, DOCS = 'unraid/api', 'unraid/webgui', 'unraid/docs'
USERPREFS = 'emhttp/plugins/dynamix.docker.manager/include/UserPrefs.php'
SDL = '''
type Query { docker: Docker! }
type Mutation { docker: DockerMutations! }
type Docker { statuses: [Item!]! }
type DockerMutations { start(id: ID!): Boolean! stop(id: ID!): Boolean! }
type Item { name: String! }
'''
WITHOUT_STOP = SDL.replace(' stop(id: ID!): Boolean!', ' halt(id: ID!): Boolean!')
SCRIPT = """
var dockerMap = { start: 'start', stop: 'stop' };
fv3GraphQL('{ docker { statuses { name } } }');
fv3GraphQL('mutation($id: ID!) { docker { ' + act + '(id: $id) } }', { id: id });
$.post('/plugins/dynamix.docker.manager/include/UserPrefs.php');
"""
CFG = {
    'issue': 52,
    'plugin': 'plugin',
    'expand': [{'match': 'docker { ${act}', 'map': 'dockerMap'}],
    'sources': [
        {'repo': API, 'branch': 'main', 'schema': 'api/schema.graphql', 'surface': '(?i)docker',
         'namespaces': ['Docker', 'DockerMutations'], 'paths': {'api/switch.ts': 'page switch'}},
        {'repo': WEB, 'branch': 'master', 'paths': {'emhttp/page/': 'markup'},
         'endpoints': {'/plugins/dynamix.docker.manager/': 'emhttp/plugins/dynamix.docker.manager/'}},
        {'repo': DOCS, 'branch': 'main', 'releases': 'notes/', 'since': '9.0.0', 'tags': WEB},
    ],
}
NEWER = SDL + 'extend type DockerMutations { restart(id: ID!): Boolean! }\nextend type Item { icon: String }\n'


def url(route, /, **params):
    return route + ('?' + urlencode(sorted(params.items())) if params else '')


def sha(n):
    return f'{n:040x}'


def commit(n, subject='subject', date='2026-10-01T00:00:00Z'):
    return {'sha': sha(n), 'commit': {'message': subject, 'committer': {'date': date}}}


def bot(body):
    return {'id': 1, 'user': BOT, 'body': body}


OLD = {API: sha(0xa0), WEB: sha(0xb0), DOCS: sha(0xc0)}
NEW = {API: sha(0xa1), WEB: sha(0xb1), DOCS: sha(0xc1)}
RELEASE, BETA_API, LATEST_API = sha(0xa2), sha(0xa4), sha(0xa5)
STABLE_WEB, BETA_WEB = sha(0xb3), sha(0xb4)


class Fake:
    """Stands in for GitHub: routes map (method, path?query) to json, text, or (status, body); unknown is 404."""

    def __init__(self):
        self.routes, self.calls = {}, []

    def __call__(self, method, address, headers, data):
        path = address[len(HOST):]
        self.calls.append((method, path, json.loads(data) if data else None, headers))
        reply = self.routes.get((method, path), (404, {'message': 'Not Found'}))
        if isinstance(reply, Exception):
            raise reply
        if isinstance(reply, list) and reply and isinstance(reply[0], tuple):
            reply = reply.pop(0) if len(reply) > 1 else reply[0]
        status, body = reply if isinstance(reply, tuple) else (200, reply)
        return status, body.encode() if isinstance(body, str) else json.dumps(body).encode()

    def sent(self, method):
        return [c for c in self.calls if c[0] == method]


class World:
    """A plugin, its issue, and three upstream repos that moved from OLD to NEW without touching anything watched."""

    def __init__(self, case, script=SCRIPT):
        tmp = tempfile.TemporaryDirectory()
        case.addCleanup(tmp.cleanup)
        self.root = tmp.name
        scripts = Path(tmp.name, 'plugin/scripts')
        scripts.mkdir(parents=True)
        (scripts / 'a.js').write_text(script, encoding='utf-8')
        self.fake, self.comments = Fake(), []
        routes = self.fake.routes
        routes['GET', url(f'/repos/{ME}/issues/52/comments', page=1, per_page=100)] = self.comments
        routes['POST', f'/repos/{ME}/issues/52/comments'] = (201, {'html_url': f'https://github.com/{ME}/issues/52#issuecomment-9'})
        for repo, branch in ((API, 'main'), (WEB, 'master'), (DOCS, 'main')):
            routes['GET', f'/repos/{repo}/commits/{branch}'] = {'sha': NEW[repo]}
            self.between(repo, [1])
        for repo, path in ((API, 'api/switch.ts'), (WEB, 'emhttp/page/'), (WEB, USERPREFS)):
            self.touched(repo, path, [])
            routes['HEAD', url(f'/repos/{repo}/contents/{path.rstrip("/")}', ref=NEW[repo])] = (200, '')
        routes['HEAD', url(f'/repos/{API}/contents/api/schema.graphql', ref=NEW[API])] = (200, '')
        routes['HEAD', url(f'/repos/{DOCS}/contents/notes', ref=NEW[DOCS])] = (200, '')
        routes['GET', f'/repos/{API}/releases/latest'] = {'tag_name': 'v4.0.0'}
        routes['GET', f'/repos/{API}/commits/v4.0.0'] = {'sha': RELEASE}
        for ref in (OLD[API], NEW[API], RELEASE):
            self.schema(ref, SDL)
            self.tree(API, ref, {'api/schema.graphql': 's1', 'api/switch.ts': 'w1'})
        self.notes(OLD[DOCS], {})
        self.notes(NEW[DOCS], {})

    def between(self, repo, numbers, status='ahead', span=None):
        start, head = span or (OLD[repo], NEW[repo])
        self.fake.routes['GET', url(f'/repos/{repo}/compare/{start}...{head}', page=1, per_page=100)] = {
            'status': status, 'total_commits': len(numbers), 'commits': [commit(n) for n in numbers]}

    def tree(self, repo, ref, entries):
        self.fake.routes['GET', url(f'/repos/{repo}/git/trees/{ref}', recursive=1)] = {
            'truncated': False, 'tree': [{'path': path, 'sha': blob} for path, blob in entries.items()]}

    def tag(self, repo, name, ref):
        self.fake.routes['GET', f'/repos/{repo}/commits/{name}'] = {'sha': ref}

    def release_line(self):
        """A beta on top of a stable: 9.0.3 ships API 4.0.0, 9.1.0-beta.2 ships 4.1.0, 4.2.0 is out, main has moved on."""
        self.notes(NEW[DOCS], {
            '9.1.0.md': '# Version 9.1.0-beta.2 2030-01-02\n\n* [dynamix.unraid.net](<x>): version 4.0.0 -> 4.1.0-3\n',
            '9.0.3.md': '# Version 9.0.3 2030-01-01\n\n* The Unraid API version remains 4.0.0.\n',
            '9.0.2.md': '# Version 9.0.2\n\nNothing about the API here.\n',
            '9.0.1.md': '# Version 9.0.1\n\n- dynamix.unraid.net 7.7.7 - see changes\n',
            '8.9.0.md': '# Version 8.9.0\n\n- dynamix.unraid.net 3.9.9 - see changes\n',
            'index.md': '# Release notes\n',
        })
        self.fake.routes['GET', f'/repos/{API}/commits/v7.7.7'] = (422, {'message': 'No commit found for SHA: v7.7.7'})
        self.fake.routes['GET', f'/repos/{API}/releases/latest'] = {'tag_name': 'v4.2.0'}
        self.tag(API, 'v4.1.0', BETA_API)
        self.tag(API, 'v4.2.0', LATEST_API)
        self.tag(WEB, '9.0.3', STABLE_WEB)
        self.tag(WEB, '9.1.0-beta.2', BETA_WEB)
        self.schema(RELEASE, WITHOUT_STOP)
        self.schema(BETA_API, SDL)
        self.schema(LATEST_API, SDL)
        self.schema(NEW[API], NEWER)
        self.tree(API, RELEASE, {'api/schema.graphql': 's0', 'api/switch.ts': 'w0'})
        self.tree(API, BETA_API, {'api/schema.graphql': 's1', 'api/switch.ts': 'w0'})
        self.tree(API, LATEST_API, {'api/schema.graphql': 's1', 'api/switch.ts': 'w0'})
        self.tree(API, NEW[API], {'api/schema.graphql': 's2', 'api/switch.ts': 'w1'})
        self.tree(WEB, STABLE_WEB, {'emhttp/page': 't0', USERPREFS: 'u0'})
        self.tree(WEB, BETA_WEB, {'emhttp/page': 't1', USERPREFS: 'u0'})
        self.tree(WEB, NEW[WEB], {'emhttp/page': 't1', USERPREFS: 'u0'})
        self.between(API, [50], span=(LATEST_API, NEW[API]))
        self.between(WEB, [60, 61], status='diverged', span=(STABLE_WEB, BETA_WEB))
        self.fake.routes['GET', url(f'/repos/{API}/commits', page=1, path='api/switch.ts', per_page=100,
                                    sha=NEW[API])] = [commit(50, 'feat: enable the new page', '2030-01-03T00:00:00Z')]

    def touched(self, repo, path, commits):
        self.fake.routes['GET', url(f'/repos/{repo}/commits', page=1, path=path.rstrip('/'), per_page=100,
                                    sha=NEW[repo])] = commits

    def schema(self, ref, sdl):
        self.fake.routes['GET', url(f'/repos/{API}/contents/api/schema.graphql', ref=ref)] = sdl

    def notes(self, ref, files):
        self.fake.routes['GET', url(f'/repos/{DOCS}/contents/notes', ref=ref)] = [
            {'name': name, 'sha': hashlib.sha1(text.encode()).hexdigest(), 'type': 'file'} for name, text in files.items()]
        for name, text in files.items():
            self.fake.routes['GET', url(f'/repos/{DOCS}/contents/notes/{name}', ref=ref)] = text

    def state(self, state=OLD, login=BOT['login']):
        number = 100 + len(self.comments)
        self.comments.append({'id': number, 'user': {'login': login},
                              'body': '### Unraid watch\n\nearlier report\n' + report.marker(state)})
        self.fake.routes['PATCH', f'/repos/{ME}/issues/comments/{number}'] = {'id': number}

    def hit(self):
        self.between(WEB, [1, 2])
        self.touched(WEB, USERPREFS, [commit(2, 'fix(docker): renumber prefs (#2750)', '2026-10-02T01:00:00Z'),
                                      commit(900, 'older change')])

    def client(self):
        return GitHub('token', self.fake, lambda seconds: None)

    def run(self, base='', dry_run=False):
        out = io.StringIO()
        with redirect_stdout(out):
            code = watch.cmd_watch(CFG, self.client(), self.root, ME, base, dry_run)
        return code, out.getvalue()

    def _written(self, method, status):
        return [(call[1], call[2]['body']) for call in self.fake.sent(method)
                if call[2]['body'].rstrip().endswith(report.STATUS) == status]

    @property
    def posted(self):
        return [body for _, body in self._written('POST', False)]

    @property
    def patched(self):
        return self._written('PATCH', False)

    @property
    def status(self):
        """Every write of the status comment, as (method, body)."""
        return [(method, body) for method in ('POST', 'PATCH') for _, body in self._written(method, True)]


class Case(unittest.TestCase):
    def setUp(self):
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        for name in ('GITHUB_OUTPUT', 'GITHUB_STEP_SUMMARY', 'GITHUB_REPOSITORY', 'GITHUB_TOKEN'):
            os.environ.pop(name, None)
        self.w = World(self)

    def saved(self, body):
        return report.read_state([bot(body)])[0]

    def captured(self, call, *args):
        out = io.StringIO()
        with redirect_stdout(out):
            code = call(*args)
        return code, out.getvalue()
