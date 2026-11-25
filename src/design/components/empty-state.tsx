import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { useThemeColors } from "../hooks/use-theme-colors";
import { desktop } from "../lib/platform";
import { type PressHandler } from "../lib/press";
import { Duration, EASE_IN_OUT } from "../motion";
import { Layout, Space, withAlpha } from "../tokens";
import { Button } from "./button";
import { Text } from "./text";

/** Statim's lit point: the filled link of its mark (assets/brand/mark.svg), cropped to its bounds. */
const MARK = "M208.34 234 H303.66 A68 68 0 1 1 303.66 278 H208.34 A68 68 0 1 1 208.34 234 Z";
const MARK_BOX = { x: 76, y: 188, width: 360, height: 136 };

/** White-hot in the accent's hue, glowing; in loading states it pulses 0.5 → 1 every 1.6s. */
export function LitPoint({ size = 48, pulse = false }: { size?: 48 | 64; pulse?: boolean }) {
  const colors = useThemeColors();
  const reduce = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!pulse || reduce) return;
    opacity.set(
      withRepeat(
        withSequence(withTiming(0.5, { duration: 800, easing: EASE_IN_OUT }), withTiming(1, { duration: 800 })),
        -1,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [pulse, reduce, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const height = (size * MARK_BOX.height) / MARK_BOX.width;

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}
    >
      <View style={{ filter: `drop-shadow(0 0 10px ${colors.accent})` }}>
        <Svg width={size} height={height} viewBox={`${MARK_BOX.x} ${MARK_BOX.y} ${MARK_BOX.width} ${MARK_BOX.height}`}>
          <Path d={MARK} fillRule="evenodd" fill={mixWithWhite(colors.accent, 0.12)} />
        </Svg>
      </View>
    </Animated.View>
  );
}

/** `color-mix(in oklab, <accent> 12%, white)`, near enough in sRGB. */
function mixWithWhite(hex: string, amount: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const mix = (c: number) => Math.round(c * amount + 255 * (1 - amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** The block cursor `▍`, blinking with steps at `blink`; still when motion is reduced. */
function Cursor() {
  const colors = useThemeColors();
  const reduce = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduce) return;
    const half = Duration.blink / 2;
    opacity.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: half }),
          withTiming(0, { duration: 0 }),
          withTiming(0, { duration: half }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [reduce, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      style={[
        {
          width: 11,
          height: 20,
          marginLeft: Space[1],
          backgroundColor: colors.accent,
          boxShadow: `0 0 12px ${withAlpha(colors.accent, 0.55)}`,
        },
        style,
      ]}
    />
  );
}

/** `> boot line▍`: mono `xl` 600 with the text glow, `>` in `accent`, three words or fewer, lowercase. */
export function BootLine({ children }: { children: string }) {
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center" }}
      accessibilityRole="header"
      accessibilityLabel={children}
    >
      <Text variant="title" tone="accent">
        {">"}{" "}
      </Text>
      <Text variant="title" glow>
        {children}
      </Text>
      <Cursor />
    </View>
  );
}

interface EmptyStateProps {
  /** Three words or fewer, lowercase, written for the moment: first run, all done, filtered to nothing. */
  boot: string;
  /** One sentence: what this place is for and how things arrive. */
  text?: string;
  /** At most one button: the action that fills the place. */
  action?: { label: string; onPress: PressHandler; keys?: readonly string[]; testID?: string };
  /** No match for a search, or a second empty region beside one that already shows it: no lit point. */
  noMatch?: boolean;
  testID?: string;
}

/** A place with nothing in it yet, where the lit point shows: centred, 48 around, 360 wide at most. */
export function EmptyState({ boot, text, action, noMatch = false, testID }: EmptyStateProps) {
  return (
    <View testID={testID} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <View style={{ maxWidth: Layout.empty, padding: Space[12], alignItems: "center", gap: Space[4] }}>
        {noMatch ? null : <LitPoint />}
        <BootLine>{boot}</BootLine>
        {text ? (
          <Text tone="muted" align="center">
            {text}
          </Text>
        ) : null}
        {action ? (
          <Button
            variant="primary"
            label={action.label}
            keys={action.keys}
            onPress={action.onPress}
            testID={action.testID}
          />
        ) : null}
      </View>
    </View>
  );
}

/** While the app starts: `void`, the lit point at 64 pulsing, and a boot line in mono `xs` `muted`. */
export function Splash({ line = "> opening statim…" }: { line?: string }) {
  const colors = useThemeColors();
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: Space[4], backgroundColor: colors.void }}
    >
      <LitPoint size={64} pulse />
      <Text variant="meta">{line}</Text>
    </View>
  );
}

/** Skeleton rows in `hover`, the shape of the rows they stand for, with no shimmer. */
export function Skeleton({ rows = 6, avatar = false, lines = 2 }: { rows?: number; avatar?: boolean; lines?: 1 | 2 }) {
  const colors = useThemeColors();
  const bar = (width: `${number}%`, height: number) => (
    <View style={{ width, height, borderRadius: 1, backgroundColor: colors.hover }} />
  );
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={{
            height: lines === 2 ? (desktop ? Layout.row : 68) : desktop ? 32 : 44,
            paddingHorizontal: desktop ? Space[3] : Space[4],
            flexDirection: "row",
            alignItems: "center",
            gap: Space[3],
          }}
        >
          {avatar ? <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.hover }} /> : null}
          <View style={{ flex: 1, gap: Space[2] }}>
            {bar(`${55 - ((i * 13) % 25)}%`, 12)}
            {lines === 2 ? bar(`${80 - ((i * 17) % 30)}%`, 10) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
