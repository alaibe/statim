import { Image, View, type ImageURISource } from 'react-native';

import { useThemeColors, type ThemeColors } from '../hooks/use-theme-colors';
import { CHAT_PATTERNS, CHAT_PATTERN_SCALE, type ChatPatternName } from './chat-pattern-tile';

const SOURCES = Object.fromEntries(
  Object.entries(CHAT_PATTERNS).map(([name, uri]) => [
    name,
    { uri, scale: CHAT_PATTERN_SCALE } satisfies ImageURISource,
  ])
) as Record<ChatPatternName, ImageURISource>;

/**
 * Equal opacities do not look equal: near-black on white shows at 5%, while near-white on the dark
 * canvas needs about twice that. A desktop window shows far more wallpaper and reads as flat grey
 * at `subtle`, hence `vivid`.
 */
const PATTERN_OPACITY = {
  subtle: { light: 0.05, dark: 0.12 },
  vivid: { light: 0.16, dark: 0.18 },
};

// `surface-sunken` sits only five values from the canvas in dark, so a
// gradient to it reads as a flat black rectangle.
const GRADIENTS = {
  subtle: {
    light: (c: ThemeColors) =>
      `linear-gradient(141deg, ${c['brand-soft']} 0%, ${c.canvas} 55%, ${c.surface} 100%)`,
    dark: (c: ThemeColors) =>
      `linear-gradient(141deg, ${c.surface} 0%, ${c.canvas} 55%, ${c.surface} 100%)`,
  },
  vivid: {
    light: (c: ThemeColors) =>
      `linear-gradient(160deg, ${c['brand-soft']} 0%, color-mix(in srgb, ${c.brand} 6%, ${c.canvas}) 45%, color-mix(in srgb, ${c.success} 22%, ${c.canvas}) 100%)`,
    dark: (c: ThemeColors) =>
      `linear-gradient(160deg, ${c['brand-soft']} 0%, ${c.canvas} 50%, color-mix(in srgb, ${c.success} 14%, ${c.canvas}) 100%)`,
  },
};

// The browser wants the CSS property; React Native has its own name for it.
const GRADIENT_PROP = (
  process.env.EXPO_OS === 'web' ? 'backgroundImage' : 'experimental_backgroundImage'
) as 'experimental_backgroundImage';

export interface ChatBackgroundProps {
  pattern?: ChatPatternName;
  /** `vivid` for a whole window, `subtle` behind one chat on a phone. */
  intensity?: 'subtle' | 'vivid';
}

export function ChatBackground({ pattern = 'doodles', intensity = 'subtle' }: ChatBackgroundProps) {
  const colors = useThemeColors();
  const scheme = colors.scheme;

  return (
    <View style={{ pointerEvents: 'none' }} className="absolute inset-0 overflow-hidden">
      <View
        style={{
          position: 'absolute',
          inset: 0,
          [GRADIENT_PROP]: GRADIENTS[intensity][scheme](colors),
        }}
      />

      <Image
        source={SOURCES[pattern]}
        resizeMode="repeat"
        tintColor={intensity === 'vivid' && scheme === 'light' ? colors.brand : colors.content}
        style={{ position: 'absolute', inset: 0, opacity: PATTERN_OPACITY[intensity][scheme] }}
        fadeDuration={0}
        accessible={false}
      />
    </View>
  );
}
