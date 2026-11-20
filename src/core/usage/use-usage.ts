import { useEffect, useState } from "react";
import { currentFront, watchFront } from "./front";
import { createTracker } from "./tracker";

export function useUsage<S extends string>(screen: S | null, send: (screen: S) => void): void {
  const [tracker] = useState(() => createTracker(send));
  useEffect(() => {
    let live = true;
    const unwatch = watchFront((inFront) => tracker.front(inFront));
    void currentFront().then((inFront) => live && tracker.front(inFront));
    return () => {
      live = false;
      unwatch();
      tracker.stop();
    };
  }, [tracker]);
  useEffect(() => tracker.show(screen), [tracker, screen]);
}
