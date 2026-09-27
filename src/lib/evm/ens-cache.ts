import { persistedCache, type CacheStorage } from '../persisted-cache';

export interface StoredEnsProfile {
  name: string;
  avatar: string | null;
  description: string | null;
  url: string | null;
  /** Milliseconds, so the entry survives JSON. */
  paidUntil: number | null;
}

// A record edited on ENS shows within a day; a name claimed after a miss, within minutes.
const LIFETIME = { limit: 300, ttlMs: 24 * 60 * 60 * 1000, missTtlMs: 10 * 60 * 1000 };

export const ensNames = persistedCache<string | null>({ name: 'ens-names', ...LIFETIME });
export const ensProfiles = persistedCache<StoredEnsProfile | null>({
  name: 'ens-profiles',
  ...LIFETIME,
});

export async function hydrateEnsCache(storage: CacheStorage): Promise<void> {
  await Promise.all([ensNames.hydrate(storage), ensProfiles.hydrate(storage)]);
}

export function clearEnsCache(): void {
  ensNames.clear();
  ensProfiles.clear();
}

/** Before the owner goes to change the name, so the next look asks the chain. */
export function forgetEns(address: string): void {
  ensNames.forget(address.toLowerCase());
  ensProfiles.forget(address.toLowerCase());
}
