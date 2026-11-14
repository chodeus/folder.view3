#!/bin/bash
# php -l over every plugin .php and .page file, then every .github/scripts/*_test.php, with every error level on.
# A deprecation fails like an error, so a PHP that Unraid has not shipped yet shows what FolderView3 must change.
set -u
cd "$(dirname "$0")/../.." || exit 2
status=0
errors=$(mktemp)
trap 'rm -f "$errors"' EXIT
php -v | head -1

while IFS= read -r -d '' f; do
    if ! out=$(php -d error_reporting=-1 -l "$f" 2>&1) || grep -q 'Deprecated:' <<<"$out"; then
        echo "$out"
        status=1
    fi
done < <(find src \( -name '*.php' -o -name '*.page' \) -print0)

for t in .github/scripts/*_test.php; do
    echo "== $t"
    php -d error_reporting=-1 -d display_errors=stderr -d log_errors=0 "$t" 2>"$errors" || status=1
    cat "$errors" >&2
    if grep -q 'Deprecated:' "$errors"; then
        echo "FAILED: $t ran into a deprecation"
        status=1
    fi
done
exit $status
