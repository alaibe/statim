import * as Linking from "expo-linking";
import { useEffect } from "react";
import { AppState } from "react-native";
import { accountRuntime } from "@/runtime";
import { useAccountStore } from "../account/account-store";
import { useLockStore } from "../account/lock-store";
import { registerHardwareVendors } from "../account/vendors";
import { handleTrezorCallback, isTrezorCallback } from "../account/vendors/trezor";
import { usePluginHost } from "../plugins/host";
import { reportError } from "./report-error";

registerHardwareVendors();

export function useAppBoot(): void {
  const status = useAccountStore((s) => s.status);
  const keyring = useAccountStore((s) => s.keyring);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const restore = useAccountStore((s) => s.restore);
  const { registry, defaultEnabled, makeContext, onPluginsChanged } = usePluginHost();

  useEffect(() => {
    if (status === "loading") void restore();
  }, [status, restore]);

  useEffect(watchForReturn, []);

  useEffect(() => {
    void accountRuntime.synchronize(
      status === "ready" && keyring && activeAccountId
        ? {
            accountId: activeAccountId,
            keyring,
            registry,
            defaultEnabled,
            makeContext,
            onPluginsChanged,
          }
        : null,
    );
  }, [status, keyring, activeAccountId, registry, defaultEnabled, makeContext, onPluginsChanged]);
}

const CLOCK_TICK_MS = 10_000;
const SLEPT_MS = 30_000;

/** Coming back to the foreground, online or from sleep (seen as the clock jumping) lets protocols re-open. */
function watchForReturn(): () => void {
  const resume = () => accountRuntime.resume();
  let state = AppState.currentState;
  const subscription = AppState.addEventListener("change", (next) => {
    if (next === "active" && state === "background") resume();
    state = next;
  });
  let tick = Date.now();
  const clock = setInterval(() => {
    const now = Date.now();
    if (now - tick > SLEPT_MS) resume();
    tick = now;
  }, CLOCK_TICK_MS);
  const events = typeof globalThis.addEventListener === "function" ? globalThis : null;
  events?.addEventListener("online", resume);
  return () => {
    subscription.remove();
    clearInterval(clock);
    events?.removeEventListener("online", resume);
  };
}

export function useDeepLinkRouter() {
  const { handleUri } = usePluginHost();

  useEffect(() => {
    const consume = (url: string | null) => {
      if (!url) return;
      if (isTrezorCallback(url)) {
        handleTrezorCallback(url);
        return;
      }
      const parsed = Linking.parse(url);
      const wrapped = typeof parsed.queryParams?.uri === "string" ? parsed.queryParams.uri : null;
      handleUri(wrapped ?? url).catch((error) => {
        console.warn("[deeplink] no handler for", url, error);
      });
    };

    Linking.getInitialURL().then(consume).catch(reportError);
    const sub = Linking.addEventListener("url", ({ url }) => consume(url));
    return () => sub.remove();
  }, [handleUri]);
}

export function useAppLock() {
  const status = useLockStore((s) => s.status);
  const evaluate = useLockStore((s) => s.evaluate);

  useEffect(() => {
    if (status === "checking") evaluate().catch(reportError);
  }, [status, evaluate]);

  return status;
}
