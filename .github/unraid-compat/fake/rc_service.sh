#!/bin/bash
# Stand-in for the OS image's /etc/rc.d/rc.docker and rc.libvirt: `status` says running (the Dashboard draws its tiles from it)
[ "$1" = status ] && exit 0
echo "rc UNKNOWN $0 $*" >> /var/log/fv3-fakes.log
exit 1
