// Hint ladder.
//   Rung 1: diegetic traces already in the machine (history, aliases, crontab comments, notes...).
//           Nothing to fire here; the game only logs when the player first touches a trace clue.
//   Rung 2: a colleague nudge in the player's messenger, after `idleMinutes` without progress on
//           the cause slot, right after a wrong accusation (voice picked by who was blamed), or at
//           once when the player asks ("뭐부터 봐요?" quick reply; free, logged).
//   Rung 3: the 💡 panel, three steps per report slot: 요약 (what you have found, free) → 방향
//           (where to look next) → 정답 (confirmed twice). Each 방향/정답 counts as one hint in the
//           record; only senior mode turns them into score cost (src/engine/hintpanel.ts).
// Pure state machine: the caller passes `now` (ms) so timers are testable.

import type { HintsDef, NudgeDef, SlotId } from './types.ts';

/** A clue found this recently means the player is about to get there: the idle nudge waits. */
export const HOLD_MS = 60_000;

export type PanelRung = 'summary' | 'direction' | 'answer';

/** One step opened in the 💡 panel. `key` = a slot id or 'obj:<objective id>'. */
export interface PanelUse {
  key: string;
  rung: PanelRung;
  /** Direction: index into hints.explicit (slots) or 0 (objectives). */
  index: number;
  at: number;
  /** Senior-mode cost of this step (0 for summaries). */
  cost: number;
}

export interface LadderState {
  lastProgressAt: number;
  idleFired: string[];
  wrongFired: string[];
  /** Old saves (one-button explicit hints): still counted as hints. */
  explicitUsed: { slot: SlotId; index: number; at: number; cost: number }[];
  /** 💡 panel steps opened (added later; filled in on load when missing). */
  panel?: PanelUse[];
  /** Nudges delivered because the player asked. */
  asked?: { at: number; nudge: string }[];
}

export class HintLadder {
  idleMs: number;
  readonly def: HintsDef;
  state: LadderState;

  constructor(def: HintsDef, startAt: number, opts: { idleMs?: number } = {}, state?: LadderState) {
    this.def = def;
    this.idleMs = opts.idleMs ?? def.idleMinutes * 60000;
    this.state = state ?? { lastProgressAt: startAt, idleFired: [], wrongFired: [], explicitUsed: [] };
    this.state.panel ??= [];
    this.state.asked ??= [];
  }

  /** New key evidence found: the "stuck" timer restarts. */
  progress(now: number): void {
    this.state.lastProgressAt = now;
  }

  /** Milliseconds until the next idle nudge could fire (for UI/debug). */
  msUntilNudge(now: number): number {
    return Math.max(0, this.state.lastProgressAt + this.idleMs - now);
  }

  /** The next idle nudge not yet sent and not already covered by found clues. */
  peekIdle(found: ReadonlySet<string>): NudgeDef | null {
    return this.def.idle.find((n) => !this.state.idleFired.includes(n.id) && !(n.unlessClues?.length && n.unlessClues.every((c) => found.has(c)))) ?? null;
  }

  private take(n: NudgeDef, now: number): NudgeDef {
    this.state.idleFired.push(n.id);
    this.state.lastProgressAt = now; // wait another full interval before the next one
    return n;
  }

  /**
   * Call periodically. Returns the idle nudge to deliver, if the player has been stuck long enough.
   * `causeSolved` = all key cause clues found; then idle nudges stop.
   * `lastClueAt` = when any clue (key or not) was last found: within HOLD_MS the nudge is held.
   */
  tick(now: number, found: ReadonlySet<string>, causeSolved: boolean, lastClueAt = -Infinity): NudgeDef | null {
    if (causeSolved) return null;
    if (now - this.state.lastProgressAt < this.idleMs) return null;
    if (now - lastClueAt < HOLD_MS) return null;
    const next = this.peekIdle(found);
    return next ? this.take(next, now) : null;
  }

  /**
   * The player asked a colleague: the next idle nudge right away (no timer, no hold, even after
   * the cause is solved), or null when none is left. The idle timer restarts so the timed nudge
   * does not follow on its heels.
   */
  ask(now: number, found: ReadonlySet<string>): NudgeDef | null {
    const next = this.peekIdle(found);
    this.state.asked!.push({ at: now, nudge: next?.id ?? '' });
    if (!next) {
      this.state.lastProgressAt = now;
      return null;
    }
    return this.take(next, now);
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

  /** Record a 💡 panel step. */
  usePanel(u: PanelUse): void {
    this.state.panel!.push(u);
  }

  panelUses(key?: string): PanelUse[] {
    return this.state.panel!.filter((u) => key === undefined || u.key === key);
  }

  /** Hints used for the record: every 방향/정답 step (summaries are free) plus old one-button hints. */
  hintCount(): number {
    return this.state.panel!.filter((u) => u.rung !== 'summary').length + this.state.explicitUsed.length;
  }

  /** Senior mode: the score cost of every hint used. */
  totalCost(): number {
    return this.state.panel!.reduce((a, u) => a + u.cost, 0) + this.state.explicitUsed.reduce((a, u) => a + u.cost, 0);
  }
}
