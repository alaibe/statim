import { scryptAsync } from '@noble/hashes/scrypt';

import { fromHex, timingSafeEqual, toHex } from '@/lib/bytes';
import { isNumber, isString, oneOf, shape } from '@/lib/guards';
import { randomBytes } from '@/lib/random';
import { VaultKey, vaultDelete, vaultGet, vaultSet } from '@/storage/vault';

export const PIN_LENGTH = 6;

const FREE_TRIES = 5;
const FIRST_WAIT_MS = 30_000;
const LONGEST_WAIT_MS = 24 * 60 * 60_000;

export interface PinKdf {
  name: 'scrypt';
  N: number;
  r: number;
  p: number;
  dkLen: number;
}

/**
 * Hermes runs this without a JIT, so a phone gets a lower cost than the
 * desktop to keep one check well under a second.
 */
export const PIN_KDF: PinKdf =
  process.env.EXPO_OS === 'web'
    ? { name: 'scrypt', N: 2 ** 15, r: 8, p: 1, dkLen: 32 }
    : { name: 'scrypt', N: 2 ** 10, r: 8, p: 1, dkLen: 32 };

interface SealedPin {
  kdf: PinKdf;
  salt: string;
  hash: string;
}

interface Attempts {
  failures: number;
  lockedUntil: number;
}

export type PinCheck =
  | { result: 'correct' }
  | { result: 'wrong'; lockedUntil: number | null }
  | { result: 'waiting'; lockedUntil: number };

const isSealedPin = shape<SealedPin>({
  kdf: shape<PinKdf>({
    name: oneOf('scrypt'),
    N: isNumber,
    r: isNumber,
    p: isNumber,
    dkLen: isNumber,
  }),
  salt: isString,
  hash: isString,
});

const isAttempts = shape<Attempts>({ failures: isNumber, lockedUntil: isNumber });

export function isPinShaped(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

/** When the next try is allowed after `failures` wrong PINs in a row, or null for straight away. */
export function lockedUntilAfter(failures: number, now: number): number | null {
  if (failures < FREE_TRIES) return null;
  return now + Math.min(FIRST_WAIT_MS * 2 ** (failures - FREE_TRIES), LONGEST_WAIT_MS);
}

export async function sealPin(pin: string, kdf: PinKdf = PIN_KDF): Promise<SealedPin> {
  if (!isPinShaped(pin)) throw new Error(`A PIN is ${PIN_LENGTH} digits.`);
  const salt = randomBytes(16);
  return { kdf, salt: toHex(salt), hash: toHex(await derive(pin, salt, kdf)) };
}

export async function pinMatches(pin: string, sealed: SealedPin): Promise<boolean> {
  const hash = await derive(pin, fromHex(sealed.salt), sealed.kdf);
  return timingSafeEqual(hash, fromHex(sealed.hash));
}

function derive(pin: string, salt: Uint8Array, { N, r, p, dkLen }: PinKdf): Promise<Uint8Array> {
  return scryptAsync(pin, salt, { N, r, p, dkLen });
}

export async function hasPin(): Promise<boolean> {
  return (await vaultGet(VaultKey.pin)) !== null;
}

export async function savePin(pin: string): Promise<void> {
  await vaultSet(VaultKey.pin, JSON.stringify(await sealPin(pin)));
  await vaultDelete(VaultKey.pinAttempts);
}

export async function deletePin(): Promise<void> {
  await vaultDelete(VaultKey.pin);
  await vaultDelete(VaultKey.pinAttempts);
}

/**
 * The try is counted before the PIN is hashed, so quitting the app while a
 * wrong PIN is being checked does not win another one.
 */
export async function checkPin(pin: string, now = Date.now()): Promise<PinCheck> {
  const sealed = await readSealed();
  const attempts = await readAttempts();
  if (now < attempts.lockedUntil) return { result: 'waiting', lockedUntil: attempts.lockedUntil };

  const failures = attempts.failures + 1;
  const lockedUntil = lockedUntilAfter(failures, now);
  await vaultSet(VaultKey.pinAttempts, JSON.stringify({ failures, lockedUntil: lockedUntil ?? 0 }));

  if (await pinMatches(pin, sealed)) {
    await vaultDelete(VaultKey.pinAttempts);
    return { result: 'correct' };
  }
  return { result: 'wrong', lockedUntil };
}

export async function pinLockedUntil(now = Date.now()): Promise<number | null> {
  const { lockedUntil } = await readAttempts();
  return now < lockedUntil ? lockedUntil : null;
}

async function readSealed(): Promise<SealedPin> {
  const stored = await vaultGet(VaultKey.pin);
  if (stored === null) throw new Error('No PIN is set.');
  const sealed: unknown = JSON.parse(stored);
  if (!isSealedPin(sealed)) throw new Error('The PIN record is unreadable.');
  return sealed;
}

async function readAttempts(): Promise<Attempts> {
  const stored = await vaultGet(VaultKey.pinAttempts);
  if (stored === null) return { failures: 0, lockedUntil: 0 };
  const attempts: unknown = JSON.parse(stored);
  if (!isAttempts(attempts)) throw new Error('The PIN attempt count is unreadable.');
  return attempts;
}
