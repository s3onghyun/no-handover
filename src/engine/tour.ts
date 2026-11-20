// Guided tool tour (coach marks): which step to show next. Pure, so the rules are testable
// without a browser; src/ui/tour.ts draws the marks and keeps the seen state in localStorage.

import type { TourStep } from './types.ts';

export interface TourState {
  /** Step ids already shown (dismissed). */
  seen: string[];
  /** "투어 건너뛰기": no more steps in this case. */
  skipped: boolean;
}

export function parseTourState(raw: string | null | undefined): TourState {
  try {
    const p = JSON.parse(raw ?? 'null') as Partial<TourState> | null;
    return { seen: Array.isArray(p?.seen) ? p.seen.map(String) : [], skipped: p?.skipped === true };
  } catch {
    return { seen: [], skipped: false };
  }
}

export interface TourEnv {
  /** Objective ticked (or the checklist folded). */
  done(objectiveId: string): boolean;
  playMin: number;
  /** The step's anchor (window, icon or tray control) is on screen. */
  visible(app: string): boolean;
}

/** The first unseen step whose conditions hold, in data order; null when none is due. */
export function nextTourStep(steps: TourStep[], st: TourState, env: TourEnv): TourStep | null {
  if (st.skipped) return null;
  for (const s of steps) {
    if (st.seen.includes(s.id)) continue;
    if (s.after && !env.done(s.after)) continue;
    if (s.afterMin !== undefined && env.playMin < s.afterMin) continue;
    if (!env.visible(s.app)) continue;
    return s;
  }
  return null;
}
