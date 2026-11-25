import { useState } from "react";
import { Modal, Pressable, useWindowDimensions, View } from "react-native";

import { Radius, Shadow, useEscapeKey, useThemeColors } from "@/design";

import { MediaPanelContent, type MediaPanelProps, type MediaTab } from "./media-panel-content";

export type { MediaAnchor, MediaPanelProps } from "./media-panel-content";

const WIDTH = 380;
const HEIGHT = 460;
const MARGIN = 12;

export function MediaPanel({ tab: initialTab, anchor, onClose, ...content }: MediaPanelProps) {
  const colors = useThemeColors();
  const window = useWindowDimensions();
  const [tab, setTab] = useState<MediaTab>(initialTab);
  useEscapeKey(true, onClose);

  const right = anchor ? Math.max(MARGIN, window.width - (anchor.x + anchor.width)) : MARGIN;
  const bottom = anchor ? Math.max(MARGIN, window.height - anchor.y + 8) : MARGIN;
  const height = Math.min(HEIGHT, window.height - bottom - MARGIN);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} className="flex-1" />
      <View
        style={{
          position: "absolute",
          right,
          bottom,
          width: WIDTH,
          height,
          overflow: "hidden",
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors["line-strong"],
          backgroundColor: colors.panel,
          boxShadow: Shadow.popover,
        }}
      >
        <MediaPanelContent {...content} tab={tab} onTab={setTab} autoFocusSearch />
      </View>
    </Modal>
  );
}
