import { Control } from "../tokens";

/** The desktop app is the web export in a Tauri window; everything else is a phone. */
export const desktop = process.env.EXPO_OS === "web";

/** Controls are 32 on the desktop (28 small, 36 large) and 44 on touch. */
export function controlHeight(size: "sm" | "md" | "lg" = "md"): number {
  return desktop ? Control[size] : Control.touch;
}
