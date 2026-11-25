#!/usr/bin/env bash
# Captures the store screenshots into store/ios (App Store 6.9", 1320x2868) or store/android (Google Play, 1080x1920).
set -euo pipefail

usage() {
    echo "usage: store/capture.sh ios path/to/Statim.app | android path/to/app-release.apk" >&2
    exit 1
}

[ $# -eq 2 ] || usage
PLATFORM=$1
APP=$2
[ -e "$APP" ] || {
    echo "$APP doesn't exist" >&2
    exit 1
}

cd "$(dirname "$0")/.."
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
[ -x "$MAESTRO" ] || {
    echo "maestro not found at $MAESTRO. Install it:  curl -Ls https://get.maestro.mobile.dev | bash" >&2
    exit 1
}
[ -d /opt/homebrew/opt/openjdk/bin ] && export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
java -version >/dev/null 2>&1 || {
    echo "No Java runtime for Maestro. Install one:  brew install openjdk" >&2
    exit 1
}

RUN=$(mktemp -d)
ADB=()
cleanup() {
    if [ ${#ADB[@]} -gt 0 ]; then
        "${ADB[@]}" shell wm size reset || true
        "${ADB[@]}" shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null || true
    fi
    rm -rf "$RUN"
}
trap cleanup EXIT

ios() {
    local name="Statim store" udid
    udid=$(xcrun simctl list devices -j | jq -r --arg name "$name" '[.devices[][] | select(.name == $name)][0].udid // empty')
    [ -n "$udid" ] || udid=$(xcrun simctl create "$name" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max)
    xcrun simctl shutdown "$udid" 2>/dev/null || true
    xcrun simctl erase "$udid"
    xcrun simctl bootstatus "$udid" -b >/dev/null
    xcrun simctl status_bar "$udid" override --time 9:41 --dataNetwork wifi --wifiBars 3 --cellularBars 4 \
        --batteryState charged --batteryLevel 100
    xcrun simctl install "$udid" "$APP"
    DEVICE=$udid
    OUT=store/ios
    SIZE="1320 x 2868"
}

android() {
    local adb serial
    adb="$(command -v adb || echo "${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb")"
    [ -x "$adb" ] || {
        echo "adb not found. Install platform-tools and set ANDROID_HOME." >&2
        exit 1
    }
    serial="${ANDROID_SERIAL:-$("$adb" devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')}"
    [ -n "$serial" ] || {
        echo "No Android device. Boot one:  emulator -avd <name>" >&2
        exit 1
    }
    ADB=("$adb" -s "$serial")
    "${ADB[@]}" uninstall im.statim.app >/dev/null 2>&1 || true
    "${ADB[@]}" install -g "$APP" >/dev/null
    "${ADB[@]}" shell wm size 1080x1920
    "${ADB[@]}" shell settings put global sysui_demo_allowed 1
    "${ADB[@]}" shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null
    "${ADB[@]}" shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941 >/dev/null
    "${ADB[@]}" shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false >/dev/null
    "${ADB[@]}" shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false >/dev/null
    DEVICE=$serial
    OUT=store/android
    SIZE="1080 x 1920"
}

case "$PLATFORM" in
    ios) ios ;;
    android) android ;;
    *) usage ;;
esac

"$MAESTRO" --device "$DEVICE" test --test-output-dir "$RUN" store/capture.yaml

SHOTS=$(find "$RUN" -type d -name takeScreenshot | head -n 1)
[ -n "$SHOTS" ] || SHOTS=$RUN
compgen -G "$SHOTS/*.png" >/dev/null || {
    echo "Maestro saved no screenshots." >&2
    exit 1
}

mkdir -p "$OUT"
rm -f "$OUT"/*.png
for png in "$SHOTS"/*.png; do
    file "$png" | grep -q ", $SIZE," || {
        echo "$(basename "$png") isn't $SIZE: wrong simulator or emulator size." >&2
        exit 1
    }
    cp "$png" "$OUT/"
done
ls "$OUT"
