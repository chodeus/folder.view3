#!/bin/bash

CWD=`pwd`

rm -Rf $CWD/src/folder.view3/usr/local/emhttp/plugins/folder.view3/*
cp /usr/local/emhttp/plugins/folder.view3/* $CWD/src/folder.view3/usr/local/emhttp/plugins/folder.view3 -R -v -p
chmod -R 0755 ./
chown -R root:root ./