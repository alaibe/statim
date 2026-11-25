import { View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "./text";

const TONE = {
  neutral: "bg-side",
  accent: "bg-accent-soft",
  success: "bg-success/15",
  warning: "bg-warning/15",
  danger: "bg-danger/15",
} as const;

const LABEL = {
  neutral: "text-muted",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
} as const;

interface BadgeProps {
  label: string;
  tone?: keyof typeof TONE;
}

export function Badge({ label, tone = "neutral" }: BadgeProps) {
  return (
    <View className={cn("self-start rounded-full px-2 py-0.5", TONE[tone])}>
      <Text className={cn("text-2xs font-semibold uppercase tracking-label", LABEL[tone])}>{label}</Text>
    </View>
  );
}
