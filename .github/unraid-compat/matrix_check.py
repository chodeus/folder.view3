#!/usr/bin/env python3
"""ci.yml's Unraid matrix has one release row per minor from the .plg's min to the newest, and one for any newer release."""
import pathlib
import re
import sys

ROW = re.compile(r"- \{unraid: '([^']+)', php: '([^']+)'(?:, row: '([^']+)')?\}")
RELEASE = re.compile(r'(\d+)\.(\d+)\.\d+')


def problems(ci, plg):
    floor = re.search(r'<PLUGIN [^>]*\bmin="(\d+)\.(\d+)\.\d+"', plg)
    if not floor:
        return ['folder.view3.plg names no min="x.y.z"']
    floor = (int(floor[1]), int(floor[2]))
    rows = ROW.findall(ci)
    releases = [version for version, _, row in rows if not row]
    tags = [version for version, _, row in rows if row == 'newest tag']
    out = [] if len(tags) == 1 else [f"ci.yml needs exactly one 'newest tag' row, not {len(tags)}"]
    minors = {}
    for version in releases:
        m = RELEASE.fullmatch(version)
        if not m:
            out.append(f'release row {version} is not a release version x.y.z')
        else:
            minors.setdefault((int(m[1]), int(m[2])), []).append(version)
    if not minors:
        return out + ['ci.yml has no Unraid release rows']
    for (major, minor), versions in sorted(minors.items()):
        if len(versions) > 1:
            out.append(f'Unraid {major}.{minor} has {len(versions)} release rows: {", ".join(versions)}')
        if (major, minor) < floor:
            out.append(f'release row {versions[0]} is below the .plg\'s min {floor[0]}.{floor[1]}')
    for major in sorted({major for major, _ in minors if major >= floor[0]}):
        first = floor[1] if major == floor[0] else 0
        missing = [f'{major}.{n}' for n in range(first, max(n for m, n in minors if m == major)) if (major, n) not in minors]
        out += [f'no release row for Unraid {v}, between the .plg\'s min and the newest row' for v in missing]
    # The 'newest tag' row runs only betas; a release it reaches needs a row of its own and the PHP that release ships
    out += [f'Unraid {tag} is out: give it a release row with the PHP its release notes name' for tag in tags
            if RELEASE.fullmatch(tag) and tag not in releases]
    return out


if __name__ == '__main__':
    repo = pathlib.Path(__file__).resolve().parents[2]
    found = problems((repo / '.github/workflows/ci.yml').read_text(encoding='utf-8'), (repo / 'folder.view3.plg').read_text(encoding='utf-8'))
    print('\n'.join(found) or 'The Unraid matrix covers every minor from min to the newest release')
    sys.exit(1 if found else 0)
