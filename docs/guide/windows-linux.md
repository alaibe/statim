# On Windows and Linux

The desktop app is the same app in a window, with a sidebar of chats beside the
open chat. It works as it does [on the Mac](mac.md), with Ctrl where the Mac
uses ⌘.

## Installing

Download it from the [download page](https://statim.laibe.cc/#download). Both
builds are for 64-bit Intel and AMD processors.

On Windows, run the `-setup.exe` installer, or the `.msi` package if you deploy
software that way. Windows warns about it the first time;
[the FAQ](../faq.md#why-does-my-computer-warn-me-when-i-install-it) says why and
what to click.

On Linux, install the `.deb` on Debian and Ubuntu or the `.rpm` on Fedora and
openSUSE, or run the AppImage on anything else after making it executable:

```sh
chmod +x Statim_*.AppImage
./Statim_*.AppImage
```

Both Windows installers and the Linux packages also put the `statim` command
on your PATH. With the AppImage, [add it from the app](command-line.md#installing-it).

## What changes

- **Ctrl+K** opens the switcher: type a few letters of a chat and press Enter.
- **Ctrl+F** searches messages: inside a chat it searches only that chat.
- **Ctrl+N** starts a new message, **Ctrl+,** opens settings, **Ctrl+1/2/3**
  switch tabs.
- The menu bar under the title bar lists these shortcuts too. **Go** also
  opens a filter or folder of the chat list, and **Help → Check for Updates…**
  looks for a new version. To hide the menu bar, turn on
  **Settings → Appearance → Hide menu bar**; Alt then shows it until your next
  click.
- **Enter** sends; **Shift+Enter** makes a new line. **Ctrl+B**, **Ctrl+I** and
  **Ctrl+Shift+X** make the selected text bold, italic or struck through, and
  **Ctrl+E** makes it code.
- **Right-click** a message for what long-press does on the phone.
- **Esc** closes whatever is on top: a sheet, a picker, the emoji panel.
- Settings pages open beside the list rather than over it; new chat, QR and
  profile are centred dialogs.
- The emoji and GIF panel is a popover above the button that opened it, with
  the search already focused, so you can type and press Enter for the first
  match.
- Photos, files and voice notes all work. A photo is compressed before it goes;
  a received file opens in whatever handles its type.
- Sharing means copying to the clipboard.
- Closing the window leaves Statim running, so messages and notifications
  keep arriving. Its icon in the system tray shows that you have unread
  messages. On Windows, click the icon to bring the window back; on Linux,
  choose **Open Statim** from its menu. **Ctrl+Q**, or **Quit Statim** in the
  same menu, quits. Turn on **Settings → Notifications → Open at login** to
  have it start that way, without a window, each time you log in.
- GNOME as Fedora ships it has no system tray. Install the AppIndicator
  extension to see the icon, or open Statim from your applications again: a
  second launch brings back the window of the copy already running.
- **Settings → Security** locks the app with a PIN, which the lock screen also
  takes from the keyboard. There is no Windows Hello or fingerprint unlock.

## Where your data lives

Everything sits in one folder: `%APPDATA%\im.statim.app\` on Windows, and
`~/.local/share/im.statim.app/` on Linux. It holds the encrypted vault with
recovery phrases and keys, one encrypted database per account, and the
Telegram and Matrix data for each account. The one exception is XMTP's copy of
your chats, which its library keeps in the app's web storage; it comes back
from the XMTP network if lost.

The vault's key is kept in the system's credential store: Credential Manager on
Windows, and on Linux the Secret Service, which GNOME Keyring and KWallet both
provide. Most desktops run one already. On a bare window manager, start
`gnome-keyring-daemon` or KWallet before Statim, or it cannot open the vault.

Erasing an account from Settings removes all of it.

## Hardware wallets

A Ledger connects over USB; open its Ethereum app first. Windows needs nothing
more. On Linux, install Ledger's
[udev rules](https://github.com/LedgerHQ/udev-rules) once so the app can reach
the device without root, then plug it in again. Keystone and Trezor accounts
work on the phone, not on a computer.
