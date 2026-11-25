import { cn } from "../lib/cn";
import { Text } from "./text";

const TONE = {
  muted: "text-subtle",
  accent: "text-accent",
  success: "text-success",
  danger: "text-danger",
} as const;

interface EyebrowProps {
  children: string;
  tone?: keyof typeof TONE;
  className?: string;
}

export function Eyebrow({ children, tone = "muted", className }: EyebrowProps) {
  return <Text className={cn("font-mono text-2xs uppercase tracking-label", TONE[tone], className)}>{children}</Text>;
}
