#!/usr/bin/env bash
# Runs the Maestro suite against a booted Android emulator or a connected device.
#
#   ./e2e/run-android.sh              the whole suite
#   ./e2e/run-android.sh 03-plugins   one flow
#   ./e2e/run-android.sh --fresh      wipe the app's data first, then the whole suite
#   E2E_DEVICE=<serial> ...           pick the device when more than one is attached
#   E2E_METRO_PORT=8084 ...           Metro's port, 8081 by default
set -euo pipefail

FRESH=0
if [ "${1:-}" = "--fresh" ]; then
  FRESH=1
  shift
fi

APP_ID=im.statim.app
PORT="${E2E_METRO_PORT:-8081}"

MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
[ -x "$MAESTRO" ] || {
  echo "maestro not found at $MAESTRO. Install it:  curl -Ls https://get.maestro.mobile.dev | bash"
  exit 1
}

ADB="$(command -v adb || true)"
[ -n "$ADB" ] || ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
[ -x "$ADB" ] || { echo "adb not found. Install platform-tools and set ANDROID_HOME."; exit 1; }

java -version >/dev/null 2>&1 || {
  echo "No Java runtime. Install one:  brew install openjdk@21"
  exit 1
}

SERIAL="${E2E_DEVICE:-$("$ADB" devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')}"
[ -n "$SERIAL" ] || { echo "No Android device. Boot one:  emulator -avd <name>"; exit 1; }
ADB=("$ADB" -s "$SERIAL")

"${ADB[@]}" shell pm path "$APP_ID" >/dev/null 2>&1 || {
  echo "$APP_ID is not installed on $SERIAL. Build it:  npx expo run:android"
  exit 1
}

curl -sf -m 5 "http://localhost:$PORT/status" >/dev/null 2>&1 || {
  echo "Metro is not running on $PORT. Start it:  npx expo start --port $PORT"
  exit 1
}

if [ "$FRESH" = "1" ]; then
  echo "→ Clearing the app's data, so onboarding starts with no account."
  "${ADB[@]}" shell pm clear "$APP_ID" >/dev/null
fi

# The dev client reopens the last bundle it loaded, so every later launchApp
# lands in the app only once it has loaded this one.
"${ADB[@]}" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null
"$MAESTRO" --device "$SERIAL" test \
  -e DEV_CLIENT_URL="exp+statim://expo-development-client/?url=http%3A%2F%2Flocalhost%3A$PORT&disableOnboarding=1" \
  e2e/lib/android-dev-client.yaml

if [ $# -gt 0 ]; then
  exec "$MAESTRO" --device "$SERIAL" test "e2e/$1.yaml"
fi

exec "$MAESTRO" --device "$SERIAL" test --exclude-tags ios-only e2e
