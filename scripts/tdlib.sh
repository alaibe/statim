#!/usr/bin/env bash
#
# Puts TDLib where an app opens it. Every app runs this version; bump it here,
# then rebuild all three.
#
#   scripts/tdlib.sh desktop            this machine's desktop app
#   scripts/tdlib.sh ios                the iPhone app
#   scripts/tdlib.sh android [abi...]   the Android app, from source
set -euo pipefail

COMMIT="d1085f9cebc5a62379991ae1652673954f229c1f"
VERSION="1.8.67-${COMMIT:0:8}"
PREBUILT="0.1008067.0"
MIN_IOS="18.1"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/statim"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

current() {
  if [ -e "$1" ] && [ "$(cat "$(dirname "$1")/libtdjson.version" 2>/dev/null)" = "$VERSION" ]; then
    echo "$(basename "$1") is already at TDLib $VERSION"
    exit 0
  fi
}

# Swiftgram's static archives carry OpenSSL and SQLite, so each is relinked into
# a library exporting only TDLib's JSON entry points, or it would clash with
# the app's SQLCipher.
relink() {
  local slice="$1" out="$2" name="$3" symbols="$4" zip="$CACHE/TDLibFramework-$VERSION.zip"
  shift 4
  if [ ! -f "$zip" ]; then
    mkdir -p "$CACHE"
    echo "Downloading TDLibFramework $VERSION (about 360 MB)…"
    curl -fL --progress-bar -o "$zip.part" \
      "https://github.com/Swiftgram/TDLibFramework/releases/download/$VERSION/TDLibFramework.zip"
    mv "$zip.part" "$zip"
  fi
  unzip -q "$zip" "TDLibFramework.xcframework/$slice/*" -d "$TMP"
  local flags=()
  for symbol in $symbols; do flags+=("-Wl,-u,_$symbol" "-Wl,-exported_symbol,_$symbol"); done
  "$@" -dynamiclib "${flags[@]}" -Wl,-dead_strip -install_name "$name" -o "$out" \
    "$TMP/TDLibFramework.xcframework/$slice/TDLibFramework.framework/TDLibFramework" -lz
}

framework() {
  local slice="$1" sdk="$2" platform="$3"
  shift 3
  local out="$TMP/$slice/libtdjson.framework"
  mkdir -p "$out"
  relink "$slice" "$out/libtdjson" @rpath/libtdjson.framework/libtdjson \
    "td_create_client_id td_send td_receive td_execute" xcrun --sdk "$sdk" clang++ "$@"
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
  <key>CFBundleShortVersionString</key><string>${VERSION%%-*}</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleSupportedPlatforms</key><array><string>$platform</string></array>
  <key>MinimumOSVersion</key><string>$MIN_IOS</string>
</dict>
</plist>
PLIST
}

only() { sed -i.bak "s/^for ABI in .* ; do$/for ABI in $2 ; do/" "$1"; }

desktop() {
  local dest="$ROOT/src-tauri/frameworks" lib pkg=""
  case "$(uname -s)" in
    Darwin) lib="libtdjson.dylib" ;;
    Linux)
      lib="libtdjson.so"
      case "$(uname -m)" in
        aarch64 | arm64) pkg="linux-arm64-glibc" ;;
        *) pkg="linux-x64-glibc" ;;
      esac
      ;;
    MINGW* | MSYS* | CYGWIN*) lib="tdjson.dll" pkg="win32-x64" ;;
    *)
      echo "No TDLib for $(uname -s); Telegram will report itself unavailable." >&2
      exit 0
      ;;
  esac
  current "$dest/$lib"
  mkdir -p "$dest"

  if [ -n "$pkg" ]; then
    echo "Downloading @prebuilt-tdlib/$pkg@$PREBUILT…"
    (cd "$TMP" && npm pack "@prebuilt-tdlib/$pkg@$PREBUILT" --silent >/dev/null)
    tar xzf "$TMP"/*.tgz -C "$TMP"
    cp "$TMP/package/$lib" "$dest/$lib"
  else
    relink macos-arm64_x86_64 "$dest/$lib" "@rpath/$lib" \
      "td_json_client_create td_json_client_send td_json_client_receive td_json_client_execute td_json_client_destroy" \
      clang++ -arch arm64 -arch x86_64 -mmacosx-version-min=15.0
    codesign --force --sign - "$dest/$lib"
  fi
  echo "$VERSION" > "$dest/libtdjson.version"
  echo "Put TDLib $VERSION in $dest/$lib"
}

ios() {
  local dest="$ROOT/modules/tdjson/ios/Frameworks"
  current "$dest/libtdjson.xcframework"
  framework ios-arm64 iphoneos iPhoneOS -arch arm64 -miphoneos-version-min="$MIN_IOS"
  framework ios-arm64_x86_64-simulator iphonesimulator iPhoneSimulator \
    -arch arm64 -arch x86_64 -mios-simulator-version-min="$MIN_IOS"

  rm -rf "$dest/libtdjson.xcframework"
  mkdir -p "$dest"
  xcodebuild -create-xcframework \
    -framework "$TMP/ios-arm64/libtdjson.framework" \
    -framework "$TMP/ios-arm64_x86_64-simulator/libtdjson.framework" \
    -output "$dest/libtdjson.xcframework" >/dev/null
  echo "$VERSION" > "$dest/libtdjson.version"
  echo "Put TDLib $VERSION in $dest/libtdjson.xcframework"
}

# TDLib's own Android scripts with the JSONJava interface: td_json behind a small
# JNI class, so Android speaks the same JSON as the other apps.
android() {
  local abis="${*:-arm64-v8a armeabi-v7a x86_64 x86}" openssl="openssl-3.5.9" ndk="27.1.12297006"
  local dest="$ROOT/modules/tdjson/android/src/main/jniLibs" work="$CACHE/tdlib-android"
  local sdk="${ANDROID_HOME:?ANDROID_HOME must point at the Android SDK}"
  [ -d "$sdk/ndk/$ndk" ] || { echo "Missing NDK: sdkmanager 'ndk;$ndk'" >&2; exit 1; }
  [ -d "$sdk/cmake/3.22.1" ] || { echo "Missing CMake: sdkmanager 'cmake;3.22.1'" >&2; exit 1; }

  mkdir -p "$work"
  [ -d "$work/td" ] || git clone --quiet https://github.com/tdlib/td.git "$work/td"
  git -C "$work/td" fetch --quiet origin "$COMMIT" 2>/dev/null || true
  git -C "$work/td" checkout --quiet --force "$COMMIT"

  local scripts="$work/td/example/android" missing=""
  for abi in $abis; do [ -d "$work/$openssl/$abi" ] || missing="$missing $abi"; done
  if [ -n "$missing" ]; then
    only "$scripts/build-openssl.sh" "$missing"
    rm -rf "$work/$openssl-new"
    (cd "$scripts" && ./build-openssl.sh "$sdk" "$ndk" "$work/$openssl-new" "$openssl")
    mkdir -p "$work/$openssl"
    mv "$work/$openssl-new"/* "$work/$openssl/"
  fi

  only "$scripts/build-tdlib.sh" "$abis"
  (cd "$scripts" && ./build-tdlib.sh "$sdk" "$ndk" "$work/$openssl" c++_static JSONJava)
  for abi in $abis; do
    mkdir -p "$dest/$abi"
    cp "$scripts/tdlib/libs/$abi/libtdjsonjava.so" "$dest/$abi/"
  done
  echo "Put TDLib $VERSION for $abis in $dest"
}

case "${1:-}" in
  desktop | ios | android) "$@" ;;
  *)
    echo "usage: scripts/tdlib.sh desktop | ios | android [abi...]" >&2
    exit 1
    ;;
esac
