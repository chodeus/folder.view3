"""Unraid OS releases as the unraid/docs release notes describe them: the version, and the unraid/api version it bundles."""
import re

VERSION = re.compile(r'(\d+)\.(\d+)\.(\d+)(?:-(beta|rc)\.(\d+(?:\.\d+)*))?')
NUMBER = re.compile(r'\b\d+\.\d+\.\d+\b')
STAGE = {'beta': 0, 'rc': 1, None: 2}


def order(version):
    """Sort key that puts 7.4.0-beta.3 before 7.4.0-rc.1 before 7.4.0."""
    major, minor, patch, stage, build = VERSION.fullmatch(version).groups()
    return int(major), int(minor), int(patch), STAGE[stage], tuple(int(n) for n in (build or '0').split('.'))


def stable(version):
    return '-' not in version


def read(name, text):
    """(version, bundled api version or None) from one release-notes file; None when it names no version."""
    heading = next((line for line in text.splitlines() if line.startswith('# ')), '')
    found = VERSION.search(heading) or VERSION.fullmatch(name.rsplit('.', 1)[0])
    if not found:
        return None
    # The package list names the version last ("a -> b"); a release that kept its API says "remains"
    lines = text.splitlines()
    about = [l for l in lines if 'dynamix.unraid.net' in l] or [l for l in lines if 'Unraid API version' in l]
    numbers = NUMBER.findall(about[-1]) if about else []
    return found.group(0), numbers[-1] if numbers else None
