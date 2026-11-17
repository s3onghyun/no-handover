// Hint ladder.
//   Rung 1: diegetic traces already in the machine (history, aliases, crontab comments, notes...).
//           Nothing to fire here; the game only logs when the player first touches a trace clue.
//   Rung 2: a colleague nudge in the player's messenger, after `idleMinutes` without progress on
//           the cause slot, or right after a wrong accusation (voice picked by who was blamed).
//   Rung 3: explicit hint button, per slot, each with a visible score cost.
// Pure state machine: the caller passes `now` (ms) so timers are testable.

import type { HintsDef, NudgeDef, SlotId } from './types.ts';

export interface LadderState {
  lastProgressAt: number;
  idleFired: string[];
  wrongFired: string[];
  explicitUsed: { slot: SlotId; index: number; at: number; cost: number }[];
}

export class HintLadder {
  readonly idleMs: number;
  readonly def: HintsDef;
  state: LadderState;

  constructor(def: HintsDef, startAt: number, opts: { idleMs?: number } = {}, state?: LadderState) {
    this.def = def;
    this.idleMs = opts.idleMs ?? def.idleMinutes * 60000;
    this.state = state ?? { lastProgressAt: startAt, idleFired: [], wrongFired: [], explicitUsed: [] };
  }

  /** New key evidence found: the "stuck" timer restarts. */
  progress(now: number): void {
    this.state.lastProgressAt = now;
  }

  /** Milliseconds until the next idle nudge could fire (for UI/debug). */
  msUntilNudge(now: number): number {
    return Math.max(0, this.state.lastProgressAt + this.idleMs - now);
  }

  /**
   * Call periodically. Returns the idle nudge to deliver, if the player has been stuck long enough.
   * `causeSolved` = all key cause clues found; then idle nudges stop.
   */
  tick(now: number, found: ReadonlySet<string>, causeSolved: boolean): NudgeDef | null {
    if (causeSolved) return null;
    if (now - this.state.lastProgressAt < this.idleMs) return null;
    const next = this.def.idle.find((n) => !this.state.idleFired.includes(n.id) && !(n.unlessClues?.length && n.unlessClues.every((c) => found.has(c))));
    if (!next) return null;
    this.state.idleFired.push(next.id);
    this.state.lastProgressAt = now; // wait another full interval before the next one
    return next;
  }

  /** Wrong accusation: nudge in the voice of the first blamed person that has one, else default. */
  onWrong(blamed: string[], now: number): NudgeDef | null {
    const keys = [...blamed, 'default'];
    for (const k of keys) {
      const n = this.def.wrong[k];
      if (n && !this.state.wrongFired.includes(n.id)) {
        this.state.wrongFired.push(n.id);
        this.state.lastProgressAt = now;
        return n;
      }
    }
    return null;
  }

  nextExplicit(slot: SlotId): { text: string; cost: number; index: number } | null {
    const list = this.def.explicit.filter((h) => h.slot === slot);
    const used = this.state.explicitUsed.filter((u) => u.slot === slot).length;
    if (used >= list.length) return null;
    return { ...list[used], index: used };
  }

  useExplicit(slot: SlotId, now: number): { text: string; cost: number; index: number } | null {
    const h = this.nextExplicit(slot);
    if (!h) return null;
    this.state.explicitUsed.push({ slot, index: h.index, at: now, cost: h.cost });
    return h;
  }

  usedExplicit(slot: SlotId): string[] {
    const list = this.def.explicit.filter((h) => h.slot === slot);
    return this.state.explicitUsed.filter((u) => u.slot === slot).map((u) => list[u.index].text);
  }

  totalCost(): number {
    return this.state.explicitUsed.reduce((a, u) => a + u.cost, 0);
  }
}
