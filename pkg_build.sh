#!/bin/bash

CWD=`pwd`
tmpdir="$CWD/tmp/tmp.$((RANDOM % 1000000))"
version=$(date +"%Y.%m.%d")
plgfile="$CWD/folder.view3.plg"

# Auto-detect current git branch, with optional flag override
# Usage: pkg_build.sh [--beta [N] | --develop [N] | --main]
#   (no flag)    → auto-detect branch from git
#   --beta [N]   → force beta branch
#   --develop [N]→ force develop branch
#   --main       → force main branch (stable)
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
SUFFIX_NUM=""

if [ "$1" = "--beta" ]; then
    branch="beta"
    if [ -n "$2" ] && [ "$2" -eq "$2" ] 2>/dev/null; then SUFFIX_NUM="$2"; fi
elif [ "$1" = "--develop" ]; then
    branch="develop"
    if [ -n "$2" ] && [ "$2" -eq "$2" ] 2>/dev/null; then SUFFIX_NUM="$2"; fi
elif [ "$1" = "--main" ]; then
    branch="main"
else
    branch="$GIT_BRANCH"
fi

# Set version suffix based on branch
if [ "$branch" = "develop" ]; then
    version="${version}-develop${SUFFIX_NUM}"
elif [ "$branch" = "beta" ]; then
    version="${version}-beta${SUFFIX_NUM}"
elif [ "$branch" != "main" ]; then
    echo "Warning: unrecognized branch '$branch', defaulting to main"
    branch="main"
fi

filename="$CWD/archive/folder.view3-$version.txz"
dayversion=$(ls $CWD/archive/folder.view3-$version*.txz 2>/dev/null | wc -l)

if [ $dayversion -gt 0 ]
then
    version="$version.$dayversion"
    filename="$CWD/archive/folder.view3-$version.txz"
fi

mkdir -p $tmpdir

cd "$CWD/src/folder.view3"
cp --parents -f $(find . -type f ! \( -iname "pkg_build.sh" -o -iname "sftp-config.json"  \) ) $tmpdir/

# Set permissions for Unraid (only in temp dir, not the repo)
chmod -R 0755 $tmpdir

# Touch all files so autov() generates fresh cache-busting hashes
find $tmpdir -type f -exec touch {} +

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

echo "Package created: $filename"
echo "Version: $version"
echo "MD5: $md5"
echo "Branch: $branch"
echo "PLG file updated"
