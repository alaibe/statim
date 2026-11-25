import type { ThemeColors } from "@/design";

export function stackScreenOptions(colors: ThemeColors) {
  return {
    contentStyle: { backgroundColor: colors.bg },
    animation: "none",
  } as const;
}
