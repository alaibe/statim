# AI

AI rewrites what you are about to send, translates, summarises a chat and
suggests replies. It is off until you turn on **AI in chats** in **Settings ›
AI**. Commands run when you ask. You can also enable reply suggestions when
you open a chat. Nothing is sent to the chat until you press send yourself.

## Replies when you open a chat

In **Settings › AI**, enter your **TypeSafe API key**, turn on **Suggest replies
on open**, and press **Save**. Get a key from the
[TypeSafe console](https://console.typesafe.ai). Select and test your reply
model below; Jev decides whether you need to answer, and that model writes the reply.

When you open a DM or group with an incoming message last and an empty composer,
Statim sends up to 20 recent messages to TypeSafe's Jev. If its estimated
probability that a reply is needed is at least 70%, your selected model prepares
a short suggestion above the composer. Tap **Use reply** to edit it before
sending, or dismiss it. Suggestions may take a moment to appear.

The check also runs when a new message arrives in the open chat. It skips
channels, threads, requests, blocked chats and chats where you cannot send.
Typing, leaving the chat or switching accounts discards unfinished suggestions.
An error leaves the composer available; you can still use **Suggest a reply**
manually.

## Chats needing a reply

**Highlight chats needing a reply** adds a **Reply needed** badge to the chat
list. It is a separate opt-in under **Settings › AI** and uses your TypeSafe
key. Only chats visible in the list are checked; Statim loads their recent
history without marking them read. Requests, blocked chats, channels and local
bot chats are excluded.

The badge has a text label and a coloured background. Unread counts, pins and
chat ordering stay as they are. Sending a message clears the badge. Jev's
decision is shared with reply suggestions while the account remains open, so
opening an unchanged chat does not need a second decision request.

## Follow-ups

**Suggest follow-ups** is a separate opt-in under **Settings › AI**. Once your
latest sent message has waited at least 24 hours without an answer, Jev checks
whether your question or request is still unresolved. It skips failed and
unsent messages. A positive decision adds a **Follow up** badge to the chat list
and prepares a polite nudge when you open the chat with an empty composer.

This works even if **Suggest replies on open** and **Highlight chats needing a
reply** are off. It checks while you view the list or chat; it does not schedule
notifications. A new answer removes the follow-up. You review, edit and send
the suggestion yourself.

## The commands

Once it is on, chips sit above the composer in DMs and groups. Each has
a slash command behind it that you can also type.

| Chip | Slash command | Does |
| --- | --- | --- |
| **Rewrite** | `/rewrite [style] <text>` | Rewrites your text and puts it back in the composer. Styles: `clearer` (the default), `shorter`, `simpler`, `formal`, `friendly`. The chip shows up once you have typed something. |
| **Translate** | `/translate [language] [text]` | On its own, translates the last message someone else sent, into your phone's language or the one you name. With text, translates it for you to send: `/translate es see you Thursday`. |
| **Summarize** | `/summarize [n]` | Summarises the last 50 messages, or `n` of them, in a few bullet points. |
| **Suggest a reply** | `/suggest` | Offers three short replies to the latest messages. Tap one to put it in the composer. |

Summaries, suggestions and translations of other people's messages come back as
cards marked "Only you can see this". Each card names the model that wrote it
and where it ran. A summary can get a detail wrong, such as who said what, so
its card says it may contain mistakes.

## Where the model runs

Below the switch, **Settings › AI** picks the model.

**Automatic** is the default and keeps everything on your device:

- On an iPhone, iPad or Mac with iOS or macOS 26, it is Apple Intelligence.
  That needs an iPhone 15 Pro or later, or a Mac with Apple silicon, and
  Apple Intelligence turned on in **Settings › Apple Intelligence & Siri**.
- On Android, it is Gemini Nano, on the phones that carry it, such as a Pixel 9
  or later and the Galaxy S26. Gemini Nano only answers while Statim is open,
  and Android limits how much an app may ask of it in a day.
- On a computer without either, it uses Ollama if it runs on that computer.

The model on a phone is small. It handles rewriting and short replies well; a
summary of a long chat covers only the latest messages that fit, and says how
many.

**Your server** is any server that speaks OpenAI's chat API: Ollama, llama.cpp
or llama-swap, LM Studio, OpenAI or OpenRouter. Give it the address, an API
key if it wants one, and a model. **Find models** lists what the server has.

**Anthropic** uses Claude with your API key. The model defaults to
`claude-opus-5-5`; any model name your key can use works.

**Try it** sends a short test request and says how long the answer took.

## Translation

Translation uses the device's own translator first: Apple Translation on an
iPhone, iPad or Mac, ML Kit on Android. It is offline and does not need Apple
Intelligence or Gemini Nano.

Apple Translation only uses languages you have downloaded:

- iPhone and iPad: **Settings › Apps › Translate › Downloaded Languages**
- Mac: **System Settings › General › Language & Region › Translation Languages**

On Android, ML Kit downloads a language the first time you use it, about 30 MB.
Its translations are marked "Translated by Google", and Google asks apps that
show them to carry this notice: THIS SERVICE MAY CONTAIN TRANSLATIONS POWERED BY
GOOGLE. GOOGLE DISCLAIMS ALL WARRANTIES RELATED TO THE TRANSLATIONS, EXPRESS OR
IMPLIED, INCLUDING ANY WARRANTIES OF ACCURACY, RELIABILITY, AND ANY IMPLIED
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT.

When the device has no translator for a language, the model you set up
translates instead, and the card names it.

## Your own server from a phone

A phone is stricter than a computer about plain `http://`:

- An iPhone connects over `http://` only to names on your network, such as
  `mac-mini.local`, or a machine's short name on Tailscale, such as
  `http://llm-box:8080`. Use `https://` for any other address.
- Android connects only to `https://` servers.

On a computer, any address works. Ollama's default is
`http://localhost:11434/v1`.

## What leaves your device

- **Automatic** with a model on the device: nothing.
- **Your server** and **Anthropic**: the text of each request goes to that
  server. That is what you rewrite or translate, and for `/summarize` and
  `/suggest` the recent messages of the chat. In a group those include other
  people's messages, and they did not choose your server.

- **Suggest replies on open**: recent messages also go to TypeSafe for the
  decision, even if your reply model runs on your device. The suggestion itself
  uses your selected model. This setting is off by default.

API keys stay on this device with your account's other keys. The TypeSafe key
only goes to TypeSafe; the reply model's key only goes to its configured server.
