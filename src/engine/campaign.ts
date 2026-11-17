// Campaign ladder (docs/campaign-ladder.md): which case is open, solved, skipped or not built yet.
// Pure functions over a small progress record so the rules are testable without a browser.
// "Solved" means the case reached its debrief (right answer or out of submissions).

import type { CaseFile } from './types.ts';

export interface CampaignEntry {
  /** Ladder position: Case 0 … Case 4. */
  slot: number;
  id: string;
  title: string;
  /** In-world day, e.g. '11/10 (화)'. */
  when: string;
  /** The one principle the case teaches. */
  principle: string;
  tutorial?: boolean;
  /** Absent = placeholder ("준비 중", title only). */
  cs?: CaseFile;
}

export interface Progress {
  solved: string[];
  skipped: string[];
}

export type EntryStatus = 'solved' | 'skipped' | 'open' | 'locked' | 'soon';

export function parseProgress(raw: string | null | undefined): Progress {
  try {
    const p = JSON.parse(raw ?? 'null') as Partial<Progress> | null;
    return { solved: Array.isArray(p?.solved) ? p.solved.map(String) : [], skipped: Array.isArray(p?.skipped) ? p.skipped.map(String) : [] };
  } catch {
    return { solved: [], skipped: [] };
  }
}

export class Campaign {
  readonly entries: CampaignEntry[];
  constructor(entries: CampaignEntry[]) {
    this.entries = [...entries].sort((a, b) => a.slot - b.slot);
    if (!this.playable().length) throw new Error('campaign has no playable case');
  }

  entry(id: string): CampaignEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  playable(): CampaignEntry[] {
    return this.entries.filter((e) => e.cs);
  }

  first(): CampaignEntry {
    return this.playable()[0];
  }

  tutorialId(): string | undefined {
    return this.entries.find((e) => e.tutorial)?.id;
  }

  /** Next playable case after `id` (placeholders in between are passed over). */
  next(id: string): CampaignEntry | null {
    const list = this.playable();
    const i = list.findIndex((e) => e.id === id);
    return i >= 0 ? list[i + 1] ?? null : null;
  }

  /** A playable case is open when every playable case before it is solved or skipped. */
  unlocked(id: string, p: Progress): boolean {
    const list = this.playable();
    const i = list.findIndex((e) => e.id === id);
    if (i < 0) return false;
    return list.slice(0, i).every((e) => p.solved.includes(e.id) || p.skipped.includes(e.id));
  }

  status(id: string, p: Progress): EntryStatus {
    const e = this.entry(id);
    if (!e?.cs) return 'soon';
    if (p.solved.includes(id)) return 'solved';
    if (!this.unlocked(id, p)) return 'locked';
    if (p.skipped.includes(id)) return 'skipped';
    return 'open';
  }

  solve(id: string, p: Progress): Progress {
    return { solved: p.solved.includes(id) ? p.solved : [...p.solved, id], skipped: p.skipped.filter((x) => x !== id) };
  }

  /** "Skip to": mark every unsolved playable case before `id` as skipped, which opens `id`. */
  skipTo(id: string, p: Progress): Progress {
    const list = this.playable();
    const i = list.findIndex((e) => e.id === id);
    const skip = list.slice(0, Math.max(0, i)).map((e) => e.id).filter((x) => !p.solved.includes(x) && !p.skipped.includes(x));
    return { solved: p.solved, skipped: [...p.skipped, ...skip] };
  }

  /**
   * Which case to open: an explicit request (?case=, facilitator — ignores locks) if it is
   * playable, else the last opened case if it is still open, else the first playable case.
   */
  pick(requested: string | null, last: string | null, p: Progress): CampaignEntry {
    const req = requested ? this.entry(requested) : undefined;
    if (req?.cs) return req;
    const prev = last ? this.entry(last) : undefined;
    if (prev?.cs && this.unlocked(prev.id, p)) return prev;
    return this.first();
  }
}
