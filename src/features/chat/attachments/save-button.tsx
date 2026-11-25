import { type ReactNode, useState } from "react";
import { View } from "react-native";

import { Icon, type IconSize, Pressable, Radius, useThemeColors, withAlpha } from "@/design";

/** On a photo: a `void` scrim at 70% behind `fg`, whatever the theme. */
export function SaveButton({ onPress, size = 20 }: { onPress: () => void; size?: IconSize }) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Save as…"
      onPress={onPress}
      hitSlop={8}
      className="items-center justify-center p-1.5"
      style={{ borderRadius: Radius.md, backgroundColor: withAlpha(colors.void, 0.7) }}
    >
      <Icon name="download" size={size} tone="fg" />
    </Pressable>
  );
}

export function HoverSave({ onSave, children }: { onSave?: () => void; children: ReactNode }) {
  const [hovered, setHovered] = useState(false);
  if (!onSave) return children;
  return (
    <View onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      {children}
      {hovered ? (
        <View className="absolute right-1.5 top-1.5">
          <SaveButton onPress={onSave} />
        </View>
      ) : null}
    </View>
  );
}
