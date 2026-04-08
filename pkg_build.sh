#!/bin/bash
set -euo pipefail

# Platform detection — macOS vs Linux (Unraid)
if [[ "$(uname)" == "Darwin" ]]; then
    SED_I=(sed -i'')
    MD5CMD() { md5 -q "$1"; }
    CP_PARENTS() {
        rsync -aR --files-from=<(find . -type f ! \( -iname "pkg_build.sh" -o -iname "sftp-config.json" \)) . "$1/"
    }
else
    SED_I=(sed -i)
    MD5CMD() { md5sum "$1" | awk '{print $1}'; }
    CP_PARENTS() {
        cp --parents -f $(find . -type f ! \( -iname "pkg_build.sh" -o -iname "sftp-config.json" \)) "$1/"
    }
fi

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

if [ "${1:-}" = "--beta" ]; then
    branch="beta"
    if [ -n "${2:-}" ] && [ "${2:-}" -eq "${2:-}" ] 2>/dev/null; then SUFFIX_NUM="$2"; fi
elif [ "${1:-}" = "--develop" ]; then
    branch="develop"
    if [ -n "${2:-}" ] && [ "${2:-}" -eq "${2:-}" ] 2>/dev/null; then SUFFIX_NUM="$2"; fi
elif [ "${1:-}" = "--main" ]; then
    branch="main"
else
    branch="$GIT_BRANCH"
fi

# Set version suffix based on branch
if [ "$branch" = "develop" ] || [ "$branch" = "beta" ]; then
    if [ -z "$SUFFIX_NUM" ]; then
        # Auto-increment: find highest existing hotfix number and add 1
        highest=0
        for f in $CWD/archive/folder.view3-${version}.*[0-9].txz; do
            [ -e "$f" ] || continue
            num=$(echo "$f" | sed 's/.*\.\([0-9]*\)\.txz/\1/')
            [ -n "$num" ] && [ "$num" -gt "$highest" ] && highest=$num
        done
        SUFFIX_NUM=$((highest + 1))
    fi
    version="${version}.${SUFFIX_NUM}"
elif [ "$branch" != "main" ]; then
    echo "Warning: unrecognized branch '$branch', defaulting to main"
    branch="main"
fi

filename="$CWD/archive/folder.view3-$version.txz"

# Collision detection for main branch (date-based only)
if [ "$branch" = "main" ]; then
    dayversion=$(ls $CWD/archive/folder.view3-$version*.txz 2>/dev/null | wc -l | tr -d ' ' || echo 0)
    if [ "$dayversion" -gt 0 ]; then
        version="$version.$dayversion"
        filename="$CWD/archive/folder.view3-$version.txz"
    fi
fi

mkdir -p $tmpdir

cd "$CWD/src/folder.view3"
CP_PARENTS "$tmpdir"

# Verify files were copied
filecount=$(find "$tmpdir" -type f | wc -l | tr -d ' ')
if [ "$filecount" -lt 10 ]; then
    echo "ERROR: Only $filecount files copied to temp dir (expected 50+). Aborting."
    rm -rf "$CWD/tmp"
    exit 1
fi

# Set permissions for Unraid (only in temp dir, not the repo)
chmod -R 0755 $tmpdir

# Strip macOS extended attributes and touch all files for cache-busting
xattr -cr $tmpdir 2>/dev/null
find $tmpdir -type f -exec touch {} +

cd $tmpdir
# Strip macOS extended attributes so Slackware's installpkg/upgradepkg works cleanly
COPYFILE_DISABLE=1 tar --no-xattrs -cJf $filename * 2>/dev/null || COPYFILE_DISABLE=1 tar -cJf $filename *

cd $CWD

# Verify package is not empty
pkgsize=$(wc -c < "$filename" | tr -d ' ')
if [ "$pkgsize" -lt 1000 ]; then
    echo "ERROR: Package is only ${pkgsize} bytes (expected 50KB+). Aborting."
    rm -f "$filename"
    rm -rf "$CWD/tmp"
    exit 1
fi

md5=$(MD5CMD "$filename")

# Update version and md5 in plg file
"${SED_I[@]}" "s/<!ENTITY version.*>/<!ENTITY version \"$version\">/" "$plgfile"
"${SED_I[@]}" "s/<!ENTITY md5.*>/<!ENTITY md5 \"$md5\">/" "$plgfile"

# Update branch references in plg file (URLs use XML entities like &github;)
"${SED_I[@]}" 's|&github;/[a-zA-Z]*/&name;.plg|\&github;/'"$branch"'/\&name;.plg|' "$plgfile"
"${SED_I[@]}" 's|&github;/[a-zA-Z]*/archive/|\&github;/'"$branch"'/archive/|' "$plgfile"

# Verify plg was updated correctly
plg_version=$(grep 'ENTITY version' "$plgfile" | grep -o '"[^"]*"' | tr -d '"')
plg_md5=$(grep 'ENTITY md5' "$plgfile" | grep -o '"[^"]*"' | tr -d '"')
if [ "$plg_version" != "$version" ]; then
    echo "ERROR: PLG version is '$plg_version' but expected '$version'. sed failed."
    exit 1
fi
if [ "$plg_md5" != "$md5" ]; then
    echo "ERROR: PLG md5 is '$plg_md5' but expected '$md5'. sed failed."
    exit 1
fi

rm -R $CWD/tmp

echo ""
echo "Package created: $filename"
echo "Version: $version"
echo "MD5: $md5"
echo "Branch: $branch"
echo "Files: $filecount"
echo "Size: ${pkgsize} bytes"
echo "PLG verified ✓"
