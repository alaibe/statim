# On the Mac

The desktop app is the same app in a window: every screen, every protocol, every
plugin. The layout puts a sidebar of chats beside the open chat,
the way Telegram for macOS does, and a keyboard and a pointer take over from
taps.

## What changes

- **⌘K** opens the switcher: type a few letters of a chat and press Enter.
- **⌘F** searches messages: inside a chat it searches only that chat.
- **⌘N** starts a new message, **⌘,** opens settings, **⌘1/2/3** switch tabs.
- **Enter** sends; **Shift-Enter** makes a new line.
- **Right-click** a message for what long-press does on the phone.
- **Esc** closes whatever is on top: a sheet, a picker, the emoji panel.
- Settings pages open beside the list rather than over it; new chat, QR and
  profile are centred dialogs.
- The emoji and GIF panel is a popover above the button that opened it, with
  the search already focused, so you can type and press Enter for the first
  match.
- Photos, files and voice notes all work. A photo is compressed before it goes;
  a received file opens in whatever handles its type.
- Sharing means copying to the clipboard. An invite also opens Messages.
- Closing the window leaves Statim running, so messages and notifications
  keep arriving. The Dock icon keeps its badge, and an icon in the menu bar
  shows the unread count. Click the Dock icon, or choose Open Statim from the
  menu bar icon, to bring the window back; **⌘Q** quits. On Windows and Linux
  the icon sits in the system tray with Open Statim and Quit in its menu, and
  **Ctrl+Q** also quits.
- **Settings → Security** locks the app with Touch ID, on a Mac that has it,
  or with a PIN, which the lock screen also takes from the keyboard.

## Where your data lives

Everything sits under `~/Library/Application Support/im.statim.app/`:
the encrypted vault holding recovery phrases and keys, one encrypted database
per account, and the Telegram and Matrix data for each account. The vault's key
is in the macOS Keychain. The one exception is XMTP's copy of your chats, which
its library keeps in the app's web storage; it comes back from the XMTP network
if lost.

Erasing an account from Settings removes all of it.

## Hardware wallets

A Ledger connects over USB. Keystone signs by showing and scanning QR codes,
which needs a camera, so use the phone for a Keystone account.
