import type { ThemeColors } from "@/design";

export function stackScreenOptions(colors: ThemeColors) {
  return {
    contentStyle: { backgroundColor: colors.bg },
    animation: "slide_from_right",
  } as const;
}
