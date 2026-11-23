# End-to-end tests

[Maestro](https://maestro.mobile.dev) drives the development build on a booted
iOS simulator or Android emulator. It is a smoke check, run by hand: the app
starts and its main screen works. Logic is tested in Jest.

## Running them

```bash
brew install --cask temurin@21 # Maestro needs a JDK; macOS ships none
curl -Ls "https://get.maestro.mobile.dev" | bash
npx expo run:ios               # or run:android
npm start

./e2e/run.sh ios               # both flows
./e2e/run.sh ios 01-launch     # one flow
./e2e/run.sh android --fresh   # wipe the account first
```

`E2E_METRO_PORT` points the run at a Metro other than 8081, and `E2E_DEVICE` at
one simulator or device when several are booted.

A failing run prints where Maestro left its screenshots and logs; a passing run
leaves nothing behind.

A normal run keeps whatever account the device already has. `--fresh` resets
the simulator Keychain or clears the app's data on Android, and `00-onboarding`
then creates the account `01-launch` needs.

`run.sh` checks for Maestro, Java, Metro and a booted device before it starts,
and on iOS for Xcode, a stale native build and an unresponsive CoreSimulator.
Each of those otherwise fails somewhere in the middle of a flow and looks like a
bug in the app.

It loads the build from Metro once before the flows, because the dev client
reopens the last bundle it loaded and every flow starts with `launchApp`. On
Android it forwards Metro's port to the device first; on iOS it confirms the
"Open in “Statim”?" prompt a simulator shows the first time. Give the emulator
4 GB of RAM: with the default 2 GB the low-memory killer takes down Maestro's
driver while the app creates an account.

## The flows

| Flow | Covers |
| --- | --- |
| `00-onboarding` | Creates an account when none exists. |
| `01-launch` | Launches, opens the Statim chat, returns to Chats. |

Shared steps live in `e2e/lib/`: `launch-app` launches the app and, when the dev
client stays on its server list instead of reopening the bundle, taps this run's
Metro (`run.sh` passes its port as `METRO_PORT`); `launch` does that and waits
for the chat list. Maestro only enumerates the top level of `e2e/`, so those
never run as flows of their own.

## Rules the selectors follow

Use `id:`, never the child text of a pressable. On iOS a pressable row is a
single accessibility element, so its inner text is not a stable selector.

Use the app's own `Back` control from a chat.

Keep the suite to this smoke check. A change to how something works gets a unit
test in Jest, not a flow here.

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

Tapping a chat row during launch is deliberately avoided. Rows can reorder
between Maestro resolving a selector and tapping its coordinates, so the flows
enter the Statim chat through its app link instead.
