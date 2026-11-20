// Shared motion helpers: duration tokens and the reduced-motion check. Investigation-time
// motion is diegetic and small (live graph points, an alert blink, evidence snapping onto the
// board): every animation is shorter than a second, never blocks input, and is skipped when the
// player asks the system for reduced motion (the static end state is shown instead).
// The CSS uses the same numbers as custom properties on :root (--motion-*).

/** Durations in ms; each stays under 1 s. */
export const DUR = {
  /** Evidence row/marker snapping onto the board or timeline. */
  snap: 380,
  /** Threshold line / critical stat blink (two pulses). */
  blink: 800,
  /** A new live point arriving on a graph. */
  tail: 600,
  /** Jump-to-row highlight after clicking a timeline marker. */
  flash: 900,
} as const;

/** Real milliseconds between live graph refreshes (the in-game clock drives the new points). */
export const LIVE_TICK_MS = 1000;

export function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Restart a CSS animation class on an element (no-op under reduced motion). */
export function play(el: Element | null | undefined, cls: string, ms: number): void {
  if (!el || reducedMotion()) return;
  el.classList.remove(cls);
  void (el as HTMLElement).getBoundingClientRect();
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms + 50);
}
