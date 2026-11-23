import { createContext, useContext } from "react";

/** The desktop's sidebar, which overlays centre beside, and its drag strip, which screen headers start below. */
export const LayoutInsetsContext = createContext({ left: 0, top: 0 });

export function useLayoutInsets() {
  return useContext(LayoutInsetsContext);
}
