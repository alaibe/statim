# Statim

An encrypted messenger for iOS, Android and the desktop from one Expo SDK 57 codebase in TypeScript; the desktop app is
its web export in a Tauri window (`src-tauri`, Rust). Expo SDK 57 differs from what you remember: read
https://docs.expo.dev/versions/v57.0.0/ before writing Expo, Expo Router or React Native code.

## Checks

- Before you finish: `npm run format && npm run typecheck && npm run lint && npm test`.
- CI also runs these on what you touched: for `src-tauri` or `src/core/usage/usage-vectors.json`,
  `cargo clippy --all-targets --locked -- -D warnings` and `cargo test --locked` in `src-tauri`; for Swift,
  `swift format lint --strict`; for shell, `shfmt -d -i 4 -ci -bn` and `shellcheck -S warning`.
- The nightly ships main every morning, so every commit on main passes them.

## Rules

- Delete obsolete code outright, with no compatibility layer, fallback, shim, legacy path or migration of old data, config or formats.
- The account database changes only through `src/storage/schema.ts` and `npm run db:generate`; commit the SQL and leave shipped migrations as they are.
- Comments are one line, and only where the reason isn't obvious from the code.
- Change generated files at their source: `ios/` and `android/` from `app.json`; `src/storage/migrations/index.ts` with `npm run db:bundle`; `src/global.css`, `skills/statim/SKILL.md`, `src-tauri/cli/help.txt`, `src-tauri/cli/mcp.json`, the icons, `chat-pattern-tile.ts` and the token lists with the generators in `priv/`.
- `priv/` is gitignored and holds the maintainer's material and tooling; a worktree has none, so use the main checkout's.
- The store screenshots are `store/ios` and `store/android`, captured by `store/capture.sh` from `store/capture.yaml` on a Release build; the Store screenshots workflow captures and commits the App Store's. A new screen worth showing in the stores gets its step in `capture.yaml`.
- `.web.ts(x)` is the desktop app, never a browser build, and each platform file needs a non-platform neighbour.
- `index.js` loads `src/polyfills` before Expo Router: viem and WalletConnect capture `globalThis.crypto` as they evaluate.
- Protocols live in `src/protocols/<name>/` behind `ChatSession`; persistence lives in `src/storage`.
- `src/core/usage/tracker.ts`, `use-usage.ts` and `usage-vectors.json` are byte-for-byte copies of Kestrel's and Grenier's: change all three repositories together.
- When a change alters how the app is used or what it sends, update the guide or privacy policy in the laibe repository (`content/statim/`).

## Design

- Statim follows the laibe design system v0.1.0 (`git.laibe.cc/anthony/design`) with the `ultraviolet` accent. Before a UI change, read its `principles.md` and the component pages it touches.
- `Palette` in `src/design/tokens.ts` is the system's colours under Statim's names (brand → accent, canvas → bg, surface → panel, content → fg); `src/global.css` carries the same values.
- Inter for what people read and write, JetBrains Mono for the interface, both bundled (`src/design/fonts.ts`); `Text` picks the face from its weight. The desktop has the system's status bar with contextual hints.

## Words

Say chat (not conversation or room), participant (not peer or user), account (not identity or profile), request with accept and decline (not invite or reject; declining never blocks), plugin (not extension), slash command and CLI command (not just command). Protocol is XMTP, Matrix, Telegram, Nostr or Status; network is where a chat lives, such as a bridged WhatsApp; chain is a blockchain. Code that mirrors a protocol's API keeps its words.
