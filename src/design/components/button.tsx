import * as Haptics from "expo-haptics";
import { ActivityIndicator } from "react-native";

import { cn } from "../lib/cn";
import { type PressHandler, usePress } from "../lib/press";
import { Pressable, type PressScaleProps } from "./pressable";
import { Text } from "./text";

const TONE = {
  accent: { view: "bg-accent active:bg-accent-strong", label: "text-on-accent font-mono font-medium" },
  neutral: { view: "bg-panel border border-line", label: "text-fg font-mono font-medium" },
  ghost: { view: "bg-transparent", label: "text-accent font-mono font-medium" },
  success: { view: "bg-success", label: "text-bg font-mono font-medium" },
  warning: { view: "bg-warning", label: "text-bg font-mono font-medium" },
  danger: { view: "bg-danger", label: "text-bg font-mono font-medium" },
} as const;

const SIZE = {
  sm: { view: "h-9 px-3 rounded-md", label: "text-md" },
  md: { view: "h-touch px-4 rounded-md", label: "text-md" },
} as const;

const SM_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 } as const;

export interface ButtonProps extends Omit<PressScaleProps, "children" | "onPress"> {
  label: string;
  tone?: keyof typeof TONE;
  size?: keyof typeof SIZE;
  loading?: boolean;
  fullWidth?: boolean;
  onPress?: PressHandler;
}

export function Button({
  label,
  tone = "accent",
  size = "md",
  loading = false,
  fullWidth = false,
  disabled,
  onPress,
  className,
  ...props
}: ButtonProps) {
  const { pending, press } = usePress(onPress);
  const busy = loading || pending;
  const isDisabled = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy }}
      onPress={
        isDisabled
          ? undefined
          : () => {
              if (process.env.EXPO_OS === "ios") {
                Haptics.selectionAsync().catch(() => {});
              }
              press?.();
            }
      }
      disabled={isDisabled}
      hitSlop={size === "sm" ? SM_HIT_SLOP : undefined}
      style={{ borderCurve: "continuous" }}
      className={cn(
        "flex-row items-center justify-center gap-2",
        TONE[tone].view,
        SIZE[size].view,
        fullWidth && "w-full",
        isDisabled && "opacity-40",
        className,
      )}
      {...props}
    >
      {busy ? (
        <ActivityIndicator size="small" />
      ) : (
        <Text className={cn(TONE[tone].label, SIZE[size].label)}>{label}</Text>
      )}
    </Pressable>
  );
}
