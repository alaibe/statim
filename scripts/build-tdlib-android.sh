#!/usr/bin/env bash
#
# Builds TDLib for Android from the official source, at the commit the desktop
# runs (scripts/fetch-tdlib.sh), into modules/tdjson. It uses TDLib's own
# Android scripts with the JSONJava interface, which is td_json behind a small
# JNI class, so Android speaks the same JSON as iOS and the desktop.
#
#   ./scripts/build-tdlib-android.sh                    every ABI
#   ./scripts/build-tdlib-android.sh arm64-v8a x86_64   only these
#
# Needs ANDROID_HOME with ndk;27.1.12297006 and cmake;3.22.1, and JDK, PHP,
# perl and gperf on the PATH. OpenSSL and TDLib build once per ABI; work stays
# in ~/.cache/statim/tdlib-android, so a second run only copies.
set -euo pipefail

COMMIT="d1085f9cebc5a62379991ae1652673954f229c1f"
VERSION="1.8.67-d1085f9c"
OPENSSL="openssl-3.5.9"
NDK="27.1.12297006"
ABIS="${*:-arm64-v8a armeabi-v7a x86_64 x86}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/modules/tdjson/android/src/main/jniLibs"
WORK="${XDG_CACHE_HOME:-$HOME/.cache}/statim/tdlib-android"
SDK="${ANDROID_HOME:?ANDROID_HOME must point at the Android SDK}"

[ -d "$SDK/ndk/$NDK" ] || { echo "Missing NDK: sdkmanager 'ndk;$NDK'"; exit 1; }
[ -d "$SDK/cmake/3.22.1" ] || { echo "Missing CMake: sdkmanager 'cmake;3.22.1'"; exit 1; }

mkdir -p "$WORK"
if [ ! -d "$WORK/td" ]; then
  git clone --quiet https://github.com/tdlib/td.git "$WORK/td"
fi
git -C "$WORK/td" fetch --quiet origin "$COMMIT" 2>/dev/null || true
git -C "$WORK/td" checkout --quiet --force "$COMMIT"

SCRIPTS="$WORK/td/example/android"
# Upstream loops over all four ABIs; build only the ones asked for.
only() { sed -i.bak "s/^for ABI in .* ; do$/for ABI in $2 ; do/" "$SCRIPTS/$1"; }

MISSING=""
for ABI in $ABIS; do [ -d "$WORK/$OPENSSL/$ABI" ] || MISSING="$MISSING $ABI"; done
if [ -n "$MISSING" ]; then
  only build-openssl.sh "$MISSING"
  rm -rf "$WORK/$OPENSSL-new"
  (cd "$SCRIPTS" && ./build-openssl.sh "$SDK" "$NDK" "$WORK/$OPENSSL-new" "$OPENSSL")
  mkdir -p "$WORK/$OPENSSL"
  mv "$WORK/$OPENSSL-new"/* "$WORK/$OPENSSL/"
  rm -rf "$WORK/$OPENSSL-new"
fi

only build-tdlib.sh "$ABIS"
(cd "$SCRIPTS" && ./build-tdlib.sh "$SDK" "$NDK" "$WORK/$OPENSSL" c++_static JSONJava)

for ABI in $ABIS; do
  mkdir -p "$DEST/$ABI"
  cp "$SCRIPTS/tdlib/libs/$ABI/libtdjsonjava.so" "$DEST/$ABI/"
done
echo "$VERSION" > "$DEST/libtdjsonjava.version"
echo "Built TDLib $VERSION for $ABIS into $DEST"
