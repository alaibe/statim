# Privacy policy

Statim has no server. Your account is a recovery phrase on your device,
there is no sign-up, and the developer operates nothing that your messages, keys
or contacts pass through. This page is the complete account of what leaves your
device, and to whom.

## What the developer receives

Two things, both anonymous.

The first is performance data, through Expo's `expo-observe` library. It
reports how long the app took to start and to move between screens, plus the
host name of the slowest network request made during launch. For this app that
is a messaging relay, or your own blockchain endpoint if you set one. It carries no
account, name, address or message content, and it is not linked to you.

The second is a count of how many devices are running each version, which
follows from the update check described below. It is a number on a dashboard,
with no way back to a person.

That is the entire list. There is no analytics SDK, no advertising, no crash
reporter that captures what you write, and no push service run by the developer.
Notifications are generated on the device, except the iPhone notifications your
computer sends through your own iCloud, described below.

## What leaves your device, and who sees it

### Messages

**XMTP, Nostr and Status** carry end-to-end encrypted messages. Relay operators
see ciphertext and routing metadata: that two parties are communicating,
roughly when, and from which network address. Nostr relays additionally never
learn who sent a message, only who receives it. You choose the relays under
Settings → Protocols. Status goes through Status's own nodes unless you give it
a Status node of your own there.

**Telegram** is different, and only active if you sign in. Telegram chats are
not end-to-end encrypted: Telegram's servers hold and can read them, exactly as
with the official app. Signing in sends your phone number to Telegram, and the
app identifies itself with the API ID and hash you registered yourself. The
Telegram database on this device is encrypted with its own key in the keychain
and is deleted when you sign out or erase the account.

**Matrix** is only active if you sign in. Messages go to the homeserver you
name. Rooms with encryption on are end-to-end encrypted with Olm and Megolm; the
homeserver still sees who talks to whom and when. If that homeserver runs a
bridge to another network, the bridge decrypts what it relays, on the machine
where it runs. Signing in sends your Matrix ID and password to the homeserver
once; the app then keeps only a session token, and the SDK's local store
(history, keys, downloaded media) is encrypted with its own key from the
keychain. Both are deleted when you sign out or erase the account.

On a computer, Statim can run that homeserver itself. It answers only on the
computer and, once you connect your phone, on your own Tailscale network, and
it talks to no other Matrix server. The first time you turn it or a bridge on,
the app downloads that program from GitHub and checks it against a hash the app
ships with. The server's database, the bridges' logins and their copies of your
chats stay in the app's data folder on the computer. The app does not encrypt
them itself, so they rely on the computer's disk encryption. They are deleted
when you erase the account. Tailscale's HTTPS certificates put the computer's
name on your tailnet in public certificate logs.

### Money

Blockchain reads and transactions go from your device to a public endpoint for
that network, or to one you set with `/rpc`. That endpoint sees which addresses
you look at and which transactions you send.

Token balances are read from that same endpoint. On EVM chains the app asks each
contract on a token list bundled with it; on Solana it asks the node what the
address holds. No third party is told what you own, and no key is involved.

`/trade` asks [LI.FI](https://li.fi) for a quote, which shows LI.FI your address,
the tokens and the amount. It works without an account; a LI.FI key you enter
yourself only raises how often you may ask. The transaction is signed on your
device and broadcast through the blockchain endpoint like any other. Releasing a
token to the route is usually a signature rather than a transaction, either the
token's own `permit` or Uniswap's Permit2, and neither reveals more than the
trade already does.

Prices come from a public market data endpoint (Binance's, by default; `/marketapi`
changes it) with no account and no identifier attached.

A hardware wallet signs on the device. A Ledger talks to the app over Bluetooth
or USB and a Keystone over QR codes, with nothing in between. A Trezor request
travels as a `connect.trezor.io` link that the phone hands to the Trezor Suite
app; if Trezor Suite is not installed, the link opens Trezor's website instead,
which then sees the request.

### Links and attachments

Link previews fetch the page behind a link directly from that site, to show its
title, description and picture. For YouTube it fetches the small oEmbed response
instead of the page. This means the site sees your network address when the message
*arrives*, not only if you tap it. It is on by default and Settings → Privacy
turns it off. Results are cached on the device for a week so the same link is
not re-fetched as it scrolls past.

Links, phone numbers, email addresses, places and wallet addresses are
recognised on the device with no request at all. A wallet address found in a
message is looked up through the blockchain endpoint you already use, exactly as
`/balance` would.

GIF search uses KLIPY, and only if you enter your own key for it.

### AI

AI is off until you turn it on in Settings → AI, and each command runs only
when you type it or tap its chip. With Automatic, the model and the translator are the
ones built into your device (Apple Intelligence and Apple Translation, or
Gemini Nano and Google's ML Kit) and the text never leaves it. ML Kit downloads
a language from Google the first time you translate into it, which shows Google
your network address and nothing else.

If you choose your own server or Anthropic in Settings → AI, the text of each
request goes to that server: what you rewrite or translate and, for summaries
and reply suggestions, the recent messages of that chat, including other
people's in a group. Translation also falls back to that server when the device
has no translator for a language. The address and the key you enter stay on
this device.

**Suggest replies on open** is a separate, optional setting in Settings → AI.
When enabled with your TypeSafe API key, opening an eligible DM or group, or
receiving a new message while it is open, sends up to 20 recent messages to
TypeSafe's Jev to decide whether you need to reply. This includes other
participants' messages and happens even when your reply model runs on the
device. If a reply is needed, your selected model receives recent messages to
write a suggestion. You review and send it yourself. The TypeSafe key stays
with your account's other keys on this device and is sent only to TypeSafe.

**Highlight chats needing a reply** is another optional setting. It loads recent
history for chats visible in the chat list and sends up to 20 recent messages
to TypeSafe for the badge decision, without marking the chat read. This does
not generate or send a reply.

### Notifications from your computer

iOS stops Statim soon after you leave it, so an iPhone can hear about new
messages from Statim on your computer instead. It is off until you turn it on in
two places: **Notify my iPhone** on the computer and **Notifications from your
computer** on the iPhone.

Turning it on opens Apple's sign-in in your browser on the computer. Your
password stays between you and Apple. Statim receives a token that opens only
its own space in your iCloud and keeps it in the vault on that computer; Apple
replaces the token with each request.

For each message that would notify on the computer while its window is in the
background, the computer saves a note in the private iCloud database of your
Apple Account. The note holds which chat it is, the chat's name and up to 300
characters of the message preview, encrypted with a key derived from the
account's recovery phrase. Next to it is a tag, derived from the same phrase,
that names the account without revealing its address. Apple stores the note and
wakes your iPhone with it through its push service. Apple can see that your
Apple Account uses Statim, when notes arrive, how large they are and the tag,
but it cannot read them. The developer has no access to your private iCloud
database.

The iPhone decrypts the note itself, with the key it derives from the same
recovery phrase, and fetches nothing else. The computer deletes each note about
five minutes after saving it. Turning the feature off deletes the notes that
are left and signs the computer out of iCloud.

### App updates

On iPhone and Android, the app asks Expo's update service (`u.expo.dev`) at
each launch whether a newer version of its own code exists, and uses what it
finds from the next launch. That is how a fix reaches you without waiting for
an app store review.

The request says which platform, which release channel and which build; Expo
sees the network address it came from, as any server does. It carries no
account, address, phone number or anything from your conversations.

The desktop app checks GitHub instead, and replaces itself only after
verifying a signature.

### What is never sent

There is no last-seen and no typing indicator. The protocols carry no presence
and the app does not add a side channel to broadcast one. Read receipts are off
by default and symmetric: with them off you do not see the other person's
either. Your address book is read on the device to suggest who to invite and is
never uploaded.

## What stays on your device

Your recovery phrase and keys, in the system keychain, optionally sealed behind
Face ID or the device passcode. For a hardware wallet account, that is the chat
key seed its wallet's signature produced, never the wallet's own key. On an iPhone that hears from your computer, the
key that opens those notes also sits in a keychain group shared with Statim's
notification extension. Message history, in an encrypted database per
account. Downloaded media, in per-account directories. Preferences, per account.

## Deleting your data

There is no server-side account to delete, because there is none to begin with.
**Settings → Erase this account** removes the keys, the databases, the media and
the settings from this device, signs out of Telegram and Matrix if they were
connected, and stops notifications from the computer for that account. It does not delete anything held by those networks, and it does not
affect the recovery phrase you wrote down. The same phrase restores the same
account later.

Messages already delivered to relays or to other people are beyond the
developer's reach, as they are with any messenger.

## This website

statim.laibe.cc counts visits with Umami, which the developer runs on the
developer's own server. It sets no cookies, and its statistics hold no network
address. Each page view records the page, the referring page, browser,
operating system, device type, screen size, language, and the country, region
and city looked up from the network address. A click on a download link also
records which platform's file it was. Page views are grouped into visits
by an identifier derived from the address and browser that changes every month.

Each count reaches that server through Cloudflare, and the server's access log
keeps the request with its network address for a short time, to run and protect
the service. That log is capped by size rather than by a number of days. The site itself is hosted on GitHub Pages, so GitHub also sees each
visitor's network address, under
[its privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

The app sends nothing to the site on its own. A guide link opened from the app
loads the page in a browser view, where it counts as a visit like any other.

## Children

The app is not directed at children and collects nothing that would identify
anyone, of any age.

## Changes

This policy is a file in a public repository, so every change to it is a visible
commit. Material changes will be noted in the app's release notes.

## Contact

Open an issue at
[github.com/alaibe/statim/issues](https://github.com/alaibe/statim/issues).
For anything security-sensitive, use the private route in
[SECURITY.md](https://github.com/alaibe/statim/blob/main/SECURITY.md)
instead.

Last updated 2026-10-05.
