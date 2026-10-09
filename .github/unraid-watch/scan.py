"""Read what FolderView3 asks of Unraid out of its own source: GraphQL operations and webgui endpoints."""
import re

DOC = re.compile(
    r"(?:\bfv3GraphQL\(\s*|\bquery:\s*)'((?:\{|query\b|mutation\b|subscription\b)[^'\\\n]*)'"
    r"((?:\s*\+\s*\w+\s*\+\s*'[^'\\\n]*')*)")
TAIL = re.compile(r"\+\s*(\w+)\s*\+\s*'([^'\\\n]*)'")
# { query: query } is fv3GraphQL's own passthrough, not a document
SITE = re.compile(r"\bfv3GraphQL\(|\bquery:(?!\s*query\b)")
HOLE = re.compile(r'\$\{\w+\}')


def _files(plugin, patterns):
    return [f for p in patterns for f in sorted(plugin.glob(p)) if f.is_file()]


def _where(f, text, pos):
    return f'{f.name}:{text.count(chr(10), 0, pos) + 1}'


def documents(plugin):
    """({document: [file:line]}, problems); a concatenated variable becomes ${name}."""
    found, problems = {}, []
    for f in _files(plugin, ('scripts/*.js', '*.page')):
        text = f.read_text(encoding='utf-8')
        for site in SITE.finditer(text):
            if text[text.rfind('\n', 0, site.start()) + 1:site.start()].lstrip().startswith(('//', '*')):
                continue
            m = DOC.match(text, site.start())
            if not m:
                problems.append(f'{_where(f, text, site.start())}: the GraphQL document must be a plain '
                                'single-quoted string so the upstream check can read it')
                continue
            doc = m.group(1) + ''.join('${%s}%s' % pair for pair in TAIL.findall(m.group(2)))
            found.setdefault(doc, []).append(_where(f, text, site.start()))
    return found, problems


def map_values(plugin, name):
    """Values of the object literal assigned to a JS variable such as fv3DockerActionMap."""
    for f in _files(plugin, ('scripts/*.js',)):
        m = re.search(r'\b' + re.escape(name) + r'\s*=\s*\{(.*?)\}', f.read_text(encoding='utf-8'), re.S)
        if m:
            return sorted(set(re.findall(r":\s*'(\w+)'", m.group(1))))
    return []


def operations(plugin, rules):
    """([(query, [file:line])], problems); each ${variable} is filled from the JS map its rule names."""
    docs, problems = documents(plugin)
    ops = []
    for doc, where in docs.items():
        if not HOLE.search(doc):
            ops.append((doc, where))
            continue
        rule = next((r for r in rules if r['match'] in doc), None)
        hole = HOLE.search(rule['match']) if rule else None
        filled = [doc.replace(hole.group(0), v) for v in map_values(plugin, rule['map'])] if hole else []
        if not filled or any(HOLE.search(q) for q in filled):
            problems.append(f'{where[0]}: nothing fills the variable in "{doc}" (no expand rule, or its map is empty)')
            continue
        ops += [(q, where) for q in filled]
    if not ops and not problems:
        problems.append('no GraphQL documents found in the plugin scripts')
    return ops, problems


def endpoints(plugin, prefixes):
    """{upstream path: file:line} for every webgui PHP file the plugin references by URL or include."""
    found = {}
    for f in _files(plugin, ('scripts/*.js', '*.page', 'server/*.php')):
        text = f.read_text(encoding='utf-8')
        for url, repo in prefixes.items():
            for m in re.finditer(re.escape(url) + r'([\w./-]+?\.php)\b', text):
                if '..' not in m.group(1):
                    found.setdefault(repo + m.group(1), _where(f, text, m.start()))
    return found
