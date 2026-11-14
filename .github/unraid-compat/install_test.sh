#!/bin/bash
# FolderView3 through a real Unraid webGUI's plugin installer: install, upgrade over the last stable, remove, failures, min.
# Disposable container only, as root, with no network. Usage: install_test.sh <webgui-tree> <unraid-version> <stable-checkout>
set -u
# This replaces /usr/bin/php, package tools and plugin files, so it runs only in a fresh Docker container, never on a host.
if [ ! -f /.dockerenv ] || [ -e /etc/unraid-version ] || [ -d /boot/config ]; then echo 'Refusing to run outside a fresh Docker container' >&2; exit 2; fi
version=$2; repo=$(pwd)
fail() { echo "FAILED [Unraid $version]: $*"; exit 1; }
web=$(cd "$1" 2>/dev/null && pwd) && [ -f "$web/emhttp/plugins/dynamix.plugin.manager/scripts/plugin" ] || fail "no Unraid plugin installer under $1"
stable=$(cd "$3" 2>/dev/null && pwd) && [ -f "$stable/pkg_build.sh" ] || fail "no last-stable checkout with pkg_build.sh at $3"
awk --version 2>/dev/null | grep -q 'GNU Awk' || fail 'awk is not gawk, as it is on Unraid: the remove script needs RT'

name=folder.view3
docroot=/usr/local/emhttp
flash=/boot/config/plugins/$name
live=$docroot/plugins/$name
manifest=/boot/config/plugins/$name.plg
mkdir -p "$docroot/plugins" /boot/config/plugins-error /var/log/plugins /var/log/packages /var/local/emhttp
cp -R "$web/emhttp/plugins/dynamix" "$web/emhttp/plugins/dynamix.plugin.manager" "$docroot/plugins/"
ln -sfn "$docroot/plugins/dynamix" "$docroot/webGui"
printf 'csrf_token="compat-test-token"\n' > /var/local/emhttp/var.ini
# Unraid's pre- and post-install hooks run as #!/usr/bin/php and keep their state under /tmp/plugins
mkdir -p /tmp/plugins
ln -sf "$(command -v php)" /usr/bin/php
plugin() { php "$docroot/plugins/dynamix.plugin.manager/scripts/plugin" "$@"; }

# Slackware's package tools, as they work: the record lists the package's files, and removepkg takes those and the folders
# they leave empty. Everything else is Unraid's own code.
cat > /sbin/upgradepkg <<'STUB'
#!/bin/bash
for pkg; do :; done
tar -xJf "$pkg" -C / || exit 1
tar -tJf "$pkg" > "/var/log/packages/$(basename "$pkg" .txz)"
STUB
cat > /sbin/removepkg <<'STUB'
#!/bin/bash
record=/var/log/packages/$1
[ -f "$record" ] || exit 1
grep -v '/$' "$record" | while IFS= read -r f; do rm -f "/$f"; done
grep '/$' "$record" | sort -r | while IFS= read -r d; do rmdir "/$d" 2>/dev/null; done
rm -f "$record"
STUB
chmod +x /sbin/upgradepkg /sbin/removepkg

work=$(mktemp -d)
build() { # build <source tree> <version> <branch>: the .plg and package as the release workflow makes them
	local dir="$work/$2"; mkdir -p "$dir"; cp -R "$1/src" "$1/$name.plg" "$1/pkg_build.sh" "$dir/"
	(cd "$dir" && bash pkg_build.sh --version "$2" --branch "$3" --out "$dir/dist" >/dev/null) || fail "package build of $2"
}
old=2026.01.01; new=2099.01.01
build "$stable" $old main; build "$repo" $new beta
min=$(grep -o '<PLUGIN [^>]*min="[^"]*"' "$work/$new/$name.plg" | sed 's/.*min="//; s/"$//')
[ -n "$min" ] || fail 'the .plg names no min version'

set_version() { printf 'version="%s"\n' "$1" > /etc/unraid-version; }
reset() {
	rm -rf "$flash" "$live" "$manifest" /var/log/plugins/$name.plg /var/log/packages/$name-* /boot/config/plugins/dockerMan /boot/config/plugins/dynamix.vm.manager
	mkdir -p "$flash"
}
install() { # install <version> <log>: the .plg with its package already on the flash, as a boot or a cached download has it
	cp "$work/$1/dist/$name-$1-x86_64-1.txz" "$flash/"
	plugin install "$work/$1/$name.plg" > "$work/$2.log" 2>&1 || { cat "$work/$2.log"; fail "$2: install of $1 refused"; }
}
installed() { # installed <version> <step>: its files are live, its package is recorded and its manifest registered
	local pkg=$name-$1-x86_64-1 x=$work/unpacked
	rm -rf "$x" && mkdir "$x" && tar -xJf "$work/$1/dist/$pkg.txz" -C "$x" || fail "$2: unpack $1"
	local differ; differ=$(cd "$x" && find . -type f | while read -r f; do cmp -s "$f" "/$f" || echo "${f#.}"; done)
	[ -z "$differ" ] || fail "$2: files not as $1 ships them: $(echo $differ | head -c 300)"
	[ -e "/var/log/packages/$pkg" ] || fail "$2: no package record for $1"
	[ -L /var/log/plugins/$name.plg ] && grep -q "ENTITY version \"$1\"" "$manifest" || fail "$2: $1 is not the registered manifest"
}
saved_config() { # what a user has saved: folders, settings, a theme, and Unraid's own orders holding folder entries
	mkdir -p "$flash/styles" "$flash/scripts" /boot/config/plugins/dockerMan /boot/config/plugins/dynamix.vm.manager
	printf '{"AbCdEfGhIjKlMnOpQrSt":{"name":"Media","icon":"","regex":"","containers":["alpha"],"settings":{"preview":1},"actions":[]}}' > "$flash/docker.json"
	printf '{"ZyXwVuTsRqPoNmLkJiHg":{"name":"Lab","icon":"","regex":"","containers":["Debian 12"],"settings":{"preview":1},"actions":[]}}' > "$flash/vm.json"
	printf '{"docker":{"preview":1}}' > "$flash/settings.json"
	printf '.folder-appname { color: #abc; }\n' > "$flash/styles/custom.css"
	# folder-sync and folder-nightlybackups are containers: too short, or no capital as a folder id has
	printf '0="folder-AbCdEfGhIjKlMnOpQrSt"\n1="alpha"\n2="folder-sync"\n3="folder-nightlybackups"\n4="beta"\n' > /boot/config/plugins/dockerMan/userprefs.cfg
	printf '0="folder-ZyXwVuTsRqPoNmLkJiHg"\r\n1="Debian 12"\r\n2="Windows"' > /boot/config/plugins/dynamix.vm.manager/userprefs.cfg
}
config_sums() { (cd /boot/config/plugins && find $name dockerMan dynamix.vm.manager -type f ! -name "$name-*.txz" ! -path "$name/version" -print0 | sort -z | xargs -0 md5sum); }
boot() { # boot <step>: what a reboot does: RAM starts empty, and the registered manifest installs again from the flash alone
	rm -rf "$live" /var/log/packages/$name-* /var/log/plugins/$name.plg
	plugin install "$manifest" > "$work/$1.log" 2>&1 || { cat "$work/$1.log"; fail "$1: reinstall at boot refused"; }
}
set_version "$version"

# A fresh install
reset; install $new fresh; installed $new fresh
[ "$(cat "$flash/version")" = $new ] || fail 'fresh: version file not written'
[ -d "$flash/styles" ] && [ -d "$flash/scripts" ] || fail 'fresh: styles and scripts folders not made'

# An upgrade over the last stable keeps what the user saved, byte for byte, and drops the previous package
reset; install $old stable; installed $old stable; saved_config; before=$(config_sums)
install $new upgrade; installed $new upgrade
[ "$(config_sums)" = "$before" ] || fail 'upgrade: saved folders, settings, theme or Unraid orders changed'
[ ! -e "$flash/$name-$old-x86_64-1.txz" ] || fail 'upgrade: previous archive left on the flash'
[ ! -e "/var/log/packages/$name-$old-x86_64-1" ] || fail 'upgrade: previous package record left'

# A reboot after the upgrade brings back the new version from its archive
boot boot; installed $new boot
[ "$(config_sums)" = "$before" ] || fail 'boot: saved files changed'

# Removal leaves nothing, a file the package did not ship included, and takes only FolderView3's entries out of Unraid's
# orders, line endings kept
printf 'x' > "$live/not-from-the-package"
plugin remove $name.plg > "$work/remove.log" 2>&1 || { cat "$work/remove.log"; fail 'remove: refused'; }
[ ! -e "$live" ] && [ ! -e "$flash" ] && [ ! -e /var/log/plugins/$name.plg ] && [ ! -e "$manifest" ] || fail 'remove: files left behind'
ls /var/log/packages/$name-* >/dev/null 2>&1 && fail 'remove: package record left'
cmp -s /boot/config/plugins/dockerMan/userprefs.cfg <(printf '0="alpha"\n1="folder-sync"\n2="folder-nightlybackups"\n3="beta"\n') \
	|| fail "remove: Docker order not as expected: $(od -c /boot/config/plugins/dockerMan/userprefs.cfg | head -5)"
cmp -s /boot/config/plugins/dynamix.vm.manager/userprefs.cfg <(printf '0="Debian 12"\r\n1="Windows"') \
	|| fail "remove: VM order not as expected: $(od -c /boot/config/plugins/dynamix.vm.manager/userprefs.cfg | head -5)"

# A download that fails (no network here) leaves the running install, what the user saved, and a next boot that brings it back
reset; install $old stable2; saved_config; before=$(config_sums)
plugin install "$work/$new/$name.plg" > "$work/download.log" 2>&1 && fail 'download: install reported success without its package'
grep -q 'download failure' "$work/download.log" || { cat "$work/download.log"; fail 'download: refused for a reason other than the download'; }
installed $old download
[ "$(config_sums)" = "$before" ] || fail 'download: saved files changed'
[ -f "$flash/$name-$old-x86_64-1.txz" ] || fail 'download: deleted the archive the next boot installs from'
boot download-boot; installed $old download-boot

# A failed upgradepkg does the same
reset; install $old stable3; saved_config; before=$(config_sums)
cp "$work/$new/dist/$name-$new-x86_64-1.txz" "$flash/"
mv /sbin/upgradepkg "$work/upgradepkg"; printf '#!/bin/bash\nexit 1\n' > /sbin/upgradepkg; chmod +x /sbin/upgradepkg
plugin install "$work/$new/$name.plg" > "$work/upgradepkg.log" 2>&1; status=$?
mv "$work/upgradepkg" /sbin/upgradepkg
[ $status -ne 0 ] || fail 'upgradepkg: install reported success though upgradepkg failed'
grep -q "run failed: 'upgradepkg" "$work/upgradepkg.log" || { cat "$work/upgradepkg.log"; fail 'upgradepkg: refused before upgradepkg ran'; }
installed $old upgradepkg
[ "$(config_sums)" = "$before" ] || fail 'upgradepkg: saved files changed'
[ -f "$flash/$name-$old-x86_64-1.txz" ] || fail 'upgradepkg: deleted the archive the next boot installs from'
boot upgradepkg-boot; installed $old upgradepkg-boot

# The installer itself refuses an Unraid below the .plg's min, and says why
reset; set_version 6.12.15; cp "$work/$new/dist/$name-$new-x86_64-1.txz" "$flash/"
plugin install "$work/$new/$name.plg" > "$work/min.log" 2>&1 && fail "min: installed on 6.12.15 though min is $min"
grep -q "installed Unraid version is too low, require at least version $min" "$work/min.log" || { cat "$work/min.log"; fail 'min: no reason given'; }
[ ! -e "$live" ] || fail 'min: files installed below min'
set_version "$version"

echo "Unraid $version: install, upgrade, boot, remove, failed download, failed upgradepkg and min passed"
