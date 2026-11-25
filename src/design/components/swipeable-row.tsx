import * as Haptics from "expo-haptics";
import { useRef } from "react";
import { View } from "react-native";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon, type IconName } from "../icon";
import { type PressHandler, runPress } from "../lib/press";
import { Pressable } from "./pressable";
import { Text } from "./text";

export type SwipeTone = "neutral" | "warning" | "accent" | "danger";

export interface SwipeAction {
  id: string;
  label: string;
  icon: IconName;
  tone?: SwipeTone;
  destructive?: boolean;
  onPress: PressHandler;
}

export interface SwipeableRowProps {
  right?: SwipeAction[];
  left?: SwipeAction[];
  children: React.ReactNode;
}

const ACTION_WIDTH = 76;

export function SwipeableRow({ right, left, children }: SwipeableRowProps) {
  const ref = useRef<SwipeableMethods>(null);

  const run = (action: SwipeAction) => {
    ref.current?.close();
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(
        action.destructive ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
      ).catch(() => {});
    }
    void runPress(action.onPress);
  };

  const render = (actions: SwipeAction[]) =>
    function SwipeActions() {
      return (
        <View style={{ flexDirection: "row", alignItems: "stretch" }}>
          {actions.map((action, index) => (
            <ActionButton key={action.id} action={action} onRun={run} first={index === 0} />
          ))}
        </View>
      );
    };

  if (!right?.length && !left?.length) return <>{children}</>;

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={ACTION_WIDTH / 2}
      leftThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      overshootLeft={false}
      renderRightActions={right?.length ? render(right) : undefined}
      renderLeftActions={left?.length ? render(left) : undefined}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

function ActionButton({
  action,
  onRun,
  first,
}: {
  action: SwipeAction;
  onRun(action: SwipeAction): void;
  first: boolean;
}) {
  const colors = useThemeColors();
  const tone = action.destructive || action.tone === "danger" ? "danger" : "fg";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={() => onRun(action)}
      style={{
        width: ACTION_WIDTH,
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        backgroundColor: colors.panel,
        borderLeftWidth: first ? 0 : 1,
        borderColor: colors.line,
      }}
    >
      <Icon name={action.icon} size={20} tone={tone === "danger" ? "danger" : "muted"} />
      <Text variant="label" tone={tone} numberOfLines={1}>
        {action.label}
      </Text>
    </Pressable>
  );
}
