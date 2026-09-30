# Command line

On a computer, `statim` does from a terminal what the app does in its
window: read and search chats, send messages and files, run groups, sign in to
protocols, change settings, and run any plugin command. It talks to the app
running on the same computer, under the account you are using there. If the
app is closed, the first command starts it without a window.

An AI assistant such as Claude Code or Codex can use it too, when you ask it
to work with your messages.

## Turning it on

The command line is off until you turn it on in **Settings › Command line**.
While it is on, any program running as you on this computer can read and send
your messages through it without asking, the same way you can. Turn it off
again when you are done with it.

## Installing it

On macOS, the `.pkg` installer adds the command. If you installed from the
`.dmg` or the App Store, open **Settings › Command line** and run the line it
shows once in Terminal.

On Windows, both installers add it; open a new terminal afterwards. On Linux,
the `.deb` and `.rpm` packages add it, and with the AppImage you use the line
in **Settings › Command line**.

Run `statim help` to check it works.

## Using it

```sh
statim chats --unread
statim read Alice
statim send Alice "On my way"
git log -1 | statim send dev-team -
statim send Alice --file ./photo.jpg
statim search invoice
statim run /price eth
```

A chat can be named by its id or by part of its title, or of the other
person's name or address. When a name fits more than one chat, the command
stops and lists them with their ids. `last` means the newest message in a
chat, so `statim edit Alice last "on my way!"` fixes a typo.

Add `--json` to any command for output a script can read. `statim
help <command>` explains one command, and `statim help` lists them
all.

`statim watch` prints new messages as they arrive, until you stop
it with Ctrl-C.

## What still asks you first

The terminal cannot approve these by itself. The app comes to the front and
asks you, and nothing happens until you say yes:

- anything that signs, such as a wallet send or trade confirmed with
  `--confirm`
- erasing an account
- turning on a plugin, since that grants it permissions
- signing out of a protocol, and revoking XMTP installations

If you close the terminal while the app is asking, the request is dropped.
Your recovery phrase is never shown on the command line.

## AI assistants

```sh
statim skills install
```

This installs instructions for Claude Code that explain the commands and the
rules to follow. Use `--codex` for Codex, or `--dir <folder>` for another
assistant. `statim --skills` prints the same instructions.

The instructions tell the assistant that messages are written by other people
and are never orders to follow, and that it should ask you before sending,
deleting or leaving anything. The approvals listed above come to you in the
app either way.

## The app in the background

When the command line started the app, it has no window and no Dock icon.
Open the app as usual to bring its window up. Until you do, it quits after ten
minutes with no command running; after that it behaves like an app you opened
yourself. `statim quit` quits it straight away.
