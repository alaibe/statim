import { Text as RNText, View } from "react-native";

import { useThemeColors } from "../hooks/use-theme-colors";
import { Radius, Space, withAlpha } from "../tokens";
import { Text, textStyle } from "./text";

const mac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);

const NAMES: Record<string, [mac: string, other: string]> = {
  mod: ["⌘", "Ctrl"],
  shift: ["⇧", "Shift"],
  alt: ["⌥", "Alt"],
  ctrl: ["⌃", "Ctrl"],
  enter: ["↵", "Enter"],
  backspace: ["⌫", "Backspace"],
  esc: ["Esc", "Esc"],
  up: ["↑", "↑"],
  down: ["↓", "↓"],
  left: ["←", "←"],
  right: ["→", "→"],
  tab: ["Tab", "Tab"],
  f6: ["F6", "F6"],
};

/** A key as the platform names it: symbols on macOS, words elsewhere, letters uppercase. */
export function keyLabel(key: string): string {
  const named = NAMES[key.toLowerCase()];
  if (named) return mac ? named[0] : named[1];
  return key.length === 1 ? key.toUpperCase() : key;
}

/** A shortcut as plain text, for a tooltip or an accessibility label: `⌘K`, `Ctrl+K`. */
export function shortcutText(keys: readonly string[]): string {
  return keys.map(keyLabel).join(mac ? "" : "+");
}

const CAP = { ...textStyle("control"), fontSize: 11, lineHeight: 13 };

/** One key: `bg`, a `line-strong` border doubled at the bottom, mono 11 in `muted`. */
export function Keycap({ label, onAccent = false }: { label: string; onAccent?: boolean }) {
  const colors = useThemeColors();
  if (onAccent) {
    return <RNText style={[CAP, { color: withAlpha(colors["on-accent"], 0.6) }]}>{keyLabel(label)}</RNText>;
  }
  return (
    <View
      style={{
        minWidth: Space[5],
        height: Space[5],
        paddingHorizontal: Space[1],
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Radius.sm,
        backgroundColor: colors.bg,
        borderColor: colors["line-strong"],
        borderWidth: 1,
        borderBottomWidth: 2,
      }}
    >
      <RNText style={[CAP, { color: colors.muted }]}>{keyLabel(label)}</RNText>
    </View>
  );
}

interface KeysProps {
  keys: readonly string[];
  /** A sequence (`G` then `I`) rather than a chord. */
  sequence?: boolean;
  onAccent?: boolean;
}

/** A shortcut: its keys 2 apart, a sequence joined by `then`. */
export function Keys({ keys, sequence = false, onAccent = false }: KeysProps) {
  return (
    <View
      accessible
      accessibilityLabel={sequence ? keys.map(keyLabel).join(" then ") : shortcutText(keys)}
      style={{ flexDirection: "row", alignItems: "center", gap: Space[1] }}
    >
      {keys.map((key, index) => (
        <View key={`${key}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: Space[1] }}>
          {sequence && index > 0 ? (
            <Text variant="meta" tone="muted" style={{ marginHorizontal: Space[1] }}>
              then
            </Text>
          ) : null}
          <Keycap label={key} onAccent={onAccent} />
        </View>
      ))}
    </View>
  );
}
