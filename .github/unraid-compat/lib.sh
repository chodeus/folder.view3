#!/bin/bash
# Shared by install_test.sh and fake_unraid.sh: source it from the repo root with $version set. These replace system files,
# so they run only in a fresh Docker container, never on a host.
if [ ! -f /.dockerenv ] || [ -e /etc/unraid-version ] || [ -d /boot/config ]; then echo 'Refusing to run outside a fresh Docker container' >&2; exit 2; fi
name=folder.view3
docroot=/usr/local/emhttp
flash=/boot/config/plugins/$name
work=$(mktemp -d)
fail() { echo "FAILED [Unraid $version]: $*"; exit 1; }

fv3_docroot() { # fv3_docroot <webgui-tree>: Unraid's /usr/local/emhttp from that webGUI checkout, its symlinks included
	[ -f "$1/emhttp/plugins/dynamix.plugin.manager/scripts/plugin" ] || return 1
	mkdir -p $docroot /var/local/emhttp /boot/config/plugins && cp -a "$1/emhttp/." $docroot/ || return 1
	printf 'csrf_token="compat-test-token"\n' > /var/local/emhttp/var.ini || return 1
	# Unraid's hooks and scripts run as #!/usr/bin/php
	ln -sf "$(command -v php)" /usr/bin/php
}

fv3_build() { # fv3_build <source tree> <version> <branch>: the .plg and package as the release workflow makes them, in $work/<version>
	local dir="$work/$2"; mkdir -p "$dir"; cp -R "$1/src" "$1/$name.plg" "$1/pkg_build.sh" "$dir/"
	(cd "$dir" && bash pkg_build.sh --version "$2" --branch "$3" --out "$dir/dist" >/dev/null)
}
