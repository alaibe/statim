import { formatListTime } from "./list-time";

const now = new Date(2026, 10, 25, 14, 0, 0).getTime();

describe("formatListTime", () => {
  it("counts seconds, minutes and hours", () => {
    expect(formatListTime(now - 12_000, now)).toBe("12s");
    expect(formatListTime(now - 4 * 60_000, now)).toBe("4m");
    expect(formatListTime(now - 3 * 3_600_000, now)).toBe("3h");
  });

  it("names the weekday within a week", () => {
    expect(formatListTime(now - 3 * 86_400_000, now)).toMatch(/^[A-Za-z]{2,4}\.?$/);
  });

  it("gives the day and month after a week", () => {
    expect(formatListTime(new Date(2026, 9, 24, 9).getTime(), now)).toBe("24 Oct");
  });

  it("reads a time a clock skew puts in the future as now", () => {
    expect(formatListTime(now + 5_000, now)).toBe("0s");
  });
});
