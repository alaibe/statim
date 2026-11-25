import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { View, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon, type IconName } from "../icon";
import { controlHeight, desktop } from "../lib/platform";
import { type PressHandler, usePress } from "../lib/press";
import { usePrimaryClaim } from "../lib/primary";
import { useSubmitKey } from "../lib/submit-key";
import { EASE_IN_OUT } from "../motion";
import { Chamfer as ChamferSize, Radius, withAlpha } from "../tokens";
import { Chamfer } from "./chamfer";
import { Keys } from "./keycap";
import { Pressable } from "./pressable";
import { Text, type TextTone } from "./text";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps {
  label: string;
  /** Secondary unless the button is the one thing the screen is for. */
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  /** A familiar symbol (add, search, copy, delete…), before the label. */
  icon?: IconName;
  /** Opens options or goes somewhere: `chevron-down`, `arrow-right`, `arrow-up-right`. */
  trailingIcon?: IconName;
  /** Its shortcut as keycaps after the label, on the desktop. */
  keys?: readonly string[];
  /** The confirmation dialog's danger button, the one place it is filled. */
  confirm?: boolean;
  busy?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  onPress?: PressHandler;
  testID?: string;
  accessibilityLabel?: string;
}

export function Button({
  label,
  variant = "secondary",
  size = "md",
  icon,
  trailingIcon,
  keys,
  confirm = false,
  busy: loading = false,
  disabled,
  fullWidth = false,
  onPress,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  const colors = useThemeColors();
  const { pending, press } = usePress(onPress);
  const busy = loading || pending;
  const off = Boolean(disabled) || busy;
  const primary = variant === "primary";
  const filledDanger = variant === "danger" && confirm;
  usePrimaryClaim(primary);
  useSubmitKey(keys?.join("+") === "mod+enter", () => {
    if (!off) press?.();
  });

  const tone = (hovered: boolean): TextTone => {
    if (disabled) return "subtle";
    if (primary || filledDanger) return "on-accent";
    if (variant === "danger") return "danger";
    return variant === "ghost" && !hovered ? "muted" : "fg";
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={() => {
        if (process.env.EXPO_OS === "ios") Haptics.selectionAsync().catch(() => {});
        press?.();
      }}
      style={({ hovered, pressed }) => {
        const fill: ViewStyle = {
          height: controlHeight(size),
          paddingHorizontal: size === "sm" ? 8 : 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderRadius: Radius.md,
          borderWidth: 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        };
        if (primary) {
          const lit = !disabled && (hovered || (desktop && pressed));
          return [
            fill,
            { borderColor: "transparent" },
            lit && desktop
              ? { filter: `drop-shadow(0 0 10px ${withAlpha(colors.accent, 0.55)})` as ViewStyle["filter"] }
              : null,
            desktop && pressed ? { transform: [{ translateY: 1 }] } : null,
          ];
        }
        if (filledDanger) return [fill, { backgroundColor: colors.danger, borderColor: colors.danger }];
        if (variant === "danger") return [fill, { borderColor: colors.danger }];
        const ghost = variant === "ghost";
        return [
          fill,
          {
            backgroundColor:
              desktop && pressed && !disabled
                ? colors.selection
                : hovered && !disabled
                  ? colors.hover
                  : ghost
                    ? "transparent"
                    : colors.panel,
            borderColor: ghost ? "transparent" : colors["line-strong"],
          },
        ];
      }}
    >
      {({ hovered, pressed }) => (
        <>
          {primary ? (
            <Chamfer
              corner="bottom-right"
              cut={ChamferSize.sm}
              radius={Radius.md}
              fill={disabled ? colors.line : hovered || pressed ? colors["accent-strong"] : colors.accent}
            />
          ) : null}
          {icon ? <Icon name={icon} size={desktop ? 16 : 20} tone={tone(hovered)} /> : null}
          <Text variant="control" tone={tone(hovered)} numberOfLines={1}>
            {label}
          </Text>
          {trailingIcon ? <Icon name={trailingIcon} size={desktop ? 16 : 20} tone={tone(hovered)} /> : null}
          {keys && desktop ? <Keys keys={keys} onAccent={primary} /> : null}
          {busy ? <BusyBar color={colors[tone(true)]} /> : null}
        </>
      )}
    </Pressable>
  );
}

/** Busy keeps the label and runs a 2px bar along the bottom edge. */
function BusyBar({ color }: { color: string }) {
  const reduce = useReducedMotion();
  const left = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    left.set(withRepeat(withTiming(60, { duration: 1000, easing: EASE_IN_OUT }), -1, true));
    return () => cancelAnimation(left);
  }, [left, reduce]);

  const style = useAnimatedStyle(() => ({ left: `${left.get()}%` }));

  if (reduce) {
    return <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, backgroundColor: color }} />;
  }
  return (
    <Animated.View
      style={[{ position: "absolute", bottom: 0, width: "40%", height: 2, backgroundColor: color }, style]}
    />
  );
}

interface IconButtonProps {
  icon: IconName;
  /** What it does, read aloud and shown as its tooltip. */
  label: string;
  onPress?: PressHandler;
  size?: "sm" | "md";
  /** `accent` for a control that is on (recording, a pinned filter). */
  tone?: "muted" | "accent" | "danger";
  disabled?: boolean;
  testID?: string;
  keys?: readonly string[];
}

/** A ghost button with a familiar symbol and no label: square on the desktop, a 44 target on touch. */
export function IconButton({ icon, label, onPress, size = "md", tone = "muted", disabled, testID }: IconButtonProps) {
  const colors = useThemeColors();
  const { press } = usePress(onPress);
  const side = desktop ? controlHeight(size) : controlHeight();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={press}
      {...(desktop ? { title: label } : null)}
      style={({ hovered, pressed }) => ({
        width: side,
        height: side,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Radius.md,
        backgroundColor: desktop && (hovered || pressed) && !disabled ? colors.hover : "transparent",
      })}
    >
      {({ hovered }) => (
        <Icon
          name={icon}
          size={desktop ? 16 : 24}
          color={disabled ? colors.subtle : tone === "muted" ? (hovered ? colors.fg : colors.muted) : colors[tone]}
        />
      )}
    </Pressable>
  );
}
