export const Palette = {
  light: {
    // The laibe design system, ultraviolet accent.
    brand: "101 74 187",
    "brand-soft": "234 232 255",
    "brand-strong": "86 55 167",
    "brand-on": "255 255 255",
    ai: "86 55 167",

    canvas: "245 246 251",
    surface: "255 255 255",
    "surface-raised": "255 255 255",
    "surface-sunken": "236 238 245",

    content: "11 13 25",
    "content-muted": "81 87 111",
    "content-subtle": "114 121 149",

    line: "215 218 230",
    "line-strong": "195 199 213",

    "bubble-out": "234 232 255",
    "bubble-out-on": "11 13 25",
    "bubble-in": "255 255 255",
    "bubble-in-on": "11 13 25",

    success: "0 127 56",
    warning: "169 107 0",
    danger: "201 34 43",
  },
  dark: {
    brand: "170 153 255",
    "brand-soft": "46 39 78",
    "brand-strong": "185 174 255",
    "brand-on": "4 5 11",
    ai: "185 174 255",

    canvas: "11 13 25",
    surface: "19 22 36",
    "surface-raised": "19 22 36",
    "surface-sunken": "7 8 18",

    content: "218 246 251",
    "content-muted": "176 192 209",
    "content-subtle": "114 121 149",

    line: "42 47 69",
    "line-strong": "60 65 88",

    "bubble-out": "46 39 78",
    "bubble-out-on": "218 246 251",
    "bubble-in": "19 22 36",
    "bubble-in-on": "218 246 251",

    success: "115 240 148",
    warning: "255 200 69",
    danger: "255 112 114",
  },
} as const;

export type ThemeName = keyof typeof Palette;
type TokenName = keyof (typeof Palette)["light"];

function rgb(channels: string, alpha?: number) {
  return alpha === undefined ? `rgb(${channels})` : `rgb(${channels} / ${alpha})`;
}

export type ResolvedColors = Record<TokenName, string>;

const RESOLVED: Record<ThemeName, ResolvedColors> = {
  light: Object.fromEntries(Object.entries(Palette.light).map(([k, v]) => [k, rgb(v)])) as ResolvedColors,
  dark: Object.fromEntries(Object.entries(Palette.dark).map(([k, v]) => [k, rgb(v)])) as ResolvedColors,
};

export function colorsFor(theme: ThemeName): ResolvedColors {
  return RESOLVED[theme];
}
