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
    light: (c: ThemeColors) => `linear-gradient(141deg, ${c["brand-soft"]} 0%, ${c.canvas} 55%, ${c.surface} 100%)`,
    dark: (c: ThemeColors) => `linear-gradient(141deg, ${c.surface} 0%, ${c.canvas} 55%, ${c.surface} 100%)`,
  },
  vivid: {
    light: (c: ThemeColors) =>
      `linear-gradient(160deg, ${c["brand-soft"]} 0%, color-mix(in srgb, ${c.brand} 6%, ${c.canvas}) 45%, color-mix(in srgb, ${c.success} 22%, ${c.canvas}) 100%)`,
    dark: (c: ThemeColors) =>
      `linear-gradient(160deg, ${c["brand-soft"]} 0%, ${c.canvas} 50%, color-mix(in srgb, ${c.success} 14%, ${c.canvas}) 100%)`,
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
        tintColor={intensity === "vivid" && scheme === "light" ? colors.brand : colors.content}
        style={{ position: "absolute", inset: 0, opacity: PATTERN_OPACITY[intensity][scheme] }}
        fadeDuration={0}
        accessible={false}
      />
    </View>
  );
}
