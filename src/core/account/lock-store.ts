import { create } from 'zustand';

import { reportError } from '../app/report-error';
import {
  authenticate,
  type LockSetup,
  type PromptOutcome,
  readLockSetup,
  setLockEnabled,
  unlockMethod,
} from './lock';
import { checkPin, deletePin, type PinCheck, savePin } from './pin';

export type LockStatus = 'checking' | 'locked' | 'open';

export const RELOCK_AFTER_MS = 60_000;

export interface LockState {
  status: LockStatus;
  /** Null until read, and after a read fails; the app stays locked until one succeeds. */
  setup: LockSetup | null;
  prompting: boolean;
  backgroundedAt: number | null;

  evaluate(): Promise<void>;
  noteJustAuthenticated(): void;
  unlock(): Promise<PromptOutcome>;
  verifyPin(pin: string): Promise<PinCheck>;
  setPin(pin: string): Promise<void>;
  removePin(): Promise<void>;
  setBiometricLock(enabled: boolean, label: string): Promise<boolean>;
  noteBackgrounded(): void;
  noteForegrounded(): Promise<void>;
}

export const useLockStore = create<LockState>((set, get) => ({
  status: 'checking',
  setup: null,
  prompting: false,
  backgroundedAt: null,

  async evaluate() {
    const setup = await readSetup();
    set({ setup, status: setup && unlockMethod(setup) === null ? 'open' : 'locked' });
  },

  noteJustAuthenticated() {
    set({ status: 'open', backgroundedAt: null });
  },

  async unlock() {
    if (get().prompting) return 'failed';

    set({ prompting: true });
    try {
      const outcome = await authenticate('Unlock Status Original');
      if (outcome === 'passed') set({ status: 'open', backgroundedAt: null });
      return outcome;
    } finally {
      set({ prompting: false });
    }
  },

  async verifyPin(pin) {
    const check = await checkPin(pin);
    if (check.result === 'correct' && get().status === 'locked') {
      set({ status: 'open', backgroundedAt: null });
    }
    return check;
  },

  async setPin(pin) {
    await savePin(pin);
    set({ setup: await readLockSetup() });
  },

  async removePin() {
    await deletePin();
    set({ setup: await readLockSetup() });
  },

  async setBiometricLock(enabled, label) {
    const applied = await setLockEnabled(enabled, label);
    if (applied) set({ setup: await readLockSetup(), backgroundedAt: null });
    return applied;
  },

  noteBackgrounded() {
    if (get().status === 'open') set({ backgroundedAt: Date.now() });
  },

  async noteForegrounded() {
    const { backgroundedAt, status } = get();
    if (status !== 'open' || backgroundedAt === null) return;

    set({ backgroundedAt: null });
    if (Date.now() - backgroundedAt < RELOCK_AFTER_MS) return;

    const setup = await readSetup();
    set(setup && unlockMethod(setup) === null ? { setup } : { setup, status: 'locked' });
  },
}));

async function readSetup(): Promise<LockSetup | null> {
  try {
    return await readLockSetup();
  } catch (error) {
    reportError(error);
    return null;
  }
}
