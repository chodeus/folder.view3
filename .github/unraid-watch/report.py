"""The comments the watcher writes: news with the hidden marker that carries the saved position, the status view, and the Discord inputs."""
import json
import os
import re

import releases
from github import SHA, GitHubError

BOT = 'github-actions[bot]'
STATE = re.compile(r'\n<!-- unraid-watch (\{[^<>\n]*\}) -->\s*\Z')
STATUS = '<!-- unraid-watch-status -->'
COMMENT_URL = re.compile(r'https://github\.com/[\w.-]+/[\w.-]+/issues/\d+#issuecomment-\d+\Z')


def code(text, limit=140):
    """Upstream text as an inert one-line code span: no mentions, links or markup survive."""
    text = ' '.join(''.join(c if c.isprintable() else ' ' for c in str(text)).replace('`', "'").split())
    return '`%s`' % (text[:limit - 1] + '…' if len(text) > limit else text or '-')


def capped(items, limit, indent=''):
    return items[:limit] + ([f'{indent}- … and {len(items) - limit} more'] if len(items) > limit else [])


def fit(body):
    """A comment body GitHub will accept: it refuses anything over 65536 characters."""
    return body if len(body) <= 60000 else body[:60000] + '\n\n(cut short: too long for one comment)'


def used_at(where):
    return f' (used at {", ".join(where)})' if where else ''


def marker(state):
    return '\n<!-- unraid-watch %s -->' % json.dumps(state, separators=(',', ':'))


def restamp(body, state):
    """The same comment with its marker moved to a new position."""
    return STATE.sub(lambda _: marker(state), body)


def read_state(comments):
    """({repo: sha}, comment) from the newest bot comment that carries a well-formed marker."""
    for comment in reversed(comments):
        found = STATE.search(comment.get('body') or '') if comment['user']['login'] == BOT else None
        try:
            state = json.loads(found.group(1)) if found else None
        except ValueError:
            continue
        if state and all(isinstance(v, str) and SHA.match(v) for v in state.values()):
            return state, comment
    return None, None


def render(report, state):
    out = ['### Unraid watch', '']
    if report['releases']:
        out += ['**Unraid OS release notes**', '']
        out += [f'- {code(title)} in [{name}]({url})' for title, name, url in report['releases']] + ['']
    used = [f'- {kind} {code(text, 400)}{used_at(where)}' for kind, text, uses, where in report['api'] if uses]
    other = [f'- {kind} {code(text, 400)}' for kind, text, uses, _ in report['api'] if not uses]
    if used:
        out += ['**API changes to what FolderView3 calls**', ''] + used + ['']
    if other:
        out += ['**Other Docker and VM API changes**', ''] + capped(other, 40) + ['']
    for repo, start, head, rows in report['files']:
        link = f'https://github.com/{repo}/compare/{start}...{head}'
        out += [f'**Watched files in {repo}** ([{start[:7]}...{head[:7]}]({link}))', '']
        for path, why, commits in rows:
            out.append(f'- {code(path, 200)}: {why}')
            out += capped([f'  - [{code(sha[:7])}](https://github.com/{repo}/commit/{sha}) {code(f"{date} {subject}")}'
                           for sha, subject, date in commits], 8, '  ')
        out.append('')
    if len(out) == 2:
        out += ['Nothing relevant has changed upstream since the starting point.', '']
    return fit('\n'.join(out + [report['contract']])) + '\n' + marker(state)


def status_comment(comments):
    """The newest bot comment that is the status view, if there is one."""
    return next((c for c in reversed(comments)
                 if c['user']['login'] == BOT and (c.get('body') or '').rstrip().endswith(STATUS)), None)


def _changed(commits):
    # None: the two refs are on diverged branches, so there is no commit list to show
    if not commits:
        return 'differs'
    _, subject, date = commits[0]
    return f'{len(commits)} commit{"" if len(commits) == 1 else "s"}, newest {code(f"{date} {subject}")}'


def render_status(view):
    newest, stable, latest = view['releases']
    facts = [f'Newest OS release {code(newest[0])} (API {code(newest[1] or "not stated")})'] if newest else []
    if stable and stable != newest:
        facts.append(f'newest stable {code(stable[0])} (API {code(stable[1] or "not stated")})')
    facts.append(f'{"l" if facts else "L"}atest API release {code(latest)}')
    out = ['### Unraid integration status', '', ', '.join(facts) + '.', '']
    for title, entries in view['stages']:
        out += [f'**{title}**', '']
        for repo, a, b, api, rows in entries:
            if rows is None:
                out.append(f'- {repo} {code(a)}...{code(b)}: not available')
                continue
            out.append(f'- {repo} {code(a)}...{code(b)}' + (':' if api or rows else ': nothing'))
            out += [f'  - {kind} {code(text, 400)}{used_at(where)}' for kind, text, _, where in api]
            out += [f'  - {code(path, 200)}: {_changed(commits)}' for path, _, commits in rows]
        out.append('')
    out += ['**Operations by OS release**', '']
    outcomes = {}
    for ref, who, valid, total, gone in view['matrix']:
        outcomes.setdefault((valid, total, tuple(gone)), []).append(f'{code(ref)} ({", ".join(who)})')
    for (valid, total, gone), members in outcomes.items():
        out.append(f'- {valid} of {total}' + (', missing ' + ', '.join(code(g, 120) for g in gone) if gone else '')
                   + ': ' + '; '.join(members))
    if view['unstated']:
        out.append('- API version not stated in the notes: ' + ', '.join(code(v) for v in view['unstated']))
    out += ['', f'<details><summary>API not used yet ({len(view["idle"])} operations)</summary>', '']
    out += [f'- {code(signature, 300)}' for signature in view['idle']]
    if view['types']:
        out += ['', 'Fields read of those available: '
                + ', '.join(f'{code(name)} {read}/{total}' for name, read, total in view['types']) + '.']
    out += ['', '</details>', '', f'<details><summary>Still on legacy ({len(view["legacy"])} webgui files)</summary>', '']
    out += [f'- {code(path, 200)}: {why}' for path, why in view['legacy']] + ['', '</details>']
    return fit('\n'.join(out)) + '\n\n' + STATUS


def announce(report, url):
    """Discord job inputs; built from counts and a strictly matched version, never from upstream free text."""
    path = os.environ.get('GITHUB_OUTPUT')
    if not COMMENT_URL.match(url):
        raise GitHubError('the comment URL GitHub returned is not an issue comment link')
    versions = [v for title, name, _ in report['releases'] for v in [releases.os_version(title, name)] if v]
    commits = sum(len(c) for _, _, _, rows in report['files'] for _, _, c in rows)
    title = f'Unraid {versions[0]} release notes published' if versions else 'Unraid watch: upstream changes for FolderView3'
    counts = f'{len(report["releases"])} release note update(s), {len(report["api"])} API change(s), {commits} commit(s) on watched files'
    if path:
        with open(path, 'a', encoding='utf-8') as f:
            f.write(f'posted=true\nurl={url}\ntitle={title}\nsummary={counts}\n')
