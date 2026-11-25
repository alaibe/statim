import { Text as RNText, type TextProps as RNTextProps } from "react-native";

import { fontFamilyFor } from "../fonts";
import { cn } from "../lib/cn";

// Interface text (titles, amounts, captions, labels) is mono; what people read and write is Inter.
const VARIANTS = {
  display: "text-3xl font-mono font-semibold tracking-tight text-fg",
  headline: "text-2xl font-mono font-semibold tracking-tight text-fg",
  title: "text-lg font-mono font-semibold text-fg",
  amount: "text-[1.625rem] font-mono font-semibold tracking-tight tabular-nums text-fg",
  body: "text-md font-sans text-fg",
  bodyMuted: "text-md font-sans text-muted",
  footnote: "text-md font-sans text-muted",
  caption: "text-sm font-mono text-subtle",
  micro: "text-2xs font-mono uppercase tracking-caps text-subtle",
  mono: "text-md font-mono text-muted",
} as const;

type TextVariant = keyof typeof VARIANTS;

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  className?: string;
}

export function Text({ variant = "body", className, style, ...props }: TextProps) {
  const classes = cn(VARIANTS[variant], className);
  return (
    <RNText
      className={classes}
      style={[{ fontFamily: fontFamilyFor(classes), fontWeight: "normal" }, style]}
      {...props}
    />
  );
}
