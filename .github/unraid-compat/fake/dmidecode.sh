#!/bin/bash
# Stand-in for the OS image's dmidecode: the SMBIOS types Unraid's Dashboard reads, for a synthetic board with 16 GiB
case "$*" in
-qt0) printf 'BIOS Information\n\tVendor: Example BIOS\n\tVersion: 1.00\n\tRelease Date: 01/01/2025\n\n' ;;
-qt2) printf 'Base Board Information\n\tManufacturer: Example Boards\n\tProduct Name: FV3-TEST\n\tVersion: 1.0\n\tSerial Number: FV3-0001\n\n' ;;
-qt4) printf 'Processor Information\n\tSocket Designation: CPU0\n\tManufacturer: Example CPUs\n\tVersion: Example CPU 8-Core\n\tCurrent Speed: 3600 MHz\n\n' ;;
-qt16) printf 'Physical Memory Array\n\tLocation: System Board Or Motherboard\n\tUse: System Memory\n\tError Correction Type: None\n\tMaximum Capacity: 64 GB\n\tNumber Of Devices: 2\n\n' ;;
-qt17) for slot in A1 B1; do printf 'Memory Device\n\tSize: 8 GB\n\tLocator: DIMM_%s\n\tType: DDR4\n\tSpeed: 3200 MT/s\n\n' $slot; done ;;
*) echo "dmidecode UNKNOWN $* ($# arguments)" >> /var/log/fv3-fakes.log; exit 1 ;;
esac
