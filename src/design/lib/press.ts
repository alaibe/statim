import { useRef, useState } from 'react';

import { reportError } from '@/core/app/report-error';

export type PressHandler = () => void | Promise<unknown>;

function isPromise(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

export function runPress(onPress: PressHandler): Promise<void> | undefined {
  const result = onPress();
  if (!isPromise(result)) return undefined;
  return Promise.resolve(result).then(() => {}, reportError);
}

export function usePress(onPress: PressHandler | undefined) {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const press = () => {
    if (!onPress || inFlight.current) return;
    const settled = runPress(onPress);
    if (!settled) return;
    inFlight.current = true;
    setPending(true);
    void settled.then(() => {
      inFlight.current = false;
      setPending(false);
    });
  };

  return { pending, press: onPress ? press : undefined };
}
