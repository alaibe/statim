# Working in this repository

Expo SDK 57 differs from what you remember: read https://docs.expo.dev/versions/v57.0.0/ before writing Expo, Expo Router or React Native code.

## Checks

Run `npm run format && npm run typecheck && npm run lint && npm test` before you finish. CI also runs these on what you touched:

- `src-tauri` or `src/core/usage/usage-vectors.json`: `cargo clippy --all-targets --locked -- -D warnings` and `cargo test --locked` in `src-tauri`.
- Swift: `swift format lint --strict`. Shell: `shfmt -d -i 4 -ci -bn` and `shellcheck -S warning`.

The nightly ships main every morning, so every commit on main passes them.

## Rules

- Delete obsolete code outright, with no compatibility layer, fallback, shim, legacy path or migration of old data, config or formats.
- The account database changes only through `src/storage/schema.ts` and `npm run db:generate`; commit the SQL and leave shipped migrations as they are.
- Comments are one line, and only where the reason isn't obvious from the code.
- Change generated files at their source: `ios/` and `android/` from `app.json`; `src/storage/migrations/index.ts` with `npm run db:bundle`; `src/global.css`, `skills/statim/SKILL.md`, `src-tauri/cli/help.txt`, `src-tauri/cli/mcp.json`, the icons, `chat-pattern-tile.ts` and the token lists with the generators in `priv/`.
- `priv/` is gitignored and holds the maintainer's material and tooling; a worktree has none, so use the main checkout's.
- `.web.ts(x)` is the desktop app, never a browser build, and each platform file needs a non-platform neighbour.
- `index.js` loads `src/polyfills` before Expo Router: viem and WalletConnect capture `globalThis.crypto` as they evaluate.
- Protocols live in `src/protocols/<name>/` behind `ChatSession`; persistence lives in `src/storage`.
- `src/core/usage/tracker.ts`, `use-usage.ts` and `usage-vectors.json` are byte-for-byte copies of Kestrel's and Grenier's: change all three repositories together.
- When a change alters how the app is used or what it sends, update the guide or privacy policy in the laibe repository (`content/statim/`).

## Words

Say chat (not conversation or room), participant (not peer or user), account (not identity or profile), request with accept and decline (not invite or reject; declining never blocks), plugin (not extension), slash command and CLI command (not just command). Protocol is XMTP, Matrix, Telegram, Nostr or Status; network is where a chat lives, such as a bridged WhatsApp; chain is a blockchain. Code that mirrors a protocol's API keeps its words.
