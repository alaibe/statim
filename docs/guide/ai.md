# AI

The AI plugin rewrites what you are about to send, translates, summarises a
chat and suggests replies. It is off until you turn it on in **Settings ›
Plugins**, like every other plugin, and it only runs when you ask: nothing is
read in the background and nothing is sent until you press send yourself.

## The commands

Once the plugin is on, chips sit above the composer in DMs and groups. Each has
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

**Settings › AI** picks the model.

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

The API key stays on this device with your account's other keys, and only goes
to the server it was saved for.
