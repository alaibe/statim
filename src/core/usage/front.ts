import { AppState } from "react-native";

export function currentFront(): Promise<boolean> {
  return Promise.resolve(AppState.currentState === "active");
}

export function watchFront(onChange: (inFront: boolean) => void): () => void {
  const subscription = AppState.addEventListener("change", (state) => onChange(state === "active"));
  return () => subscription.remove();
}
