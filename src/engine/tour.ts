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

/** Ids of marks that hid on their own timer before the player read them (no-handover:tour-missed). */
export function parseMissed(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? [...new Set(v.map(String))] : [];
  } catch {
    return [];
  }
}

/** The tool guide's order: marks the player missed first (in the order they hid), then the rest in data order. */
export function guideOrder<T extends { id: string }>(steps: T[], missed: string[]): T[] {
  const m = missed.filter((id) => steps.some((s) => s.id === id));
  return [...m.map((id) => steps.find((s) => s.id === id)!), ...steps.filter((s) => !m.includes(s.id))];
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

/**
 * "n/N" on a mark: n counts this case's marks already shown, plus this one, so the marks read 1, 2,
 * 3… in the order they appear (data order read 8/8 before 6/8 when the report unlocked first).
 */
export function tourNumber(steps: TourStep[], st: TourState): string {
  return `${steps.filter((x) => st.seen.includes(x.id)).length + 1}/${steps.length}`;
}
