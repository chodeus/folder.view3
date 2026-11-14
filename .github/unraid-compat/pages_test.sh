#!/bin/bash
# FV3's endpoints and pages through a real Unraid webGUI. Disposable container only, as root, with no network; run from the
# repo root. Usage: pages_test.sh <webgui-tree> <unraid-version>
set -u
bash .github/unraid-compat/fake_unraid.sh "$1" "$2" || exit 1
php -d auto_prepend_file= -d display_errors=stderr .github/unraid-compat/pages_test.php "$2"
