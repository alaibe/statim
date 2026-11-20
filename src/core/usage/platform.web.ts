import { invoke } from "@tauri-apps/api/core";

import type { PageView, System } from "./usage";

const OS: System["os"] = /Mac/.test(navigator.userAgent)
  ? "macOS"
  : /Windows/.test(navigator.userAgent)
    ? "Windows"
    : "Linux";

export function system(): System {
  return { os: OS, device: "desktop", width: window.screen.width, height: window.screen.height };
}

/** Rust sends it, under a fixed browser User-Agent. */
export async function post(body: PageView): Promise<void> {
  await invoke("usage_post", { body });
}
