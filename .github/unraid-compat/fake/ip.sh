#!/bin/bash
# Stand-in for the OS image's ip: eth0's IPv4 address from network.ini, the one form Unraid's ipaddr() asks from 7.1
addr=$(sed -n 's/^IPADDR:0="\(.*\)"$/\1/p' /var/local/emhttp/network.ini 2>/dev/null)
# Matched on the argument count as well as the words, so the same words split another way are not answered
case "$#:$*" in
'7:-4 -br addr show eth0 scope global') [ -n "$addr" ] && echo "eth0             UP             $addr/24 " && exit 0 ;;
esac
echo "ip UNKNOWN $* ($# arguments; network.ini address: ${addr:-none})" >> /var/log/fv3-fakes.log
exit 1
