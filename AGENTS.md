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
- Change generated files at their source: `ios/` and `android/` from `app.json`; `src/storage/migrations/index.ts` with `npm run db:bundle`; `src/global.css` and `src/design/laibe/tokens.json` with `npm run tokens`; `skills/statim/SKILL.md`, `src-tauri/cli/help.txt`, `src-tauri/cli/mcp.json`, the icons, `chat-pattern-tile.ts` and the token lists with the generators in `priv/`.
- `priv/` is gitignored and holds the maintainer's material and tooling; a worktree has none, so use the main checkout's.
- Screenshots follow the design system's `patterns/screenshots.md`: `screenshots/capture.sh site|store-ios|store-android` runs the flows `screenshots/site.yaml` (the guide's, into laibe) and `screenshots/store.yaml` (into `screenshots/store/`), and the weekly Screenshots workflow commits them. A new screen worth showing gets its step in the flow.
- `.web.ts(x)` is the desktop app, never a browser build, and each platform file needs a non-platform neighbour.
- `index.js` loads `src/polyfills` before Expo Router: viem and WalletConnect capture `globalThis.crypto` as they evaluate.
- Protocols live in `src/protocols/<name>/` behind `ChatSession`; persistence lives in `src/storage`.
- `src/core/usage/tracker.ts`, `use-usage.ts` and `usage-vectors.json` are byte-for-byte copies of Kestrel's and Grenier's: change all three repositories together.
- When a change alters how the app is used or what it sends, update the guide or privacy policy in the laibe repository (`content/statim/`).

## Design

- Statim follows the laibe design system as of 2026-11-25 (`git.laibe.cc/anthony/design`) with the `ultraviolet` accent. Before a UI change, read its `principles.md` and the component pages it touches.
- `src/design/laibe/tokens.css` is the system's `tokens/tokens.css`, byte for byte: replace it on a new entry in the system's changelog, never edit it, and run `npm run tokens`, which writes the colours (light and dark), sizes, radii, durations and shadows under the system's names into `src/design/laibe/tokens.json` and `src/global.css`. Tailwind's theme is that and nothing else.
- `src/design/components` ports the system's `components.css` to React Native, one file per component page, named like the page, with every value kept. Screens use them and set no colour, radius or type themselves: `className` is for layout only, and lint fails on a colour, radius, type or arbitrary class, or a raw colour, in `src/app`, `src/features` or `src/plugins`. `Text` takes the typography roles (`display title heading label control meta body reading code stat`). One primary button per screen: `Screen`, dialogs and sheets report a second one in development.
- Inter for what people read and write, JetBrains Mono for the interface, both bundled (`src/design/fonts.ts`). Icons are Lucide (`src/design/icon.tsx`, 16/20/24); network marks are Statim's own.
- The shell is the system's app shell. Phones: the system's tab bar and `PhoneHeader` (live state as its subtitle), dialogs as bottom sheets, the palette from the Chats search button. Desktop (`app-frame.web.tsx`): title bar, sidebar of places, list, detail and status bar, collapsing below 1100 and 860.
- Every action is one entry in `src/features/navigation/commands.ts`: the keymap (`keymap.web.ts`, every shared key of `patterns/keyboard.md`), the ⌘K palette, the `?` overlay, the status bar's hints and the app menu's ids (`src-tauri/src/app_menu.rs`, checked by `commands.test.ts`) all read it.

## Words

Say chat (not conversation or room), participant (not peer or user), account (not identity or profile), request with accept and decline (not invite or reject; declining never blocks), plugin (not extension), slash command and CLI command (not just command). Protocol is XMTP, Matrix, Telegram, Nostr or Status; network is where a chat lives, such as a bridged WhatsApp; chain is a blockchain. Code that mirrors a protocol's API keeps its words.
