#!/usr/bin/env bash
#   scripts/build-mac-pkg.sh <path/to/Statim.app> <version> <out.pkg>
set -euo pipefail

APP="$1"
VERSION="$2"
OUT="$3"
NAME="$(basename "$APP")"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/root/Applications" "$work/scripts"
ditto "$APP" "$work/root/Applications/$NAME"

cat > "$work/scripts/postinstall" <<SCRIPT
#!/bin/sh
mkdir -p /usr/local/bin
ln -sf "/Applications/$NAME/Contents/MacOS/statim" /usr/local/bin/statim
SCRIPT
chmod +x "$work/scripts/postinstall"

# Installed where it says, never "relocated" onto another copy of the app found elsewhere.
pkgbuild --analyze --root "$work/root" "$work/components.plist" >/dev/null
plutil -replace 0.BundleIsRelocatable -bool NO "$work/components.plist"

pkgbuild \
  --root "$work/root" \
  --component-plist "$work/components.plist" \
  --scripts "$work/scripts" \
  --identifier im.statim.app.pkg \
  --version "$VERSION" \
  --install-location / \
  "$OUT"
