import {
  Easing,
  FadeIn,
  FadeOut,
  Keyframe,
  LinearTransition,
  ReduceMotion,
  SlideInLeft,
  SlideInRight,
  type WithSpringConfig,
} from "react-native-reanimated";

import { Durations, Ease } from "./tokens";

const R = ReduceMotion.System;

/** The design system's durations: hover and press, menus and rows, dialogs and panels, pages and toasts. */
export const Duration = {
  instant: Durations.instant,
  fast: Durations.fast,
  base: Durations.base,
  slow: Durations.slow,
  blink: Durations.blink,
} as const;

export const EASE_OUT = Easing.bezier(...Ease.out);
export const EASE_IN_OUT = Easing.bezier(...Ease["in-out"]);
export const EASE_SNAP = Easing.bezier(...Ease.snap);

/** Springs only follow a finger: a swipe lets go where the gesture left it. */
export const Spring = {
  press: {
    damping: 28,
    stiffness: 320,
    mass: 0.6,
    overshootClamping: true,
    reduceMotion: R,
  } satisfies WithSpringConfig,
} as const;

export function springLayout() {
  return LinearTransition.duration(Duration.fast).easing(EASE_OUT).reduceMotion(R);
}

/** Things scale from 98% and fade, never slide or bounce. */
function scaleIn(duration: number, delay: number) {
  return new Keyframe({
    0: { opacity: 0, transform: [{ scale: 0.98 }] },
    100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE_OUT },
  })
    .duration(duration)
    .delay(delay)
    .reduceMotion(R);
}

export const Enter = {
  content: (delay = 0) => scaleIn(Duration.base, delay),

  fade: (delay = 0) => FadeIn.duration(Duration.base).easing(EASE_OUT).delay(delay).reduceMotion(R),

  /** A toast, from its corner. */
  fromBottom: () => scaleIn(Duration.slow, 0),

  fromRight: () => SlideInRight.duration(Duration.slow).easing(EASE_OUT).reduceMotion(R),

  fromLeft: () => SlideInLeft.duration(Duration.slow).easing(EASE_OUT).reduceMotion(R),
} as const;

export const Exit = {
  fade: () => FadeOut.duration(Duration.fast).reduceMotion(R),
} as const;

export function stagger(index: number, step = 16, max = 120) {
  return Math.min(index * step, max);
}
