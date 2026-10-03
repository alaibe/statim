# End-to-end tests

[Maestro](https://maestro.mobile.dev) drives the development build on a booted
iOS simulator or Android emulator.

## Running them

```bash
brew install --cask temurin@21 # Maestro needs a JDK; macOS ships none
curl -Ls "https://get.maestro.mobile.dev" | bash
npx expo run:ios               # or run:android
npm start

./e2e/run.sh ios               # everything but the Android-only flows
./e2e/run.sh ios 01-launch     # one flow
./e2e/run.sh android --fresh   # wipe the account first
```

`E2E_METRO_PORT` points the run at a Metro other than 8081, and `E2E_DEVICE` at
one simulator or device when several are booted.

A normal run keeps whatever account the device already has. `--fresh` resets
the simulator Keychain or clears the app's data on Android, and `00-onboarding`
then creates the account the later flows need.

`run.sh` checks for Maestro, Java, Metro and a booted device before it starts,
and on iOS for Xcode, a stale native build and an unresponsive CoreSimulator.
Each of those otherwise fails somewhere in the middle of a flow and looks like a
bug in the app.

On Android it forwards Metro's port to the device and loads the build from it
once, because the dev client reopens the last bundle it loaded and every flow
starts with `launchApp`. Give the emulator 4 GB of RAM: with the default 2 GB
the low-memory killer takes down Maestro's driver while the app creates an
account.

## The flows

| Flow | Covers |
| --- | --- |
| `00-onboarding` | Creates an account when none exists. |
| `01-launch` | Launches, opens the Statim chat, returns to Chats. |
| `02-commands` | Runs a command from a chip and from the composer. |
| `03-plugins` | Enables and disables a plugin, and its chat. |
| `04-statim` | Persists a unique message in the local Statim chat. |
| `05-settings` | Opens the settings screens and cancels account erasure. |
| `06-browser` | `/commands` discovery and its chat-specific list, scrolls the full slash picker to Scan, opens Scan from each entry point, and keeps the swap providers in the Browser chat. |
| `07-open` | Opens a bookmark with `/open` in Safari, comes back, checks the composer is free again. |

Shared steps live in `e2e/lib/`: `launch` launches and waits for the chat list,
`open-statim-chat` launches into the Statim chat, `send-command` sends its
`TEXT` parameter from the composer, and `back` leaves a native stack screen. Maestro only
enumerates the top level of `e2e/`, so those never run as flows of their own.

## Rules the selectors follow

Use `id:`, never the child text of a pressable. On iOS a pressable row is a
single accessibility element, so its inner text is not a stable selector.

**Use the app's own `Back` control from a chat**, and `lib/back.yaml` on native
stack screens.

Do not call `hideKeyboard`. Maestro cannot dismiss this app's keyboard with
it; the flows tap a non-interactive area instead.

Generate unique text where a flow asserts persistence. `04-statim` uses
`evalScript` so that output left over from an earlier run cannot satisfy its
assertions.

Add a flow when a change adds a screen, or a command someone reaches by hand.

## What this does not cover

Real message delivery is out of reach here: the UI suite never creates a remote
peer. Deterministic adapter coverage is in Jest instead, running two
independently keyed sessions against a fake relay:

```bash
npm test -- --runInBand src/protocols/nostr/adapter.test.ts src/protocols/status/adapter.test.ts
```

Those tests do not exercise public infrastructure, XMTP native delivery, or
release-build networking. Before a release, exchange a message and a reply
between two clean release installs over each configured protocol by hand.

`07-open` is tagged `ios-only`: it drives Safari. A flow for one platform gets
that platform's `-only` tag, and the other platform's run leaves it out.

The camera is only checked as far as presentation and dismissal, which the
scanner flow does without requiring camera permission. Reading a real
WalletConnect QR code needs a physical device.

Tapping a chat row during launch is deliberately avoided. Rows can reorder
between Maestro resolving a selector and tapping its coordinates, so the flows
enter the Statim chat through its app link instead.
