# Your account

Your account is a recovery phrase: twelve words the app generates on your
device the first time you open it. Everything follows from those words: your
keys on XMTP, Nostr and Status, and the Ethereum, Bitcoin and Solana addresses
the wallet uses. There is no password to forget, and no server that
knows you exist.

<div class="phones">
  <figure><img src="/screenshots/welcome.png" alt="The welcome screen"><figcaption>The welcome screen</figcaption></figure>
  <figure><img src="/screenshots/recovery-phrase-hidden.png" alt="The recovery phrase screen before it is revealed"><figcaption>Reveal the phrase, write it down, confirm</figcaption></figure>
</div>

## Create an account

1. Tap **Create an account**.
2. Tap **Reveal recovery phrase** and write the twelve words down, in order, on
   paper. Not a screenshot, not a note that syncs somewhere.
3. Tap **I've written it down**.

That is the whole sign-up. The chat list opens with one chat, the
Statim chat, which holds help and slash commands.

::: warning Nobody can reset this
The phrase *is* the account. Lose both the phrase and the device and the
account, with anything in its wallet, is gone. Nobody at Statim, Apple or
Google can bring it back, because none of them ever had it.
:::

## Restore an account

Tap **I already have a recovery phrase** and type the twelve words. Your
addresses come back exactly as they were.

Chat history does not travel with the phrase. What comes back depends on the
protocol: XMTP restores from its nodes, Telegram and Matrix from their
servers, Nostr and Status only what their relays and store nodes still hold.
[Protocols](./networks) has the detail.

## Use a hardware wallet

Tap **Connect a hardware wallet** for an account whose Ethereum key lives on a
wallet rather than the phone:

- A Ledger connects over Bluetooth on the phone and over USB on a computer.
  Open its Ethereum app first.
- A Keystone works by QR codes. On the Keystone, open **Connect Software
  Wallet**, choose **MetaMask** and scan the code it shows. To sign, it scans a
  code from your screen and you scan its answer.
- A Trezor works through the Trezor Suite app on the same phone, which opens
  to confirm each request and sends you back. On Android any Trezor connects
  to it over USB; on an iPhone only a Trezor Safe 7 can, over Bluetooth.

While connecting, the wallet signs one message, "Statim chat keys". It moves no
funds. Its signature, the same every time for that wallet, gives the account
the keys Nostr, Status and notifications from your computer use, so the same
wallet gets the same keys on every device. Those chat keys are kept on the
device like a recovery phrase would be; the key that holds your funds never
leaves the wallet.

Every payment and every signature is then confirmed on the wallet. When the
wallet is not connected, Statim asks you to connect it at that moment.

Bitcoin and Solana need the wallet's own apps for those chains, which Statim
does not drive yet, so they are unavailable on a hardware account. Keystone and
Trezor accounts work on the phone; on a computer, use a Ledger.

## Several accounts

**Settings → Accounts** holds every account on this device. Add one from a new
phrase, an existing phrase or a hardware wallet, and switch between them from
the same screen. Each account has its own history, plugins, keys and settings.
Nothing is shared between them, including which protocols are connected.

## Lock it

**Settings → Security** holds the lock:

- **Require Face ID** to open the app at all, or Touch ID on a Mac.
- **Set PIN** for a 6-digit PIN of its own, separate from the phone's
  passcode or the Mac's password.
- **Also protect keys**, which seals the phrase in the keychain so that nothing
  can read it, or sign with it, without Face ID first.

[Settings](./settings#security) explains how the PIN works and what happens if
you forget it. **Settings → Recovery phrase** shows the words again.

The phrase is stored in the device keychain, marked as this-device-only, and
never leaves it.

## Erase an account

**Settings → Erase this account** removes that account's messages, media, keys
and settings from this device, and signs out of Telegram and Matrix if they
were connected.

It does not delete anything those protocols hold, and it does not touch the
recovery phrase you wrote down. The same phrase restores the same account
later.
