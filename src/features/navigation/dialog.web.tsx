import { useRouter } from "expo-router";
import type { PropsWithChildren } from "react";
import { Pressable, View } from "react-native";

import { DialogSurface, Space, scrimColor, useEscapeKey, useThemeColors } from "@/design";

/** A dialog route on the desktop: the form dialog's surface over a `void` scrim at 70%. */
export function Dialog({ children }: PropsWithChildren) {
  const router = useRouter();
  const colors = useThemeColors();
  useEscapeKey(true, () => router.back());

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: Space[6] }}>
      <Pressable
        accessibilityLabel="Close"
        onPress={() => router.back()}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: scrimColor(colors) }}
      />
      <DialogSurface width="dialog-form">
        <View style={{ height: 640, maxHeight: "100%" }}>{children}</View>
      </DialogSurface>
    </View>
  );
}
