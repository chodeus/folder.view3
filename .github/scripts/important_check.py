#!/usr/bin/env python3
"""Each !important in the plugin's own CSS, JS, PHP and .page files needs a `!important: <reason>` comment."""
import pathlib
import re
import sys

import vendor

REASON = re.compile(r'!important:\s*\w', re.I)
KINDS = {'.css': 'css', '.js': 'js', '.php': 'php', '.page': 'page'}
# A `/` after one of these, or first on its line, opens a JS regex literal rather than dividing; not `<`, as `</p>` has it
REGEX_AFTER = set('(,=:[!&|?{};+-*%>~^')


def _blank(code, text, i, j):
    code[i:j] = [ch if ch == '\n' else ' ' for ch in text[i:j]]


def _regex_end(text, i):
    """End of the JS regex literal opening at `i`, or None when the `/` divides."""
    before = text[:i].rstrip(' \t')
    if before and not before.endswith('\n') and before[-1] not in REGEX_AFTER and not re.search(r'\b(return|typeof)$', before):
        return None
    j, in_class = i + 1, False
    while j < len(text) and text[j] != '\n':
        if text[j] == '\\':
            j += 1
        elif text[j] == '[':
            in_class = True
        elif text[j] == ']':
            in_class = False
        elif text[j] == '/' and not in_class:
            return j + 1
        j += 1
    return None


def _in_script(spans, i):
    return any(start <= i < end for start, end in spans)


def scan(text, kind):
    """(code, comments): the text with comments, CSS strings and JS regexes blanked, and [(start, end, comment text)]."""
    code, comments, i, n = list(text), [], 0, len(text)
    script = kind != 'css'
    # A .page holds CSS and HTML too: only its <script> blocks have regex literals (url(/x) in a <style> is not one)
    js = [(0, n)] if kind == 'js' else [m.span(1) for m in re.finditer(r'<script\b[^>]*>(.*?)</script>', text, re.I | re.S)] if kind == 'page' else []
    while i < n:
        c, two = text[i], text[i:i + 2]
        html = kind == 'page' and text.startswith('<!--', i)
        # `//` after a `:` is a URL (https://), not a comment
        if two == '/*' or html or (script and two == '//' and text[i - 1:i] != ':') or (kind == 'php' and c == '#' and text[i + 1:i + 2] != '['):
            close = '*/' if two == '/*' else '-->' if html else '\n'
            found = text.find(close, i + 2)
            end = n if found == -1 else found + (0 if close == '\n' else len(close))
            comments.append((i, end, text[i:end]))
            _blank(code, text, i, end)
            i = end
        elif c == '/' and _in_script(js, i) and (end := _regex_end(text, i)):
            _blank(code, text, i, end)
            i = end
        elif c in '"\'' or (c == '`' and script):
            j = i + 1
            while j < n and text[j] != c and text[j] != '\n':
                j += 2 if text[j] == '\\' else 1
            # A script's string is where inline styles live: keep it as code; a CSS string (content: "...") is text
            if kind == 'css':
                _blank(code, text, i, j + 1)
            i = j + 1
        else:
            i += 1
    return ''.join(code), comments


def _line(text, at):
    return text.count('\n', 0, at)


def _own_line(text, start):
    return text[text.rfind('\n', 0, start) + 1:start].strip() == ''


def _reason(comments, text, line, alone):
    """A reason comment ending on `line`; with `alone`, only one with no code before it on its line."""
    return any(REASON.search(body) and _line(text, end - 1) == line and (not alone or _own_line(text, start))
               for start, end, body in comments)


def _rule_start(code, at):
    """Where the selector of the rule holding the declaration at `at` begins, past any nested rules; None outside a rule."""
    depth, opened = 0, at - 1
    while opened >= 0 and not (code[opened] == '{' and depth == 0):
        depth += (code[opened] == '}') - (code[opened] == '{')
        opened -= 1
    if opened < 0:
        return None
    start = max(code.rfind(ch, 0, opened) for ch in '{};') + 1
    while start < opened and code[start].isspace():
        start += 1
    return start


def problems_in(path, text, kind):
    code, comments = scan(text, kind)
    out = []
    for m in re.finditer(r'!\s*important\b', code, re.I):
        line = _line(text, m.start())
        ok = _reason(comments, text, line, alone=False) or _reason(comments, text, line - 1, alone=True)
        start = _rule_start(code, m.start()) if kind == 'css' else None
        if not ok and start is not None:
            ok = _reason(comments, text, _line(text, start) - 1, alone=True) or _reason(comments, text, _line(text, start), alone=True)
        if not ok:
            out.append(f'{path}:{line + 1}: !important without a "!important: <reason>" comment on its line, the line above, or above its rule')
    return out


def problems(repo):
    repo = repo.resolve()
    manifest, root = vendor.plugin_root(repo)
    bundled = {vendor.destination(manifest, root, dest) for lib in manifest['libraries'] for dest in lib['files'].values()}
    files = [p for p in sorted(root.rglob('*')) if p.suffix in KINDS and p.is_file() and p.resolve() not in bundled]
    if not files:
        return [f'{manifest["root"]}: no CSS, JS, PHP or .page files to check']
    return [problem for p in files for problem in problems_in(p.relative_to(repo), p.read_text(encoding='utf-8'), KINDS[p.suffix])]


if __name__ == '__main__':
    found = problems(pathlib.Path(__file__).resolve().parents[2])
    print('\n'.join(found) or 'Every !important has its reason')
    sys.exit(1 if found else 0)
