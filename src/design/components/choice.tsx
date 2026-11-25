import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon } from "../icon";
import { desktop } from "../lib/platform";
import { Duration, EASE_SNAP } from "../motion";
import { Radius, Size } from "../tokens";
import { Pressable } from "./pressable";

/** Track 28 × 16 with a 12 knob on the desktop, 44 × 26 with a 20 knob on touch. */
const TRACK = desktop ? { width: 28, height: 16, knob: 12 } : { width: 44, height: 26, knob: 20 };

interface ToggleProps {
  value: boolean;
  onValueChange?(value: boolean): void;
  label: string;
  disabled?: boolean;
  /** Drawn inside a row that is itself the switch. */
  decorative?: boolean;
}

/** `line-strong` and an `fg` knob when off; `accent` and an `on-accent` knob when on, sliding with `fast` and `snap`. */
export function Toggle({ value, onValueChange, label, disabled = false, decorative = false }: ToggleProps) {
  const colors = useThemeColors();
  const travel = TRACK.width - TRACK.knob - 4;
  const x = useSharedValue(value ? travel : 0);

  useEffect(() => {
    x.set(withTiming(value ? travel : 0, { duration: Duration.fast, easing: EASE_SNAP }));
  }, [value, travel, x]);

  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  const track = (
    <View
      style={{
        width: TRACK.width,
        height: TRACK.height,
        borderRadius: Radius.full,
        padding: 2,
        backgroundColor: value ? (disabled ? colors["line-strong"] : colors.accent) : colors["line-strong"],
      }}
    >
      <Animated.View
        style={[
          {
            width: TRACK.knob,
            height: TRACK.knob,
            borderRadius: Radius.full,
            backgroundColor: value && !disabled ? colors["on-accent"] : colors.fg,
          },
          knob,
        ]}
      />
    </View>
  );

  if (decorative) return track;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={desktop ? 8 : 10}
      onPress={() => onValueChange?.(!value)}
    >
      {track}
    </Pressable>
  );
}

const BOX = desktop ? 16 : 20;

/** 16 (touch 20), radius `sm`; checked is an `accent` fill with a `check` in `on-accent`. */
export function Checkbox({ checked, disabled = false }: { checked: boolean; disabled?: boolean }) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        width: BOX,
        height: BOX,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Radius.sm,
        borderWidth: 1,
        borderColor: checked
          ? disabled
            ? colors["line-strong"]
            : colors.accent
          : disabled
            ? colors.line
            : colors["line-strong"],
        backgroundColor: checked ? (disabled ? colors["line-strong"] : colors.accent) : colors.panel,
      }}
    >
      {checked ? <Icon name="check" size={16} tone="on-accent" /> : null}
    </View>
  );
}

/** A circle; selected is an `accent` border and a glowing `accent` dot. */
export function Radio({ checked, disabled = false }: { checked: boolean; disabled?: boolean }) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        width: BOX,
        height: BOX,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: checked ? colors.accent : disabled ? colors.line : colors["line-strong"],
        backgroundColor: colors.panel,
      }}
    >
      {checked ? (
        <View
          style={{
            width: Size.dot,
            height: Size.dot,
            borderRadius: Radius.full,
            backgroundColor: colors.accent,
            boxShadow: `0 0 6px ${colors.accent}`,
          }}
        />
      ) : null}
    </View>
  );
}
