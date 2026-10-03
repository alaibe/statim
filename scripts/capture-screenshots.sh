#!/usr/bin/env bash
# Captures screenshots from a clean simulator or emulator.
#
#   scripts/capture-screenshots.sh store            # App Store, 1320×2868, verified
#   scripts/capture-screenshots.sh play             # Google Play, 1080×1920, verified
#   scripts/capture-screenshots.sh docs             # user guide, halved for the web
#   scripts/capture-screenshots.sh store path/to.app
#   scripts/capture-screenshots.sh play path/to.apk
#
# The simulator is erased, or the app reinstalled on the emulator, and the flow
# creates its own account, because this is a messenger: a screenshot taken on a
# device someone has used holds real conversations, addresses and names, and a
# store listing is the most public place those could end up.
#
# SIM_MODEL, METRO_PORT and ANDROID_SERIAL override the defaults.
set -euo pipefail

cd "$(dirname "$0")/.."

case "${1:-}" in
  store)
    PLATFORM=ios
    FLOW="distribution/capture.yaml"
    OUT="distribution/ios/screenshots/6.9"
    # Apple requires 6.9" iPhone screenshots at exactly this size.
    EXPECTED="1320 2868"
    WIDTH=""
    ;;
  play)
    PLATFORM=android
    FLOW="distribution/capture.yaml"
    OUT="distribution/play/screenshots"
    # Play takes 9:16 and promotes listings with shots at least 1080 wide.
    EXPECTED="1080 1920"
    WIDTH=""
    ;;
  docs)
    PLATFORM=ios
    FLOW="docs/screenshots/capture.yaml"
    OUT="docs/public/screenshots"
    EXPECTED=""
    WIDTH=660
    ;;
  *)
    echo "usage: $0 <store|play|docs> [path/to.app|path/to.apk]" >&2
    exit 1
    ;;
esac

capture_ios() {
  MODEL="${SIM_MODEL:-iPhone 17 Pro Max}"
  PORT="${METRO_PORT:-8081}"

  DEVICE=$(xcrun simctl list devices available | grep "$MODEL (" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
  [ -n "$DEVICE" ] || { echo "No available simulator named '$MODEL'." >&2; exit 1; }

  # The newest debug build, since several worktrees may have one.
  APP="${1:-$(ls -td ~/Library/Developer/Xcode/DerivedData/Statim-*/Build/Products/Debug-iphonesimulator/Statim.app 2>/dev/null | head -1)}"
  [ -d "$APP" ] || { echo "No app bundle. Build one (xcodebuild or expo run:ios) or pass its path." >&2; exit 1; }

  echo "device  $MODEL ($DEVICE)"
  echo "app     $APP"
  echo "flow    $FLOW"

  xcrun simctl shutdown "$DEVICE" 2>/dev/null || true
  xcrun simctl erase "$DEVICE"
  xcrun simctl bootstatus "$DEVICE" -b >/dev/null
  xcrun simctl install "$DEVICE" "$APP"

  # A debug build loads JavaScript from Metro; a release build embeds it. The
  # interface comes from the routing table rather than an assumed en0, because a
  # blank host produces "Invalid URL: http://:8081" inside the app.
  if [ -f "$APP/EXDevLauncher.bundle/Info.plist" ] || [ -d "$APP/Frameworks/EXDevLauncher.framework" ] || [ -z "${1:-}" ]; then
    curl -sf "http://localhost:$PORT/status" >/dev/null || { echo "Metro is not listening on :$PORT; start it with npm start." >&2; exit 1; }
    xcrun simctl spawn "$DEVICE" defaults write im.statim.app EXDevMenuShowsAtLaunch -bool NO
    xcrun simctl spawn "$DEVICE" defaults write im.statim.app EXDevMenuIsOnboardingFinished -bool YES
    xcrun simctl spawn "$DEVICE" defaults write im.statim.app EXDevMenuShowFloatingActionButton -bool NO
    HOST=$(ipconfig getifaddr "$(route -n get default | awk '/interface:/{print $2}')")
    xcrun simctl openurl "$DEVICE" "im.statim.app://expo-development-client/?url=http%3A%2F%2F${HOST}%3A${PORT}"
    sleep 20
  fi

  PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ~/.maestro/bin/maestro --device "$DEVICE" test "$FLOW"
}

capture_android() {
  ADB="$(command -v adb || echo "${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}/platform-tools/adb")"
  [ -x "$ADB" ] || { echo "adb not found. Install platform-tools and set ANDROID_HOME." >&2; exit 1; }
  SERIAL="${ANDROID_SERIAL:-$("$ADB" devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')}"
  [ -n "$SERIAL" ] || { echo "No Android device. Boot one:  emulator -avd <name>" >&2; exit 1; }
  ADB=("$ADB" -s "$SERIAL")

  APK="${1:-android/app/build/outputs/apk/release/app-release.apk}"
  [ -f "$APK" ] || { echo "No APK. Build one (./gradlew :app:assembleRelease in android/) or pass its path." >&2; exit 1; }

  echo "device  $SERIAL"
  echo "apk     $APK"
  echo "flow    $FLOW"

  "${ADB[@]}" uninstall im.statim.app >/dev/null 2>&1 || true
  "${ADB[@]}" install -g "$APK" >/dev/null

  # Emulators are taller than 9:16, so the display is resized for the run, and
  # demo mode keeps notifications and a low battery out of the status bar.
  demo() { "${ADB[@]}" shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null; }
  trap '"${ADB[@]}" shell wm size reset; demo exit' EXIT
  "${ADB[@]}" shell wm size "${EXPECTED// /x}"
  "${ADB[@]}" shell settings put global sysui_demo_allowed 1
  demo enter
  demo clock -e hhmm 0941
  demo battery -e level 100 -e plugged false
  demo network -e wifi show -e level 4 -e fully true
  demo network -e mobile hide
  demo notifications -e visible false

  PATH="/opt/homebrew/opt/openjdk/bin:$PATH" ~/.maestro/bin/maestro --device "$SERIAL" test "$FLOW"
}

"capture_$PLATFORM" "${2:-}"

# Maestro writes into its own run directory; take the latest.
RUN=$(ls -td ~/.maestro/tests/*/ | sed -n 1p)
mkdir -p "$OUT"
rm -f "$OUT"/*.png

if [ -n "$WIDTH" ]; then
  for png in "$RUN"capture/takeScreenshot/*.png; do
    sips --resampleWidth "$WIDTH" "$png" --out "$OUT/$(basename "$png")" >/dev/null
  done
else
  cp "$RUN"capture/takeScreenshot/*.png "$OUT"/
fi

if [ -n "$EXPECTED" ]; then
  for png in "$OUT"/*.png; do
    size=$(sips -g pixelWidth -g pixelHeight "$png" | awk '/pixel/{printf "%s ", $2}' | sed 's/ $//')
    if [ "$size" != "$EXPECTED" ]; then
      echo "$png is $size, not $EXPECTED: wrong simulator or emulator size." >&2
      exit 1
    fi
  done
fi

ls "$OUT"
