#!/bin/bash
set -euo pipefail

# Platform detection — macOS vs Linux (Unraid)
if [[ "$(uname)" == "Darwin" ]]; then
    SED_I=(sed -i'')
    MD5CMD() { md5 -q "$1"; }
    CP_PARENTS() {
        rsync -aR --files-from=<(find . -type f ! \( -iname "pkg_build.sh" -o -iname "sftp-config.json" \)) . "$1/"
    }
    MAKE_TAR() { COPYFILE_DISABLE=1 tar --uid 0 --gid 0 --uname root --gname root -cJf "$1" *; }
else
    SED_I=(sed -i)
    MD5CMD() { md5sum "$1" | awk '{print $1}'; }
    CP_PARENTS() {
        cp --parents -f $(find . -type f ! \( -iname "pkg_build.sh" -o -iname "sftp-config.json" \)) "$1/"
    }
    MAKE_TAR() { tar --owner=0 --group=0 --no-xattrs -cJf "$1" *; }
fi

CWD=`pwd`
tmpdir="$CWD/tmp/tmp.$((RANDOM % 1000000))"
plgfile="$CWD/folder.view3.plg"
OUT="$CWD/dist"

# Usage: pkg_build.sh --version YYYY.MM.DD[.N] [--branch main|beta] [--out DIR]
# The release workflow owns version numbering; local test builds pass any version explicitly.
version=""
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
while [ $# -gt 0 ]; do
    case "$1" in
        --version) version="$2"; shift 2 ;;
        --branch)  branch="$2";  shift 2 ;;
        --out)     OUT="$2";     shift 2 ;;
        *) echo "ERROR: unknown option '$1'"; exit 1 ;;
    esac
done
[ -n "$version" ] || { echo "ERROR: --version is required (e.g. --version 0000.00.00 for a test build)"; exit 1; }
case "$branch" in
    main|beta) ;;
    *) echo "Warning: unrecognized branch '$branch', pointing pluginURL at main"; branch="main" ;;
esac
mkdir -p "$tmpdir" "$OUT"
OUT=$(cd "$OUT" && pwd)  # tar runs from the temp dir, so a relative --out would land there
filename="$OUT/folder.view3-$version-x86_64-1.txz"

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
xattr -cr $tmpdir 2>/dev/null || true
find $tmpdir -type f -exec touch {} +

cd $tmpdir
MAKE_TAR "$filename"

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

# Point pluginURL at this branch (URLs use XML entities like &github;)
"${SED_I[@]}" 's|&github;/[a-zA-Z]*/&name;.plg|\&github;/'"$branch"'/\&name;.plg|' "$plgfile"

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
