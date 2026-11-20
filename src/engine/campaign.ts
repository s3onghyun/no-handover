// Campaign ladder (docs/campaign-ladder.md): which case is open, solved, skipped or not built yet.
// Pure functions over a small progress record so the rules are testable without a browser.
// "Solved" means the case reached its debrief (right answer or out of submissions).

import type { CaseFile } from './types.ts';
import { grade } from './scoring.ts';

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

/** What the case list shows: like EntryStatus, with a started-but-unfinished save as 'playing'. */
export type CaseState = 'locked' | 'soon' | 'new' | 'playing' | 'done' | 'skipped';

/** The parts of a case's save the case list needs (no Game is built for it). */
export interface SaveInfo {
  /** Unlocked and played for a moment: there is something to resume or throw away. */
  started: boolean;
  finished: boolean;
  /** S…D of the finishing report, when finished. */
  grade: string | null;
}

export function saveInfo(raw: string | null | undefined): SaveInfo | null {
  try {
    const s = JSON.parse(raw ?? 'null') as { unlocked?: unknown; playMs?: unknown; finished?: unknown; submissions?: { score?: { total?: unknown; max?: unknown } }[] } | null;
    if (!s || typeof s !== 'object') return null;
    const last = Array.isArray(s.submissions) ? s.submissions[s.submissions.length - 1]?.score : undefined;
    const finished = s.finished === true;
    const g = finished && typeof last?.total === 'number' && typeof last?.max === 'number' && last.max > 0 ? grade(last.total, last.max) : null;
    return { started: s.unlocked === true && typeof s.playMs === 'number' && s.playMs > 0, finished, grade: g };
  } catch {
    return null;
  }
}

/** Last grade per finished case; kept apart from the save so "이 사건 처음부터" does not erase it. */
export function parseGrades(raw: string | null | undefined): Record<string, string> {
  try {
    const g = JSON.parse(raw ?? 'null') as Record<string, unknown> | null;
    if (!g || typeof g !== 'object' || Array.isArray(g)) return {};
    return Object.fromEntries(Object.entries(g).filter(([, v]) => typeof v === 'string' && /^[SABCD]$/.test(v))) as Record<string, string>;
  } catch {
    return {};
  }
}

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

  /** The case list's state: a started, unfinished save reads 'playing' even on a case solved before. */
  state(id: string, p: Progress, save: SaveInfo | null): CaseState {
    const st = this.status(id, p);
    if (st === 'soon' || st === 'locked') return st;
    if (save?.started && !save.finished) return 'playing';
    if (st === 'solved') return 'done';
    if (st === 'skipped') return 'skipped';
    return 'new';
  }

  /** Where to go next: the first open playable case that is neither solved nor skipped. */
  upNext(p: Progress): CampaignEntry | null {
    return this.playable().find((e) => this.unlocked(e.id, p) && !p.solved.includes(e.id) && !p.skipped.includes(e.id)) ?? null;
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
