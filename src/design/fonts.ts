import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from "@expo-google-fonts/jetbrains-mono";

/** Inter for content and JetBrains Mono for the interface, bundled: 400 and 600 each, and mono's 500 for controls. */
export const FONTS = {
  "Inter-400": Inter_400Regular,
  "Inter-600": Inter_600SemiBold,
  "JetBrainsMono-400": JetBrainsMono_400Regular,
  "JetBrainsMono-500": JetBrainsMono_500Medium,
  "JetBrainsMono-600": JetBrainsMono_600SemiBold,
};

export type FontFamily = "mono" | "sans";
export type FontWeight = 400 | 500 | 600;

/** The loaded file for a family and weight; Inter has no 500, so it takes 400. */
export function fontFile(family: FontFamily, weight: FontWeight): keyof typeof FONTS {
  if (family === "sans") return weight === 600 ? "Inter-600" : "Inter-400";
  return `JetBrainsMono-${weight}`;
}
