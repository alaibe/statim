# Working in this repository

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before
writing any code. What you remember about Expo, Expo Router or React Native is
probably from an older SDK and probably wrong.

## Comments

Keep comments to the minimum. Add one only when it explains something the code
cannot make clear; never restate the code or add tautological commentary.

## Before you finish

```bash
npm run format && npm run typecheck && npm run lint && npm test
```

Biome formats TypeScript and JSON, rustfmt formats `src-tauri`. Neither lints;
`expo lint` still does that.

## Things that are not obvious from the code

- Generated output is not editable. `src/global.css` comes from
  `src/design/tokens.ts` (`npm run theme:build`); `assets/brand/mark.svg`,
  every icon and store graphic from `assets/brand/status-logo-2018.png`
  (`npm run brand:build`); `ios/` and `android/` from `app.json`
  (`npx expo prebuild`); `skills/statim/SKILL.md`,
  `src-tauri/cli/help.txt` and `src-tauri/cli/mcp.json` from
  `src/features/cli/commands.ts` (`npm run cli:docs`);
  `docs/public/promo/` from `marketing/film.html` (`npm run promo:build`); `src/storage/migrations/index.ts` from the SQL
  files beside it (`npm run db:bundle`); `docs/public/stickers/` from
  `scripts/generate-stickers.js` (`npm run stickers:build`). Editing the
  output is undone on the next build.
- `.web.ts` / `.web.tsx` is the desktop. There is no browser deployment.
  A platform file must have a non-platform neighbour, and Expo Router needs a
  non-platform file for every route.
- Polyfill order in `index.js` is load-bearing. viem and WalletConnect
  capture `globalThis.crypto` as they evaluate, so `src/polyfills` must run
  before Expo Router builds the route tree.
- Protocols go in `src/protocols/<name>/` and implement `ChatSession`.
  Persistence is `src/storage`. Do not mix the two.
- Stored data moves forward by migration. For the account database, edit
  `src/storage/schema.ts`, run `npm run db:generate` and commit the SQL it
  writes. A shipped migration stays as it is; the next change is a new one.
  SQL drizzle-kit cannot write, such as moving data, goes in a
  `npm run db:generate -- --custom` migration; run `npm run db:bundle` once
  its SQL is in. A change to what a vault entry holds is a step appended to
  `VAULT_MIGRATIONS` in `src/storage/vault-migrations.ts`.
- User-typed `/commands` are `SlashCommand`s contributed by a plugin, or
  core commands in `src/core/commands`. Core commands get no plugin context.
- Chat widgets are data, not components (`src/design/widgets/schema.ts`),
  because a message is stored, forwarded and rendered by clients that may not
  have the plugin that made it. Keep the union additive.
- `statim <command>` is the desktop binary in client mode, talking
  to the running app over a local socket; the page runs the command
  (`src/features/cli`). A new store action fails typecheck until
  `src/features/cli/coverage.ts` names its command or why it has none.
- `patches/` is load-bearing too. Every patch is documented in
  `patches/README.md` with its symptom, cause and removal condition. Add one
  only with that entry.

## Words

Use these words in code, UI text, the CLI and the guide. Code in `src/protocols/<name>/` that mirrors that protocol's own API keeps the protocol's words (a Matrix room, an XMTP inbox).

### Messaging

**Protocol**: A messaging system the app speaks itself: XMTP, Matrix, Telegram, Nostr or Status.
_Avoid_: network, transport, service

**Transport**: The part of a protocol that only moves messages, where the app keeps the chats and their history itself, as for Nostr and Status.

**Network**: The service a chat lives on. It is the chat's protocol, or for a bridged chat, the service at the far end of the bridge, such as Slack or WhatsApp.
_Avoid_: platform, service

**Bridge**: A bot on a Matrix homeserver that carries chats between Matrix and another network.

**Chat**: A place where participants exchange messages: a DM, a group or a channel.
_Avoid_: conversation, room, dialog

**DM**: A chat between you and one other participant.
_Avoid_: direct chat, private chat, 1:1

**Group**: A chat with several members where every member can post, unless an admin restricts it.
_Avoid_: room, supergroup

**Channel**: A chat where only some members post and everyone else reads.
_Avoid_: broadcast

**Message**: One item posted in a chat: text, media, a poll, a widget.
_Avoid_: event, post

**Reply**: A message that answers an earlier message and quotes it.

**Sticker**: A message that is one picture or short animation, drawn large and without a bubble.

**Sticker pack**: A named set of stickers you pick from: your packs on a network, or Statim's own, published with the site.

**Thread**: The messages posted under one message, shown apart from the rest of the chat.
_Avoid_: topic, sub-chat

**Request**: A chat someone started with you that you have not accepted yet. You accept it or decline it.
_Avoid_: invite, message request, pending chat

**Decline**: Refuse a request. The chat leaves your list; the sender is not blocked.
_Avoid_: deny, ignore, reject, block

**Join request**: Someone asking to join a group or channel you manage.

**Invite link**: A link that lets whoever opens it join a group or channel.

### People

**User**: The person holding the device.

**Account**: A set of keys you hold in this app, with its own chats, settings and protocol logins. You can have several.
_Avoid_: identity, profile, user

**Participant**: Someone who can take part in chats on one protocol, known by that protocol's id. One person on two protocols is two participants.
_Avoid_: peer, user, inbox, recipient

**Address**: What someone gives you so you can reach them on a protocol: an Ethereum address, an ENS name, a Matrix ID, a Telegram username. The protocol resolves it to a participant.
_Avoid_: handle

**Member**: A participant in a group or channel, with a role.

**Role**: What a member may do in a group or channel: owner, admin or member.

**Contact**: Someone listed in Contacts: a participant you have a DM with, or a person from your phone's address book.
_Avoid_: peer, friend

**Bot**: A participant run by a program instead of a person.

### Chat list

**Chat list**: Every chat of the active account, across all its protocols, in one list.
_Avoid_: inbox

**Filter**: One of the tabs above the chat list that narrows it: All, Unread, Mentions, DMs, Groups.
_Avoid_: tab, folder

**Folder**: A row in the chat list that holds a set of chats: the archive, or every chat on one network.
_Avoid_: directory

**Archive**: The folder for chats you have moved out of the main list.

### Extending the app

**Plugin**: A package that adds slash commands, message types, bots or screens to the app.
_Avoid_: extension, mini-app

**Slash command**: A `/name` typed in a chat's composer.
_Avoid_: command (on its own), action

**CLI command**: A `statim <name>` run in a terminal against the running desktop app.

**Widget**: A message whose layout and buttons are described by data and drawn by the app.

### Wallet

**Chain**: A blockchain the wallet works with, such as Ethereum or Base.
_Avoid_: network

`CONTRIBUTING.md` covers setup and the contribution workflow.
