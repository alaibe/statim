import { create } from "zustand";
import type { AccountStorage } from "@/storage/account";

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "appearance";

export interface AppearanceState {
  accountId: string | null;
  theme: ThemeChoice;
  /** The desktop status bar shows the keys of the current context. */
  quickTips: boolean;
  readReceipts: boolean;
  typingIndicators: boolean;
  linkPreviews: boolean;
  aiInChats: boolean;

  hydrate(storage: AccountStorage): Promise<void>;
  clear(): void;
  setTheme(theme: ThemeChoice): Promise<void>;
  setQuickTips(enabled: boolean): Promise<void>;
  setReadReceipts(enabled: boolean): Promise<void>;
  setTypingIndicators(enabled: boolean): Promise<void>;
  setLinkPreviews(enabled: boolean): Promise<void>;
  setAiInChats(enabled: boolean): Promise<void>;
}

type Settings = Pick<
  AppearanceState,
  "theme" | "quickTips" | "readReceipts" | "typingIndicators" | "linkPreviews" | "aiInChats"
>;

const DEFAULTS: Settings = {
  theme: "system",
  quickTips: true,
  readReceipts: false,
  typingIndicators: false,
  linkPreviews: true,
  aiInChats: false,
};

let projectedStorage: AccountStorage | null = null;
let hydration = 0;

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  accountId: null,
  ...DEFAULTS,

  async hydrate(storage) {
    const request = ++hydration;
    projectedStorage = storage;
    try {
      const parsed = await storage.get<Partial<Settings>>(KEY);
      if (request !== hydration || projectedStorage !== storage) return;
      set({ accountId: storage.accountId, ...DEFAULTS, ...parsed });
    } catch {}
  },

  clear() {
    hydration += 1;
    projectedStorage = null;
    set({ accountId: null, ...DEFAULTS });
  },

  async setTheme(theme) {
    set({ theme });
    await persist(get());
  },

  async setQuickTips(quickTips) {
    set({ quickTips });
    await persist(get());
  },

  async setReadReceipts(readReceipts) {
    set({ readReceipts });
    await persist(get());
  },

  async setTypingIndicators(typingIndicators) {
    set({ typingIndicators });
    await persist(get());
  },

  async setLinkPreviews(linkPreviews) {
    set({ linkPreviews });
    await persist(get());
  },

  async setAiInChats(aiInChats) {
    set({ aiInChats });
    await persist(get());
  },
}));

async function persist(state: AppearanceState): Promise<void> {
  const storage = projectedStorage;
  if (!state.accountId || storage?.accountId !== state.accountId) return;
  try {
    await storage.set(KEY, {
      theme: state.theme,
      quickTips: state.quickTips,
      readReceipts: state.readReceipts,
      typingIndicators: state.typingIndicators,
      linkPreviews: state.linkPreviews,
      aiInChats: state.aiInChats,
    } satisfies Settings);
  } catch (error) {
    console.warn("[appearance] could not persist settings", error);
  }
}
