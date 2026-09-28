import { create } from 'zustand';

import { reportError } from '../app/report-error';
import type { PromptOutcome } from './biometric-prompt';
import { authenticate, type LockSetup, readLockSetup, setLockEnabled, unlockMethod } from './lock';
import { checkPin, deletePin, type PinCheck, savePin } from './pin';

export type LockStatus = 'checking' | 'locked' | 'open';

export interface LockState {
  status: LockStatus;
  /** Null until read, and after a read fails; the app stays locked until one succeeds. */
  setup: LockSetup | null;
  prompting: boolean;

  evaluate(): Promise<void>;
  noteJustAuthenticated(): void;
  unlock(): Promise<PromptOutcome>;
  verifyPin(pin: string): Promise<PinCheck>;
  setPin(pin: string): Promise<void>;
  removePin(): Promise<void>;
  setBiometricLock(enabled: boolean): Promise<boolean>;
}

export const useLockStore = create<LockState>((set, get) => ({
  status: 'checking',
  setup: null,
  prompting: false,

  async evaluate() {
    const setup = await readSetup();
    set({ setup, status: setup && unlockMethod(setup) === null ? 'open' : 'locked' });
  },

  noteJustAuthenticated() {
    set({ status: 'open' });
  },

  async unlock() {
    if (get().prompting) return 'failed';

    set({ prompting: true });
    try {
      const outcome = await authenticate('unlock');
      if (outcome === 'passed') set({ status: 'open' });
      return outcome;
    } finally {
      set({ prompting: false });
    }
  },

  async verifyPin(pin) {
    const check = await checkPin(pin);
    if (check.result === 'correct' && get().status === 'locked') {
      set({ status: 'open' });
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

  async setBiometricLock(enabled) {
    const applied = await setLockEnabled(enabled);
    if (applied) set({ setup: await readLockSetup() });
    return applied;
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
