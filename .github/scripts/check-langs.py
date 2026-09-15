#!/usr/bin/env python3
"""Fail when a language pack no longer matches en.json, or the code uses a key en.json lacks."""
import json
import re
import sys
from collections import Counter
from pathlib import Path

PLACEHOLDER = re.compile(r'\$\d+')
TAG = re.compile(r'</?[A-Za-z][A-Za-z0-9]*')
MAGIC = re.compile(r'\{\{(.*?)\}\}', re.S)
PLURAL = re.compile(r'PLURAL:\$\d+(\|[^|{}]*)+')
# Literal keys only; a key ending in "-" is a prefix the code completes at runtime
SOURCE_KEYS = [re.compile(p) for p in (
    r"fv3I18nOr\(\s*'([a-z0-9-]+)'",
    r"\$\.i18n\(\s*'([a-z0-9-]+)'",
    r"i18nText\([^,()]+,\s*'([a-z0-9-]+)'",
    r"i18nSpan\(\s*'([a-z0-9-]+)'",
    r"key:\s*'([a-z0-9-]+)'",
    r'data-i18n="(?:\[[a-z]+\])?([a-z0-9-]+)"',
    r"'\[[a-z]+\]([a-z0-9-]+)'",
)]


def load(path, errors):
    raw = path.read_bytes()
    if raw.startswith(b'\xef\xbb\xbf'):
        errors.append(f'{path.name}: starts with a byte order mark')
        raw = raw[3:]
    try:
        return json.loads(raw.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        errors.append(f'{path.name}: not valid UTF-8 JSON ({e})')
        return None


def check_value(name, key, value, source, errors):
    if not isinstance(value, str) or not value.strip():
        errors.append(f'{name} "{key}": empty')
        return
    if set(PLACEHOLDER.findall(value)) != set(PLACEHOLDER.findall(source)):
        errors.append(f'{name} "{key}": placeholders differ from en.json')
    if Counter(TAG.findall(value)) != Counter(TAG.findall(source)):
        errors.append(f'{name} "{key}": HTML tags differ from en.json')
    if value.count('{{') != value.count('}}'):
        errors.append(f'{name} "{key}": unbalanced {{{{ }}}}')
    for expr in MAGIC.findall(value):
        if not PLURAL.fullmatch(expr):
            errors.append(f'{name} "{key}": "{{{{{expr}}}}}" is not {{{{PLURAL:$n|form|...}}}}')


def source_keys(plugin_dir):
    found = {}
    files = sorted(plugin_dir.glob('*.page')) + sorted((plugin_dir / 'scripts').glob('*.js')) + [plugin_dir / 'langs' / 'script.php']
    for f in files:
        if not f.is_file():
            continue
        text = f.read_text(encoding='utf-8')
        for rx in SOURCE_KEYS:
            for m in rx.finditer(text):
                if not m.group(1).endswith('-'):
                    found.setdefault(m.group(1), f.name)
    return found


def main(langs_dir):
    errors = []
    langs = Path(langs_dir)
    packs = {p.name: load(p, errors) for p in sorted(langs.glob('*.json'))}
    en = packs.get('en.json')
    if not isinstance(en, dict):
        errors.append('en.json: missing or unreadable')
        return report(errors, len(packs))
    keys = [k for k in en if k != '@metadata']
    for key in keys:
        check_value('en.json', key, en[key], en[key], errors)
    for key, where in sorted(source_keys(langs.resolve().parent).items()):
        if key not in en:
            errors.append(f'{where}: uses "{key}", which is not in en.json')
    for name, pack in packs.items():
        if name == 'en.json' or not isinstance(pack, dict):
            continue
        meta = pack.get('@metadata')
        if not isinstance(meta, dict) or meta.get('locale') != name[:-5]:
            errors.append(f'{name}: @metadata.locale should be "{name[:-5]}"')
        own = [k for k in pack if k != '@metadata']
        missing = [k for k in keys if k not in pack]
        extra = [k for k in own if k not in en]
        if missing:
            errors.append(f'{name}: missing {", ".join(missing)}')
        if extra:
            errors.append(f'{name}: not in en.json: {", ".join(extra)}')
        if not missing and not extra and own != keys:
            errors.append(f'{name}: keys are not in en.json order')
        for key in keys:
            if key in pack:
                check_value(name, key, pack[key], en[key], errors)
    return report(errors, len(packs))


def report(errors, count):
    for e in errors:
        print(f'::error::{e}')
    print(f'{count} packs checked, {len(errors)} problem(s)')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
