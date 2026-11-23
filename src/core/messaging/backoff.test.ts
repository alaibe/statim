import { Backoff } from "./backoff";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("Backoff", () => {
  it("lengthens the wait up to five minutes", () => {
    const backoff = new Backoff();
    expect([1, 2, 3, 4, 5].map(() => backoff.next())).toEqual([5_000, 15_000, 60_000, 300_000, 300_000]);
  });

  it("keeps lengthening when the link comes up only briefly", () => {
    const backoff = new Backoff();
    backoff.next();
    backoff.up();
    jest.advanceTimersByTime(59_000);
    expect(backoff.next()).toBe(15_000);
  });

  it("starts over once the link has stayed up a minute", () => {
    const backoff = new Backoff();
    backoff.next();
    backoff.next();
    backoff.up();
    jest.advanceTimersByTime(60_000);
    expect(backoff.next(0)).toBe(0);
    expect(backoff.next(0)).toBe(15_000);
  });
});
