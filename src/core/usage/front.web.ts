import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export async function currentFront(): Promise<boolean> {
  if (!isTauri()) return false;
  const window = getCurrentWindow();
  try {
    return (await window.isFocused()) && (await window.isVisible());
  } catch {
    return false;
  }
}

export function watchFront(onChange: (inFront: boolean) => void): () => void {
  if (!isTauri()) return () => {};
  const listening = getCurrentWindow()
    .onFocusChanged(({ payload }) => onChange(payload))
    .catch(() => undefined);
  return () => void listening.then((unlisten) => unlisten?.());
}
