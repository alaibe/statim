import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Notice, toast } from "@/design";

/** A banner under the title bar: an update is app-wide state. */
export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const looking = useRef(false);

  const look = useEffectEvent(async (asked: boolean): Promise<Update | null> => {
    if (update || looking.current) return null;
    looking.current = true;
    try {
      const found = await check();
      if (!found) {
        if (asked) toast.info("Statim is up to date");
        return null;
      }
      if (asked) toast.info(`Downloading version ${found.version}`);
      await found.download();
      return found;
    } catch (error) {
      console.warn("[updater]", error);
      if (asked) toast.error("Couldn’t check for updates. Try again later.");
      return null;
    } finally {
      looking.current = false;
    }
  });

  useEffect(() => {
    const show = (found: Update | null) => {
      if (found) setUpdate(found);
    };
    if (!__DEV__) void look(false).then(show);
    let stop: UnlistenFn | undefined;
    let cancelled = false;
    void listen<string>("app-menu", ({ payload }) => {
      if (payload === "check-updates") void look(true).then(show);
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  if (!update) return null;

  const restart = async () => {
    try {
      await update.install();
      await relaunch();
    } catch (error) {
      console.warn("[updater]", error);
      toast.error("Couldn’t install the update. Try again from the Statim menu.");
    }
  };

  return (
    <Notice
      banner
      tone="accent"
      tag="UPDATE"
      message={`Version ${update.version} is ready.`}
      action={{ label: "Restart", onPress: restart }}
    />
  );
}
