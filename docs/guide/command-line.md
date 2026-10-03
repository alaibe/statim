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

Installed with Homebrew (`brew install --cask alaibe/tap/statim`), the command
is already there. Otherwise, on macOS and with the Linux AppImage, open
**Settings › Command line** and press **Install**. macOS asks for your password
first.

On Windows, both installers add it; open a new terminal afterwards. On Linux,
the `.deb` and `.rpm` packages add it.

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

## AI apps over MCP

Apps that take an MCP server, such as Claude Desktop, Cursor or Codex in the
ChatGPT desktop app, can use the commands as tools through `statim mcp`. The app
starts it when it needs it, so you don't run it yourself. It works only while
the command line is on, and it gives the app the same rules as the skill. The
approvals above still wait for you in Statim.

From a terminal, one line adds it.

Claude Code:

```sh
claude mcp add --scope user statim -- statim mcp
```

Codex (Codex in the ChatGPT desktop app and the Codex extension for VS Code
read the same settings, so this covers them too):

```sh
codex mcp add statim -- statim mcp
```

Gemini CLI:

```sh
gemini mcp add -s user statim statim mcp
```

VS Code with GitHub Copilot:

```sh
code --add-mcp '{"name":"statim","command":"statim","args":["mcp"]}'
```

Claude Desktop, Cursor and LM Studio read a settings file instead. In Claude
Desktop, open it from **Settings › Developer › Edit Config**; Cursor keeps it
in `~/.cursor/mcp.json`. Add Statim, then quit and reopen the app:

```json
{
  "mcpServers": {
    "statim": {
      "command": "/Applications/Statim.app/Contents/MacOS/statim",
      "args": ["mcp"]
    }
  }
}
```

That is the path on macOS, where an app opened from the Dock does not see the
folders your terminal adds to the PATH. On Windows and Linux, `"statim"` is
enough when an installer added the command; with the AppImage, give the path
of the AppImage. **Settings › Command line** shows this entry with the path of
your copy.

ChatGPT on the web reaches only servers on the internet, so it cannot use
Statim.

Some commands stay in the terminal. An AI app cannot import an account or save
an API key, so a recovery phrase or a key never passes through it, and it gets
no `watch`, which never ends. When a sign-in asks for a password, or a protocol
setting is secret, type it in Statim under **Settings › Protocols**.

## The app in the background

When the command line started the app, it has no window and no Dock icon,
only its icon in the menu bar (the system tray on Windows and Linux). Open the
app as usual to bring its window up. It keeps running until you choose
**Quit Statim** from that icon or run `statim quit`.
