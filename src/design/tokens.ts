import tokens from "./laibe/tokens.json";

export type ColorName = keyof typeof tokens.colors;
export type ThemeName = "light" | "dark";
export type ResolvedColors = Record<ColorName, string>;

export const COLOR_NAMES = Object.keys(tokens.colors) as ColorName[];

function resolve(theme: ThemeName): ResolvedColors {
  return Object.fromEntries(COLOR_NAMES.map((name) => [name, tokens.colors[name][theme]])) as ResolvedColors;
}

const RESOLVED: Record<ThemeName, ResolvedColors> = { light: resolve("light"), dark: resolve("dark") };

export function colorsFor(theme: ThemeName): ResolvedColors {
  return RESOLVED[theme];
}

/** A token colour at an opacity, as `color-mix(in oklab, <colour> <n>%, transparent)` gives it. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const FontSize = tokens.fontSize;
export const Leading = tokens.leading;
export const Tracking = tokens.tracking;
export const Space = tokens.space;
export const Radius = tokens.radius;
export const Chamfer = tokens.chamfer;
export const Control = tokens.control;
export const Layout = tokens.layout;
export const Layer = tokens.layer;
export const Size = tokens.size;
export const Durations = tokens.duration;
export const Ease = tokens.ease as Record<keyof typeof tokens.ease, [number, number, number, number]>;
export const Shadow = tokens.shadow;

export type FontSizeName = keyof typeof FontSize;

/** `--glow`: the primary button on hover, the live indicator, the lit point. */
export function glow(colors: ResolvedColors): string {
  return `0 0 0 1px ${withAlpha(colors.accent, 0.7)}, 0 0 18px ${withAlpha(colors.accent, 0.35)}`;
}

/** `--focus-ring`, drawn on every focusable element under keyboard focus. */
export function focusRing(colors: ResolvedColors): string {
  return `0 0 0 2px ${colors.bg}, 0 0 0 3px ${colors.accent}, 0 0 14px ${withAlpha(colors.accent, 0.45)}`;
}

/** `--glow-text`, as React Native's text shadow. */
export function glowText(colors: ResolvedColors) {
  return {
    textShadowColor: withAlpha(colors.accent, 0.55),
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  };
}
