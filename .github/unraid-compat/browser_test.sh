#!/bin/bash
# FV3's pages in Chromium and Firefox: the fake Unraid in a container with no network, the browsers in one that joins its network.
# From the repo root, after npm ci here: browser_test.sh <fake-unraid-image> <webgui-tree from the repo root> <unraid-version> <screenshot-dir>
set -u
image=$1; tree=$2; version=$3; shots=$4
# Renovate moves this with playwright-core in package.json: the driver only runs the browsers built for its own version
browsers=mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579
fail() { echo "FAILED [Unraid $version]: $*"; exit 1; }
# Removes only the container this run made; one a killed run leaves stops within the hour (its sleep 3600)
fake=
trap '[ -z "$fake" ] || docker rm -f "$fake" >/dev/null 2>&1' EXIT

driver=$(node -p "require('./.github/unraid-compat/node_modules/playwright-core/package.json').version" 2>/dev/null)
[[ $browsers == *":v$driver-"* ]] || fail "playwright-core ${driver:-is not installed (npm ci in .github/unraid-compat)}, but the browsers are ${browsers%@*}"
fake=$(docker run -d --network none -v "$PWD:/repo" -w /repo "$image" \
	bash -c 'bash .github/unraid-compat/fake_unraid.sh "$0" "$1" && touch /run/fv3-fake-up && exec sleep 3600' "$tree" "$version") \
	|| fail 'the fake Unraid container did not start'
end=$((SECONDS + 120))
until docker exec "$fake" test -f /run/fv3-fake-up 2>/dev/null; do
	[ "$(docker inspect -f '{{.State.Running}}' "$fake" 2>/dev/null)" = true ] || fail "the fake Unraid stopped: $(docker logs "$fake" 2>&1 | tail -20)"
	[ $SECONDS -lt $end ] || fail 'the fake Unraid was not up within 2 minutes'
	sleep 0.5
done
# browser_test.js writes only once the page it reaches carries this token
token=$(docker exec "$fake" php -d auto_prepend_file= -r 'echo parse_ini_file("/var/local/emhttp/var.ini")["csrf_token"] ?? "";')
[ -n "$token" ] || fail "no csrf_token in the fake's var.ini"

mkdir -p "$shots" || fail "cannot make $shots"
browse() { docker run --rm --network container:"$fake" --shm-size=1g --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD:/repo:ro" \
	-v "$(cd "$shots" && pwd):/shots" -w /repo/.github/unraid-compat "$browsers" node browser_test.js "$version" /shots "$token" "$tree" "$@"; }
# Unraid alone first, with FV3's page hooks (folder.view3.<page>.page) out of its plugin folder; FV3's pass then compares with it
docker exec "$fake" bash -c 'mkdir -p /run/fv3-off && mv /usr/local/emhttp/plugins/folder.view3/folder.view3.*.page /run/fv3-off/' || fail "FV3's pages could not be moved aside"
# FV3's pass must never compare with an earlier run's measurements
rm -f "$shots/unraid-alone.json" || fail "the last run's measurements could not be removed from $shots"
browse unraid-alone; status=$?
docker exec "$fake" bash -c 'mv /run/fv3-off/* /usr/local/emhttp/plugins/folder.view3/' || fail "FV3's pages could not be put back"
browse || status=1
# The logs hold what the pages asked of Unraid's PHP and the fakes, for every run above
docker exec "$fake" php -d auto_prepend_file= -d display_errors=stderr .github/unraid-compat/fake_logs.php "$version" || status=1
exit $status
