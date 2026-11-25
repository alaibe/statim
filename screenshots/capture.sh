#!/usr/bin/env bash
# Captures Statim's screenshots, as the design system's patterns/screenshots.md says:
#   site           the guide's, light and dark, 660 px WebP into $SITE_CHECKOUT/public/sites/statim/screenshots
#   store-ios      the App Store's, dark, 1320x2868 PNG into screenshots/store/ios
#   store-android  Google Play's, dark, 1080x1920 PNG into screenshots/store/android
set -euo pipefail

usage() {
    echo "usage: APP=path/to/Statim.app screenshots/capture.sh site | store-ios" >&2
    echo "       APP=path/to/app-release.apk screenshots/capture.sh store-android" >&2
    echo "site takes a Debug build with Metro running (npm start) and SITE_CHECKOUT, a checkout of laibe;" >&2
    echo "store-ios and store-android take a Release build." >&2
    exit 1
}

fail() {
    echo "$1" >&2
    exit 1
}

[ $# -eq 1 ] || usage
KIND=$1
APP=${APP:-}
[ -n "$APP" ] || usage
[ -e "$APP" ] || fail "$APP doesn't exist"

cd "$(dirname "$0")/.."
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
[ -x "$MAESTRO" ] || fail "maestro not found at $MAESTRO. Install it:  curl -Ls https://get.maestro.mobile.dev | bash"
[ -d /opt/homebrew/opt/openjdk/bin ] && export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
java -version >/dev/null 2>&1 || fail "No Java runtime for Maestro. Install one:  brew install openjdk"

RUN=$(mktemp -d)
ADB=()
NIGHT=""
UDID=""
cleanup() {
    if [ ${#ADB[@]} -gt 0 ]; then
        "${ADB[@]}" shell wm size reset || true
        "${ADB[@]}" shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null || true
        [ -z "$NIGHT" ] || "${ADB[@]}" shell cmd uimode night "$NIGHT" >/dev/null || true
    fi
    [ -z "$UDID" ] || xcrun simctl shutdown "$UDID" 2>/dev/null || true
    rm -rf "$RUN"
}
trap cleanup EXIT

# A clean iPhone 17 Pro Max (1320x2868) in the given appearance, at 9:41 with a full battery, the app installed.
simulator() {
    local appearance=$1 name="Statim $KIND"
    if [ -z "$UDID" ]; then
        UDID=$(xcrun simctl list devices -j | jq -r --arg name "$name" '[.devices[][] | select(.name == $name)][0].udid // empty')
        [ -n "$UDID" ] || UDID=$(xcrun simctl create "$name" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max)
    fi
    xcrun simctl shutdown "$UDID" 2>/dev/null || true
    xcrun simctl erase "$UDID"
    xcrun simctl bootstatus "$UDID" -b >/dev/null
    xcrun simctl ui "$UDID" appearance "$appearance"
    xcrun simctl status_bar "$UDID" override --time 9:41 --dataNetwork wifi --wifiBars 3 --cellularBars 4 \
        --batteryState charged --batteryLevel 100
    xcrun simctl install "$UDID" "$APP"
}

# Runs a flow, refuses a shot of the wrong size, and prints the folder of its shots.
capture() {
    local device=$1 flow=$2 size=$3 out shots png
    out=$(mktemp -d "$RUN/run.XXXXXX")
    "$MAESTRO" --device "$device" test --test-output-dir "$out" "$flow" >&2
    shots=$(find "$out" -type d -name takeScreenshot | head -n 1)
    [ -n "$shots" ] || shots=$out
    compgen -G "$shots/*.png" >/dev/null || fail "Maestro saved no screenshots."
    for png in "$shots"/*.png; do
        file "$png" | grep -q ", $size," || fail "$(basename "$png") isn't $size: wrong simulator or emulator size."
    done
    echo "$shots"
}

# The store's shots replace the folder's PNGs.
keep() {
    local shots=$1 out=$2
    mkdir -p "$out"
    rm -f "$out"/*.png
    cp "$shots"/*.png "$out/"
    ls "$out"
}

store_ios() {
    local shots
    simulator dark
    shots=$(capture "$UDID" screenshots/store.yaml "1320 x 2868")
    keep "$shots" screenshots/store/ios
}

store_android() {
    local adb serial shots
    adb="$(command -v adb || echo "${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb")"
    [ -x "$adb" ] || fail "adb not found. Install platform-tools and set ANDROID_HOME."
    serial="${ANDROID_SERIAL:-$("$adb" devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')}"
    [ -n "$serial" ] || fail "No Android device. Boot one:  emulator -avd <name>"
    ADB=("$adb" -s "$serial")
    NIGHT=$("${ADB[@]}" shell cmd uimode night | awk '{ print $NF }' | tr -d '\r')
    "${ADB[@]}" shell cmd uimode night yes >/dev/null
    "${ADB[@]}" uninstall im.statim.app >/dev/null 2>&1 || true
    "${ADB[@]}" install -g "$APP" >/dev/null
    "${ADB[@]}" shell wm size 1080x1920
    "${ADB[@]}" shell settings put global sysui_demo_allowed 1
    "${ADB[@]}" shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null
    "${ADB[@]}" shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941 >/dev/null
    "${ADB[@]}" shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false >/dev/null
    "${ADB[@]}" shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false >/dev/null
    shots=$(capture "$serial" screenshots/store.yaml "1080 x 1920")
    keep "$shots" screenshots/store/android
}

# The guide's shots come from a Debug build through Metro: statim://fixture/move-invite exists only there.
site() {
    local port=${METRO_PORT:-8081} out stage names mode shots png name webp
    [ -n "${SITE_CHECKOUT:-}" ] || fail "Set SITE_CHECKOUT to a checkout of laibe."
    [ -d "$SITE_CHECKOUT/public/sites/statim" ] || fail "$SITE_CHECKOUT isn't a checkout of laibe."
    command -v cwebp >/dev/null || fail "cwebp not found. Install it:  brew install webp"
    [ -e "$APP/EXDevLauncher.bundle" ] || [ -d "$APP/Frameworks/EXDevLauncher.framework" ] \
        || fail "$APP isn't a Debug build, which the move-invite fixture needs."
    curl -fsS "http://localhost:$port/status" 2>/dev/null | grep -q packager-status:running \
        || fail "Metro isn't running on :$port. Start it:  npm start"

    names=$(awk '$1 == "-" && $2 == "takeScreenshot:" { print $3 }' screenshots/site.yaml)
    stage="$RUN/site"
    mkdir -p "$stage"
    for mode in light dark; do
        simulator "$mode"
        xcrun simctl spawn "$UDID" defaults write im.statim.app EXDevMenuShowsAtLaunch -bool NO
        xcrun simctl spawn "$UDID" defaults write im.statim.app EXDevMenuIsOnboardingFinished -bool YES
        xcrun simctl spawn "$UDID" defaults write im.statim.app EXDevMenuShowFloatingActionButton -bool NO
        xcrun simctl openurl "$UDID" "im.statim.app://expo-development-client/?url=http%3A%2F%2Flocalhost%3A$port"
        sleep 20
        shots=$(capture "$UDID" screenshots/site.yaml "1320 x 2868")
        for png in "$shots"/*.png; do
            name=$(basename "$png" .png)
            webp="$stage/$name-$mode.webp"
            cwebp -quiet -q 82 -resize 660 0 "$png" -o "$webp"
            [ "$(sips -g pixelWidth "$webp" | awk '/pixelWidth/ { print $2 }')" = 660 ] \
                || fail "$name-$mode.webp isn't 660 px wide."
        done
    done
    for name in $names; do
        for mode in light dark; do
            [ -f "$stage/$name-$mode.webp" ] || fail "$name wasn't captured in $mode."
        done
    done

    out="$SITE_CHECKOUT/public/sites/statim/screenshots"
    mkdir -p "$out"
    rm -f "$out"/*-light.webp "$out"/*-dark.webp
    for name in $names; do
        rm -f "$out/$name.png"
    done
    cp "$stage"/*.webp "$out/"
    ls "$out"
}

case "$KIND" in
    site) site ;;
    store-ios) store_ios ;;
    store-android) store_android ;;
    *) usage ;;
esac
