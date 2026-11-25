const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** A list's time, relative and short as content/voice.md asks: `12s`, `4m`, `3h`, `Tue`, `24 Nov`. */
export function formatListTime(ms: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - ms);
  if (elapsed < MINUTE) return `${Math.floor(elapsed / 1000)}s`;
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 7 * DAY) return WEEKDAY.format(ms);
  return DAY_MONTH.format(ms);
}

/** The exact time, for a hover or a screen reader. */
export function exactTime(ms: number): string {
  return new Date(ms).toLocaleString();
}
