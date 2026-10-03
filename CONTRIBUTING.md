# Contributing

## Set up the project

Start with the [README quick start](README.md#quick-start) for the required
toolchain. The iOS app needs Xcode and a simulator; the desktop app also needs
Rust. Expo Go cannot run this project because it uses native modules.

From the repository root:

```bash
npm install
npx expo run:ios
```

For later iOS sessions, boot the simulator and run `npm start`. Run
`npm run desktop` to work on the desktop app.

## Make a change

1. Read [AGENTS.md](AGENTS.md) before editing. It covers the pinned Expo docs,
   generated files, platform files, and other repository rules.
2. Find the closest existing feature and its tests. App code is under `src/`;
   native desktop code is under `src-tauri/`. Follow the patterns already used
   nearby and keep the change focused.
3. Add or update tests when behavior changes. Update the user guide in `docs/`
   when the way people use the app changes.
4. Leave generated files as they are, except database migrations, which you
   generate as [AGENTS.md](AGENTS.md) describes. The maintainer regenerates the
   rest from your source change. If you change a dependency patch, update
   [patches/README.md](patches/README.md).

## Check your work

Run these before opening a pull request:

```bash
npm run format && npm run typecheck && npm run lint && npm test
```

For changes to a screen or user flow, also run `npm run test:e2e` with Metro and
an iOS simulator running. See [e2e/README.md](e2e/README.md) for setup and
flow conventions.

In the pull request, explain what changed, why, and how you tested it. Call out
any checks you could not run. Keep commits focused and use messages that say
what the change does.

Report vulnerabilities through the private route in [SECURITY.md](SECURITY.md),
not a public issue.
