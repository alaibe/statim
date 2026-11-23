import { Dimensions, Platform } from "react-native";

import type { PageView, System } from "./usage";

const ENDPOINT = "https://stats.laibe.cc/api/send";
const TIMEOUT_SECONDS = 5;
const TABLET_SHORT_SIDE = 600;

const OS = Platform.OS === "android" ? "Android" : "iOS";

// Umami drops `okhttp/…` as a bot and hashes this into the session, so it names a browser, never the app.
export function userAgent(os: "iOS" | "Android"): string {
  return os === "Android"
    ? "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    : "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
}

export function device(width: number, height: number): "mobile" | "tablet" {
  return Math.min(width, height) >= TABLET_SHORT_SIDE ? "tablet" : "mobile";
}

export function system(): System {
  const width = Math.round(Dimensions.get("screen").width);
  const height = Math.round(Dimensions.get("screen").height);
  return { os: OS, device: device(width, height), width, height };
}

export async function post(body: PageView): Promise<void> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_SECONDS * 1000);
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": userAgent(OS) },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
