#!/usr/bin/env python3
"""Tell FolderView3 when Unraid changes something it calls: watch.py check | contract | watch | status."""
import argparse
import json
import os
import sys
from pathlib import Path

import scan
import schema
import status
from github import GitHub, GitHubError
from report import announce, code, read_state, render, render_status, restamp, status_comment
from upstream import api_changes, release_notes, source, validity

HERE = Path(__file__).resolve().parent


class Problem(RuntimeError):
    pass


def derive(cfg, root):
    """(operations, {repo: {path: reason}}, problems) from the plugin source and watch.json."""
    plugin = Path(root, cfg['plugin'])
    ops, problems = scan.operations(plugin, cfg['expand'])
    for query, where in ops:
        error = schema.syntax_error(query)
        if error:
            problems.append(f'{where[0]}: not GraphQL ({error}): {query}')
    watched = {}
    for src in cfg['sources']:
        paths = dict(src.get('paths', {}))
        if 'endpoints' in src:
            found = scan.endpoints(plugin, src['endpoints'])
            if not found:
                problems.append(f'{src["repo"]}: the plugin references none of its endpoints, so the scan found nothing')
            for path, where in found.items():
                paths.setdefault(path, f'called from {where}')
        watched[src['repo']] = paths
    return ops, watched, problems


def readable(cfg, root):
    """(operations, watched paths), or a Problem when the plugin source cannot be read reliably."""
    ops, watched, problems = derive(cfg, root)
    if problems:
        raise Problem('; '.join(problems))
    return ops, watched


def flat(text):
    return ' '.join(str(text).split())


def annotate(level, message):
    print(f'::{level}::{flat(message)}')


def note(text):
    path = os.environ.get('GITHUB_STEP_SUMMARY')
    if path:
        with open(path, 'a', encoding='utf-8') as f:
            f.write(text + '\n')


def show(text):
    note(text)
    print(text)


def cmd_check(cfg, root):
    ops, watched, problems = derive(cfg, root)
    for query, where in ops:
        print(f'{where[0]:22s} {query}')
    for repo, paths in watched.items():
        for path, why in sorted(paths.items()):
            print(f'{repo:22s} {path}  ({why})')
    for problem in problems:
        annotate('error', problem)
    print(f'{len(ops)} operations, {sum(map(len, watched.values()))} watched paths, {len(problems)} problem(s)')
    return 1 if problems else 0


def cmd_contract(cfg, gh, root, refs):
    ops, watched, errors = derive(cfg, root)
    api = source(cfg, 'schema')
    lines = []
    for ref, bad, deprecated in validity(gh, api, ops, refs or [api['branch'], gh.latest_release(api['repo'])]):
        errors += [f'{site}: not valid on {api["repo"]} {ref}: {message} In: {query}' for site, query, message in bad]
        for site, _, message in deprecated:
            annotate('warning', f'{site}: deprecated on {api["repo"]} {ref}: {message}')
        lines.append(f'- {schema.valid_count(ops, bad)} of {len(ops)} operations valid on {code(ref)}, {len(deprecated)} deprecated')
    for src in cfg['sources']:
        repo, head = src['repo'], gh.sha(src['repo'], src['branch'])
        paths = sorted({*watched[repo], *filter(None, (src.get('releases'), src.get('schema')))})
        gone = [p for p in paths if not gh.exists(repo, head, p)]
        errors += [f'{repo}: {p} no longer exists on {src["branch"]}; fix the call or watch.json' for p in gone]
        lines.append(f'- {len(paths) - len(gone)} of {len(paths)} watched paths present in {repo}')
    for error in errors:
        annotate('error', error)
    print('\n'.join(lines))
    note('\n'.join(['### Unraid contract', ''] + lines + [f'- {code(e, 300)}' for e in errors]))
    return 1 if errors else 0


def cmd_status(cfg, gh, root):
    ops, watched = readable(cfg, root)
    heads = {src['repo']: gh.sha(src['repo'], src['branch']) for src in cfg['sources']}
    show(render_status(status.gather(gh, cfg, ops, watched, heads)))
    return 0


def cmd_watch(cfg, gh, root, me, base, dry_run):
    ops, watched = readable(cfg, root)
    comments = gh.comments(me, cfg['issue'])
    saved, holder = read_state(comments)
    state = dict(saved or {})
    for pair in base.split():
        repo, _, ref = pair.partition('=')
        if repo not in watched or not ref:
            raise Problem(f'base "{pair}" must be <watched repo>=<ref>')
        state[repo] = gh.sha(repo, ref)
    report, heads = {'releases': [], 'api': [], 'files': [], 'contract': ''}, {}
    for src in cfg['sources']:
        repo = src['repo']
        head = heads[repo] = gh.sha(repo, src['branch'])
        start = state.get(repo)
        if start is None:
            raise Problem(f'no saved state for {repo} on #{cfg["issue"]}; run the workflow by hand with base "{repo}=<ref>"')
        if start == head:
            continue
        within = gh.between(repo, start, head)
        if within is None:
            raise Problem(f'{repo}: {start[:7]} is not an ancestor of {head[:7]}; '
                          f'run the workflow by hand with base "{repo}=<ref>"')
        rows = [(path, why, commits) for path, why in sorted(watched[repo].items())
                for commits in [gh.path_commits(repo, path, head, within)] if commits]
        if rows:
            report['files'].append((repo, start, head, rows))
        if 'schema' in src:
            report['api'] = api_changes(gh, src, start, head, ops)
        if 'releases' in src:
            report['releases'] = release_notes(gh, src, start, head)
    quiet = holder is not None and not (report['releases'] or report['api'] or report['files'])
    body = '### Unraid watch\n\nNo relevant upstream changes.'
    if not quiet:
        api = source(cfg, 'schema')
        report['contract'] = 'Operations valid: ' + ', '.join(
            f'{schema.valid_count(ops, bad)} of {len(ops)} on {code(ref)}'
            for ref, bad, _ in validity(gh, api, ops, [api['branch'], gh.latest_release(api['repo'])])) + '.'
        body = render(report, heads)
    show(body)
    view = render_status(status.gather(gh, cfg, ops, watched, heads))
    show(view)
    if dry_run:
        return 0
    # Every read is done. The status view carries no state, so it goes first and is only written when it reads differently
    current = status_comment(comments)
    if not (current and current['body'].strip() == view.strip()):
        if current:
            gh.edit_comment(me, current['id'], view)
        else:
            gh.comment(me, cfg['issue'], view)
    # The write that moves the saved position is the last call, so a run that fails earlier is repeated in full
    if not quiet:
        announce(report, gh.comment(me, cfg['issue'], body))
    elif heads != saved:
        gh.edit_comment(me, holder['id'], restamp(holder['body'], heads))
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('check', 'contract', 'watch', 'status'))
    parser.add_argument('--root', default='.', help='repository root')
    parser.add_argument('--ref', action='append', help='contract: unraid/api ref to validate against (repeatable)')
    parser.add_argument('--base', default='', help='watch: "repo=ref ..." to report from instead of the saved state')
    parser.add_argument('--dry-run', action='store_true', help='watch: print the report, write nothing')
    args = parser.parse_args(argv)
    cfg = json.loads((HERE / 'watch.json').read_text(encoding='utf-8'))
    gh = GitHub(os.environ.get('GITHUB_TOKEN', ''))
    try:
        if args.command == 'check':
            return cmd_check(cfg, args.root)
        if args.command == 'contract':
            return cmd_contract(cfg, gh, args.root, args.ref)
        if args.command == 'status':
            return cmd_status(cfg, gh, args.root)
        me = os.environ.get('GITHUB_REPOSITORY')
        if not me:
            raise Problem('GITHUB_REPOSITORY is not set')
        return cmd_watch(cfg, gh, args.root, me, args.base, args.dry_run)
    except (GitHubError, Problem) as e:
        annotate('error', e)
        return 2


if __name__ == '__main__':
    sys.exit(main())
