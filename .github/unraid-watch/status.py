"""Where FolderView3 stands against Unraid today: what is coming, what each OS release supports, what it leaves unused."""
import re

import releases
import schema
import upstream

FIELD = re.compile(r"Cannot query field '(\w+)' on type '(\w+)'")


def missing(errors):
    """What the failed operations asked for that is not there: Type.field, or the message for another kind of error."""
    return sorted({f'{m[2]}.{m[1]}' if m else message for _, _, message in errors for m in [FIELD.search(message)]})


def stage(gh, cfg, ops, watched, spans):
    """[(repo, from, to, api changes, differing files)] for {repo: ((label, sha), (label, sha))}; both None if a sha is."""
    out = []
    for src in cfg['sources']:
        if src['repo'] not in spans:
            continue
        (a, start), (b, head) = spans[src['repo']]
        if not (start and head):
            out.append((src['repo'], a, b, None, None))
            continue
        rows = upstream.differences(gh, src['repo'], watched[src['repo']], start, head)
        api = upstream.api_changes(gh, src, start, head, ops) if 'schema' in src else []
        out.append((src['repo'], a, b, api, rows))
    return out


def gather(gh, cfg, ops, watched, heads):
    """Everything the status comment shows, as plain data."""
    api, docs = upstream.source(cfg, 'schema'), upstream.source(cfg, 'releases')
    core, tagged = api['repo'], docs['tags']
    branch = next(s['branch'] for s in cfg['sources'] if s['repo'] == tagged)
    known = upstream.os_releases(gh, cfg, heads)
    newest = known[0] if known else None
    stable = next((r for r in known if releases.stable(r[0])), None)
    latest = gh.latest_release(core)

    def at(repo, ref):
        # No sha: the notes do not state that version, or its tag is not there yet
        return ref or 'not stated', ref and gh.sha(repo, ref, missing_ok=True)

    def bundled(release):
        return release and release[1] and f'v{release[1]}'

    merged = {core: (at(core, latest), (api['branch'], heads[core])),
              tagged: (at(tagged, newest and newest[0]), (branch, heads[tagged]))}
    stages = [('Coming: merged, in no release', stage(gh, cfg, ops, watched, merged)),
              ('Coming: released API, not in an OS build',
               stage(gh, cfg, ops, watched, {core: (at(core, bundled(newest)), at(core, latest))}))]
    if newest and stable and newest != stable:
        ahead = {core: (at(core, bundled(stable)), at(core, bundled(newest))),
                 tagged: (at(tagged, stable[0]), at(tagged, newest[0]))}
        line = '.'.join(newest[0].split('.')[:2])
        stages.append((f'Coming with {line}: in {newest[0]}, not in {stable[0]}', stage(gh, cfg, ops, watched, ahead)))

    rows, unstated = {api['branch']: ['not released'], latest: ['latest API release']}, []
    for version, number in known:
        if number:
            rows.setdefault(f'v{number}', []).append(f'Unraid {version}')
        else:
            unstated.append(version)
    matrix = [(ref, rows[ref], upstream.valid_count(ops, bad), len(ops), missing(bad))
              for ref, bad, _ in upstream.validity(gh, api, ops, list(rows))]

    current = schema.load(gh.file(core, heads[core], api['schema']))
    idle, types = schema.coverage(current, api['surface'], schema.check(current, ops)[2], api['namespaces'])
    return {'releases': (newest, stable, latest), 'stages': stages, 'matrix': matrix, 'unstated': unstated,
            'idle': idle, 'types': types, 'legacy': sorted(watched[tagged].items())}
