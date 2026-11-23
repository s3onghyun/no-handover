// The 💡 hint panel: three steps per report slot (and, in the tutorial, per "오늘 할 일" item),
// opened in order. Seoul escape-room style (web-escape analysis §9 item 5):
//
//   ① 요약   what the player has already confirmed for this slot (generated from found clues). Free.
//   ② 방향   one `hints.explicit` direction at a time, in two parts: 볼 곳 (`text`: the host or tab,
//            command, file, panel or pin to look at) and then 비교할 것 (`compare`: what to put side
//            by side there, never the conclusion). Directions whose `unlessClues` are not all found
//            come first; when they are already found the 볼 곳 part is pointless, so the panel opens
//            the 비교할 것 part straight away. One hint per part.
//   ③ 정답   the answer (`hints.answers[slot]`, default: the correct option text). The UI asks
//            twice before opening it. One hint.
//
// Hints are a record ("힌트 N회"), not a penalty: only 숙련자 모드 turns them into score cost (and,
// in Cases 0–2, charges the 요약 too: src/engine/expert.ts).
// Pure functions over the case, the found clues and the ladder state (no DOM).

import type { HintLadder, PanelRung, PanelUse } from './hints.ts';
import type { CaseFile, ObjectiveDef, SlotDef } from './types.ts';

export const DEFAULT_ANSWER_COST = 30;

export interface PanelSection {
  /** Slot id ('cause', …) or 'obj:<objective id>'. */
  key: string;
  kind: 'slot' | 'objective';
  title: string;
  summaryOpen: boolean;
  /** Live lines for ① 요약 (empty = nothing confirmed yet). */
  summary: string[];
  /** ② 방향 lines opened so far, in the order they were opened. */
  directions: string[];
  /** Which part each line in `directions` is (same order): 볼 곳 or 비교할 것. */
  directionParts: DirectionPart[];
  /** Another ② can be opened (the summary is open and an unopened direction is left). */
  moreDirections: boolean;
  /** The part the next ② opens (null when none is left). */
  nextPart: DirectionPart | null;
  /** ③ text once opened, else null. */
  answer: string | null;
  /** ③ can be opened now: at least one ② is open (or the section has none). */
  answerReady: boolean;
}

export interface PanelInput {
  cs: CaseFile;
  found: ReadonlySet<string>;
  ladder: HintLadder;
  /** The current (first unticked) checklist item while the checklist is open, else null. */
  objective: ObjectiveDef | null;
  doneObjectives: ObjectiveDef[];
  /** Cost of a slot's ① 요약 (숙련자 모드 with an overlay; default 0 = free). */
  summaryCost?: number;
}

/**
 * ③ for a slot: the correct option(s), then the case's specifics (`hints.answers`: the options
 * stay hypotheses, the answer step carries the facts) and which evidence the slot accepts.
 */
export function slotAnswer(cs: CaseFile, slot: SlotDef): string {
  const lines =
    slot.type === 'single'
      ? [slot.options.find((o) => o.correct)?.text ?? '']
      : [...slot.options.filter((o) => (o.weight ?? 0) > 0).map((o) => `· ${o.text}`), '(사람을 범인으로 고르는 보기는 고르지 않는다)'];
  const own = cs.hints.answers?.[slot.id];
  if (own) lines.push(own);
  if (slot.evidence?.length) lines.push(`📌 근거로 인정: ${slot.evidence.map((k) => k.label).join(' · ')}`);
  return lines.join('\n');
}

/** ③ for a checklist item. */
export function objectiveAnswer(o: ObjectiveDef): string {
  return o.answer ?? (o.next ? `터미널에 그대로 치세요: ${o.next}` : o.hint ?? o.text);
}

/** ① for a slot: labels of the clues found for it, key clues first. */
export function slotSummary(cs: CaseFile, slot: string, found: ReadonlySet<string>): string[] {
  const mine = cs.clues.filter((c) => c.slot === slot && found.has(c.id));
  return [...mine.filter((c) => c.key), ...mine.filter((c) => !c.key)].map((c) => c.label);
}

/** ② comes in two parts: where to look (`text`), then what to compare there (`compare`). */
export type DirectionPart = 'look' | 'compare';

export interface DirectionStep {
  /** Index into hints.explicit. */
  index: number;
  part: DirectionPart;
}

/** The direction parts already opened for a slot, from the ladder's panel uses. */
export function openedDirections(uses: readonly PanelUse[]): DirectionStep[] {
  return uses.filter((u) => u.rung === 'direction').map((u) => ({ index: u.index, part: u.part ?? 'look' }));
}

/**
 * The ② part to open next for a slot, or null when every part is open. In order:
 *   1. the 비교할 것 of a direction whose 볼 곳 is open (finish what was started);
 *   2. the 볼 곳 of a direction whose clues are not all found yet (case order);
 *   3. the 비교할 것 of a direction whose clues are all found (the player is there already);
 *   4. anything left (the 볼 곳 of found directions).
 */
export function nextDirection(cs: CaseFile, slot: string, found: ReadonlySet<string>, opened: readonly DirectionStep[]): DirectionStep | null {
  const has = (index: number, part: DirectionPart) => opened.some((o) => o.index === index && o.part === part);
  let best: DirectionStep | null = null;
  let bestRank = Infinity;
  cs.hints.explicit.forEach((d, index) => {
    if (d.slot !== slot) return;
    const look = has(index, 'look');
    const cmp = !d.compare || has(index, 'compare');
    if (look && cmp) return;
    const covered = !!d.unlessClues?.length && d.unlessClues.every((c) => found.has(c));
    const [rank, part]: [number, DirectionPart] = look ? [0, 'compare'] : !covered ? [1, 'look'] : !cmp ? [2, 'compare'] : [3, 'look'];
    if (rank < bestRank) {
      best = { index, part };
      bestRank = rank;
    }
  });
  return best;
}

/** The text of one ② part. */
export function directionText(cs: CaseFile, step: DirectionStep): string {
  const d = cs.hints.explicit[step.index];
  return step.part === 'compare' ? (d.compare ?? d.text) : d.text;
}

function objectiveSection(input: PanelInput, o: ObjectiveDef): PanelSection {
  const key = `obj:${o.id}`;
  const uses = input.ladder.panelUses(key);
  const summaryOpen = uses.some((u) => u.rung === 'summary');
  const dirOpen = uses.some((u) => u.rung === 'direction');
  const direction = o.direction ?? o.hint ?? o.text;
  return {
    key,
    kind: 'objective',
    title: o.text,
    summaryOpen,
    summary: input.doneObjectives.map((d) => `✓ ${d.text}`),
    directions: dirOpen ? [direction] : [],
    directionParts: dirOpen ? ['look'] : [],
    moreDirections: summaryOpen && !dirOpen,
    nextPart: dirOpen ? null : 'look',
    answer: uses.some((u) => u.rung === 'answer') ? objectiveAnswer(o) : null,
    answerReady: dirOpen,
  };
}

function slotSection(input: PanelInput, slot: SlotDef): PanelSection {
  const { cs, found, ladder } = input;
  const uses = ladder.panelUses(slot.id);
  const opened = openedDirections(uses);
  const summaryOpen = uses.some((u) => u.rung === 'summary');
  const hasDirections = cs.hints.explicit.some((d) => d.slot === slot.id);
  const next = nextDirection(cs, slot.id, found, opened);
  return {
    key: slot.id,
    kind: 'slot',
    title: slot.title,
    summaryOpen,
    summary: slotSummary(cs, slot.id, found),
    directions: opened.map((o) => directionText(cs, o)),
    directionParts: opened.map((o) => o.part),
    moreDirections: summaryOpen && next !== null,
    nextPart: next?.part ?? null,
    answer: uses.some((u) => u.rung === 'answer') ? slotAnswer(cs, slot) : null,
    answerReady: summaryOpen && (opened.length > 0 || !hasDirections),
  };
}

/** The panel as it stands: the current checklist item first (tutorial), then every report slot. */
export function buildPanel(input: PanelInput): PanelSection[] {
  const out: PanelSection[] = [];
  if (input.cs.hints.objectivePanel && input.objective) out.push(objectiveSection(input, input.objective));
  for (const s of input.cs.accusation.slots) out.push(slotSection(input, s));
  return out;
}

/**
 * Open the next step of a section. Returns what was opened (with its senior-mode cost), or null
 * when that step is not available yet (steps go in order) or already used up.
 */
export function openStep(input: PanelInput, key: string, rung: PanelRung, now: number): { rung: PanelRung; index: number; part?: DirectionPart; cost: number; text: string } | null {
  const sec = buildPanel(input).find((s) => s.key === key);
  if (!sec) return null;
  const { cs, ladder, found } = input;
  let index = 0;
  let part: DirectionPart | undefined;
  let cost = 0;
  let text: string;
  if (rung === 'summary') {
    if (sec.summaryOpen) return null;
    text = sec.summary.join('\n');
    cost = input.summaryCost ?? 0;
  } else if (rung === 'direction') {
    if (!sec.moreDirections) return null;
    if (sec.kind === 'slot') {
      const step = nextDirection(cs, key, found, openedDirections(ladder.panelUses(key)))!;
      ({ index, part } = step);
      cost = cs.hints.explicit[index].cost;
      text = directionText(cs, step);
    } else text = input.objective?.direction ?? input.objective?.hint ?? input.objective?.text ?? '';
  } else {
    if (!sec.answerReady || sec.answer !== null) return null;
    if (sec.kind === 'slot') {
      cost = cs.hints.answerCost ?? DEFAULT_ANSWER_COST;
      text = slotAnswer(cs, cs.accusation.slots.find((s) => s.id === key)!);
    } else text = objectiveAnswer(input.objective!);
  }
  if (sec.kind === 'objective') cost = 0; // the tutorial checklist never costs points
  ladder.usePanel({ key, rung, index, ...(part === 'compare' ? { part } : {}), at: now, cost });
  return { rung, index, part, cost, text };
}
