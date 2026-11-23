import type { ThemeColors } from "@/design";

export function stackScreenOptions(_colors: ThemeColors) {
  return {
    contentStyle: { backgroundColor: "transparent" },
    animation: "none",
  } as const;
}
