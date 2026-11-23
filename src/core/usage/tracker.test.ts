import { AWAY_MS, type Clock, createTracker, SETTLE_MS } from "./tracker";

// T01–T11 of the suite shared with Kestrel and Grenier, on a hand-moved clock so Vitest and Jest agree.

interface ManualClock extends Clock {
  /** Moves to `at`, running each timer that falls due on the way, in order. Moving back runs nothing. */
  to(at: number): void;
}

function manualClock(): ManualClock {
  let time = 0;
  let timers: { at: number; run: () => void }[] = [];
  const next = (at: number) => timers.filter((timer) => timer.at <= at).sort((a, b) => a.at - b.at)[0];
  return {
    now: () => time,
    after(ms, run) {
      const timer = { at: time + ms, run };
      timers.push(timer);
      return () => {
        timers = timers.filter((other) => other !== timer);
      };
    },
    to(at) {
      for (let due = next(at); due !== undefined; due = next(at)) {
        const running = due;
        timers = timers.filter((timer) => timer !== running);
        time = running.at;
        running.run();
      }
      time = at;
    },
  };
}

/** A tracker on a manual clock at 0, already in front unless told otherwise, and the screens it has sent. */
function track(inFront = true) {
  const clock = manualClock();
  const sent: string[] = [];
  const tracker = createTracker<string>((screen) => {
    sent.push(screen);
  }, clock);
  if (inFront) tracker.front(true);
  return { clock, sent, tracker };
}

describe("the usage tracker", () => {
  it("T01 a screen is sent once it has settled", () => {
    const { clock, sent, tracker } = track();
    tracker.show("A");
    clock.to(SETTLE_MS - 1);
    expect(sent).toEqual([]);
    clock.to(SETTLE_MS);
    expect(sent).toEqual(["A"]);
  });

  it("T02 a screen left sooner is not sent", () => {
    const { clock, sent, tracker } = track();
    tracker.show("A");
    clock.to(500);
    tracker.show("B");
    clock.to(500 + SETTLE_MS - 1);
    expect(sent).toEqual([]);
    clock.to(500 + SETTLE_MS);
    expect(sent).toEqual(["B"]);
  });

  it("T03 never the same screen twice in a row", () => {
    const { clock, sent, tracker } = track();
    for (const screen of ["A", "A", "B", "A"]) {
      tracker.show(screen);
      clock.to(clock.now() + SETTLE_MS);
    }
    expect(sent).toEqual(["A", "B", "A"]);
  });

  it("T04 null sends nothing and cancels a pending screen", () => {
    const { clock, sent, tracker } = track();
    tracker.show(null);
    clock.to(SETTLE_MS);
    tracker.show("A");
    clock.to(SETTLE_MS + 500);
    tracker.show(null);
    clock.to(10 * SETTLE_MS);
    expect(sent).toEqual([]);
  });

  it("T05 nothing until the app is in front; then the screen", () => {
    const { clock, sent, tracker } = track(false);
    tracker.show("A");
    clock.to(5 * SETTLE_MS);
    expect(sent).toEqual([]);
    tracker.front(true);
    clock.to(6 * SETTLE_MS);
    expect(sent).toEqual(["A"]);
    tracker.show("B");
    clock.to(6 * SETTLE_MS + 500);
    tracker.front(false);
    tracker.show("C");
    clock.to(20 * SETTLE_MS);
    expect(sent).toEqual(["A"]);
  });

  it("T06 the same screen again after 30 minutes away", () => {
    const { clock, sent, tracker } = track();
    tracker.show("A");
    clock.to(SETTLE_MS);
    const left = clock.now();
    tracker.front(false);
    clock.to(left + AWAY_MS - 1);
    tracker.front(true);
    clock.to(clock.now() + SETTLE_MS);
    expect(sent).toEqual(["A"]);

    const leftAgain = clock.now();
    tracker.front(false);
    clock.to(leftAgain + 10 * 60_000);
    tracker.front(false);
    clock.to(leftAgain + AWAY_MS);
    tracker.front(true);
    clock.to(clock.now() + SETTLE_MS);
    expect(sent).toEqual(["A", "A"]);
  });

  it("T07 a clock that went back is not away", () => {
    const { clock, sent, tracker } = track();
    tracker.show("A");
    clock.to(SETTLE_MS);
    tracker.front(false);
    clock.to(clock.now() - 2 * AWAY_MS);
    tracker.front(true);
    clock.to(clock.now() + SETTLE_MS);
    expect(sent).toEqual(["A"]);
  });

  it("T08 coming to the front without having left sends nothing", () => {
    const { clock, sent, tracker } = track();
    tracker.show("A");
    clock.to(SETTLE_MS);
    clock.to(2 * AWAY_MS);
    tracker.front(true);
    clock.to(clock.now() + SETTLE_MS);
    expect(sent).toEqual(["A"]);
  });

  it("T09 stop cancels a pending send", () => {
    const { clock, sent, tracker } = track();
    tracker.show("A");
    clock.to(500);
    tracker.stop();
    clock.to(10 * SETTLE_MS);
    expect(sent).toEqual([]);
  });

  it("T10 showing the screen already shown doesn't restart the settle", () => {
    const { clock, sent, tracker } = track();
    tracker.show("A");
    clock.to(600);
    tracker.show("A");
    clock.to(SETTLE_MS - 1);
    expect(sent).toEqual([]);
    clock.to(SETTLE_MS);
    expect(sent).toEqual(["A"]);
  });

  it("T11 after stop, showing the same screen sends it", () => {
    const { clock, sent, tracker } = track();
    tracker.show("A");
    tracker.stop();
    tracker.show("A");
    clock.to(SETTLE_MS);
    expect(sent).toEqual(["A"]);
  });
});
