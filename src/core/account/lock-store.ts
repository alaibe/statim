import { create } from 'zustand';

import { reportError } from '../app/report-error';
import { authenticate, isLockEnabled } from './lock';

export type LockStatus = 'checking' | 'locked' | 'open';

export const RELOCK_AFTER_MS = 60_000;

interface LockState {
  status: LockStatus;
  prompting: boolean;
  backgroundedAt: number | null;

  evaluate(): Promise<void>;
  noteJustAuthenticated(): void;
  unlock(): Promise<boolean>;
  noteBackgrounded(): void;
  noteForegrounded(): Promise<void>;
}

export const useLockStore = create<LockState>((set, get) => ({
  status: 'checking',
  prompting: false,
  backgroundedAt: null,

  async evaluate() {
    set({ status: (await lockedUnlessDisarmed()) ? 'locked' : 'open' });
  },

  noteJustAuthenticated() {
    set({ status: 'open', backgroundedAt: null });
  },

  async unlock() {
    if (get().prompting) return false;

    set({ prompting: true });
    try {
      const passed = await authenticate('Unlock Status Original');
      if (passed) set({ status: 'open', backgroundedAt: null });
      return passed;
    } finally {
      set({ prompting: false });
    }
  },

  noteBackgrounded() {
    if (get().status === 'open') set({ backgroundedAt: Date.now() });
  },

  async noteForegrounded() {
    const { backgroundedAt, status } = get();
    if (status !== 'open' || backgroundedAt === null) return;

    set({ backgroundedAt: null });
    if (Date.now() - backgroundedAt < RELOCK_AFTER_MS) return;
    if (await lockedUnlessDisarmed()) set({ status: 'locked' });
  },
}));

async function lockedUnlessDisarmed(): Promise<boolean> {
  try {
    return await isLockEnabled();
  } catch (error) {
    reportError(error);
    return true;
  }
}
