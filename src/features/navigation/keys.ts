import { COMMANDS, type Command, type CommandScope } from "./commands";

const NAMED: Record<string, string> = {
  ArrowDown: "down",
  ArrowUp: "up",
  ArrowLeft: "left",
  ArrowRight: "right",
  Escape: "esc",
  Enter: "enter",
  F6: "f6",
};

export function editable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
  );
}

/** A keydown as the registry writes keys: `["mod", "k"]`, `["shift", "f6"]`, `["?"]`. */
export function keysOf(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): string[] {
  const key = NAMED[event.key] ?? event.key.toLowerCase();
  const printable = key.length === 1;
  return [
    ...(event.metaKey || event.ctrlKey ? ["mod"] : []),
    ...(event.shiftKey && !printable ? ["shift"] : []),
    ...(event.altKey ? ["alt"] : []),
    key,
  ];
}

export const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((k, i) => k === b[i]);

/** The command a key press runs, if any; single letters never fire inside a text field. */
export function commandFor(keys: readonly string[], editing: boolean, scope: CommandScope): Command | undefined {
  const plain = !keys.includes("mod") && !keys.includes("alt");
  if (editing && (plain || same(keys, ["mod", "z"]))) return undefined;
  return COMMANDS.find(
    (command) =>
      !command.sequence && command.keys && same(command.keys, keys) && (!command.when || command.when(scope)),
  );
}
