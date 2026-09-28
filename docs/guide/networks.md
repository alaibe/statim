# Protocols

Every chat runs over one protocol. The app tells you which, and what that
protocol protects, on the chat itself and in full under **Settings →
Protocols**, where each one is set up.

<div class="phones">
  <figure><img src="/screenshots/protocols.png" alt="Settings → Protocols: the five protocols and their state"><figcaption>Settings → Protocols</figcaption></figure>
  <figure><img src="/screenshots/protocol-matrix.png" alt="The Matrix settings screen: what it protects, homeserver and Matrix ID"><figcaption>Each protocol says what it protects before you connect</figcaption></figure>
</div>

## At a glance

| Protocol | Who can read your messages | To reach someone you need | History on a new device |
| --- | --- | --- | --- |
| **XMTP** | Only the people in the chat. Relays see that two inboxes talk, not what they say. | An Ethereum address or ENS name that has opened an XMTP app | Comes back from its nodes |
| **Nostr** | Only the participants. Relays see who receives a message and when, never who sent it. | A public key (`npub…`) | Only what your relays still hold |
| **Status** | Only the participants. The nodes you go through see which topics you read, not the content. | A chat key (`zQ3sh…`) or a `status.app` link | Only what the store nodes still hold |
| **Telegram** | Telegram. Not end-to-end encrypted, same as the official app. | A `@username`, a `t.me` link, or a phone number in your contacts | Yes, from Telegram |
| **Matrix** | Only the chat's members, in chats with encryption on. The homeserver sees who talks to whom and when. | `@user:server` or a `matrix.to` link | Yes, from the homeserver; encrypted chats also need the keys |

XMTP, Nostr and Status work the moment your account exists, because your
recovery phrase holds your keys for them. Telegram and Matrix are accounts you
already have elsewhere, so you sign in to them.

Unread badges use each protocol's available history: Telegram and Matrix report
their counts, while XMTP, Status and Nostr count locally available messages since
you last read the chat.

## XMTP

Messages between Ethereum accounts, encrypted with MLS. Groups work, with
membership enforced by the protocol rather than by convention. The other person
must have opened an XMTP-capable app at least once; if they have not, the app
says so when you try to start the chat.

**Settings → XMTP environment** switches between the production environment
and the developer one. Two apps only see each other on the same one.

**Settings → Devices** lists the installations, phones and computers, that share
your inbox, and revokes one you no longer have.

Group details show the description, image and member count when set. On phones,
you can request deletion of a message you sent; XMTP deletion asks clients to
hide it and does not erase copies already held by nodes or other participants. The
current desktop SDK can receive deletion notices but cannot initiate them.
XMTP has no built-in list of public groups or enforced admin-only posting.
Invite links can be built with an app service, but are not a protocol-native
public join flow.

## Nostr

Sealed DMs, NIP-17: relays deliver them without learning who sent
them. Under **Settings → Protocols → Nostr** you choose which relays, one per
line; the defaults are public ones. More relays means better delivery and more
servers that see when you receive something.

Relays may drop messages or forget history, so a new device only sees what your
relays still have.

This app uses NIP-17 for DMs and for participant-set groups. NIP-17 has
no public group identifier or admin moderation. NIP-29 relay groups are a
different protocol and are not connected here. NIP-17 permits advisory deletion
events, but this adapter does not yet send or apply them.

## Status

DMs and groups with people who use the [Status](https://status.app) app, over
the Status network. Statim speaks Status's own chat protocol for these;
communities are not part of it.

Your Status identity comes from your recovery phrase the same way the Status app
derives it, so importing the phrase you use in Status makes you the same person
in both apps. **Settings → Protocols → Status** shows your address, the
`zQ3sh…` chat key Status users add you by.

Statim reaches the Status network through Status's own nodes, as the Status app
does. It asks them for the messages addressed to you, hands them yours to pass
on, and fetches what arrived while it was closed. Those nodes see your network
address and which topics you follow, never what the messages say.

Under **Settings → Protocols → Status** you can set the **Display name** Status
users see instead of your chat key. Status drops every message whose sender name
breaks its rules (5 to 24 letters, digits, spaces, `_` or `-`), so the app will
not connect with such a name. Tap **Save and reconnect**.

To go through a node you run instead, start nwaku on the Status network
somewhere your phone can reach, and enter its REST address
(`http://your-host:8645`) as the **nwaku node URL**:

```bash
wakunode2 --cluster-id=16 --shard=32 --relay=true \
  --dns-discovery=true --discv5-discovery=true \
  --dns-discovery-url=enrtree://AMOJVZX4V6EXP7NTJPMAYJYST2QP6AJXYW76IU6VGJS7UVSNDYZG4@boot.prod.status.nodes.status.im \
  --storenode=/dns4/store-01.do-ams3.status.prod.status.im/tcp/30303/p2p/16Uiu2HAmAUdrQ3uwzuE4Gy4D56hX6uLKEeerJAnhKEHZ3DxF1EfT \
  --max-msg-size=1024KiB --rest=true --rest-address=0.0.0.0 \
  --rest-relay-cache-capacity=1000
```

That node relays every Status DM and group on its shard, a few messages a
second, and hands the app what is addressed to you. `--max-msg-size` matters:
Status sends photos inline, up to 1 MiB, and nwaku drops anything over 150 KiB
by default.

Starting a chat sends your first message as a Status contact request, which is
how the Status app decides to show a chat at all: until they accept, it waits
in their notifications. A contact request from a Status user arrives under
[Requests](./chats#requests), and accepting it adds them back.

Groups are Status groups, kept as a signed log of membership changes that every
member checks. Status only lets you add people who accepted your contact
request. The creator is the group's owner and adds or
removes people; any member can rename it, and anyone can leave. An invitation
from someone you have not added waits under Requests.

Replies, mentions, reactions, photos, voice notes, edits and deletions work
both ways. You can edit your own text and captions, delete your own messages for
everyone, and delete any message for yourself only. Group admins can delete
other people's messages. Profile pictures and group pictures set in Status show
here too. Stickers from Status show as a line saying what they were, and there
are no polls, pins or presence.

Messages you send are encrypted to the other person's chat key with a one-off
key per message, so there is no forward secrecy. Once you have written to
someone, their Status app encrypts to this device with a Double Ratchet, and
Statim follows it. If the same recovery phrase is also in the Status app, a
contact's messages reach Statim only after Statim has written to them, and the
two apps do not share history.

## Telegram

Your own Telegram account, in the same chat list: DMs, groups and
channels, with replies, reactions, photos, video, files and voice notes. You can edit
your own text, delete a message for everyone when Telegram allows it, and delete
any message for yourself only. Group admins can delete other people's messages.
Polls in Telegram chats show results and let you vote.
In a Telegram group or channel where you can post, use `/poll "Question" "First choice" "Second choice"` to create an anonymous single-choice poll.
You can search messages in one chat or across chats. Telegram searches its history;
other protocols search stored and loaded messages.
In Telegram groups, typing `@` suggests members, with or without a username. The
Mentions filter shows chats with unread Telegram mentions or replies.
You can pin messages where the chat allows it and open the pinned list from the
top of a chat.
Typing and available online or last-seen status appear for DMs.
Drafts and chats marked unread are saved to your Telegram account, so they
follow you to your other devices.
Channels are read-only for members; administrators can post.
Group and channel details show the description, link, photo and member count
when Telegram provides them.
You can preview a public Telegram group or channel by @username or t.me link
from New message, then join it.
Private invite links can also be previewed there. Links that require approval
send a join request instead of opening the chat immediately.
Group and channel administrators can create regular invite links or links that
require approval from the details screen.
Administrators can approve or decline pending join requests there, and the
chat's title bar counts them as they arrive.
Group administrators with restriction rights can set slow mode in group
details, and can mute, remove or ban a member from the member's profile.

<div class="phones">
  <figure><img src="/screenshots/protocol-telegram.png" alt="The Telegram settings screen: API ID and API hash"><figcaption>Telegram asks for your own API credentials</figcaption></figure>
</div>

1. Get an **API ID** and **API hash** at [my.telegram.org](https://my.telegram.org)
   → *API development tools*. Telegram issues every developer their own pair.
   This app ships none, so each person registers theirs; it takes a minute and
   nothing about it is shared.
2. Enter both under **Settings → Protocols → Telegram** and tap **Save and
   reconnect**.
3. The screen then asks for your **phone number**, the **code** Telegram sends
   to your other devices or by SMS, and your **two-step verification password**
   if you have one.

You appear in Telegram's *Active Sessions* like any other client. **Sign out**
on the same screen ends the session there and deletes Telegram's data from this
device.

::: info Not end-to-end encrypted
Telegram's servers hold and can read these chats, exactly as with the official
app. Secret Chats are not opened here. Every Telegram chat says so.
:::

Telegram works everywhere except Android.

## Matrix

Your own Matrix account: encrypted groups and DMs on any homeserver, plus
whatever that homeserver bridges in. See [WhatsApp, Signal &
friends](./bridges).

1. Under **Settings → Protocols → Matrix**, enter your **homeserver** URL (the
   server's address, such as `https://matrix.example.org`) and your **Matrix
   ID** (`@you:example.org`), then **Save and reconnect**.
2. Enter your **password** once. The app keeps a session token, not the
   password.

Invitations arrive as [requests](./chats#requests);
accepting one joins the chat. Chats with encryption on are end-to-end encrypted. A
message sent before this device joined shows as waiting for its keys, which is
how Matrix encryption works rather than a fault.

Matrix chats support edits, redactions, pins, mentions, typing, video and polls.
DMs show online or last seen when the homeserver shares presence.
Search reaches the homeserver's history for chats without encryption.
Chats marked unread are saved to your Matrix account.
Admins can create an invite link. A link that needs approval lets
people knock, and their requests wait under Join requests in the chat's
details. Admins can also mute, remove or ban a member; muting lowers the
member's power level below what sending needs.
Use `/poll "Question" "First choice" "Second choice"` in a chat where you can
post. A room alias, ID or matrix.to link can be previewed from New message;
public groups can be joined, and those with knock enabled accept a join request.
An unjoined public preview is labelled “Group” because posting rights are only
known after joining; once joined, a chat where only some members post is
labelled “Channel.”
Chat details show the description, avatar, link and member count. Posting rights come
from Matrix power levels, so groups with restricted posting appear as
channels with a read-only composer for members.

For a chat bridged to another network, these are Matrix-side capabilities. A
bridge must translate each action to the network at the far end; support varies
by the specific bridge, its configuration and that network's API. For example,
a Matrix poll may stay on the Matrix side without becoming a poll on the
remote network. See [bridges](./bridges).

Two things to check with whoever runs your homeserver:

- It must support **sliding sync** (Synapse 1.114 or newer, or the Conduit
  family). Element X needs the same thing.
- Sign-in must be by **password**. Servers that only offer a web sign-in, as
  matrix.org now does, are not supported yet.
