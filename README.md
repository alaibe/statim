# Statim

An encrypted messenger whose account is a key you hold: twelve words generated
on the device, with no sign-up, phone number or server of ours. XMTP, Nostr,
Status, Telegram and Matrix chats share one list, and the same phrase is an
Ethereum, Bitcoin and Solana wallet. It runs on iOS, Android, macOS, Windows
and Linux from one Expo codebase; the desktop app is its web export in a Tauri
window.

[User guide](https://statim.laibe.cc/) · [Security](SECURITY.md) ·
[Privacy](https://statim.laibe.cc/privacy) · [Disclaimer](https://statim.laibe.cc/disclaimer)

## Install

iPhone: [TestFlight](https://testflight.apple.com/join/kQGUUDUv). Android:
[Google Play](https://play.google.com/apps/testing/im.statim.app). Mac:
`brew install --cask alaibe/tap/statim`.

## Run from source

Node.js 24, Xcode 27.2 with an iPhone simulator, and CocoaPods; Rust for the
desktop app, and on Linux [Tauri's system libraries](https://v2.tauri.app/start/prerequisites/#linux);
for Android, its SDK and a JDK from 17 to 21. Expo Go cannot run it.

```bash
npm install
./scripts/tdlib.sh ios
npx expo run:ios     # or: npm run desktop, which fetches TDLib itself
```

npm runs a dependency's install script only when `allowScripts` in
`package.json` approves it; after a new one, `npm install-scripts ls` lists it
for `approve` or `deny`.

## Code signing policy

Release builds come only from `.forgejo/workflows/release.yml` at the tagged
commit, with every file's SHA-256 in `SHA256SUMS`. Committers, reviewers and
approvers: [Anthony Laibe](https://github.com/alaibe).

MIT. See [`LICENSE`](LICENSE).
