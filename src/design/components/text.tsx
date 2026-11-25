import { Text as RNText, type TextProps as RNTextProps } from "react-native";

import { fontFamilyFor } from "../fonts";
import { cn } from "../lib/cn";

// Interface text (titles, amounts, captions, labels) is mono; what people read and write is Inter.
const VARIANTS = {
  display: "text-display font-mono font-semibold tracking-tight text-content",
  headline: "text-headline font-mono font-semibold tracking-tight text-content",
  title: "text-title font-mono font-semibold text-content",
  amount: "text-[1.625rem] font-mono font-semibold tracking-tight tabular-nums text-content",
  body: "text-body font-sans text-content",
  bodyMuted: "text-body font-sans text-content-muted",
  footnote: "text-footnote font-sans text-content-muted",
  caption: "text-caption font-mono text-content-subtle",
  micro: "text-micro font-mono uppercase tracking-wider text-content-subtle",
  mono: "text-footnote font-mono text-content-muted",
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
