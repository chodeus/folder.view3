#!/bin/bash
# php -l over every plugin .php and .page file, then every .github/scripts/*_test.php, with every error level on.
# Every PHP process logs to one file, the endpoints the tests start included; a deprecation there fails like an error.
set -u
cd "$(dirname "$0")/../.." || exit 2
status=0
ini=$(mktemp -d)
trap 'rm -rf "$ini"' EXIT
log=$ini/errors.log
: > "$log"
printf 'error_reporting=-1\nlog_errors=1\nerror_log=%s\n' "$log" > "$ini/zz-fv3-tests.ini"
# An empty entry keeps PHP's own scan folder; this file loads after it, in every child process too
export PHP_INI_SCAN_DIR="${PHP_INI_SCAN_DIR:-}:$ini"
php -v | head -1
php -r 'exit((error_reporting() & E_ALL) === E_ALL && ini_get("log_errors") ? 0 : 1);' || { echo 'FAILED: the error-log settings did not load'; exit 1; }

deprecated() { # deprecated <step>: fails the run when <step> logged a deprecation
	local seen; seen=$(grep -c 'Deprecated:' "$log")
	if [ "$seen" -gt "${logged:-0}" ]; then
		echo "FAILED: $1 ran into a deprecation:"
		grep 'Deprecated:' "$log" | tail -n "$((seen - ${logged:-0}))"
		status=1
	fi
	logged=$seen
}

while IFS= read -r -d '' f; do
	php -l "$f" >/dev/null 2>&1 || { php -l "$f"; status=1; }
done < <(find src \( -name '*.php' -o -name '*.page' \) -print0)
deprecated 'php -l'

for t in .github/scripts/*_test.php; do
	echo "== $t"
	php -d display_errors=stderr "$t" || status=1
	deprecated "$t"
done
exit $status
