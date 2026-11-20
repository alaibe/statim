import { useSegments } from "expo-router";

import { useAccountStore } from "@/core/account/account-store";
import { useLockStore } from "@/core/account/lock-store";

import { type ScreenUrl, screenUrl } from "./screens";
import { sendPageView } from "./usage";
import { useUsage } from "./use-usage";

const send = (screen: ScreenUrl) => void sendPageView(screen);

/** Nothing before onboarding is done or while the app is locked. */
export function UsageStatistics(): null {
  const url = screenUrl(useSegments());
  const ready = useAccountStore((s) => s.status === "ready");
  const unlocked = useLockStore((s) => s.status === "open");
  useUsage(ready && unlocked ? url : null, send);
  return null;
}
