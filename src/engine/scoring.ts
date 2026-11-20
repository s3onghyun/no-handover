// Accusation scoring: 100 per report slot (the case decides which slots exist: case 0 has two,
// case 3 three), attempt multiplier, evidence bonus, hint cost. The hint cost is only passed in
// 숙련자 모드 (`?senior=1`, src/engine/expert.ts), which in Cases 0–2 also takes off play time over
// par; otherwise hints are a record ("힌트 N회"), see src/engine/record.ts.

import { citeState, kindsFor, type CiteState, type PinLike } from './evidence.ts';
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
  /** 숙련자 모드 (Cases 0–2): points off for play time over par; absent otherwise. */
  timeCost?: number;
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
  ctx: { attempt: number; pinnedKeyClues: number; hintCost: number; pins?: PinLike[]; timeCost?: number },
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
  const total = Math.max(0, Math.round(base * multiplier) + evidenceBonus - ctx.hintCost - (ctx.timeCost ?? 0));
  const timed = ctx.timeCost === undefined ? {} : { timeCost: ctx.timeCost };
  return {
    ...timed,
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

/** Short slot name for replies and the debrief: '원인 (기술)' -> '원인'. */
export function slotName(def: SlotDef): string {
  return def.title.replace(/\s*\(.*\)$/, '');
}

/** How a wrong report is answered: per-field ✓/✗ always; 'hints' adds what does not fit, per field. */
export function feedbackMode(cs: CaseFile): 'marks' | 'hints' {
  return cs.accusation.feedback ?? 'marks';
}

export interface FieldMark {
  slot: SlotId;
  name: string;
  ok: boolean;
}

/** Per report field: ✓ (option right and, where kinds exist, a cited pin backs it) or ✗. */
export function fieldMarks(cs: CaseFile, score: ScoreResult): FieldMark[] {
  return cs.accusation.slots.map((s) => ({ slot: s.id, name: slotName(s), ok: !!score.slots[s.id]?.correct }));
}

/** The line under the marks ('marks' mode) when the case gives none (the CTO's voice, Case 3). */
export const MARK_LINES = [
  '✗ 표시된 칸이 사실과 맞지 않습니다. 다시 확인해 주십시오.',
  '✗ 칸을 다시 봐 주십시오. ✓ 칸은 그대로 두셔도 됩니다.',
  '아직 ✗ 칸이 남았습니다. 근거를 다시 대조해 주십시오.',
];

/**
 * 'hints' mode: what the colleague says per field. `{f}` = the field's short name, `{k}` = an
 * evidence kind of that field with no pin on the board yet. Variants go round per attempt (and
 * per field), so the same wrong report never hears the same line twice in a row. They name the
 * field and the kind of record, never an option.
 */
export const FIELD_LINES = {
  ok: ['{f} 칸은 맞아요.', '{f} 칸은 됐어요. 그대로 두세요.', '{f} 칸은 괜찮아요.'],
  cite: ['{f} 칸은 고른 핀이 그 칸 근거가 아니에요.', '{f} 칸, 근거로 고른 핀이 그 칸 얘기가 아니에요.'],
  cause: ['{f} 칸이 기록이랑 안 맞아요. 그 설명으로는 설명 안 되는 줄이 남아요.', '{f} 칸은 아직이에요. 핀한 줄을 그 설명에 하나씩 대 봐요.', '{f} 칸, 그렇게 보기엔 기록이 다른 말을 해요.'],
  sequence: ['{f} 칸은 순서나 시각이 기록이랑 안 맞아요.', '{f} 칸, 언제 시작됐는지부터 시각을 다시 맞춰 봐요.', '{f} 칸은 아직이에요. 기록에 찍힌 시각을 순서대로 놓아 봐요.'],
  extra: ['{f} 칸에 기록으로 뒷받침 안 되는 항목이 섞여 있어요.', '{f} 칸, 사실과 다른 게 하나 들어가 있어요.'],
  short: ['{f} 칸에 빠진 게 있어요.', '{f} 칸, 기록에 남은 요인이 더 있어요.'],
  kind: ["'{k}' 쪽은 아직 안 봤죠?", "'{k}' 쪽도 한번 봐요.", "'{k}' 쪽에서 맞춰 볼 게 있을 거예요."],
  close: ['다시요.', '고쳐서 다시 줘요.', '한 번 더요.'],
};

const pick = (xs: string[], i: number): string => xs[((i % xs.length) + xs.length) % xs.length];

/**
 * The reply body after a wrong (not finished) report. `attempt` is the submission number (1 =
 * first); `pins` the board, for the 'hints' pointer to an evidence kind nobody pinned yet.
 */
export function wrongReply(cs: CaseFile, score: ScoreResult, sub: Submission, opts: { attempt: number; pins?: PinLike[] }): string {
  const turn = opts.attempt - 1;
  if (feedbackMode(cs) === 'marks') return pick(cs.accusation.reply?.lines ?? MARK_LINES, turn);
  const out: string[] = [];
  cs.accusation.slots.forEach((def, i) => {
    const s = score.slots[def.id];
    const f = (xs: string[]) => pick(xs, turn + i).replace('{f}', slotName(def));
    if (s?.correct) {
      out.push(f(FIELD_LINES.ok));
      return;
    }
    let line: string;
    if (s?.optionCorrect) line = f(FIELD_LINES.cite);
    else if (def.type === 'multi') {
      const ids = sub.responsibility;
      const chosen = def.options.filter((o) => ids.includes(o.id));
      const extra = chosen.some((o) => (o.weight ?? 0) < 0);
      line = f(extra ? FIELD_LINES.extra : FIELD_LINES.short);
    } else line = f(def.id === 'sequence' ? FIELD_LINES.sequence : FIELD_LINES.cause);
    const open = kindsFor(def, opts.pins ?? []).find((k) => !k.pins.length);
    if (open && !s?.optionCorrect) line += ` ${pick(FIELD_LINES.kind, turn + i).replace('{k}', open.kind.label)}`;
    out.push(line);
  });
  out.push(pick(FIELD_LINES.close, turn));
  return out.join('\n');
}

export function grade(total: number, max: number): string {
  const p = total / max;
  if (p >= 0.9) return 'S';
  if (p >= 0.75) return 'A';
  if (p >= 0.55) return 'B';
  if (p >= 0.35) return 'C';
  return 'D';
}
