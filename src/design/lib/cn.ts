import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

import { COLOR_NAMES, FontSize, Radius } from "../tokens";

const twMerge = extendTailwindMerge({
  override: {
    theme: {
      color: [...COLOR_NAMES, "transparent"],
      radius: Object.keys(Radius),
      text: Object.keys(FontSize),
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
