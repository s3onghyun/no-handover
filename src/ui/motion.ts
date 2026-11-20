// Shared motion helpers (owner-approved animation principle, 2026-11-20):
//  1. during the investigation only small diegetic motion — live graph points, an alert blink,
//     evidence snapping onto the board, messenger typing, notifications sliding in — each under
//     1 s and never blocking input;
//  2. big moments only at the case start (briefing), the decisive "aha" clue and the report result;
//  3. everything skippable; prefers-reduced-motion (or ?motion=0) shows the static end state.
// The CSS uses the same numbers as custom properties on :root (--motion-*, --dur-*).

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
  /** Small UI motion: toasts, coach marks. */
  micro: 160,
  short: 280,
  /** A big moment's card appearing. */
  base: 450,
} as const;

/** Real milliseconds between live graph refreshes (the in-game clock drives the new points). */
export const LIVE_TICK_MS = 1000;

let forced: boolean | null = null;

/** True when the player asked for less motion (OS setting, or ?motion=0 for facilitators and tests). */
export function reducedMotion(): boolean {
  if (forced !== null) return forced;
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Read ?motion=0|1 once and mirror the result on <html> (CSS uses html.reduce-motion). */
export function applyMotionPref(params: URLSearchParams): void {
  const p = params.get('motion');
  if (p === '0') forced = true;
  else if (p === '1') forced = false;
  const sync = () => document.documentElement.classList.toggle('reduce-motion', reducedMotion());
  sync();
  try {
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', sync);
  } catch {
    /* old browsers: the class stays as first computed */
  }
  for (const [k, v] of Object.entries(DUR)) document.documentElement.style.setProperty(`--dur-${k}`, `${v}ms`);
}

/** Restart a CSS animation class on an element (no-op under reduced motion). */
export function play(el: Element | null | undefined, cls: string, ms: number): void {
  if (!el || reducedMotion()) return;
  el.classList.remove(cls);
  void (el as HTMLElement).getBoundingClientRect();
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms + 50);
}

export interface Moment {
  el: HTMLElement;
  /** Resolves when the moment is gone (timed out or skipped). */
  done: Promise<void>;
  skip(): void;
}

/**
 * A big moment (aha clue, report result): a centred card that never takes input — pointer events
 * pass through, focus stays where it was — announced to screen readers, gone after `holdMs`, or at
 * once on Esc or any click. With reduced motion it appears without scaling and leaves sooner.
 */
export function showMoment(opts: { kind: 'aha' | 'result'; title: string; sub?: string; tone?: 'good' | 'plain'; holdMs?: number }): Moment {
  document.querySelector('.moment')?.remove();
  const reduce = reducedMotion();
  const el = document.createElement('div');
  el.className = `moment moment-${opts.kind}${opts.tone === 'good' ? ' good' : ''}${reduce ? ' still' : ''}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'assertive');
  const card = document.createElement('div');
  card.className = 'moment-card';
  const tag = document.createElement('div');
  tag.className = 'moment-tag';
  tag.textContent = opts.kind === 'aha' ? '💡' : '📝';
  const title = document.createElement('div');
  title.className = 'moment-title';
  title.textContent = opts.title;
  card.append(tag, title);
  if (opts.sub) {
    const sub = document.createElement('div');
    sub.className = 'moment-sub';
    sub.textContent = opts.sub;
    card.appendChild(sub);
  }
  el.appendChild(card);
  document.body.appendChild(el);
  let finish: () => void = () => {};
  const done = new Promise<void>((res) => (finish = res));
  let gone = false;
  const skip = () => {
    if (gone) return;
    gone = true;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', skip, true);
    clearTimeout(timer);
    el.classList.add('out');
    setTimeout(() => {
      el.remove();
      finish();
    }, reduce ? 0 : DUR.short);
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && skip();
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', skip, true); // the click still reaches what it was aimed at
  const timer = window.setTimeout(skip, reduce ? Math.min(opts.holdMs ?? 1600, 1200) : opts.holdMs ?? 1600);
  return { el, done, skip };
}
