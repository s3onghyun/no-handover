// Accusation scoring: three slots x 100, attempt multiplier, evidence bonus, hint cost.

import type { CaseFile, SlotDef, SlotId } from './types.ts';

export interface Submission {
  cause: string | null;
  sequence: string | null;
  responsibility: string[];
}

export interface SlotScore {
  correct: boolean;
  points: number;
}

export interface ScoreResult {
  slots: Record<SlotId, SlotScore>;
  allCorrect: boolean;
  base: number;
  multiplier: number;
  evidenceBonus: number;
  hintCost: number;
  total: number;
  max: number;
  /** Person ids blamed by wrong options (drives the colleague nudge). */
  blamed: string[];
}

export const ATTEMPT_MULTIPLIER = [1, 0.85, 0.7];
export const EVIDENCE_POINTS = 5;
export const EVIDENCE_CAP = 30;

function slot(cs: CaseFile, id: SlotId): SlotDef {
  const s = cs.accusation.slots.find((x) => x.id === id);
  if (!s) throw new Error(`case has no slot ${id}`);
  return s;
}

export function scoreSlot(def: SlotDef, picked: string | string[] | null): SlotScore & { blamed: string[] } {
  const ids = picked === null ? [] : Array.isArray(picked) ? picked : [picked];
  const chosen = def.options.filter((o) => ids.includes(o.id));
  const blamed = chosen.filter((o) => o.blames).map((o) => o.blames!);
  if (def.type === 'single') {
    const correct = chosen.length === 1 && !!chosen[0].correct;
    return { correct, points: correct ? 100 : 0, blamed };
  }
  const sum = chosen.reduce((a, o) => a + (o.weight ?? 0), 0);
  const negative = chosen.some((o) => (o.weight ?? 0) < 0);
  const maxW = def.options.reduce((a, o) => a + Math.max(0, o.weight ?? 0), 0) || 1;
  const points = Math.max(0, Math.round((sum / maxW) * 100));
  const correct = !negative && sum >= (def.pass ?? maxW);
  return { correct, points, blamed };
}

export function scoreSubmission(
  cs: CaseFile,
  sub: Submission,
  ctx: { attempt: number; pinnedKeyClues: number; hintCost: number },
): ScoreResult {
  const c = scoreSlot(slot(cs, 'cause'), sub.cause);
  const s = scoreSlot(slot(cs, 'sequence'), sub.sequence);
  const r = scoreSlot(slot(cs, 'responsibility'), sub.responsibility);
  const base = c.points + s.points + r.points;
  const multiplier = ATTEMPT_MULTIPLIER[Math.min(ctx.attempt, ATTEMPT_MULTIPLIER.length) - 1] ?? ATTEMPT_MULTIPLIER[ATTEMPT_MULTIPLIER.length - 1];
  const evidenceBonus = Math.min(EVIDENCE_CAP, ctx.pinnedKeyClues * EVIDENCE_POINTS);
  const total = Math.max(0, Math.round(base * multiplier) + evidenceBonus - ctx.hintCost);
  return {
    slots: { cause: c, sequence: s, responsibility: r },
    allCorrect: c.correct && s.correct && r.correct,
    base,
    multiplier,
    evidenceBonus,
    hintCost: ctx.hintCost,
    total,
    max: 300 + EVIDENCE_CAP,
    blamed: [...new Set([...c.blamed, ...s.blamed, ...r.blamed])],
  };
}

export function grade(total: number, max: number): string {
  const p = total / max;
  if (p >= 0.9) return 'S';
  if (p >= 0.75) return 'A';
  if (p >= 0.55) return 'B';
  if (p >= 0.35) return 'C';
  return 'D';
}
