import { useEffect, useState } from 'react';

/** Milliseconds left until `until`, ticking each second; 0 once it has passed or when there is none. */
export function useWaitLeft(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until === null) return;
    const tick = () => {
      setNow(Date.now());
      if (Date.now() >= until) clearInterval(timer);
    };
    const timer = setInterval(tick, 1000);
    tick();
    return () => clearInterval(timer);
  }, [until]);

  return until === null ? 0 : Math.max(0, until - now);
}

export function describeWait(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

export function waitMessage(ms: number): string {
  return `Too many wrong PINs. Try again in ${describeWait(ms)}.`;
}
