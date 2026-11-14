"""What upstream looks like, read through the GitHub client: schema changes, release notes, file differences."""
import re

import css
import releases
import schema
from github import GitHubError

NOTES = re.compile(r'[\w.-]+\.md\Z')


def source(cfg, key):
    """The source that carries a given setting: 'schema' is the API, 'releases' the release notes."""
    return next(s for s in cfg['sources'] if key in s)


def release_notes(gh, src, start, head):
    """[(heading, file name, url)] for release notes whose first heading changed."""
    repo, folder = src['repo'], src['releases']
    old, new = gh.listing(repo, start, folder), gh.listing(repo, head, folder)
    out = []
    for name in sorted(new):
        if new[name] == old.get(name) or not NOTES.match(name):
            continue
        before = releases.heading(gh.file(repo, start, folder + name)) if name in old else None
        after = releases.heading(gh.file(repo, head, folder + name))
        if after and after != before:
            out.append((after, name, f'https://github.com/{repo}/blob/{head}/{folder}{name}'))
    return out


def os_releases(gh, cfg, heads):
    """[(os version, api version or None)], newest first, from release notes at or after the configured floor."""
    docs, api = source(cfg, 'releases'), source(cfg, 'schema')
    head, floor = heads[docs['repo']], releases.order(docs['since'])
    out = []
    for name in gh.listing(docs['repo'], head, docs['releases']):
        stem = name.rsplit('.', 1)[0]
        if not NOTES.match(name) or not releases.VERSION.fullmatch(stem) or releases.order(stem) < floor:
            continue
        found = releases.read(name, gh.file(docs['repo'], head, docs['releases'] + name))
        if found:
            version, bundled = found
            # A number that is not an API tag was misread from the prose; say "not stated" instead of guessing
            known = bundled and gh.sha(api['repo'], f'v{bundled}', missing_ok=True)
            out.append((version, bundled if known else None))
    return sorted(out, key=lambda r: releases.order(r[0]), reverse=True)


def api_changes(gh, src, start, head, ops):
    """[(kind, signature, used by the plugin, call sites)] for the watched part of the schema."""
    old, new = (schema.load(gh.file(src['repo'], ref, src['schema'])) for ref in (start, head))
    sites = {}
    for s in (old, new):
        for coordinate, where in schema.check(s, ops)[2].items():
            sites.setdefault(coordinate, set()).update(where)
    (a, uses_a), (b, uses_b) = (schema.surface(s, src['surface'], sites) for s in (old, new))
    return [(kind, text, coordinate in uses_a | uses_b, sorted(sites.get(coordinate, ())))
            for kind, coordinate, text in schema.diff(a, b)]


def validity(gh, src, ops, refs):
    """[(ref, errors, deprecations)] for the operations against the schema at each unraid/api ref."""
    out = []
    for ref in refs:
        sdl = gh.file(src['repo'], gh.sha(src['repo'], ref), src['schema'])
        errors, deprecated, _ = schema.check(schema.load(sdl), ops)
        out.append((ref, errors, deprecated))
    return out


def release_refs(gh, src, floor):
    """Stable release tags at or after floor (the plugin's declared minimum), oldest first, then the development branch."""
    tags = [t for t in gh.tags(src['repo']) if releases.os_tag(t) and releases.order(t) >= releases.order(floor)]
    # None would leave only the development branch checked, read as every release passing
    if not tags:
        raise GitHubError(f'{src["repo"]}: no stable release tag at or after {floor}')
    return sorted(tags, key=releases.order) + [src['branch']]


def text_at(gh, repo, ref, path):
    """A file's text at a ref; None when the file is not there."""
    blob = gh.tree(repo, ref).get(path)
    return None if blob is None else gh.blob(repo, blob)


def applies(entry, ref):
    """A contract with `since` holds only from that release on; the development branch is always held to it."""
    return 'since' not in entry or not releases.VERSION.fullmatch(ref) or releases.order(ref) >= releases.order(entry['since'])


def contracts(gh, src, refs, pinned):
    """[(contract, {ref: True, False, 'missing' (no such file), or None where it does not apply})]; pinned maps a branch to its sha."""
    out = []
    for entry in src.get('contracts', []):
        found = {}
        for ref in refs:
            text = text_at(gh, src['repo'], pinned.get(ref, ref), entry['path']) if applies(entry, ref) else None
            found[ref] = None if not applies(entry, ref) else 'missing' if text is None else bool(re.search(entry['match'], text))
        out.append((entry, found))
    return out


def stylesheets(gh, src, refs, ours, pinned):
    """({theme: css.changes}, [listed file no release has]) for Unraid's stylesheets; a file one release lacks is skipped."""
    styles = src['styles']
    out, seen = {}, set()
    # Each theme's own file is its own input: one theme's themes/{theme}.css does not stand in for another's
    listed = list(dict.fromkeys(p.format(theme=t) for t in styles['themes'] for p in styles['files']))
    for theme in styles['themes']:
        by_ref = {}
        for ref in refs:
            texts = []
            for path in (p.format(theme=theme) for p in styles['files']):
                text = text_at(gh, src['repo'], pinned.get(ref, ref), path)
                if text is not None:
                    texts.append(text)
                    seen.add(path)
            by_ref[ref] = css.merged(texts)
        out[theme] = css.changes(by_ref, refs, ours)
    return out, [p for p in listed if p not in seen]


def differences(gh, repo, paths, start, head):
    """[(path, why, commits)] for watched paths that differ between two commits; commits is None when start is no ancestor."""
    a, b = gh.tree(repo, start), gh.tree(repo, head)
    changed = [(path, why) for path, why in sorted(paths.items()) if a.get(path.rstrip('/')) != b.get(path.rstrip('/'))]
    # Release branches diverge from the development line, so a commit list does not always exist
    within = gh.between(repo, start, head) if changed else None
    return [(path, why, None if within is None else gh.path_commits(repo, path, head, within)) for path, why in changed]
