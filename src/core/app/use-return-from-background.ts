import { useEffect, useEffectEvent, useRef } from "react";
import { AppState } from "react-native";

/** Runs on return from another app, not when a system prompt or sheet hands focus back via `inactive`. */
export function useOnReturnFromBackground(onReturn: () => void): void {
  const handler = useEffectEvent(onReturn);
  const last = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const previous = last.current;
      last.current = next;
      if (next === "active" && previous === "background") handler();
    });
    return () => subscription.remove();
  }, []);
}
