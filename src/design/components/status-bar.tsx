import { Fragment, useEffect } from "react";
import { Text as RNText, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useThemeColors } from "../hooks/use-theme-colors";
import { EASE_IN_OUT } from "../motion";
import { glow, Layout, Radius, Size, Space } from "../tokens";
import { Keys } from "./keycap";
import { Pressable } from "./pressable";
import { Tag } from "./tag";
import { Text, textStyle } from "./text";

export interface StatusSegment {
  id: string;
  /** Sentence case, compact: "Syncing 2/5", "3 queued". */
  label: string;
  /** A problem starts with its tag. */
  tag?: "ERR" | "WARN";
  /** What is happening right now, in `fg`. */
  busy?: boolean;
  onPress?: () => void;
}

export interface StatusHint {
  keys: readonly string[];
  action: string;
  sequence?: boolean;
}

interface StatusBarProps {
  app: string;
  working: boolean;
  segments: readonly StatusSegment[];
  hints: readonly StatusHint[];
}

const BAR_TEXT = { ...textStyle("control"), fontSize: 11, lineHeight: 13 };

/** The 24px bar at the bottom of the desktop window: is it working, what is waiting, what can I press. */
export function StatusBar({ app, working, segments, hints }: StatusBarProps) {
  const colors = useThemeColors();
  return (
    <View
      accessibilityRole="summary"
      style={{
        height: Layout.statusbar,
        flexDirection: "row",
        alignItems: "center",
        gap: Space[2],
        paddingHorizontal: Space[3],
        overflow: "hidden",
        backgroundColor: colors.void,
        borderTopWidth: 1,
        borderColor: colors.line,
      }}
    >
      <Dot working={working} />
      <Text variant="label" tone="fg">
        {app}
      </Text>
      <View aria-live="polite" style={{ flexDirection: "row", alignItems: "center", gap: Space[2], flexShrink: 1 }}>
        {segments.map((segment, index) => (
          <Fragment key={segment.id}>
            {index > 0 ? <RNText style={[BAR_TEXT, { color: colors.muted }]}>·</RNText> : null}
            <Pressable
              accessibilityRole={segment.onPress ? "button" : "text"}
              disabled={!segment.onPress}
              onPress={segment.onPress}
              style={{ flexDirection: "row", alignItems: "center", gap: Space[2] }}
            >
              {segment.tag ? <Tag tone={segment.tag === "ERR" ? "err" : "warn"} /> : null}
              <RNText numberOfLines={1} style={[BAR_TEXT, { color: segment.busy ? colors.fg : colors.muted }]}>
                {segment.label}
              </RNText>
            </Pressable>
          </Fragment>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: Space[3], overflow: "hidden" }}>
        {hints.slice(0, 5).map((hint) => (
          <View key={hint.action} style={{ flexDirection: "row", alignItems: "center", gap: Space[1] }}>
            <Keys keys={hint.keys} sequence={hint.sequence} />
            <RNText style={[BAR_TEXT, { color: colors.muted }]}>{hint.action}</RNText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The lit point as a dot: steady when idle, pulsing with the glow while something runs. */
function Dot({ working }: { working: boolean }) {
  const colors = useThemeColors();
  const reduce = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!working || reduce) {
      opacity.set(1);
      return;
    }
    opacity.set(
      withRepeat(
        withSequence(withTiming(0.5, { duration: 800, easing: EASE_IN_OUT }), withTiming(1, { duration: 800 })),
        -1,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [working, reduce, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      style={[
        {
          width: Size.dot,
          height: Size.dot,
          borderRadius: Radius.full,
          backgroundColor: colors.accent,
          boxShadow: working ? glow(colors) : undefined,
        },
        style,
      ]}
    />
  );
}
