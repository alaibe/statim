import { useColorScheme } from 'nativewind';

import { colorsFor, type ResolvedColors, type ThemeName } from '../tokens';

export type ThemeColors = ResolvedColors & { scheme: ThemeName };

const THEMES: Record<ThemeName, ThemeColors> = {
  light: { ...colorsFor('light'), scheme: 'light' },
  dark: { ...colorsFor('dark'), scheme: 'dark' },
};

/**
 * Colours for props that cannot take a class. NativeWind's `useColorScheme` follows the in-app
 * theme; React Native's reports only the OS setting.
 */
export function useThemeColors(): ThemeColors {
  const { colorScheme } = useColorScheme();
  return THEMES[colorScheme === 'dark' ? 'dark' : 'light'];
}
