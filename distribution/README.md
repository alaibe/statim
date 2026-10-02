# Shipping

The text and images the stores ask for, and how each platform gets released.

| File | Goes into |
| --- | --- |
| `ios/store.config.json` | App Store Connect listing, through `eas metadata:push` |
| `ios/review-notes.md` | App Review Information → Notes, and TestFlight's Beta App Review notes |
| `ios/export-compliance.md` | the encryption questions App Store Connect asks on upload |
| `ios/screenshots/6.9/` | Media Manager → iPhone 6.9" Display |
| `privacy-labels.md` | App Privacy and Play's Data safety form |
| `play/listing.md` | Play Console listing, Data safety and content rating |
| `play/icon.png`, `play/feature-graphic.png` | Play listing graphics, from `npm run brand:build` |
| `play/screenshots/` | Main store listing → Phone screenshots |
| `capture.yaml` | the Maestro flow both sets of screenshots come from |

`./scripts/capture-screenshots.sh store path/to/Statim.app` retakes the
screenshots from an erased simulator, and
`./scripts/capture-screenshots.sh play path/to/app-release.apk` from a fresh
install on a booted emulator, so no real chat ends up in the listing. Use a
release build for a submission. `.claude/skills/store-artifacts/SKILL.md`
has the text limits and the other checks to run before submitting.

## Releasing

Bump the version in `app.json`, `package.json`, `package-lock.json`,
`src-tauri/Cargo.toml`, the `statim` entry of `src-tauri/Cargo.lock` and
`src-tauri/tauri.conf.json`. Commit, then push a `vX.Y.Z` tag to `github`.
The tag runs `.github/workflows/release.yml`:

| Job | Runner | Produces |
| --- | --- | --- |
| macOS | `macos-15` | universal `.dmg`, `.pkg` (also installs the `statim` command) and `.app.tar.gz` |
| Linux | `ubuntu-22.04` | `.deb`, `.rpm`, `.AppImage` |
| Windows | `windows-latest` | `.msi`, NSIS `.exe` |
| iOS | `ubuntu-latest` | an EAS build, uploaded to TestFlight |

The workflow fails before building if the tag, `app.json`, `package.json`,
`tauri.conf.json` and `Cargo.toml` disagree on the version. The GitHub release
is published once the three desktop jobs succeed. The iOS job does not hold it
back.

A manual run from the Actions tab builds the version `app.json` holds, and its
`draft` input keeps the release unpublished. If that version's release is
already published, the desktop jobs upload into it again. The iOS job runs too
and uploads a new build to TestFlight.

The macOS bundles are ad-hoc signed and not notarized, so macOS asks people to
allow the app on first open. Linux and Windows bundles are unsigned.

| Secret | For |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | signs desktop updates |
| `EXPO_TOKEN` | runs EAS from the iOS job |

Installed desktop copies only accept updates signed by that private key, and
its public key is `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. If
the private key is lost, installed copies can never update again.

## iOS

The App Store Connect app is "Statim Messenger", because "Statim" was taken.
The home screen still shows Statim. The bundle ID is `im.statim.app`, and
`eas.json` holds the App Store Connect app ID and the team ID. The EAS project
`@alaibe/statim` stores the distribution certificate, the provisioning profile,
the push key and the App Store Connect API key. EAS assigns build numbers and
ignores the `buildNumber` in `app.json`.

Builds go to TestFlight. To build and upload by hand:

```sh
eas build --platform ios --profile production --auto-submit
```

If EAS stops with "Runtime version mismatch", your `node_modules` differs from
a clean install. A local Android build rewrites some libraries' Android
manifests. Run `npm ci` and build again.

Before the first App Store review:

- Apple requires an organization developer account for apps with a wallet
  (guideline 3.1.5(b)).
- The app uses non-exempt encryption. Each build shows "Missing Compliance"
  until the questions are answered, and App Store Connect asks for a
  self-classification report or a CCATS, and a declaration for France. See
  `ios/export-compliance.md`.
- The `review` block in `ios/store.config.json` holds placeholders because this
  repository is public. Remove it before `eas metadata:push` and enter the
  contact details in App Store Connect.
- Keep other companies' names out of the keywords. Apple rejects trademarks
  there. The description may name Telegram and Matrix because the app works
  with them.
- Two things leave the device without the user acting: `expo-observe`
  performance data, including the host of the slowest request during launch,
  and the update check, which gives a device count per version.
  `privacy-labels.md`, `PRIVACY.md` and the privacy manifest in `app.json` all
  describe them. Change them together.
- App Store Connect offers Apple's standard EULA. `DISCLAIMER.md` is published
  at `/disclaimer` on the site.

## Android

Android is not released. It needs a Play developer account, a service account
key at `secrets/play-service-account.json` (gitignored), phone screenshots from
an Android build, and a target API level that meets Play's minimum. Gradle
needs a JDK from 17 to 21, and `./scripts/setup.sh --android` checks the
toolchain. Telegram on Android needs `libtdjsonjava.so` in
`modules/tdjson/android/src/main/jniLibs`, which
`./scripts/build-tdlib-android.sh` builds from TDLib's source. Nothing puts it
there for an EAS build yet, and a build without it reports Telegram as not
part of the build.

Play re-signs uploads with its own app signing key, while an APK built by EAS
carries EAS's key. People cannot upgrade between the two without uninstalling.
To ship both, upload EAS's keystore as the Play app signing key at the first
Play upload, because Play does not let you change it later.

## Mac App Store

Nothing has been submitted to the Mac App Store.
`src-tauri/tauri.appstore.conf.json` sandboxes the app against
`src-tauri/Entitlements.plist` and removes the updater, and
`--no-default-features` leaves it out of the binary. The entitlements cover USB
HID for a Ledger, the address book, user-selected files and network access.

It needs a Mac App Distribution certificate, a Mac Installer Distribution
certificate, a provisioning profile at `src-tauri/embedded.provisionprofile`
(gitignored), and the team ID `8N3Z3WWTK7` in place of `TEAMID` in
`Entitlements.plist`. Then:

```sh
./scripts/fetch-tdlib.sh
npx tauri build --bundles app --target universal-apple-darwin \
  --config src-tauri/tauri.appstore.conf.json -- --no-default-features

xcrun productbuild --sign "$APPLE_INSTALLER_IDENTITY" \
  --component "src-tauri/target/universal-apple-darwin/release/bundle/macos/Statim.app" \
  /Applications "Statim.pkg"

xcrun altool --upload-app --type macos --file "Statim.pkg" \
  --apiKey "$APPLE_API_KEY" --apiIssuer "$APPLE_API_ISSUER"
```

## Updates

The desktop app updates itself on macOS, Windows and the AppImage. It reads
`latest.json` from the newest release and checks the signature before
replacing the bundle. `.deb` and `.rpm` installs update by installing the new
package.

Mobile updates carry JavaScript and assets only:

```sh
eas update --channel production --message "what changed"
```

An update reaches only builds with the same runtime version, which is a
fingerprint of the native project. A change to native code needs a new build
and a new store upload.

## TDLib

`scripts/fetch-tdlib.sh` gets the library for the machine it runs on. On macOS
it builds one from Swiftgram's xcframework that exports only the
`td_json_client_*` symbols. Linux and Windows use TDLib 1.8.67 from the
`prebuilt-tdlib` npm packages, which Tauri bundles as a resource.

The prebuilt libraries contain OpenSSL and export its symbols. `Library::new`
in `src-tauri/src/tdlib.rs` must keep `libloading`'s default `RTLD_LOCAL`, or
TDLib's OpenSSL could replace the one SQLCipher uses.

Linux bundles need glibc 2.35 or newer, because they are built on
`ubuntu-22.04`. There are no musl, arm64 Linux or Windows on ARM builds of
TDLib here. Without the library, Telegram is unavailable and the rest of the
app works.
