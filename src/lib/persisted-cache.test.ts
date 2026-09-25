import { persistedCache } from './persisted-cache';

const options = { name: 'things', limit: 2, ttlMs: 60_000, missTtlMs: 1_000 };

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('persistedCache', () => {
  it('does not keep a failure', async () => {
    const cache = persistedCache<string | null>(options);
    const fetch = jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue('up');

    await expect(cache.load('k', fetch)).rejects.toThrow('down');
    expect(cache.peek('k')).toBeUndefined();
    expect(await cache.load('k', fetch)).toBe('up');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('asks again after forget, and drops an answer that was in flight when it was forgotten', async () => {
    const cache = persistedCache<string | null>(options);
    let resolve: (value: string) => void = () => {};
    const stale = cache.load('k', () => new Promise((r) => (resolve = r)));

    cache.forget('k');
    resolve('old');
    expect(await stale).toBe('old');
    expect(cache.peek('k')).toBeUndefined();

    expect(await cache.load('k', async () => 'new')).toBe('new');
    expect(cache.peek('k')).toBe('new');
  });

  it('keeps only the newest entries', async () => {
    const cache = persistedCache<string>(options);
    for (const key of ['a', 'b', 'c']) await cache.load(key, async () => key);

    expect(cache.peek('a')).toBeUndefined();
    expect(cache.peek('b')).toBe('b');
    expect(cache.peek('c')).toBe('c');
  });
});
