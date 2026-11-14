#!/bin/bash
# One Unraid version running in this container, FV3 installed and Docker and libvirt faked, served on 127.0.0.1:80.
# Run from the repo root. Usage: fake_unraid.sh <webgui-tree> <unraid-version>
set -u
version=$2; repo=$(pwd); here=$repo/.github/unraid-compat
. "$here/lib.sh"
# Past lib.sh's guard: fake/docker.php and pages_test.php refuse to run without this
mkdir -p /var/run && touch /var/run/fv3-fake-unraid || fail 'no marker'
fv3_docroot "$1" || fail "no Unraid webGUI under $1"

# FV3 as upgradepkg leaves it, and the config folder its .plg makes
fv3_build "$repo" 2099.01.01 beta || fail 'package build'
tar -xJf "$work/2099.01.01/dist/$name-2099.01.01-x86_64-1.txz" -C / || fail 'package unpack'
mkdir -p "$flash/styles" "$flash/scripts" && printf '2099.01.01' > "$flash/version"

# Unraid's own state in emhttp's files, the array started: a synthetic licence and flash, root alone, and no devices, disks
# or user shares
printf 'version="%s"\n' "$version" > /etc/unraid-version
cat >> /var/local/emhttp/var.ini <<EOF
version="$version"
NAME="Tower"
COMMENT=""
SYS_MODEL=""
fsState="Started"
mdState="STARTED"
deviceCount="0"
shareSMBEnabled="yes"
shareNFSEnabled="no"
configValid="yes"
flashGUID="0000-0000-0000-000000000000"
flashVendor="Example"
flashProduct="FV3 Test Flash"
regTy="Pro"
regTm="1735689600"
regExp=""
regBuildTime="1735689600"
EOF
for ini in devs disks sec sec_nfs shares; do : > /var/local/emhttp/$ini.ini; done
printf '["root"]\nidx="0"\nname="root"\ndesc="Console and webGui login account"\npasswd="yes"\n' > /var/local/emhttp/users.ini
printf '[eth0]\nBONDING="no"\nBRIDGING="no"\nIPADDR:0="192.0.2.10"\nNETMASK:0="255.255.255.0"\nUSE_DHCP:0="no"\n' > /var/local/emhttp/network.ini
printf 'DOCKER_ENABLED="yes"\n' > /boot/config/docker.cfg
# DEBUG keeps PHP warnings on: without it Unraid's libvirt_helpers.php, which FV3 loads, turns error reporting off
printf 'SERVICE="enable"\nDEBUG="yes"\n' > /boot/config/domain.cfg
# Unraid's own writers add every other key with its default
for cfg in dynamix.docker.manager/scripts/dockerconfig dynamix.vm.manager/scripts/libvirtconfig; do
	php -d short_open_tag=On $docroot/plugins/$cfg || fail "$cfg"
done
# The OS image adds the Connect plugin, which the webGUI repo lacks from 7.2 on: the header includes its myservers files, and
# from 7.4 requires its state class
if [ ! -f $docroot/plugins/dynamix.my.servers/include/state.php ]; then
	mkdir -p $docroot/plugins/dynamix.my.servers/include
	cp "$here/fake/connect_state.php" $docroot/plugins/dynamix.my.servers/include/state.php
	: > $docroot/plugins/dynamix.my.servers/include/myservers1.php
	: > $docroot/plugins/dynamix.my.servers/include/myservers2.php
fi
ln -sf $docroot/plugins/dynamix.plugin.manager/scripts/plugin /usr/local/sbin/plugin

# A saved setup: Media holds app-a by hand and app-b by its label, Tools takes tool-c by regex, app-d is loose; Lab holds a VM
mkdir -p /boot/config/plugins/dockerMan/templates-user /boot/config/plugins/dynamix.vm.manager /var/lib/docker
cat > "$flash/docker.json" <<'EOF'
{"MediaAbCdEfGhIjKlMnO":{"name":"Media","icon":"","regex":"","containers":["app-a"],"settings":{"preview":1},"actions":[]},"ToolsPqRsTuVwXyZaBcD":{"name":"Tools","icon":"","regex":"^tool-","containers":[],"settings":{"preview":1},"actions":[]}}
EOF
cat > "$flash/vm.json" <<'EOF'
{"LabFoldAbCdEfGhIjKlM":{"name":"Lab","icon":"","regex":"","containers":["Debian 12"],"settings":{"preview":1},"actions":[]}}
EOF
printf '0="folder-MediaAbCdEfGhIjKlMnO"\n1="app-a"\n2="app-b"\n3="folder-ToolsPqRsTuVwXyZaBcD"\n4="tool-c"\n5="app-d"\n' > /boot/config/plugins/dockerMan/userprefs.cfg
printf '0="folder-LabFoldAbCdEfGhIjKlM"\n1="Debian 12"\n2="Home Assistant"\n3="Windows 11"\n' > /boot/config/plugins/dynamix.vm.manager/userprefs.cfg
printf 'app-a\napp-d 10\n' > /var/lib/docker/unraid-autostart
cat > /boot/config/plugins/dockerMan/templates-user/my-app-a.xml <<'EOF'
<?xml version="1.0"?>
<Container version="2">
  <Name>app-a</Name>
  <Repository>alpine:3.20</Repository>
  <Network>bridge</Network>
  <Shell>sh</Shell>
  <WebUI>http://[IP]:[PORT:8080]/</WebUI>
  <Config Name="WebUI" Target="8080" Default="18080" Mode="tcp" Type="Port" Display="always" Required="false" Mask="false">18080</Config>
</Container>
EOF

# PHP as Unraid's php.ini sets it: short tags, the prepend, errors to a log and never into a page
cat > "$PHP_INI_DIR/conf.d/zz-fake-unraid.ini" <<EOF
short_open_tag=On
auto_prepend_file=$here/fake/prepend.php
display_errors=Off
log_errors=On
error_log=/var/log/phplog
error_reporting=E_ALL
EOF
: > /var/log/phplog; : > /var/log/fv3-fakes.log

# Docker and libvirtd under their own names and rc scripts, so Unraid's pgrep(), /proc/<pid> and status checks find them running
mkdir -p /etc/rc.d && for rc in rc.docker rc.libvirt; do cp "$here/fake/rc_service.sh" /etc/rc.d/$rc && chmod +x /etc/rc.d/$rc; done
# The OS image's dmidecode and ip: the forms Unraid's Dashboard and ipaddr() run, anything else UNKNOWN
for cmd in dmidecode ip; do cp "$here/fake/$cmd.sh" /usr/sbin/$cmd && chmod +x /usr/sbin/$cmd; done
printf '#!/bin/sh\nexec php %s/fake/docker.php cli "$@"\n' "$here" > /usr/local/bin/docker && chmod +x /usr/local/bin/docker
ln -sf "$(command -v php)" /usr/local/sbin/dockerd; ln -sf "$(command -v sleep)" /usr/local/sbin/libvirtd
dockerd "$here/fake/docker.php" serve > /var/log/dockerd.log 2>&1 &
mkdir -p /var/run/libvirt; libvirtd infinity & echo $! > /var/run/libvirt/libvirtd.pid
php -S 127.0.0.1:80 -t $docroot "$here/fake/router.php" > /var/log/php-server.log 2>&1 &
for _ in $(seq 300); do
	[ -S /var/run/docker.sock ] && [ -s /var/run/dockerd.pid ] && curl -sf -o /dev/null http://127.0.0.1/robots.txt && exit 0
	sleep 0.1
done
fail "the fake Unraid did not start: $(cat /var/log/dockerd.log /var/log/php-server.log)"
