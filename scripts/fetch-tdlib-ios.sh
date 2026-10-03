#!/usr/bin/env bash
#
# Puts TDLib into modules/tdjson for the iPhone app, at the version the desktop
# and Android run. It takes the macOS route (scripts/fetch-tdlib.sh): Swiftgram's
# static archive carries OpenSSL and SQLite, so it is linked into a framework of
# its own that exports only TDLib's JSON entry points and cannot clash with the
# SQLCipher expo-sqlite links into the app.
#
# Without it the iPhone app still builds, and Telegram reports itself
# unavailable. The download stays in ~/.cache/statim/tdlib-ios.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/tdlib.env"
MIN_IOS="18.1"
DEST="$ROOT/modules/tdjson/ios/Frameworks"
STAMP="$DEST/libtdjson.version"
WORK="${XDG_CACHE_HOME:-$HOME/.cache}/statim/tdlib-ios"

if [ -d "$DEST/libtdjson.xcframework" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$TDLIB_VERSION" ]; then
  echo "libtdjson.xcframework is already at TDLib $TDLIB_VERSION"
  exit 0
fi

mkdir -p "$WORK"
ZIP="$WORK/TDLibFramework-$TDLIB_VERSION.zip"
if [ ! -f "$ZIP" ]; then
  echo "Downloading TDLibFramework $TDLIB_VERSION (about 360 MB)…"
  curl -fL --progress-bar -o "$ZIP.part" \
    "https://github.com/Swiftgram/TDLibFramework/releases/download/$TDLIB_VERSION/TDLibFramework.zip"
  mv "$ZIP.part" "$ZIP"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q "$ZIP" 'TDLibFramework.xcframework/ios-*' -d "$TMP"

ENTRIES="create_client_id send receive execute"
printf '_td_%s\n' $ENTRIES > "$TMP/exports.txt"
UNDEFINED=()
for entry in $ENTRIES; do UNDEFINED+=("-Wl,-u,_td_$entry"); done

# framework <slice> <sdk> <platform> <target suffix> <arch>...
framework() {
  local slice="$1" sdk="$2" platform="$3" suffix="$4"
  shift 4
  local archive="$TMP/TDLibFramework.xcframework/$slice/TDLibFramework.framework/TDLibFramework"
  local out="$TMP/$slice/libtdjson.framework"
  local linked=()
  mkdir -p "$out"
  for arch in "$@"; do
    local input="$archive"
    if [ "$#" -gt 1 ]; then
      input="$TMP/$slice-$arch.a"
      lipo "$archive" -thin "$arch" -output "$input"
    fi
    xcrun --sdk "$sdk" clang++ -dynamiclib -target "$arch-apple-ios$MIN_IOS$suffix" \
      "${UNDEFINED[@]}" -Wl,-exported_symbols_list,"$TMP/exports.txt" -Wl,-dead_strip \
      -install_name @rpath/libtdjson.framework/libtdjson -o "$TMP/$slice-$arch" "$input" -lz
    linked+=("$TMP/$slice-$arch")
  done
  lipo -create "${linked[@]}" -output "$out/libtdjson"
  strip -x "$out/libtdjson"
  cat > "$out/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>libtdjson</string>
  <key>CFBundleIdentifier</key><string>im.statim.tdjson</string>
  <key>CFBundleName</key><string>libtdjson</string>
  <key>CFBundlePackageType</key><string>FMWK</string>
  <key>CFBundleShortVersionString</key><string>${TDLIB_VERSION%%-*}</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleSupportedPlatforms</key><array><string>$platform</string></array>
  <key>MinimumOSVersion</key><string>$MIN_IOS</string>
</dict>
</plist>
PLIST
}

framework ios-arm64 iphoneos iPhoneOS "" arm64
framework ios-arm64_x86_64-simulator iphonesimulator iPhoneSimulator -simulator arm64 x86_64

rm -rf "$DEST/libtdjson.xcframework"
mkdir -p "$DEST"
xcodebuild -create-xcframework \
  -framework "$TMP/ios-arm64/libtdjson.framework" \
  -framework "$TMP/ios-arm64_x86_64-simulator/libtdjson.framework" \
  -output "$DEST/libtdjson.xcframework" >/dev/null
echo "$TDLIB_VERSION" > "$STAMP"
echo "Built $DEST/libtdjson.xcframework from TDLib $TDLIB_VERSION"
