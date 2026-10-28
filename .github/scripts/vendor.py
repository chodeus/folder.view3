#!/usr/bin/env python3
"""Compare the bundled libraries with the sources vendor.json names, or copy them in: vendor.py check | sync."""
import argparse
import base64
import hashlib
import http.client
import io
import json
import os
import re
import sys
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHA = re.compile(r'[0-9a-f]{40}\Z')
RETRY = (429, 500, 502, 503, 504)


def get(url, api=False):
    headers = {'User-Agent': 'folder.view3-vendor'}
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    if api and token:
        headers['Authorization'] = f'Bearer {token}'
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as e:
            if e.code not in RETRY or attempt == 3:
                raise
        except (urllib.error.URLError, http.client.HTTPException, ConnectionError, TimeoutError):
            if attempt == 3:
                raise
        time.sleep(2 * attempt)


def from_npm(lib):
    name, version = lib['npm'], lib['version']
    try:
        info = json.loads(get(f'https://registry.npmjs.org/{urllib.parse.quote(name, safe="@")}/{urllib.parse.quote(version)}'))
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        raise SystemExit(f'{name}@{version} is not on npm') from None
    tarball = get(info['dist']['tarball'])
    algo, digest = info['dist']['integrity'].split('-', 1)
    if base64.b64encode(hashlib.new(algo, tarball).digest()).decode() != digest:
        raise SystemExit(f'{name}@{version}: the tarball does not match the registry integrity')
    with tarfile.open(fileobj=io.BytesIO(tarball)) as tar:
        # npm packs everything under one top folder, normally package/
        members = {m.name.split('/', 1)[1]: m for m in tar.getmembers() if m.isfile() and '/' in m.name}
        missing = [src for src in lib['files'] if src not in members]
        if missing:
            raise SystemExit(f'{name}@{version} has no {", ".join(missing)}')
        return {src: tar.extractfile(members[src]).read() for src in lib['files']}


def github_file(repo, commit, path):
    try:
        return get(f'https://raw.githubusercontent.com/{repo}/{commit}/{path}')
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    # raw.githubusercontent.com does not look inside submodules, so follow the pin recorded at this commit
    parts = path.split('/')
    for i in range(1, len(parts)):
        prefix = urllib.parse.quote('/'.join(parts[:i]))
        try:
            entry = json.loads(get(f'https://api.github.com/repos/{repo}/contents/{prefix}?ref={commit}', api=True))
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            break
        if isinstance(entry, dict) and entry.get('type') == 'submodule':
            sub = re.fullmatch(r'(?:https://github\.com/|git@github\.com:)([^/]+/[^/]+?)(?:\.git)?/?', entry['submodule_git_url'])
            if not sub or not SHA.match(entry['sha']):
                raise SystemExit(f'{repo}: {"/".join(parts[:i])} is a submodule outside GitHub')
            return github_file(sub.group(1), entry['sha'], '/'.join(parts[i:]))
    raise SystemExit(f'{repo}@{commit[:7]} has no {path}')


def from_github(lib):
    if not SHA.match(lib['commit']):
        raise SystemExit(f'{lib["github"]}: commit must be a full sha, not {lib["commit"]!r}')
    return {src: github_file(lib['github'], lib['commit'], src) for src in lib['files']}


def lf(data):
    # The checkout is LF (.gitattributes: text=auto eol=lf), so compare text the way git stores it
    return data if b'\0' in data[:8000] else data.replace(b'\r\n', b'\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('check', 'sync'))
    mode = parser.parse_args().mode
    manifest = json.loads((ROOT / 'vendor.json').read_text())
    root = (ROOT / manifest['root']).resolve()
    stale = []
    for lib in manifest['libraries']:
        if 'npm' in lib:
            label, files = f'{lib["npm"]}@{lib["version"]}', from_npm(lib)
        elif 'github' in lib:
            label, files = f'{lib["github"]}@{lib["commit"][:7]}', from_github(lib)
        else:
            raise SystemExit(f'vendor.json: a library needs an npm or github source: {lib}')
        for src, data in files.items():
            dest = (root / lib['files'][src]).resolve()
            if not dest.is_relative_to(root):
                raise SystemExit(f'vendor.json: {lib["files"][src]} is outside {manifest["root"]}')
            data = lf(data)
            if dest.is_file() and dest.read_bytes() == data:
                continue
            rel = dest.relative_to(ROOT)
            stale.append(rel)
            if mode == 'sync':
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
                print(f'{rel} <- {label} {src}')
            else:
                print(f'::error file={rel}::{rel} is not {label} {src}; run .github/scripts/vendor.py sync')
    if mode == 'check':
        print(f'{len(stale)} bundled file(s) differ from vendor.json' if stale else 'Bundled libraries match vendor.json')
        sys.exit(1 if stale else 0)


if __name__ == '__main__':
    main()
