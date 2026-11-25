import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import Animated from "react-native-reanimated";

import { Divider, Enter, Exit, Pressable, Radius, Shadow, useThemeColors } from "@/design";

export function SuggestionPopover<T>({
  items,
  keyOf,
  onPick,
  render,
  testID,
  itemTestID,
  labelOf,
}: {
  items: T[];
  keyOf: (item: T) => string;
  onPick: (item: T) => void;
  render: (item: T) => ReactNode;
  testID?: string;
  itemTestID?: (item: T) => string;
  labelOf?: (item: T) => string;
}) {
  const colors = useThemeColors();
  if (items.length === 0) return null;
  return (
    <Animated.View
      entering={Enter.fade()}
      exiting={Exit.fade()}
      className="mx-4 mb-2 overflow-hidden p-1"
      style={{
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: colors["line-strong"],
        backgroundColor: colors.panel,
        boxShadow: Shadow.popover,
      }}
    >
      <ScrollView testID={testID} keyboardShouldPersistTaps="handled" nestedScrollEnabled className="max-h-64">
        {items.map((item, index) => (
          <View key={keyOf(item)}>
            {index > 0 ? <Divider /> : null}
            <Pressable
              testID={itemTestID?.(item)}
              accessibilityRole="button"
              accessibilityLabel={labelOf?.(item)}
              onPress={() => onPick(item)}
              className="flex-row items-baseline gap-2 px-2 py-2.5"
              style={({ hovered, pressed }) => ({
                borderRadius: Radius.sm,
                backgroundColor: hovered || pressed ? colors.hover : "transparent",
              })}
            >
              {render(item)}
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}
