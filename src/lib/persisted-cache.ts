export interface CacheStorage {
  get<T>(name: string): Promise<T | null>;
  set<T>(name: string, value: T): Promise<void>;
}

interface PersistedCacheOptions {
  name: string;
  limit: number;
  ttlMs: number;
  /** How long a `null` answer is kept. */
  missTtlMs: number;
}

type Entry<T> = { value: T; at: number };

const FLUSH_DELAY_MS = 500;

/** Answers kept in memory and saved under one storage name. A fetch that throws is not kept. */
export function persistedCache<T>({ name, limit, ttlMs, missTtlMs }: PersistedCacheOptions) {
  let storage: CacheStorage | null = null;
  let entries = new Map<string, Entry<T>>();
  const pending = new Map<string, Promise<T>>();
  let flush: ReturnType<typeof setTimeout> | null = null;

  const fresh = (entry: Entry<T>) =>
    entry.at > Date.now() - (entry.value === null ? missTtlMs : ttlMs);

  function persist(): void {
    flush = null;
    const target = storage;
    if (!target) return;
    target.set(name, Object.fromEntries(entries)).catch((error) => {
      console.warn(`[cache] could not save ${name}`, error);
    });
  }

  function saveSoon(): void {
    if (!storage) return;
    if (flush) clearTimeout(flush);
    flush = setTimeout(persist, FLUSH_DELAY_MS);
  }

  function remember(key: string, value: T): void {
    entries.delete(key);
    entries.set(key, { value, at: Date.now() });
    while (entries.size > limit) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
    saveSoon();
  }

  return {
    async hydrate(target: CacheStorage): Promise<void> {
      storage = target;
      entries = new Map();
      pending.clear();
      const saved = await target.get<Record<string, Entry<T>>>(name).catch(() => null);
      if (storage !== target) return;
      for (const [key, entry] of Object.entries(saved ?? {})) {
        if (fresh(entry)) entries.set(key, entry);
      }
    },

    clear(): void {
      storage = null;
      entries = new Map();
      pending.clear();
      if (flush) clearTimeout(flush);
      flush = null;
    },

    /** `undefined` when there is no fresh answer. */
    peek(key: string): Readonly<T> | undefined {
      const known = entries.get(key);
      return known && fresh(known) ? known.value : undefined;
    },

    forget(key: string): void {
      pending.delete(key);
      if (entries.delete(key)) saveSoon();
    },

    /** One request per key; its answer is dropped if the key was forgotten or the cache cleared meanwhile. */
    load(key: string, fetch: () => Promise<T>): Promise<Readonly<T>> {
      const known = entries.get(key);
      if (known && fresh(known)) return Promise.resolve(known.value);

      const inFlight = pending.get(key);
      if (inFlight) return inFlight;

      const request: Promise<T> = fetch().then(
        (value) => {
          if (pending.get(key) === request) {
            pending.delete(key);
            remember(key, value);
          }
          return value;
        },
        (error: unknown) => {
          if (pending.get(key) === request) pending.delete(key);
          throw error;
        }
      );
      pending.set(key, request);
      return request;
    },
  };
}
