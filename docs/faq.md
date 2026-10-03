# FAQ

## I lost my phone. Is my account gone?

No, as long as you have the twelve words. Install the app on another device,
tap **I already have a recovery phrase**, and your account, addresses and wallet
are back.

Chat history is a separate matter: XMTP restores from its nodes, Telegram and
Matrix from their servers, Nostr and Status only what their relays and store
nodes still hold. See [Protocols](./guide/networks).

## I lost the twelve words.

While the app is still open on a device that has the account, **Settings →
Recovery phrase** shows them again. Write them down now.

If the device is gone too, so is the account. Nobody can recover it, because
nobody else ever had it.

## Why does the app start almost empty?

Because it is a messenger first. The wallet, market alerts, the dapp browser
and bots are plugins that ship switched off, each saying what it adds and what
it may reach. Turn them on under **Settings → Plugins**. Nothing makes a network
request until you do.

## Can I swap tokens, or move them to another chain?

Yes, once the wallet plugin is on. `/trade 25 usdc eth` quotes a swap, and
`--from base --to arbitrum` bridges between EVM chains. The quote comes from
LI.FI, which works without an account; the transaction itself is signed on your
device. [Wallet](./guide/wallet#swap-and-bridge) has the details.

## Why does Telegram ask me for an API ID?

Telegram requires every client to identify itself with a developer's API ID and
hash. Rather than shipping one for everyone, which Telegram could rate-limit or
revoke for every user at once, the app asks each person to register their own
at [my.telegram.org](https://my.telegram.org). It takes a minute and
nothing about it is shared.

## Matrix says my homeserver is not supported.

The app needs a homeserver with **sliding sync**: Synapse 1.114 or newer, or
the Conduit family. Element X has the same requirement. Ask whoever runs the
server.

Separately, a server that only signs in through a web page, as matrix.org does
now, does not work yet. One with password sign-in does.

## A Matrix message says it is waiting for the keys.

It was sent to the chat before this device joined, or before this device
existed, so its encryption key was never shared with you. That is how Matrix
end-to-end encryption works rather than a fault. New messages arrive readable.

## Can I message someone on WhatsApp or Signal?

Not directly. Those networks do not allow it. You can through a Matrix
homeserver running a bridge; [WhatsApp, Signal &
friends](./guide/bridges) explains what that involves.

## Can an AI assistant use it?

Yes, on a computer. The `statim` command does whatever the app does,
and `statim skills install` teaches Claude Code or Codex how to use
it. Turn it on first under **Settings › Command line**; it is off until you do.
The assistant runs as you, on your machine. Anything that signs, erases an
account or turns on a plugin still waits for you to approve it in the app. See
[Command line](./guide/command-line).

## Who can see my messages?

It depends on the protocol, and the app says so on every chat. Briefly:
on XMTP, Nostr and Status, only the people in the chat; on Matrix, the chat's
members, in chats with encryption on; on Telegram, Telegram. The
[Privacy](./privacy) page lists everything that leaves your device.

## Does the app collect anything?

Two anonymous things: how long the app took to start with the host of the
slowest request while it did, and a count of how many devices run each version.
No account, no identifier, no content.

Separately, balances go from your device to a public blockchain endpoint (or
one you set), prices to a public market endpoint, and link previews to the
linked site. None of that reaches the developer.

## Is there a fee on sends or swaps?

No. The app holds no funds, runs no exchange and takes no cut. You pay the
chain's fee and whatever the route charges, both shown on the review card
before you confirm.

## How does the app update itself?

On the phone it fetches its own improvements when you open it, and uses them
the next time. Anything that changes the parts of the app Apple and Google
review still arrives as a normal store update.

On a computer it looks for a new version each time it opens and downloads it in
the background. It checks the download's signature first and refuses one that
doesn't match. When the update is ready, a Restart button shows at the bottom of
the sidebar.

## Why does my computer warn me when I install it?

On a Mac it shouldn't: the app is signed with an Apple Developer ID and
notarized by Apple, so it opens like any other. If you update from 0.6.0 or
earlier, macOS asks once whether Statim can use its Keychain item. Choose
Always Allow.

The Windows app isn't signed with a Microsoft certificate yet, so Windows
shows "Windows protected your PC". Click More info, then Run anyway.

## Where is Android?

Android is in testing on Google Play, for testers only. To be added, email
[anthony@laibe.cc](mailto:anthony@laibe.cc) from the Google account your phone
uses, then
[join the test](https://play.google.com/apps/internaltest/4701701549081878732).
Everything except Telegram works there. Telegram is not in the Android build
yet.

You can also use the desktop app for macOS, Windows and Linux, and the iPhone
app through its [TestFlight beta](https://testflight.apple.com/join/kQGUUDUv).

## Is this Status?

No. Statim takes its logo from the 2018 Status app. It is not affiliated with
or endorsed by Status. It speaks Status's chat protocol, though, so you can have
DMs and groups with Status users. Communities are not supported. See
[Protocols](./guide/networks#status).

## Where do I report a bug?

[github.com/alaibe/statim/issues](https://github.com/alaibe/statim/issues).
For anything security-sensitive, use the private route in
[SECURITY.md](https://github.com/alaibe/statim/blob/main/SECURITY.md)
instead of a public issue.
