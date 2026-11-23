const DELAYS_MS = [5_000, 15_000, 60_000, 300_000];

/** How long a link must stay up before its next drop waits the first delay again. */
const STEADY_MS = 60_000;

/** The waits between tries to reach a protocol, which lengthen while the link keeps failing. */
export class Backoff {
  private tries = 0;
  private upSince: number | null = null;

  /** The wait before the next try, where a first try waits `first`. */
  next(first = DELAYS_MS[0]): number {
    if (this.upSince !== null && Date.now() - this.upSince >= STEADY_MS) this.tries = 0;
    this.upSince = null;
    const tries = this.tries;
    this.tries = Math.min(tries + 1, DELAYS_MS.length);
    return tries === 0 ? first : DELAYS_MS[Math.min(tries, DELAYS_MS.length - 1)];
  }

  up(): void {
    this.upSince ??= Date.now();
  }
}
