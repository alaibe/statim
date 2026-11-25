import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";

import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon, type IconName } from "../icon";
import { desktop } from "../lib/platform";
import { type PressHandler, runPress } from "../lib/press";
import { Control, Radius, Space } from "../tokens";
import { SearchField } from "./input";
import { Keys } from "./keycap";
import { Pressable } from "./pressable";
import { closeSheetThen, Sheet, type SheetProps } from "./sheet";
import { Text } from "./text";

export interface MenuItem {
  label: string;
  icon?: IconName;
  /** Its shortcut, shown on the right on the desktop. */
  keys?: readonly string[];
  /** Destructive: last, after a separator, in `danger`. */
  danger?: boolean;
  /** A `check` in `accent` in the icon slot. */
  selected?: boolean;
  disabled?: boolean;
  onPress: PressHandler;
}

export interface MenuProps extends Omit<SheetProps, "children"> {
  /** Picking one closes the menu before it runs. */
  items: MenuItem[];
  /** Past a handful of items the menu gets a search field; past twelve it belongs in the palette. */
  searchFor?: string;
}

export const MANY_OPTIONS = 8;

const LIST_MAX = 360;

/** A short list of actions on the current thing: a popover on the desktop, a bottom sheet on a phone. */
export function Menu({ items, searchFor, ...sheet }: MenuProps) {
  const [query, setQuery] = useState("");
  const searchable = items.length >= MANY_OPTIONS;

  const shown = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    const matching = searchable && wanted ? items.filter((item) => item.label.toLowerCase().includes(wanted)) : items;
    return [...matching.filter((item) => !item.danger), ...matching.filter((item) => item.danger)];
  }, [items, query, searchable]);
  const firstDanger = shown.findIndex((item) => item.danger);

  return (
    <Sheet {...sheet}>
      {searchable ? (
        <SearchField
          placeholder={searchFor ? `Search ${searchFor}` : "Search"}
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery("")}
          returnKeyType="search"
          testID="sheet-search"
        />
      ) : null}
      <Scroller scroll={searchable}>
        {shown.length === 0 ? (
          <View style={{ paddingVertical: Space[4] }}>
            <Text size="sm" tone="muted" align="center">
              Nothing matches “{query.trim()}”.
            </Text>
          </View>
        ) : null}
        {shown.map((item, index) => (
          <View key={`${item.label}-${index}`}>
            {index === firstDanger && index > 0 ? <MenuSeparator /> : null}
            <MenuRow item={item} onRun={() => closeSheetThen(sheet, () => void runPress(item.onPress))} />
          </View>
        ))}
      </Scroller>
    </Sheet>
  );
}

export function MenuSeparator() {
  const colors = useThemeColors();
  return <View style={{ height: 1, marginVertical: Space[1], backgroundColor: colors.line }} />;
}

/** Height 28 (touch 44), radius `sm`; Lucide in `muted`, the label in mono `sm`, keys on the right. */
export function MenuRow({ item, onRun }: { item: MenuItem; onRun(): void }) {
  const colors = useThemeColors();
  const tone = item.disabled ? "subtle" : item.danger ? "danger" : "fg";

  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={item.label}
      accessibilityState={{ disabled: item.disabled, checked: item.selected }}
      disabled={item.disabled}
      onPress={onRun}
      style={({ hovered, pressed }) => ({
        height: desktop ? Control.sm : Control.touch,
        paddingHorizontal: Space[2],
        flexDirection: "row",
        alignItems: "center",
        gap: Space[2],
        borderRadius: Radius.sm,
        backgroundColor: (hovered || (pressed && !desktop)) && !item.disabled ? colors.hover : "transparent",
      })}
    >
      {({ hovered }) => (
        <>
          {item.selected ? (
            <Icon name="check" size={desktop ? 16 : 20} tone="accent" />
          ) : item.icon ? (
            <Icon
              name={item.icon}
              size={desktop ? 16 : 20}
              tone={item.danger ? "danger" : hovered && !item.disabled ? "fg" : "muted"}
            />
          ) : null}
          <Text variant="control" tone={tone} numberOfLines={1} style={{ flex: 1 }}>
            {item.label}
          </Text>
          {item.keys && desktop ? <Keys keys={item.keys} /> : null}
        </>
      )}
    </Pressable>
  );
}

/** A sheet sizes to its contents and a ScrollView has no size of its own, so only a long list gets one. */
function Scroller({ scroll, children }: { scroll: boolean; children: React.ReactNode }) {
  if (!scroll) return <View>{children}</View>;
  return (
    <ScrollView
      style={{ maxHeight: LIST_MAX }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}
