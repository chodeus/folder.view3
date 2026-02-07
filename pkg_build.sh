#!/bin/bash

CWD=`pwd`
tmpdir="$CWD/tmp/tmp.$((RANDOM % 1000000))"
version=$(date +"%Y.%m.%d")
plgfile="$CWD/folder.view2.plg"

# Parse flags
BETA=false
if [ "$1" = "--beta" ]; then
    BETA=true
fi

# Set branch based on build type
if [ "$BETA" = true ]; then
    branch="develop"
    version="${version}-beta"
else
    branch="main"
fi

filename="$CWD/archive/folder.view2-$version.txz"
dayversion=$(ls $CWD/archive/folder.view2-$version*.txz 2>/dev/null | wc -l)

if [ $dayversion -gt 0 ]
then
    version="$version.$dayversion"
    filename="$CWD/archive/folder.view2-$version.txz"
fi

mkdir -p $tmpdir
chmod 0755 -R .

cd "$CWD/src/folder.view2"
cp --parents -f $(find . -type f ! \( -iname "pkg_build.sh" -o -iname "sftp-config.json"  \) ) $tmpdir/

cd $tmpdir
tar -cJf $filename *

cd $CWD
md5=$(md5sum $filename | awk '{print $1}')

# Update version and md5 in plg file
sed -i "s/<!ENTITY version.*>/<!ENTITY version \"$version\">/" $plgfile
sed -i "s/<!ENTITY md5.*>/<!ENTITY md5 \"$md5\">/" $plgfile

# Update branch references in plg file (URLs use XML entities like &github;)
sed -i 's|&github;/[a-zA-Z]*/&name;.plg|\&github;/'"$branch"'/\&name;.plg|' $plgfile
sed -i 's|&github;/[a-zA-Z]*/archive/|\&github;/'"$branch"'/archive/|' $plgfile

rm -R $CWD/tmp
chmod 0755 -R .

echo "Package created: $filename"
echo "Version: $version"
echo "MD5: $md5"
echo "Branch: $branch"
echo "PLG file updated"
