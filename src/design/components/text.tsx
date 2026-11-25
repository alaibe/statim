import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";

import { type FontFamily, type FontWeight, fontFile } from "../fonts";
import { useThemeColors } from "../hooks/use-theme-colors";
import { desktop } from "../lib/platform";
import { type ColorName, FontSize, type FontSizeName, glowText, Leading, Tracking } from "../tokens";

interface Role {
  family: FontFamily;
  size: FontSizeName;
  leading: keyof typeof Leading;
  weight: FontWeight;
  tracking?: keyof typeof Tracking;
  upper?: boolean;
  tabular?: boolean;
  tone: ColorName;
}

/** The typography page's roles. Phones read body text at `md` 15, the desktop at `base` 14. */
const ROLES = {
  display: { family: "mono", size: "3xl", leading: "tight", weight: 600, tracking: "tight", tone: "fg" },
  title: { family: "mono", size: "xl", leading: "tight", weight: 600, tracking: "tight", tone: "fg" },
  heading: { family: "mono", size: "lg", leading: "snug", weight: 600, tone: "fg" },
  label: { family: "mono", size: "2xs", leading: "tight", weight: 500, tracking: "caps", upper: true, tone: "muted" },
  control: { family: "mono", size: "sm", leading: "tight", weight: 500, tone: "fg" },
  meta: { family: "mono", size: "xs", leading: "snug", weight: 400, tabular: true, tone: "muted" },
  stat: { family: "mono", size: "2xl", leading: "tight", weight: 600, tabular: true, tone: "fg" },
  body: { family: "sans", size: desktop ? "base" : "md", leading: "normal", weight: 400, tone: "fg" },
  reading: { family: "sans", size: "md", leading: "normal", weight: 400, tone: "fg" },
  code: { family: "mono", size: "sm", leading: "normal", weight: 400, tone: "fg" },
} as const satisfies Record<string, Role>;

export type TextVariant = keyof typeof ROLES;

export type TextTone = Extract<
  ColorName,
  "fg" | "muted" | "subtle" | "accent" | "on-accent" | "danger" | "warning" | "success" | "info"
>;

/** A role's face, size, line height and tracking, for a `TextInput` or a web element that draws its own text. */
export function textStyle(variant: TextVariant, options: { strong?: boolean; size?: FontSizeName } = {}): TextStyle {
  const role: Role = ROLES[variant];
  const size = FontSize[options.size ?? role.size];
  const weight: FontWeight = options.strong ? 600 : role.weight;
  return {
    fontFamily: fontFile(role.family, weight),
    fontWeight: "normal",
    fontSize: size,
    lineHeight: Math.round(size * Leading[role.leading]),
    letterSpacing: role.tracking ? Tracking[role.tracking] * size : undefined,
    textTransform: role.upper ? "uppercase" : undefined,
    fontVariant: role.tabular ? ["tabular-nums"] : undefined,
  };
}

/** Where text sits, never how it looks: the role sets face, size and colour. */
export type TextLayoutStyle = Omit<
  TextStyle,
  | "color"
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "fontStyle"
  | "lineHeight"
  | "letterSpacing"
  | "textTransform"
  | "fontVariant"
>;

export interface TextProps extends Omit<RNTextProps, "style"> {
  variant?: TextVariant;
  tone?: TextTone;
  /** 600: an unread title, a value that matters in a sentence. */
  strong?: boolean;
  /** Body text a step down: `sm` for previews, descriptions and toasts; `xs` for help under a field. */
  size?: "sm" | "xs";
  align?: "left" | "center" | "right";
  /** `--glow-text`: an empty state's boot line, the status bar's running value. */
  glow?: boolean;
  /** Layout only: flex, margins, width. */
  className?: string;
  style?: TextLayoutStyle;
}

export function Text({ variant = "body", tone, strong, size, align, glow = false, style, ...props }: TextProps) {
  const colors = useThemeColors();
  const role: Role = ROLES[variant];
  return (
    <RNText
      style={[
        textStyle(variant, { strong, size: role.family === "sans" ? size : undefined }),
        { color: colors[tone ?? role.tone], textAlign: align },
        glow ? glowText(colors) : null,
        style,
      ]}
      {...props}
    />
  );
}
