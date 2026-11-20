#!/usr/bin/env bash
# Signs an unsigned Statim.app for Developer ID, inside out, under the hardened runtime with a timestamp: every Mach-O
# and bundle nested in it first, TDLib's libtdjson.dylib among them (scripts/tdlib.sh signs it only ad hoc), then the
# app with src-tauri/Entitlements.release.plist. Notarization refuses a bundle with anything unsigned, and the hardened
# runtime won't load a library another team signed.
#
#   scripts/sign-macos.sh <path/to/Statim.app> "<Developer ID Application: …>" [<keychain>]
#
# The identity must be in the default keychain search list, or in the keychain passed third.
set -euo pipefail

usage="usage: sign-macos.sh <Statim.app> <identity> [keychain]"
app="${1:?$usage}"
identity="${2:?$usage}"
keychain="${3:-}"
entitlements="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/Entitlements.release.plist"
main="$app/Contents/MacOS/statim"

sign() {
    local args=(--force --sign "$identity" --options runtime --timestamp)
    [ -n "$keychain" ] && args+=(--keychain "$keychain")
    codesign "${args[@]}" "$@"
}

[ -f "$main" ] || {
    echo "no $main: is $app an unsigned Statim build?" >&2
    exit 1
}
[ -f "$app/Contents/Frameworks/libtdjson.dylib" ] || {
    echo "no libtdjson.dylib in $app/Contents/Frameworks: did scripts/tdlib.sh desktop run before the build?" >&2
    exit 1
}

# -depth lists what a folder holds before the folder, so a nested bundle is signed after its own files. The main
# executable is left to the app's own signature, which carries the entitlements.
while IFS= read -r -d '' path; do
    if [ -d "$path" ]; then
        sign "$path"
    else
        case "$(file -b --mime-type "$path")" in
            application/x-mach-binary*) sign "$path" ;;
        esac
    fi
done < <(find "$app/Contents" -mindepth 1 -depth \( -type d \( -name '*.framework' -o -name '*.app' -o -name '*.xpc' \
    -o -name '*.appex' \) -o -type f ! -path "$main" \) -print0)

sign --entitlements "$entitlements" "$app"

codesign --verify --deep --strict --verbose=2 "$app"
if codesign -d --entitlements - "$app" 2>/dev/null | grep -q get-task-allow; then
    echo "$app carries get-task-allow; notarization would refuse it." >&2
    exit 1
fi
echo "Signed $app"
