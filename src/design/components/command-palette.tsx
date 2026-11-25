import { useMemo, useState } from "react";
import {
  Modal,
  Pressable as RNPressable,
  Text as RNText,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon, type IconName } from "../icon";
import { useEscapeKey } from "../lib/escape-key";
import { desktop } from "../lib/platform";
import { Control, Layout, Space } from "../tokens";
import { IconButton } from "./button";
import { DialogSurface, scrimColor } from "./dialog";
import { BARE } from "./input";
import { Keys } from "./keycap";
import { Pressable } from "./pressable";
import { Text, textStyle } from "./text";

export interface PaletteEntry {
  id: string;
  label: string;
  /** Actions and places read as interface, in mono; items (chats, records) as content, in sans. */
  kind: "action" | "place" | "item";
  icon?: IconName;
  leading?: React.ReactNode;
  keys?: readonly string[];
  sequence?: boolean;
  run(): void;
}

export interface PaletteGroup {
  label: string;
  entries: readonly PaletteEntry[];
}

interface CommandPaletteProps {
  visible: boolean;
  onClose(): void;
  groups: readonly PaletteGroup[];
  query: string;
  onQuery(query: string): void;
}

/** `>` lists only actions, `#` only items; the rest matches every entry's name. */
export function filterPalette(groups: readonly PaletteGroup[], query: string): PaletteGroup[] {
  const raw = query.trimStart();
  const only = raw.startsWith(">") ? "action" : raw.startsWith("#") ? "item" : null;
  const wanted = (only ? raw.slice(1) : raw).trim().toLowerCase();
  return groups
    .map((group) => ({
      label: group.label,
      entries: group.entries.filter(
        (entry) =>
          (!only || entry.kind === only || (only === "action" && entry.kind === "place")) &&
          (!wanted || entry.label.toLowerCase().includes(wanted)),
      ),
    }))
    .filter((group) => group.entries.length > 0);
}

/** ⌘K: every action, every place and recent items by name. */
export function CommandPalette({ visible, onClose, groups, query, onQuery }: CommandPaletteProps) {
  const colors = useThemeColors();
  const window = useWindowDimensions();
  const [index, setIndex] = useState(0);
  useEscapeKey(visible, onClose);

  const shown = useMemo(() => filterPalette(groups, query), [groups, query]);
  const flat = shown.flatMap((group) => group.entries);
  const selected = Math.min(index, Math.max(flat.length - 1, 0));
  const wanted = query.replace(/^[>#]/, "").trim().toLowerCase();

  const run = (entry: PaletteEntry, keepOpen = false) => {
    if (!keepOpen) onClose();
    entry.run();
  };

  const onKeyPress = (event: { nativeEvent: unknown; preventDefault(): void }) => {
    const key = event.nativeEvent as KeyboardEvent;
    if (key.key === "ArrowDown") {
      event.preventDefault();
      setIndex((value) => (flat.length ? (value + 1) % flat.length : 0));
    } else if (key.key === "ArrowUp") {
      event.preventDefault();
      setIndex((value) => (flat.length ? (value - 1 + flat.length) % flat.length : 0));
    } else if (key.key === "Enter") {
      event.preventDefault();
      const entry = flat[selected];
      if (entry) run(entry, key.metaKey || key.ctrlKey);
    }
  };

  if (!visible) return null;

  const input = (
    <View
      style={{
        height: Layout["palette-input"],
        flexDirection: "row",
        alignItems: "center",
        gap: Space[2],
        paddingHorizontal: Space[4],
        borderBottomWidth: 1,
        borderColor: colors.line,
      }}
    >
      <RNText style={[PROMPT, { color: colors.accent }]}>{">"}</RNText>
      <TextInput
        {...BARE}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Command"
        placeholder="Type a command or a chat"
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        value={query}
        onChangeText={(text) => {
          onQuery(text);
          setIndex(0);
        }}
        onKeyPress={onKeyPress}
        style={[PROMPT, { flex: 1, height: "100%", color: colors.fg }]}
      />
      {desktop ? null : <IconButton icon="x" label="Close" onPress={onClose} />}
    </View>
  );

  const results = (
    <ScrollView
      keyboardShouldPersistTaps="always"
      style={{ flexShrink: 1 }}
      contentContainerStyle={{ paddingBottom: Space[1] }}
    >
      {flat.length === 0 ? (
        <View style={{ paddingHorizontal: Space[4], paddingVertical: Space[3] }}>
          <Text tone="muted">No command matches “{query.trim()}”.</Text>
        </View>
      ) : null}
      {shown.map((group) => (
        <View key={group.label} accessibilityRole="list">
          <View style={{ paddingTop: Space[3], paddingHorizontal: Space[4], paddingBottom: Space[1] }}>
            <Text variant="label">{group.label}</Text>
          </View>
          {group.entries.map((entry) => {
            const on = flat[selected] === entry;
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityLabel={entry.label}
                accessibilityState={{ selected: on }}
                onPress={() => run(entry)}
                onHoverIn={() => setIndex(flat.indexOf(entry))}
                style={{
                  height: desktop ? Control.lg : Control.touch,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: Space[3],
                  paddingHorizontal: Space[4],
                  backgroundColor: on ? colors["accent-soft"] : "transparent",
                }}
              >
                {on ? (
                  <View
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      backgroundColor: colors.accent,
                    }}
                  />
                ) : null}
                {entry.leading ?? (entry.icon ? <Icon name={entry.icon} size={16} tone="muted" /> : null)}
                <Highlighted label={entry.label} wanted={wanted} content={entry.kind === "item"} />
                {entry.keys && desktop ? <Keys keys={entry.keys} sequence={entry.sequence} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );

  if (!desktop) {
    return (
      <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.panel }}>
          {input}
          {results}
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <RNPressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{
          flex: 1,
          alignItems: "center",
          paddingTop: window.height * 0.2,
          paddingHorizontal: Space[4],
          backgroundColor: scrimColor(colors, true),
        }}
      >
        <DialogSurface width="palette">
          <View style={{ maxHeight: 440 }}>
            {input}
            {results}
            <View
              style={{
                height: Control.sm,
                flexDirection: "row",
                alignItems: "center",
                gap: Space[4],
                paddingHorizontal: Space[4],
                backgroundColor: colors.void,
              }}
            >
              {["↵ run", "↑↓ move", "esc close"].map((hint) => (
                <RNText key={hint} style={[FOOTER, { color: colors.muted }]}>
                  {hint}
                </RNText>
              ))}
            </View>
          </View>
        </DialogSurface>
      </RNPressable>
    </Modal>
  );
}

const PROMPT = { ...textStyle("code"), fontSize: 15, lineHeight: 20 };
const FOOTER = { ...textStyle("code"), fontSize: 11, lineHeight: 13 };

/** The entry's name with the matched characters in `accent`. */
function Highlighted({ label, wanted, content }: { label: string; wanted: string; content: boolean }) {
  const colors = useThemeColors();
  const style = content ? textStyle("body") : textStyle("control");
  const at = wanted ? label.toLowerCase().indexOf(wanted) : -1;
  return (
    <RNText numberOfLines={1} style={[style, { flex: 1, color: colors.fg }]}>
      {at < 0 ? (
        label
      ) : (
        <>
          {label.slice(0, at)}
          <RNText style={{ color: colors.accent }}>{label.slice(at, at + wanted.length)}</RNText>
          {label.slice(at + wanted.length)}
        </>
      )}
    </RNText>
  );
}
