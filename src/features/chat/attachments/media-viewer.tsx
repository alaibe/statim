import type { ReactNode } from "react";
import { Modal, Pressable as RNPressable, View } from "react-native";

import { IconButton, useThemeColors } from "@/design";
import { SaveButton } from "./save-button";

interface MediaViewerProps {
  visible: boolean;
  onClose: () => void;
  onSave?: () => void;
  interactive?: boolean;
  children: ReactNode;
}

export function MediaViewer({ visible, onClose, onSave, interactive, children }: MediaViewerProps) {
  const colors = useThemeColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.void }}>
        <RNPressable
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          className="absolute inset-0"
          onPress={onClose}
        />
        <View style={{ width: "100%", height: "80%", pointerEvents: interactive ? "auto" : "none" }}>{children}</View>
        <View className="absolute right-5 top-16 flex-row items-center gap-3">
          {onSave ? <SaveButton onPress={onSave} size={24} /> : null}
          <IconButton icon="x" label="Close" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
