# Matrix on your computer

The desktop app can run a Matrix homeserver for you, with the bridges to
WhatsApp, Signal, Messenger, Instagram, Slack and Discord next to it, and
iMessage on a Mac. You turn it
on in Settings, then turn on the bridges you want; there is no server to rent
or configure. Your phone can use the same server through
[Tailscale](https://tailscale.com).

It runs on a Mac with Apple silicon and on Linux (x86_64 and arm64). Windows
and the Mac App Store version cannot run it yet.

## Turn it on

1. Open **Settings → Matrix** on the computer.
2. Choose **Run Matrix on this computer**.

Statim starts the server, makes you a Matrix account on it and signs you in.
Your Matrix ID is `@me:statim`. An account uses either this server or a
homeserver you name in the form below, not both.

The server runs while Statim runs. Closing the window leaves it running;
quitting Statim stops it, and the next start brings it back. While it is
stopped, messages wait on the other networks.

It is closed to other Matrix servers. It is there for your bridges, so you
cannot chat from it with someone on matrix.org.

## Bridges

Under **Bridges on this computer**, turn on the networks you want. The first
time, Statim downloads that bridge from its project's release and checks it
against the hash Statim ships with before running it. The server restarts
with the bridge attached.

Then use **Connect** under the bridges list to sign in to the network. WhatsApp
and Signal link as a device; Messenger, Instagram, Slack and Discord ask for
your login.

iMessage uses [Corten](https://github.com/lrhodin/corten-matrix), which talks
to Apple's servers directly from your Mac. It asks for your Apple ID and
password, and skips the two-factor code when the Mac is signed in to iCloud
with the same Apple ID. Contact Key Verification must be off for that Apple ID.

A bridge decrypts everything it relays, and here it does that on your
computer. [WhatsApp, Signal & friends](./bridges#what-to-know-before-you-rely-on-it)
covers what else to know before you rely on one.

## Your phone

Your phone reaches the server through Tailscale, which connects your own
devices to each other without opening anything to the internet.

On your tailnet, once:

1. Install Tailscale on the computer and on the phone, and sign in to the same
   tailnet on both.
2. In the Tailscale admin console, under **DNS**, turn on **MagicDNS** and
   **HTTPS Certificates**. The certificates put your devices' tailnet names in
   public certificate logs.
3. On Linux, let your user change Tailscale's settings:
   `sudo tailscale set --operator=$USER`.

Then:

1. On the computer, in **Settings → Matrix**, choose **Connect your phone**.
   Statim asks Tailscale to serve the server to your tailnet on port 8448 and
   shows a QR code.
2. On the phone, open **Settings → Matrix** and choose **Scan the code from
   your computer**.

The code signs in once and expires after two minutes. The phone gets a session
of its own on the server.

If Tailscale needs something turned on first, Statim says so and gives you the
link to the admin console page. When the server stops, Statim stops serving it
to the tailnet, and serves it again when it starts.

The phone needs Tailscale connected, and the computer awake with Statim
running. When the computer sleeps, the phone's Matrix chats wait until it
wakes.

## Remove it

Erasing the account deletes its server and everything on it: your Matrix
account, the bridges' logins and their copies of your chats.
