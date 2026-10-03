#!/usr/bin/env bash
# Runs the Maestro suite on a booted iOS simulator or Android device.
#
#   ./e2e/run.sh ios|android              the whole suite
#   ./e2e/run.sh ios|android 03-plugins   one flow
#   ./e2e/run.sh ios|android --fresh      wipe the account first, then the whole suite
#   E2E_DEVICE=<udid|serial> ...          pick the device when more than one is booted
#   E2E_METRO_PORT=8084 ...               Metro's port, 8081 by default
set -euo pipefail

PLATFORM="${1:-}"
case "$PLATFORM" in
  ios) OTHER=android ;;
  android) OTHER=ios ;;
  *)
    echo "usage: e2e/run.sh ios|android [--fresh] [flow]" >&2
    exit 1
    ;;
esac
shift

FRESH=0
if [ "${1:-}" = "--fresh" ]; then
  FRESH=1
  shift
fi

APP_ID=im.statim.app
PORT="${E2E_METRO_PORT:-8081}"
DEVICE=()
[ -n "${E2E_DEVICE:-}" ] && DEVICE=(--device "$E2E_DEVICE")

MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
[ -x "$MAESTRO" ] || {
  echo "maestro not found at $MAESTRO. Install it:  curl -Ls https://get.maestro.mobile.dev | bash"
  exit 1
}

java -version >/dev/null 2>&1 || {
  echo "No Java runtime. Install one:  brew install --cask temurin@21"
  exit 1
}

ios() {
  command -v xcrun >/dev/null 2>&1 || { echo "The iOS run needs Xcode's command line tools."; exit 1; }

  if ! xcrun simctl list devices booted | grep -q "Booted"; then
    echo "No booted simulator. Start one, then: npx expo run:ios"
    exit 1
  fi

  # A stale dev client may not contain the native modules in the lock file.
  local app
  app="$(find "$HOME/Library/Developer/Xcode/DerivedData" \
    -path "*Debug-iphonesimulator*" -name "Statim.app" -print0 2>/dev/null \
    | xargs -0 ls -dt 2>/dev/null | head -1)"
  if [ "${E2E_SKIP_BUILD_CHECK:-0}" != "1" ] && [ -n "$app" ] && [ package-lock.json -nt "$app" ]; then
    echo "The built app is older than package-lock.json, so a native module may be missing."
    echo "  built: $(date -r "$app" '+%Y-%m-%d %H:%M')"
    echo "  deps:  $(date -r package-lock.json '+%Y-%m-%d %H:%M')"
    echo "  fix:   npx expo run:ios      (or E2E_SKIP_BUILD_CHECK=1 to run anyway)"
    exit 1
  fi

  # Fail promptly when CoreSimulator accepts commands but never answers them.
  xcrun simctl listapps booted >/dev/null 2>&1 &
  local probe=$! waited=0
  while kill -0 "$probe" 2>/dev/null; do
    if [ "$waited" -ge 30 ]; then
      kill -9 "$probe" 2>/dev/null || true
      echo "The booted simulator has stopped responding; CoreSimulator is wedged. Fix it:"
      echo "  xcrun simctl shutdown all"
      echo "  killall -9 com.apple.CoreSimulator.CoreSimulatorService"
      exit 1
    fi
    sleep 1
    waited=$((waited + 1))
  done

  # `clearState` does not clear the simulator Keychain.
  if [ "$FRESH" = "1" ]; then
    echo "→ Resetting the simulator keychain, so onboarding starts with no account."
    xcrun simctl keychain booted reset
  fi
}

android() {
  local path serial
  path="$(command -v adb || true)"
  [ -n "$path" ] || path="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
  [ -x "$path" ] || { echo "adb not found. Install platform-tools and set ANDROID_HOME."; exit 1; }

  serial="${E2E_DEVICE:-$("$path" devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')}"
  [ -n "$serial" ] || { echo "No Android device. Boot one:  emulator -avd <name>"; exit 1; }
  local adb=("$path" -s "$serial")
  DEVICE=(--device "$serial")

  "${adb[@]}" shell pm path "$APP_ID" >/dev/null 2>&1 || {
    echo "$APP_ID is not installed on $serial. Build it:  npx expo run:android"
    exit 1
  }

  if [ "$FRESH" = "1" ]; then
    echo "→ Clearing the app's data, so onboarding starts with no account."
    "${adb[@]}" shell pm clear "$APP_ID" >/dev/null
  fi

  # The dev client reopens the last bundle it loaded, so every later launchApp
  # lands in the app only once it has loaded this one.
  "${adb[@]}" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null
  "$MAESTRO" "${DEVICE[@]}" test \
    -e DEV_CLIENT_URL="exp+statim://expo-development-client/?url=http%3A%2F%2Flocalhost%3A$PORT&disableOnboarding=1" \
    e2e/lib/android-dev-client.yaml
}

curl -sf -m 5 "http://localhost:$PORT/status" >/dev/null 2>&1 || {
  echo "Metro is not running on $PORT. Start it:  npx expo start --port $PORT"
  exit 1
}

"$PLATFORM"

if [ $# -gt 0 ]; then
  exec "$MAESTRO" ${DEVICE[@]+"${DEVICE[@]}"} test "e2e/$1.yaml"
fi
exec "$MAESTRO" ${DEVICE[@]+"${DEVICE[@]}"} test --exclude-tags "$OTHER-only" e2e
