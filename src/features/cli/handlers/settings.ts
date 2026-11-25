import { useAccountStore } from "@/core/account/account-store";
import { type CredentialId, writeCredential } from "@/core/account/credentials";
import { type ThemeChoice, useAppearanceStore } from "@/core/app/appearance";

import { type CliHandler, whenAccountReady } from "../context";
import { CliError } from "../errors";
import { readText } from "./input";

const THEMES: ThemeChoice[] = ["system", "light", "dark"];
const CREDENTIALS: CredentialId[] = ["gifs", "lifi", "lcx", "ai"];

function onOff(value: string): boolean {
  if (["on", "true", "yes", "1"].includes(value)) return true;
  if (["off", "false", "no", "0"].includes(value)) return false;
  throw new CliError(`Use on or off, not "${value}".`, "usage");
}

function oneOf<T extends string>(value: string, choices: readonly T[], what: string): T {
  if ((choices as readonly string[]).includes(value)) return value as T;
  throw new CliError(`${what} is one of: ${choices.join(", ")}.`, "usage");
}

const SETTERS: Record<string, (value: string) => Promise<void>> = {
  theme: (v) => useAppearanceStore.getState().setTheme(oneOf(v, THEMES, "theme")),
  "quick-tips": (v) => useAppearanceStore.getState().setQuickTips(onOff(v)),
  "read-receipts": (v) => useAppearanceStore.getState().setReadReceipts(onOff(v)),
  "typing-indicators": (v) => useAppearanceStore.getState().setTypingIndicators(onOff(v)),
  "link-previews": (v) => useAppearanceStore.getState().setLinkPreviews(onOff(v)),
  ai: (v) => useAppearanceStore.getState().setAiInChats(onOff(v)),
};

function current() {
  const s = useAppearanceStore.getState();
  return {
    theme: s.theme,
    "quick-tips": s.quickTips,
    "read-receipts": s.readReceipts,
    "typing-indicators": s.typingIndicators,
    "link-previews": s.linkPreviews,
    ai: s.aiInChats,
  };
}

export const settingsHandlers = {
  async settings() {
    await whenAccountReady();
    const data = current();
    return {
      data,
      text: Object.entries(data).map(
        ([key, value]) => `${key}: ${typeof value === "boolean" ? (value ? "on" : "off") : value}`,
      ),
    };
  },

  async "settings set"({ args }) {
    await whenAccountReady();
    const setter = SETTERS[args.setting!];
    if (!setter) {
      throw new CliError(`No setting "${args.setting}". Settings: ${Object.keys(SETTERS).join(", ")}.`, "usage");
    }
    await setter(args.value!.toLowerCase());
    return { data: current(), text: `${args.setting} is now ${args.value}.` };
  },

  async apikey({ args }, { io }) {
    await whenAccountReady();
    const service = oneOf(args.service!, CREDENTIALS, "service");
    const key = await readText(io, `${service} API key (empty removes it): `, true);
    await writeCredential(useAccountStore.getState().activeAccountId!, service, key);
    return {
      data: { service, saved: Boolean(key.trim()) },
      text: key.trim() ? `Saved the ${service} key.` : `Removed the ${service} key.`,
    };
  },
} satisfies Record<string, CliHandler>;
