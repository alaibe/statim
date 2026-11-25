import { type ReactNode, useState } from "react";
import { View } from "react-native";

import { Icon, type IconSize, Pressable } from "@/design";

export function SaveButton({ onPress, size = 20 }: { onPress: () => void; size?: IconSize }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Save as…"
      onPress={onPress}
      hitSlop={8}
      className="items-center justify-center rounded-full bg-void/45 p-1.5"
    >
      <Icon name="download" size={size} color="#fff" />
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
