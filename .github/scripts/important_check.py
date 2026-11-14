#!/usr/bin/env python3
"""Each !important in the plugin's own CSS, JS, PHP and .page files needs a `!important: <reason>` comment: on its line,
on the line above it, or (CSS) directly above its rule. Bundled libraries listed in vendor.json are skipped."""
import json
import pathlib
import re
import sys

REASON = re.compile(r'!important:\s*\w')
KINDS = {'.css': 'css', '.js': 'script', '.php': 'script', '.page': 'script'}


def scan(text, kind):
    """(code, comments): the text with comments and strings blanked, and [(start, end, comment text)]."""
    code, comments, i, n = list(text), [], 0, len(text)
    while i < n:
        c, two = text[i], text[i:i + 2]
        if two == '/*' or (two == '//' and kind == 'script'):
            end = text.find('*/', i + 2) + 2 if two == '/*' else text.find('\n', i)
            end = n if end < 2 or end == -1 else end
            comments.append((i, end, text[i:end]))
            code[i:end] = [ch if ch == '\n' else ' ' for ch in text[i:end]]
            i = end
        elif c in '"\'' or (c == '`' and kind == 'script'):
            j = i + 1
            while j < n and text[j] != c and text[j] != '\n':
                j += 2 if text[j] == '\\' else 1
            # A script's string is where inline styles live: keep it as code; a CSS string (content: "...") is text
            if kind == 'css':
                code[i:j + 1] = [ch if ch == '\n' else ' ' for ch in text[i:j + 1]]
            i = j + 1
        else:
            i += 1
    return ''.join(code), comments


def _line(text, at):
    return text.count('\n', 0, at)


def _reason_ends_on(comments, text, line):
    return any(REASON.search(body) and _line(text, end - 1) == line for start, end, body in comments)


def _rule_start(code, at):
    """Where the selector of the rule holding the declaration at `at` begins."""
    opened = code.rfind('{', 0, at)
    before = max(code.rfind(ch, 0, opened) for ch in '{};')
    return before + 1 + (len(code[before + 1:opened]) - len(code[before + 1:opened].lstrip()))


def problems_in(path, text, kind):
    code, comments = scan(text, kind)
    out = []
    for m in re.finditer(r'!\s*important\b', code):
        line = _line(text, m.start())
        ok = _reason_ends_on(comments, text, line) or _reason_ends_on(comments, text, line - 1)
        if not ok and kind == 'css':
            start = _rule_start(code, m.start())
            ok = _reason_ends_on(comments, text, _line(text, start) - 1) or _reason_ends_on(comments, text, _line(text, start))
        if not ok:
            out.append(f'{path}:{line + 1}: !important without a "!important: <reason>" comment on its line, the line above, or above its rule')
    return out


def problems(repo):
    manifest = json.loads((repo / 'vendor.json').read_text(encoding='utf-8'))
    root = repo / manifest['root']
    bundled = {(root / dest).resolve() for lib in manifest['libraries'] for dest in lib['files'].values()}
    out = []
    for path in sorted(root.rglob('*')):
        kind = KINDS.get(path.suffix)
        if kind and path.is_file() and path.resolve() not in bundled:
            out += problems_in(path.relative_to(repo), path.read_text(encoding='utf-8'), kind)
    return out


if __name__ == '__main__':
    found = problems(pathlib.Path(__file__).resolve().parents[2])
    print('\n'.join(found) or 'Every !important has its reason')
    sys.exit(1 if found else 0)
