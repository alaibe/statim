// When a screen is counted: once it has stayed SETTLE_MS in front, never twice in a row, and again after AWAY_MS
// away. The same file in Kestrel, Grenier and Statim: change all three together.

export const SETTLE_MS = 1_000;
export const AWAY_MS = 30 * 60_000;

export interface Clock {
  now(): number;
  after(ms: number, run: () => void): () => void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

export interface Tracker<S extends string> {
  /** The screen in front, or null while nothing may be counted (not set up, locked). */
  show(screen: S | null): void;
  /** The app came to the front, or went behind another app or out of sight. */
  front(inFront: boolean): void;
  stop(): void;
}

export function createTracker<S extends string>(send: (screen: S) => void, clock: Clock = systemClock): Tracker<S> {
  let shown: S | null = null;
  let sent: S | null = null;
  let awaySince: number | null = clock.now();
  let cancel: (() => void) | null = null;

  function schedule(): void {
    cancel?.();
    cancel = null;
    const screen = shown;
    if (screen === null || awaySince !== null || screen === sent) return;
    cancel = clock.after(SETTLE_MS, () => {
      cancel = null;
      sent = screen;
      send(screen);
    });
  }

  return {
    show(screen) {
      if (screen === shown && cancel !== null) return;
      shown = screen;
      schedule();
    },
    front(inFront) {
      if (!inFront) {
        awaySince ??= clock.now();
        schedule();
        return;
      }
      if (awaySince === null) return;
      if (clock.now() - awaySince >= AWAY_MS) sent = null;
      awaySince = null;
      schedule();
    },
    stop() {
      cancel?.();
      cancel = null;
    },
  };
}
