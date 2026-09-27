import * as SecureStore from 'expo-secure-store';

import { VaultKey } from '@/storage/vault';

import {
  checkPin,
  deletePin,
  hasPin,
  lockedUntilAfter,
  PIN_KDF,
  pinLockedUntil,
  pinMatches,
  savePin,
  sealPin,
} from './pin';

const CHEAP = { name: 'scrypt', N: 16, r: 1, p: 1, dkLen: 32 } as const;
const T0 = 1_700_000_000_000;

beforeEach(() => {
  (SecureStore as unknown as { __reset(): void }).__reset();
});

describe('sealing', () => {
  it('matches the PIN it sealed and nothing else', async () => {
    const sealed = await sealPin('482913', CHEAP);

    expect(await pinMatches('482913', sealed)).toBe(true);
    expect(await pinMatches('482914', sealed)).toBe(false);
    expect(await pinMatches('48291', sealed)).toBe(false);
  });

  it('salts every seal, so the same PIN never gives the same hash', async () => {
    const a = await sealPin('000000', CHEAP);
    const b = await sealPin('000000', CHEAP);

    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('verifies with the parameters it was sealed with, not the current ones', async () => {
    const sealed = await sealPin('135790', { ...CHEAP, N: 32 });

    expect(sealed.kdf.N).toBe(32);
    expect(await pinMatches('135790', sealed)).toBe(true);
    expect(await pinMatches('135790', { ...sealed, kdf: { ...sealed.kdf, N: 16 } })).toBe(false);
  });

  it('takes six digits only', async () => {
    await expect(sealPin('12345', CHEAP)).rejects.toThrow('6 digits');
    await expect(sealPin('1234567', CHEAP)).rejects.toThrow('6 digits');
    await expect(sealPin('12345a', CHEAP)).rejects.toThrow('6 digits');
  });

  it('keeps a salted scrypt hash and its parameters in the vault, never the PIN', async () => {
    await savePin('246810');

    const stored = await SecureStore.getItemAsync(VaultKey.pin);
    expect(stored).not.toContain('246810');
    expect(JSON.parse(stored!)).toEqual({
      kdf: PIN_KDF,
      salt: expect.stringMatching(/^[0-9a-f]{32}$/),
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(await hasPin()).toBe(true);
  });

  it('forgets the PIN and its attempt count together', async () => {
    await savePin('246810');
    await checkPin('000000', T0);

    await deletePin();

    expect(await hasPin()).toBe(false);
    expect(await SecureStore.getItemAsync(VaultKey.pinAttempts)).toBeNull();
  });
});

describe('waiting after wrong PINs', () => {
  it('allows five tries, then waits 30 seconds, doubling after each further miss', () => {
    for (const failures of [0, 1, 2, 3, 4]) expect(lockedUntilAfter(failures, T0)).toBeNull();

    expect(lockedUntilAfter(5, T0)).toBe(T0 + 30_000);
    expect(lockedUntilAfter(6, T0)).toBe(T0 + 60_000);
    expect(lockedUntilAfter(7, T0)).toBe(T0 + 120_000);
    expect(lockedUntilAfter(8, T0)).toBe(T0 + 240_000);
  });

  it('never makes anyone wait more than a day', () => {
    expect(lockedUntilAfter(40, T0)).toBe(T0 + 24 * 60 * 60_000);
    expect(lockedUntilAfter(5000, T0)).toBe(T0 + 24 * 60 * 60_000);
  });
});

describe('checking a PIN', () => {
  beforeEach(async () => {
    await savePin('112233');
  });

  it('accepts the right PIN', async () => {
    expect(await checkPin('112233', T0)).toEqual({ result: 'correct' });
  });

  it('starts a wait on the fifth wrong PIN in a row', async () => {
    for (let i = 0; i < 4; i++) {
      expect(await checkPin('999999', T0)).toEqual({ result: 'wrong', lockedUntil: null });
    }
    expect(await checkPin('999999', T0)).toEqual({ result: 'wrong', lockedUntil: T0 + 30_000 });
  });

  it('refuses every PIN during the wait, the right one too, without counting it', async () => {
    for (let i = 0; i < 5; i++) await checkPin('999999', T0);

    expect(await checkPin('112233', T0 + 29_999)).toEqual({
      result: 'waiting',
      lockedUntil: T0 + 30_000,
    });
    expect(await checkPin('999999', T0 + 30_000)).toEqual({
      result: 'wrong',
      lockedUntil: T0 + 30_000 + 60_000,
    });
  });

  it('starts counting again after the right PIN', async () => {
    for (let i = 0; i < 4; i++) await checkPin('999999', T0);
    expect(await checkPin('112233', T0)).toEqual({ result: 'correct' });

    for (let i = 0; i < 4; i++) {
      expect(await checkPin('999999', T0)).toEqual({ result: 'wrong', lockedUntil: null });
    }
  });

  it('keeps the count and the wait in the vault, so a restart does not reset them', async () => {
    for (let i = 0; i < 5; i++) await checkPin('999999', T0);

    expect(JSON.parse((await SecureStore.getItemAsync(VaultKey.pinAttempts))!)).toEqual({
      failures: 5,
      lockedUntil: T0 + 30_000,
    });
    expect(await pinLockedUntil(T0 + 10_000)).toBe(T0 + 30_000);
    expect(await pinLockedUntil(T0 + 30_000)).toBeNull();
  });

  it('clears the count when a new PIN is set', async () => {
    for (let i = 0; i < 5; i++) await checkPin('999999', T0);

    await savePin('445566');

    expect(await pinLockedUntil(T0)).toBeNull();
    expect(await checkPin('445566', T0)).toEqual({ result: 'correct' });
  });

  it('fails when no PIN is set rather than letting anything through', async () => {
    await deletePin();
    await expect(checkPin('112233', T0)).rejects.toThrow('No PIN is set');
  });
});
