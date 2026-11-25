import { Image, type ImageURISource, View } from "react-native";

import { type ThemeColors, useThemeColors } from "../hooks/use-theme-colors";
import { CHAT_PATTERN_SCALE, CHAT_PATTERNS, type ChatPatternName } from "./chat-pattern-tile";

const SOURCES = Object.fromEntries(
  Object.entries(CHAT_PATTERNS).map(([name, uri]) => [
    name,
    { uri, scale: CHAT_PATTERN_SCALE } satisfies ImageURISource,
  ]),
) as Record<ChatPatternName, ImageURISource>;

/** Near-white on the dark canvas needs about twice the opacity of near-black on white to look as strong. */
const PATTERN_OPACITY = {
  subtle: { light: 0.05, dark: 0.12 },
  vivid: { light: 0.16, dark: 0.18 },
};

// A gradient to `surface-sunken` reads as a flat black rectangle in dark: it is five values from the canvas.
const GRADIENTS = {
  subtle: {
    light: (c: ThemeColors) => `linear-gradient(141deg, ${c["accent-soft"]} 0%, ${c.bg} 55%, ${c.panel} 100%)`,
    dark: (c: ThemeColors) => `linear-gradient(141deg, ${c.panel} 0%, ${c.bg} 55%, ${c.panel} 100%)`,
  },
  vivid: {
    light: (c: ThemeColors) =>
      `linear-gradient(160deg, ${c["accent-soft"]} 0%, color-mix(in srgb, ${c.accent} 6%, ${c.bg}) 45%, color-mix(in srgb, ${c.success} 22%, ${c.bg}) 100%)`,
    dark: (c: ThemeColors) =>
      `linear-gradient(160deg, ${c["accent-soft"]} 0%, ${c.bg} 50%, color-mix(in srgb, ${c.success} 14%, ${c.bg}) 100%)`,
  },
};

const GRADIENT_PROP = (
  process.env.EXPO_OS === "web" ? "backgroundImage" : "experimental_backgroundImage"
) as "experimental_backgroundImage";

export interface ChatBackgroundProps {
  pattern?: ChatPatternName;
  /** `vivid` for a whole window, `subtle` behind one chat on a phone. */
  intensity?: "subtle" | "vivid";
}

export function ChatBackground({ pattern = "doodles", intensity = "subtle" }: ChatBackgroundProps) {
  const colors = useThemeColors();
  const scheme = colors.scheme;

  return (
    <View style={{ pointerEvents: "none" }} className="absolute inset-0 overflow-hidden">
      <View
        style={{
          position: "absolute",
          inset: 0,
          [GRADIENT_PROP]: GRADIENTS[intensity][scheme](colors),
        }}
      />

      <Image
        source={SOURCES[pattern]}
        resizeMode="repeat"
        tintColor={intensity === "vivid" && scheme === "light" ? colors.accent : colors.fg}
        style={{ position: "absolute", inset: 0, opacity: PATTERN_OPACITY[intensity][scheme] }}
        fadeDuration={0}
        accessible={false}
      />
    </View>
  );
}
