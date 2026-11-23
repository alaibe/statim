/** Button contracts, not typed commands: third-party bots build inline keyboards on `/reply <text>`. */
type ButtonCommand =
  | { kind: "draft"; text: string }
  | { kind: "reply"; text: string }
  | { kind: "command"; text: string };

export function buttonCommand(raw: string): ButtonCommand {
  const text = raw.trim();
  if (text.startsWith("/draft ")) return { kind: "draft", text: raw.replace(/^\s*\/draft /, "") };
  if (text.startsWith("/reply ")) return { kind: "reply", text: text.slice("/reply ".length) };
  return { kind: "command", text };
}
