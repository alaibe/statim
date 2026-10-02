import { create } from 'zustand';

import { loadAiConfig, saveAiConfig } from './config';

export interface AiState {
  accountId: string | null;
  enabled: boolean;

  hydrate(accountId: string): Promise<void>;
  clear(): void;
  setEnabled(enabled: boolean): Promise<void>;
}

let hydration = 0;

export const useAiStore = create<AiState>((set, get) => ({
  accountId: null,
  enabled: false,

  async hydrate(accountId) {
    const request = ++hydration;
    const { enabled } = await loadAiConfig(accountId);
    if (request === hydration) set({ accountId, enabled });
  },

  clear() {
    hydration += 1;
    set({ accountId: null, enabled: false });
  },

  async setEnabled(enabled) {
    const { accountId } = get();
    if (!accountId) throw new Error('No account is active yet.');
    await saveAiConfig(accountId, { enabled });
    if (get().accountId === accountId) set({ enabled });
  },
}));
