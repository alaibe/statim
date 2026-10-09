import { useEffect, useEffectEvent, useState } from 'react';

interface Loaded<T> {
  key: string;
  value?: T;
  error?: unknown;
}

/**
 * What `load` returned for `key`, or the error it threw. A result that arrives
 * after the key changed is dropped; `version` reloads the same key.
 */
export function useKeyedLoad<T, K extends string = string>(
  key: K | null,
  load: (key: K, signal: AbortSignal) => Promise<T>,
  version?: unknown
) {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const run = useEffectEvent(load);

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    run(key, controller.signal).then(
      (value) => !controller.signal.aborted && setLoaded({ key, value }),
      (error: unknown) => !controller.signal.aborted && setLoaded({ key, error })
    );
    return () => controller.abort();
  }, [key, version]);

  const current = key !== null && loaded?.key === key ? loaded : undefined;
  return {
    value: current?.value,
    error: current?.error,
    loading: key !== null && current === undefined,
    update(change: (value: T) => T) {
      setLoaded((state) =>
        state && state.key === key && state.value !== undefined
          ? { ...state, value: change(state.value) }
          : state
      );
    },
  };
}
