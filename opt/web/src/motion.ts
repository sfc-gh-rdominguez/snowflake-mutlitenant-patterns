import type { TargetAndTransition, Transition, Variants } from "motion/react";

// Shared motion, borrowed from kizn: one easing curve, a few springs, and a
// Stage that assembles the page in reading order. <MotionConfig
// reducedMotion="user"> in main.tsx honours the OS setting.

export const EASE = [0.2, 0, 0, 1] as const;
export const FAST: Transition = { duration: 0.12, ease: EASE };
export const BASE: Transition = { duration: 0.18, ease: EASE };

/** Lands with a little overshoot. */
export const SPRING: Transition = { type: "spring", stiffness: 340, damping: 26, mass: 0.9 };
/** Small things that pop: badges, dots, the primary button. */
export const BOUNCY: Transition = { type: "spring", stiffness: 520, damping: 17, mass: 0.7 };
/** Large surfaces: the toast. */
export const GLIDE: Transition = { type: "spring", stiffness: 220, damping: 28 };

/** A parent that staggers its children in, and out in reverse. */
export function stage(stagger = 0.07, delay = 0.04): Variants {
  return {
    hidden: {},
    shown: { transition: { staggerChildren: stagger, delayChildren: delay } },
    gone: { transition: { staggerChildren: 0.025, staggerDirection: -1 } },
  };
}

/** A piece of the page arriving: up, unblurring, settling. */
export const pop: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.97, filter: "blur(6px)" },
  shown: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: SPRING },
  gone: { opacity: 0, y: -6, scale: 0.98, filter: "blur(3px)", transition: FAST },
};

/** Content that arrives in place after the page is up: rows, facts. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 6 },
  shown: { opacity: 1, y: 0, transition: BASE },
  gone: { opacity: 0, y: 4, transition: FAST },
};

/** A value swapping for another: out up, in from below. */
export const swap: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: SPRING },
  gone: { opacity: 0, y: -8, transition: FAST },
};

/** Badges and dots popping into place. */
export const bead: Variants = {
  hidden: { opacity: 0, scale: 0 },
  shown: { opacity: 1, scale: 1, transition: BOUNCY },
  gone: { opacity: 0, scale: 0.4, transition: FAST },
};

/** The primary button: arrives last, with a little bounce. */
export const button: Variants = {
  hidden: { opacity: 0, scale: 0.85, y: 6 },
  shown: { opacity: 1, scale: 1, y: 0, transition: BOUNCY },
  gone: { opacity: 0, scale: 0.95, transition: FAST },
};

export const presence = { initial: "hidden", animate: "shown", exit: "gone" } as const;

/** A small yes (the test event is queryable). */
export const nod: TargetAndTransition = { scale: [1, 1.04, 1], transition: { duration: 0.36, ease: EASE } };
/** A gentle no (it timed out). */
export const shake: TargetAndTransition = { x: [0, -5, 5, -3, 3, 0], transition: { duration: 0.42, ease: EASE } };
