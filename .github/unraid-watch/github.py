"""The GitHub REST calls the watcher needs. Anything unexpected raises; nothing is read as "no change"."""
import http.client
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

API = 'https://api.github.com'
SHA = re.compile(r'[0-9a-f]{40}\Z')
RETRY = (0, 502, 503, 504)


class GitHubError(RuntimeError):
    pass


def _fetch(method, url, headers, data):
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


class GitHub:
    def __init__(self, token='', fetch=_fetch, pause=time.sleep):
        self.token, self.fetch, self.pause, self.seen = token, fetch, pause, {}

    def _once(self, key, read):
        # A run asks the same thing many times; one answer each keeps it quick and gives it one view of upstream
        if key not in self.seen:
            self.seen[key] = read()
        return self.seen[key]

    def _call(self, method, path, params=None, body=None, raw=False, missing=()):
        url = API + path + ('?' + urllib.parse.urlencode(sorted(params.items())) if params else '')
        headers = {
            'Accept': 'application/vnd.github.raw+json' if raw else 'application/vnd.github+json',
            'User-Agent': 'folder.view3-unraid-watch',
            'X-GitHub-Api-Version': '2022-11-28',
        }
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        data = None if body is None else json.dumps(body).encode()
        # Only reads are retried: a repeated POST could comment twice
        attempts = 3 if method in ('GET', 'HEAD') else 1
        for attempt in range(1, attempts + 1):
            try:
                status, payload = self.fetch(method, url, headers, data)
            except (urllib.error.URLError, http.client.HTTPException, TimeoutError) as e:
                status, payload = 0, str(e).encode()
            if status not in RETRY or attempt == attempts:
                break
            self.pause(2 * attempt)
        if status in missing:
            return None
        if not 200 <= status < 300:
            raise GitHubError(f'{method} {path}: HTTP {status} {payload[:200].decode("utf-8", "replace")}')
        if method == 'HEAD':
            return True
        return payload.decode('utf-8') if raw else json.loads(payload)

    def sha(self, repo, ref, missing_ok=False):
        """Commit a branch, tag or sha points at; None for an unknown ref when that is allowed."""
        def read():
            # GitHub answers 422, not 404, for a ref it cannot find here
            found = self._call('GET', f'/repos/{repo}/commits/{urllib.parse.quote(ref, safe="")}', missing=(404, 422))
            if found and not SHA.match(found['sha']):
                raise GitHubError(f'{repo}: {ref} resolved to something that is not a commit sha')
            return found and found['sha']
        sha = self._once(('sha', repo, ref), read)
        if sha is None and not missing_ok:
            raise GitHubError(f'{repo}: there is no ref called {ref}')
        return sha

    def between(self, repo, base, head, strict=True):
        """Shas after base up to head. When base is not an ancestor of head: raise, or None if not strict."""
        shas, total = [], 0
        for page in range(1, 101):
            data = self._call('GET', f'/repos/{repo}/compare/{base}...{head}', {'page': page, 'per_page': 100})
            if data['status'] not in ('ahead', 'identical'):
                if not strict:
                    return None
                raise GitHubError(f'{repo}: {base[:7]} is not an ancestor of {head[:7]} ({data["status"]}); '
                                  f'run again with base "{repo}=<ref>"')
            if page == 1:
                total = data['total_commits']
            shas += [c['sha'] for c in data['commits']]
            if len(data['commits']) < 100:
                break
        if len(shas) != total or not all(SHA.match(s) for s in shas):
            raise GitHubError(f'{repo}: compare listed {len(shas)} of {total} commits')
        return set(shas)

    def path_commits(self, repo, path, head, within):
        """[(sha, subject, date)], newest first, for the commits in `within` that touch path."""
        out = []
        for page in range(1, 21):
            batch = self._call('GET', f'/repos/{repo}/commits',
                               {'page': page, 'path': path.rstrip('/'), 'per_page': 100, 'sha': head})
            hits = [(c['sha'], c['commit']['message'].split('\n', 1)[0], c['commit']['committer']['date'][:10])
                    for c in batch if c['sha'] in within]
            out += hits
            if len(batch) < 100 or not hits:
                return out
        raise GitHubError(f'{repo}: more than 2000 commits touch {path} in this range')

    def file(self, repo, ref, path):
        def read():
            return self._call('GET', f'/repos/{repo}/contents/{urllib.parse.quote(path)}', {'ref': ref}, raw=True)
        return self._once(('file', repo, ref, path), read)

    def exists(self, repo, ref, path):
        return bool(self._call('HEAD', f'/repos/{repo}/contents/{urllib.parse.quote(path.rstrip("/"))}',
                               {'ref': ref}, missing=(404,)))

    def tree(self, repo, sha):
        """{path: blob or tree sha} for every file and directory at a commit."""
        def read():
            data = self._call('GET', f'/repos/{repo}/git/trees/{sha}', {'recursive': 1})
            if data.get('truncated'):
                raise GitHubError(f'{repo}: the file listing at {sha[:7]} came back cut short')
            return {entry['path']: entry['sha'] for entry in data['tree']}
        return self._once(('tree', repo, sha), read)

    def listing(self, repo, ref, folder):
        """{file name: blob sha} for a directory."""
        items = self._call('GET', f'/repos/{repo}/contents/{urllib.parse.quote(folder.rstrip("/"))}', {'ref': ref})
        if not isinstance(items, list):
            raise GitHubError(f'{repo}: {folder} is not a directory at {ref[:7]}')
        return {i['name']: i['sha'] for i in items if i['type'] == 'file'}

    def latest_release(self, repo):
        return self._once(('release', repo), lambda: self._call('GET', f'/repos/{repo}/releases/latest')['tag_name'])

    def comments(self, repo, issue):
        out = []
        for page in range(1, 101):
            batch = self._call('GET', f'/repos/{repo}/issues/{issue}/comments', {'page': page, 'per_page': 100})
            out += batch
            if len(batch) < 100:
                return out
        raise GitHubError(f'{repo}#{issue}: more than 10000 comments')

    def comment(self, repo, issue, body):
        return self._call('POST', f'/repos/{repo}/issues/{issue}/comments', body={'body': body})['html_url']

    def edit_comment(self, repo, comment_id, body):
        self._call('PATCH', f'/repos/{repo}/issues/comments/{comment_id}', body={'body': body})
