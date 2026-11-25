import { useState } from "react";
import { Modal, Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Radius, scrimColor, useThemeColors } from "@/design";

import { MediaPanelContent, type MediaPanelProps, type MediaTab } from "./media-panel-content";

export type { MediaAnchor, MediaPanelProps } from "./media-panel-content";

export function MediaPanel({ tab: initialTab, onClose, ...content }: MediaPanelProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [tab, setTab] = useState<MediaTab>(initialTab);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: scrimColor(colors) }}
      />
      <View
        style={{
          height: Math.round(height * 0.55),
          paddingBottom: insets.bottom,
          borderTopLeftRadius: Radius.xl,
          borderTopRightRadius: Radius.xl,
          backgroundColor: colors.panel,
        }}
      >
        <MediaPanelContent {...content} tab={tab} onTab={setTab} />
      </View>
    </Modal>
  );
}
