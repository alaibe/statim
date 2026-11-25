import { useState } from "react";
import { Modal, Pressable as RNPressable, useWindowDimensions, View } from "react-native";
import { create } from "zustand";

import { useThemeColors } from "../hooks/use-theme-colors";
import { useEscapeKey } from "../lib/escape-key";
import { PrimaryScope } from "../lib/primary";
import { Layout, Radius, Shadow, Space } from "../tokens";
import { IconButton } from "./button";
import { DialogHeader, DialogSurface, scrimColor } from "./dialog";
import type { SheetProps } from "./sheet";
import { Text } from "./text";

export type { SheetProps } from "./sheet";

interface SheetState {
  current: null;
  afterClose: (() => void) | null;
}

/** Nothing animates natively here; kept so the phone's sheet route type-checks. */
export const SHEET_DISMISS_MS = 0;

export const useSheetStore = create<SheetState>(() => ({ current: null, afterClose: null }));

export function closeSheetThen(sheet: Pick<SheetProps, "onClose">, action: () => void) {
  sheet.onClose();
  action();
}

const MARGIN = Space[3];

/** Opened by a pointer, a menu at the pointer; otherwise a dialog over a `void` scrim. */
export function Sheet({ visible, label, title, subtitle, leading, anchor, children, onClose }: SheetProps) {
  const colors = useThemeColors();
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: Layout.menu, height: 0 });

  useEscapeKey(visible, onClose);

  if (!visible) return null;

  if (anchor) {
    return (
      <Modal visible transparent animationType="none" onRequestClose={onClose}>
        <RNPressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }}>
          <View
            onLayout={(event) => setSize(event.nativeEvent.layout)}
            onStartShouldSetResponder={() => true}
            style={{
              position: "absolute",
              left: Math.min(anchor.x, window.width - size.width - MARGIN),
              top: Math.min(anchor.y, window.height - size.height - MARGIN),
              minWidth: Layout.menu,
              maxWidth: 320,
              padding: Space[1],
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors["line-strong"],
              borderRadius: Radius.lg,
              boxShadow: Shadow.popover,
            }}
          >
            {title ? (
              <View style={{ paddingHorizontal: Space[2], paddingTop: Space[1], paddingBottom: Space[1] }}>
                <Text variant="label" numberOfLines={1}>
                  {title}
                </Text>
              </View>
            ) : null}
            <PrimaryScope>{children}</PrimaryScope>
          </View>
        </RNPressable>
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
          justifyContent: "center",
          padding: Space[4],
          backgroundColor: scrimColor(colors),
        }}
      >
        <DialogSurface>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            {leading ? <View style={{ paddingTop: Space[5], paddingLeft: Space[5] }}>{leading}</View> : null}
            <View style={{ flex: 1 }}>
              {title ? <DialogHeader label={label} title={title} /> : null}
              {subtitle ? (
                <View style={{ paddingHorizontal: Space[5] }}>
                  <Text variant="meta">{subtitle}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ padding: Space[3] }}>
              <IconButton icon="x" label="Close" size="sm" onPress={onClose} />
            </View>
          </View>
          <View style={{ gap: Space[3], paddingHorizontal: Space[5], paddingTop: Space[2], paddingBottom: Space[5] }}>
            {children}
          </View>
        </DialogSurface>
      </RNPressable>
    </Modal>
  );
}
