import { type RefObject, useEffect } from "react";
import type { View } from "react-native";

export function useInertOutside(ref: RefObject<View | null>): void {
  useEffect(() => {
    const inside = ref.current as unknown as HTMLElement | null;
    return inside ? inertOutside(inside) : undefined;
  }, [ref]);
}

/** Portals hung off the body, such as an open popover, are hidden too, or they would paint above. */
function inertOutside(inside: HTMLElement): () => void {
  const undo: (() => void)[] = [];
  for (let node = inside; node.parentElement; node = node.parentElement) {
    const atBody = node.parentElement === document.body;
    for (const sibling of node.parentElement.children) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue;
      const visibility = sibling.style.visibility;
      sibling.inert = true;
      if (atBody) sibling.style.visibility = "hidden";
      undo.push(() => {
        sibling.inert = false;
        sibling.style.visibility = visibility;
      });
    }
    if (atBody) break;
  }
  return () => {
    for (const restore of undo) restore();
  };
}
