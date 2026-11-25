import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";

// The laibe design system bundles Inter for content and JetBrains Mono for the interface; a family per weight.
export const FONTS = {
  "Inter-400": Inter_400Regular,
  "Inter-500": Inter_500Medium,
  "Inter-600": Inter_600SemiBold,
  "Inter-700": Inter_700Bold,
  "JetBrainsMono-400": JetBrainsMono_400Regular,
  "JetBrainsMono-500": JetBrainsMono_500Medium,
  "JetBrainsMono-600": JetBrainsMono_600SemiBold,
  "JetBrainsMono-700": JetBrainsMono_700Bold,
};

/** The loaded family for a text's classes: `font-mono` picks JetBrains Mono, the weight class picks the file. */
export function fontFamilyFor(classes: string): keyof typeof FONTS {
  const weight = /\bfont-bold\b/.test(classes)
    ? 700
    : /\bfont-semibold\b/.test(classes)
      ? 600
      : /\bfont-medium\b/.test(classes)
        ? 500
        : 400;
  return `${/\bfont-mono\b/.test(classes) ? "JetBrainsMono" : "Inter"}-${weight}`;
}
