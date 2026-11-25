import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon, type IconName } from "../icon";
import { useDigitKeys } from "../lib/digit-keys";
import { Radius } from "../tokens";
import { Pressable } from "./pressable";
import { Text } from "./text";

const SHAKE = { duration: 55, reduceMotion: ReduceMotion.System } as const;

/** `shakes` counts rejections; each new one shakes the dots and buzzes. */
export function PinDots({ length, filled, shakes }: { length: number; filled: number; shakes: number }) {
  const colors = useThemeColors();
  const offset = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));

  useEffect(() => {
    if (shakes === 0) return;
    offset.set(withSequence(withTiming(-10, SHAKE), withRepeat(withTiming(10, SHAKE), 4, true), withTiming(0, SHAKE)));
    if (process.env.EXPO_OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  }, [shakes, offset]);

  return (
    <Animated.View
      style={style}
      accessible
      accessibilityLabel={`${filled} of ${length} digits entered`}
      className="flex-row justify-center gap-4 py-2"
    >
      {Array.from({ length }, (_, i) => (
        <View
          key={i}
          style={{
            width: 12,
            height: 12,
            borderRadius: Radius.full,
            borderWidth: 1,
            borderColor: i < filled ? colors.accent : colors["line-strong"],
            backgroundColor: i < filled ? colors.accent : "transparent",
          }}
        />
      ))}
    </Animated.View>
  );
}

const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
] as const;

export interface PinPadProps {
  onDigit(digit: string): void;
  onDelete(): void;
  disabled?: boolean;
  /** Whether typed digits reach this pad, on the desktop. */
  listening?: boolean;
  /** The key left of 0, such as a way back to Face ID. */
  extra?: { label: string; icon: IconName; onPress(): void };
}

export function PinPad({ onDigit, onDelete, disabled = false, listening = true, extra }: PinPadProps) {
  useDigitKeys(listening && !disabled, onDigit, onDelete);

  return (
    <View className="items-center gap-2">
      {ROWS.map((row) => (
        <View key={row[0]} className="flex-row gap-2">
          {row.map((digit) => (
            <DigitKey key={digit} digit={digit} disabled={disabled} onPress={onDigit} />
          ))}
        </View>
      ))}
      <View className="flex-row gap-2">
        {extra ? <IconKey label={extra.label} icon={extra.icon} onPress={extra.onPress} /> : <View style={KEY} />}
        <DigitKey digit="0" disabled={disabled} onPress={onDigit} />
        <IconKey label="Delete" icon="delete" disabled={disabled} onPress={onDelete} />
      </View>
    </View>
  );
}

/** A PIN key is a secondary button made big for a thumb: `panel`, `line-strong`, radius `md`, the digit in mono. */
function KeyButton({
  label,
  disabled,
  bare = false,
  onPress,
  children,
}: {
  label: string;
  disabled: boolean;
  bare?: boolean;
  onPress(): void;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ hovered, pressed }) => ({
        width: KEY.width,
        height: KEY.height,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Radius.md,
        borderWidth: bare ? 0 : 1,
        borderColor: colors["line-strong"],
        backgroundColor: bare ? "transparent" : hovered || pressed ? colors.hover : colors.panel,
      })}
    >
      {children}
    </Pressable>
  );
}

const KEY = { width: 80, height: 56 };

function DigitKey({
  digit,
  disabled,
  onPress,
}: {
  digit: string;
  disabled: boolean;
  onPress: (digit: string) => void;
}) {
  return (
    <KeyButton
      label={digit}
      disabled={disabled}
      onPress={() => {
        if (process.env.EXPO_OS === "ios") Haptics.selectionAsync().catch(() => {});
        onPress(digit);
      }}
    >
      <Text variant="title" tone={disabled ? "subtle" : "fg"}>
        {digit}
      </Text>
    </KeyButton>
  );
}

function IconKey({
  label,
  icon,
  disabled = false,
  onPress,
}: {
  label: string;
  icon: IconName;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <KeyButton label={label} disabled={disabled} bare onPress={onPress}>
      <Icon name={icon} size={24} tone={disabled ? "subtle" : "fg"} />
    </KeyButton>
  );
}
