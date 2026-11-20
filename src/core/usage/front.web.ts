import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Whether the app is in front, for the usage tracker: its window focused and shown. A page opened in a plain browser
// has no window to ask, and counts as behind.

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
