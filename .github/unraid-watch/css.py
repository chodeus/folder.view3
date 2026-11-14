"""Stylesheets, FolderView3's and Unraid's: rules as text, the elements FolderView3 styles, and what Unraid sets on them per release."""
import re

TOKEN = re.compile(r'[#.][A-Za-z_][\w-]*')
COMMENT = re.compile(r'/\*.*?\*/', re.S)
# A semicolon inside url(...) or a data URI does not end a declaration
DECLARATION = re.compile(r';(?![^(]*\))')
VAR = re.compile(r'var\(\s*(--[\w-]+)\s*([,)])')
DEFINED = re.compile(r'(?:^|[;{\s])(--[\w-]+)\s*:')
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


def rules(text):
    """[(at-rule conditions, selector, {property: value})], one entry per selector of a rule."""
    text = uncommented(text)
    out, heads, start = [], [], 0
    for i, c in enumerate(text):
        if c == '{':
            heads.append(' '.join(text[start:i].split()))
            start = i + 1
        elif c == '}' and heads:
            head, body = heads.pop(), text[start:i]
            if not head.startswith('@') and '{' not in body:
                decls = {}
                for part in DECLARATION.split(body):
                    name, colon, value = part.partition(':')
                    if colon and name.strip():
                        # `4px!important` and `4px !important` are the same value
                        decls[name.strip().lower()] = ' '.join(re.sub(r'\s*!\s*important\b', ' !important', value).split())
                context = ' '.join(h for h in heads if h.startswith('@'))
                out += [(context, ' '.join(s.split()), decls) for s in head.split(',') if s.strip()]
            start = i + 1
    return out


def subject(selector):
    """The ids and classes of the element a selector styles: its last compound, without what :not(...) and the like name."""
    last = re.split(r'[\s>+~]+', re.sub(r'\([^()]*\)', '', selector).strip())[-1]
    return TOKEN.findall(last)


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
        for context, selector, decls in rules(text):
            for name, value in decls.items():
                out[(context, selector, name)] = value
    return out


def changes(by_ref, refs, ours):
    """[(at-rule conditions, selector, property, [(ref, value or None)])] for layout properties Unraid sets on an element
    FolderView3 styles, that differ between refs, and that FolderView3 does not set there itself."""
    out = []
    for context, selector, name in sorted(set().union(*(by_ref[r] for r in refs))):
        tokens = [t for t in subject(selector) if t in ours]
        if name not in LAYOUT or not tokens or any(name in ours[t] for t in tokens):
            continue
        values = [(ref, by_ref[ref].get((context, selector, name))) for ref in refs]
        if len({v for _, v in values}) > 1:
            out.append((context, selector, name, values))
    return out


def fallbacks(stylesheets, code):
    """Problems: var(--x) with no fallback where --x is Unraid's: no FolderView3 stylesheet declares it and its scripts and
    server code (the CSS tool's presets, the generated theme CSS) never name it."""
    texts = {f: uncommented(f.read_text(encoding='utf-8')) for f in stylesheets}
    ours = {name for text in texts.values() for name in DEFINED.findall(text)}
    named = '\n'.join(f.read_text(encoding='utf-8') for f in code)
    return [f'{f.name}:{text.count(chr(10), 0, m.start()) + 1}: var({m.group(1)}) has no fallback and only Unraid defines '
            f'{m.group(1)}; an Unraid release without it would drop the style'
            for f, text in texts.items() for m in VAR.finditer(text)
            if m.group(2) == ')' and m.group(1) not in ours and not re.search(r"['\"](?:--)?" + re.escape(m.group(1)[2:]) + r"['\"]", named)]
