import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Icon, Pressable } from '@/design';

export function SaveButton({ onPress, size = 18 }: { onPress: () => void; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Save as…"
      onPress={onPress}
      hitSlop={8}
      className="items-center justify-center rounded-pill bg-black/45 p-1.5">
      <Icon name="download-outline" size={size} color="#fff" />
    </Pressable>
  );
}

/** Shows a save button in the top-right corner of a photo or video while the pointer is over it. */
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
