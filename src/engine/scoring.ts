// Accusation scoring: 100 per report slot (the case decides which slots exist: case 0 has two,
// case 3 three), attempt multiplier, evidence bonus, hint cost. The hint cost is only passed in
// senior mode (`?senior=1`); otherwise hints are a record ("힌트 N회"), see src/engine/record.ts.

import { citeState, type CiteState, type PinLike } from './evidence.ts';
import type { CaseFile, SlotDef, SlotId } from './types.ts';

export interface Submission {
  cause: string | null;
  sequence: string | null;
  responsibility: string[];
  /** Pin ids cited as the evidence for each slot (slots with `evidence` kinds need one). */
  cites?: Partial<Record<SlotId, string[]>>;
}

export interface SlotScore {
  correct: boolean;
  points: number;
  /** The picked option(s) alone were right (before the citation check). */
  optionCorrect?: boolean;
  /** Citation check, for slots with evidence kinds: a correct slot needs 'ok'. */
  cite?: CiteState;
}

export interface ScoreResult {
  /** One entry per slot the case has (cause / sequence / responsibility). */
  slots: Partial<Record<SlotId, SlotScore>>;
  allCorrect: boolean;
  base: number;
  multiplier: number;
  evidenceBonus: number;
  hintCost: number;
  /** Hints used before this submission (record; added later, absent in old saves). */
  hints?: number;
  total: number;
  max: number;
  /** Person ids blamed by wrong options (drives the colleague nudge). */
  blamed: string[];
}

export const ATTEMPT_MULTIPLIER = [1, 0.85, 0.7];
export const EVIDENCE_POINTS = 5;
export const EVIDENCE_CAP = 30;

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

export function picked(sub: Submission, id: SlotId): string | string[] | null {
  return id === 'responsibility' ? sub.responsibility : sub[id];
}

/** True when every slot the case has is filled in. */
export function complete(cs: CaseFile, sub: Submission): boolean {
  return cs.accusation.slots.every((s) => {
    const v = picked(sub, s.id);
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
}

/** Slots with evidence kinds that have no cited pin yet (the report asks before submitting). */
export function missingCites(cs: CaseFile, sub: Submission, pins: PinLike[]): SlotId[] {
  return cs.accusation.slots.filter((s) => s.evidence?.length && citeState(s, sub.cites?.[s.id], pins) === 'missing').map((s) => s.id);
}

export function scoreSubmission(
  cs: CaseFile,
  sub: Submission,
  ctx: { attempt: number; pinnedKeyClues: number; hintCost: number; pins?: PinLike[] },
): ScoreResult {
  const slots: Partial<Record<SlotId, SlotScore>> = {};
  const blamed: string[] = [];
  let base = 0;
  let allCorrect = true;
  for (const def of cs.accusation.slots) {
    const r = scoreSlot(def, picked(sub, def.id));
    // a slot with evidence kinds counts only when a cited pin supports it
    const cite = def.evidence?.length ? citeState(def, sub.cites?.[def.id], ctx.pins ?? []) : undefined;
    const backed = cite === undefined || cite === 'ok';
    const s: SlotScore = { correct: r.correct && backed, points: backed ? r.points : 0, optionCorrect: r.correct };
    if (cite) s.cite = cite;
    slots[def.id] = s;
    base += s.points;
    allCorrect &&= s.correct;
    blamed.push(...r.blamed);
  }
  const multiplier = ATTEMPT_MULTIPLIER[Math.min(ctx.attempt, ATTEMPT_MULTIPLIER.length) - 1] ?? ATTEMPT_MULTIPLIER[ATTEMPT_MULTIPLIER.length - 1];
  const evidenceBonus = Math.min(EVIDENCE_CAP, ctx.pinnedKeyClues * EVIDENCE_POINTS);
  const total = Math.max(0, Math.round(base * multiplier) + evidenceBonus - ctx.hintCost);
  return {
    slots,
    allCorrect,
    base,
    multiplier,
    evidenceBonus,
    hintCost: ctx.hintCost,
    total,
    max: 100 * cs.accusation.slots.length + EVIDENCE_CAP,
    blamed: [...new Set(blamed)],
  };
}

/** Default reply texts (the UI passes its own string table's). */
export const REPLY_DEFAULTS = {
  partial: '{total}칸 중 {n}칸이 사실과 맞지 않습니다. 다시 확인해 주십시오.',
  bundled: '보고서 어딘가가 사실과 맞지 않습니다. 어느 부분인지는 직접 다시 확인해 주십시오.',
  cite: '근거가 그 칸을 뒷받침하지 않습니다: {slots}. 증거 보드의 "보고서 근거"에서 어떤 증거가 인정되는지 확인해 주십시오.',
};

/** Short slot name for replies and the debrief: '원인 (기술)' -> '원인'. */
export function slotName(def: SlotDef): string {
  return def.title.replace(/\s*\(.*\)$/, '');
}

/**
 * The citation line of a reply: which slots' cited pins do not support them. Citations are about
 * evidence, not answers, so even the bundled reply names the slot (it never says whether the
 * picked option was right).
 */
export function citeReply(cs: CaseFile, score: ScoreResult, template: string = REPLY_DEFAULTS.cite): string | null {
  const bad = cs.accusation.slots.filter((s) => score.slots[s.id]?.cite && score.slots[s.id]!.cite !== 'ok');
  return bad.length ? template.replace('{slots}', bad.map(slotName).join(', ')) : null;
}

/** How a wrong report is answered: 'bundled' (default) never says which slot or how many. */
export function feedbackMode(cs: CaseFile): 'bundled' | 'per-slot' {
  return cs.accusation.feedback ?? 'bundled';
}

/** The reply body after a wrong (not finished) report. */
export function wrongReply(cs: CaseFile, score: ScoreResult, defaults: { partial: string; bundled: string; cite?: string } = REPLY_DEFAULTS): string {
  const rp = cs.accusation.reply;
  const cite = citeReply(cs, score, defaults.cite ?? REPLY_DEFAULTS.cite);
  let body: string;
  if (feedbackMode(cs) === 'bundled') body = rp?.bundled ?? defaults.bundled;
  else {
    const total = cs.accusation.slots.length;
    const wrong = cs.accusation.slots.filter((x) => !score.slots[x.id]?.correct).length;
    body = (rp?.partial ?? defaults.partial).replace('{n}', String(wrong)).replace('{total}', String(total));
  }
  return cite ? `${body}\n${cite}` : body;
}

export function grade(total: number, max: number): string {
  const p = total / max;
  if (p >= 0.9) return 'S';
  if (p >= 0.75) return 'A';
  if (p >= 0.55) return 'B';
  if (p >= 0.35) return 'C';
  return 'D';
}
