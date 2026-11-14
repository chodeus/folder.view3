"""Stylesheets, FolderView3's and Unraid's: rules as text, the elements FolderView3 styles, and what Unraid sets on them per release."""
import re

TOKEN = re.compile(r'[#.][A-Za-z_][\w-]*')
COMMENT = re.compile(r'/\*.*?\*/', re.S)
VAR = re.compile(r'var\(\s*(--[\w-]+)\s*([,)])')
DEFINED = re.compile(r'(?:^|[;{\s])(--[\w-]+)\s*:')
# At-rules whose block holds rules for elements; @keyframes, @font-face and @page hold none
GROUPS = ('@media', '@supports', '@container', '@layer', '@scope')
# What moves or wraps an element. Colours and fonts change with each theme by design, so they are left out
LAYOUT = frozenset({
    'display', 'position', 'white-space', 'overflow', 'overflow-x', 'overflow-y', 'float', 'clear', 'box-sizing', 'flex', 'flex-direction',
    'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'justify-content', 'gap', 'grid-template-columns', 'width',
    'min-width', 'max-width', 'height', 'min-height', 'max-height', 'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
    'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'line-height', 'font-size', 'vertical-align', 'text-align',
    'text-overflow', 'word-break', 'overflow-wrap', 'table-layout', 'border-collapse', 'border-spacing', 'top', 'left', 'right', 'bottom',
    'transform', 'z-index', 'visibility', 'content'})


def uncommented(text):
    """The text with each comment blanked out, line breaks kept so positions still give line numbers."""
    return COMMENT.sub(lambda m: '\n' * m.group(0).count('\n'), text)


def _plain(text):
    """[(index, char)] for characters outside quoted strings, so a "}" or ";" in a content value is just text."""
    out, quote = [], None
    for i, c in enumerate(text):
        if quote:
            quote = None if c == quote and text[i - 1] != '\\' else quote
        elif c in '"\'':
            quote = c
        else:
            out.append((i, c))
    return out


def _split(text, at):
    """text cut at each `at` character outside parentheses and strings (a url() or :not() list keeps its ; and ,)."""
    parts, depth, start = [], 0, 0
    for i, c in _plain(text):
        depth += (c == '(') - (c == ')')
        if c == at and depth <= 0:
            parts.append(text[start:i])
            start = i + 1
    return parts + [text[start:]]


def _selector(text):
    """One spelling per selector: spacing around combinators and quotes around attribute values do not make a rule new."""
    text = re.sub(r'\s*([>+~])\s*', r' \1 ', text)
    text = re.sub(r'\[\s*([\w-]+)\s*([~|^$*]?=)\s*["\']?([^"\'\]]*?)["\']?\s*\]', r'[\1\2\3]', text)
    return ' '.join(text.split())


def _condition(text):
    """One spelling per at-rule condition, `@media (max-width: 767px)`, however the stylesheet spaced it."""
    text = re.sub(r'\s*([():,])\s*', r'\1', text)
    text = re.sub(r'(?<=[\w)])\(', ' (', text).replace(':', ': ').replace(',', ', ')
    return ' '.join(text.split())


def _parts(body):
    """[(None, declarations) or (head, block)] of a body in source order: its own declarations and the rules nested in it."""
    items, depth, paren, start, item = [], 0, 0, 0, 0
    for i, c in _plain(body):
        paren += (c == '(') - (c == ')') if depth == 0 else 0
        if c == '{':
            if depth == 0:
                items.append((None, body[start:item]))
                head, opened = ' '.join(body[item:i].split()), i + 1
            depth += 1
        elif c == '}' and depth:
            depth -= 1
            if depth == 0:
                items.append((head, body[opened:i]))
                start = item = i + 1
        elif c == ';' and depth == 0 and paren <= 0:
            item = i + 1
    return items + [(None, body[start:])]


def _declarations(text):
    decls = {}
    for part in _split(text, ';'):
        name, colon, value = part.partition(':')
        if colon and name.strip() and not name.strip().startswith('@'):
            # `4px!important` and `4px !important` are the same value
            decls[name.strip().lower()] = ' '.join(re.sub(r'\s*!\s*important\b', ' !important', value).split())
    return decls


def _walk(body, conditions, parents, out):
    # In source order: a declaration after a nested rule comes after it, as the browser applies them
    for head, block in _parts(body):
        if head is None:
            decls = _declarations(block) if parents else {}
            out += [(conditions, parent, decls) for parent in parents if decls]
            continue
        if head.startswith('@'):
            if head.split(None, 1)[0].lower() in GROUPS:
                _walk(block, ' '.join(filter(None, (conditions, _condition(head)))), parents, out)
            continue
        selectors = [_selector(s) for s in _split(head, ',') if s.strip()]
        # Nesting: & is the parent rule; a nested selector without one is a descendant of it
        resolved = [s.replace('&', p) if '&' in s else f'{p} {s}' for p in parents for s in selectors] if parents else selectors
        _walk(block, conditions, resolved, out)


def rules(text):
    """[(at-rule conditions, selector, {property: value})] in document order, nested rules resolved."""
    out = []
    _walk(uncommented(text), '', [], out)
    return out


def subject(selector):
    """The ids and classes of the element a selector styles; none for a ::before box, nothing an attribute value or :not() names."""
    last = re.split(r'[\s>+~]+', re.sub(r'\([^()]*\)|\[[^\]]*\]', '', selector).strip())[-1]
    return [] if '::' in last else TOKEN.findall(last)


def styled(texts):
    """{id or class: properties FolderView3 sets on elements that carry it} from FolderView3's own stylesheets."""
    out = {}
    for text in texts:
        for _, selector, decls in rules(text):
            for token in subject(selector):
                out.setdefault(token, set()).update(decls)
    return out


def merged(texts):
    """{(at-rule conditions, selector, property): value} for stylesheets in load order: a later one wins."""
    out = {}
    for text in texts:
        for conditions, selector, decls in rules(text):
            for name, value in decls.items():
                out[(conditions, selector, name)] = value
    return out


def changes(by_ref, refs, ours):
    """[(conditions, selector, property, [(ref, value)])]: layout Unraid changed on elements FolderView3 styles but does not set."""
    out = []
    for conditions, selector, name in sorted(set().union(*(by_ref[r] for r in refs))):
        tokens = [t for t in subject(selector) if t in ours]
        if name not in LAYOUT or not tokens or any(name in ours[t] for t in tokens):
            continue
        values = [(ref, by_ref[ref].get((conditions, selector, name))) for ref in refs]
        if len({v for _, v in values}) > 1:
            out.append((conditions, selector, name, values))
    return out


def fallbacks(stylesheets, code):
    """Problems: var(--x) with no fallback where --x is Unraid's, not declared or keyed by FolderView3's own CSS or code."""
    texts = {f: uncommented(f.read_text(encoding='utf-8')) for f in stylesheets}
    ours = {name for text in texts.values() for name in DEFINED.findall(text)}
    named = '\n'.join(f.read_text(encoding='utf-8') for f in code)

    def keyed(name):
        # The CSS tool's presets ('fv3-x': '#fff') and the generated theme CSS ('x' => '#fff') key the plugin's own variables
        bare = re.escape(name[2:])
        return re.search(r"['\"]--" + bare + r"['\"]|['\"]" + bare + r"['\"]\s*(?::|=>)", named)
    return [f'{f.name}:{text.count(chr(10), 0, m.start()) + 1}: var({m.group(1)}) has no fallback and FolderView3 does not '
            f'define {m.group(1)}, so the style needs every Unraid release to; give it a fallback'
            for f, text in texts.items() for m in VAR.finditer(text)
            if m.group(2) == ')' and m.group(1) not in ours and not keyed(m.group(1))]
