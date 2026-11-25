import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import {
  Modal,
  Pressable as RNPressable,
  Text as RNText,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { QUICK_REACTIONS } from "@/core/messaging/reactions";
import {
  Control,
  type IconName,
  Layout,
  MenuRow,
  MenuSeparator,
  PASS_THROUGH,
  Pressable,
  Radius,
  Shadow,
  scrimColor,
  useThemeColors,
} from "@/design";

export interface MessageAction {
  id: string;
  label: string;
  icon: IconName;
  tone?: "default" | "danger";
  onPress: () => void;
}

export interface MessageAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

const REACTION_BAR_HEIGHT = 48;
const MENU_ROW_HEIGHT = Control.touch;
const GAP = 8;

/** The menu's floating surface: `panel`, a `line-strong` edge, radius `lg`, `--shadow-popover`. */
const SURFACE = (colors: ReturnType<typeof useThemeColors>) => ({
  backgroundColor: colors.panel,
  borderWidth: 1,
  borderColor: colors["line-strong"],
  borderRadius: Radius.lg,
  boxShadow: Shadow.popover,
});

export function MessageActions({
  visible,
  anchor,
  fromMe,
  actions,
  onReact,
  onClose,
  render,
}: {
  visible: boolean;
  anchor: MessageAnchor | null;
  fromMe: boolean;
  actions: MessageAction[];
  onReact?: (emoji: string) => void;
  onClose: () => void;
  render: () => React.ReactNode;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  useEffect(() => {
    if (visible) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  }, [visible]);

  if (!anchor) return null;

  // Destructive actions come last, after a separator.
  const ordered = [...actions.filter((a) => a.tone !== "danger"), ...actions.filter((a) => a.tone === "danger")];
  const firstDanger = ordered.findIndex((a) => a.tone === "danger");

  const above = onReact ? REACTION_BAR_HEIGHT + GAP : 0;
  const menuHeight = actions.length * MENU_ROW_HEIGHT + 18;
  const wanted = above + anchor.height + GAP + menuHeight;
  const top = insets.top + 8;
  const bottom = screenHeight - insets.bottom - 8;

  const groupTop = Math.max(top, Math.min(anchor.y - above, bottom - wanted));
  const scrolls = wanted > bottom - top;

  const backdrop = (
    <RNPressable
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onPress={onClose}
      style={StyleSheet.absoluteFill}
    />
  );

  const group = (
    <View
      style={[
        PASS_THROUGH,
        {
          gap: GAP,
          alignItems: fromMe ? "flex-end" : "flex-start",
          paddingLeft: fromMe ? GAP : anchor.x,
          paddingRight: fromMe ? Math.max(GAP, screenWidth - anchor.x - anchor.width) : GAP,
        },
        !scrolls && { position: "absolute", left: 0, right: 0, top: groupTop },
      ]}
    >
      {onReact ? (
        <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(100)}>
          <View className="flex-row items-center gap-1 px-1" style={[SURFACE(colors), { height: REACTION_BAR_HEIGHT }]}>
            {QUICK_REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={`React with ${emoji}`}
                onPress={() => {
                  onReact(emoji);
                  onClose();
                }}
                className="h-10 w-10 items-center justify-center"
                style={({ hovered, pressed }) => ({
                  borderRadius: Radius.md,
                  backgroundColor: hovered || pressed ? colors.hover : "transparent",
                })}
              >
                <RNText style={{ fontSize: 24 }}>{emoji}</RNText>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      ) : null}

      <View style={[PASS_THROUGH, { width: anchor.width }]}>{render()}</View>

      <Animated.View entering={FadeIn.duration(140).delay(30)} exiting={FadeOut.duration(100)}>
        <View className="p-1" style={[SURFACE(colors), { minWidth: Layout.menu }]}>
          {ordered.map((action, index) => (
            <View key={action.id}>
              {index === firstDanger && index > 0 ? <MenuSeparator /> : null}
              <MenuRow
                item={{
                  label: action.label,
                  icon: action.icon,
                  danger: action.tone === "danger",
                  onPress: action.onPress,
                }}
                onRun={() => {
                  onClose();
                  action.onPress();
                }}
              />
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: scrimColor(colors) }}>
          {scrolls ? (
            <ScrollView
              contentContainerStyle={{ paddingTop: top, paddingBottom: screenHeight - bottom }}
              showsVerticalScrollIndicator={false}
            >
              {backdrop}
              {group}
            </ScrollView>
          ) : (
            <>
              {backdrop}
              {group}
            </>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}
