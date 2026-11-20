// 숙련자 모드 — the harder way through Cases 0–2 for players who know a terminal
// (docs/campaign-ladder.md §숙련자 모드). Chosen on the first-run screen next to 터미널이 익숙해요,
// or in ❓; off by default and never on for 처음이에요. Stored per profile; a case keeps the mode
// it was started in (the setting is `settings.senior`, the old `?senior=1` switch).
//
// In every case the mode takes hint cost off the score (as `?senior=1` always did). In a case
// with an `expert` overlay (Cases 0–2) it also:
//   - folds the "오늘 할 일" checklist from the start: no steps, no rail, no yellow clue lines, every
//     icon on the desktop;
//   - sends no colleague nudge unasked (asking still works, and costs ASK_COST);
//   - charges the 💡 recap (요약) too (SUMMARY_COST), so no hint step is free;
//   - answers a wrong report with the per-field ✓/✗ only (no hint line per field);
//   - allows fewer submissions and takes TIME_STEP points off for every TIME_EVERY_MIN minutes of
//     play over the case's par (at most TIME_CAP);
//   - adds one red herring: a report option that a world detail makes plausible and one command
//     rules out (the case file's `expert` block says which);
//   - keeps the departed senior's records short: history, README and comments cut by half or more,
//     and no file holds the commands that solve the case — only traces that need reading into
//     (the overlay's `history`, `files`, `crontabs`, `mails`, `terminalTabs`, `stickies`);
//   - hides the board's evidence timeline (pins are placed by their own time stamps there, so it
//     orders itself and adds nothing to the score; the pin log, the tray and the report evidence stay).

import type { CaseFile, Emit, ExpertDef, FileDef, TimelineEvent } from './types.ts';

/** Per-profile choice (localStorage), next to the 익숙해요 / 처음이에요 record. */
export const EXPERT_KEY = 'no-handover:expert';
export const SUMMARY_COST = 5;
export const ASK_COST = 5;
export const TIME_STEP = 5;
export const TIME_EVERY_MIN = 2;
export const TIME_CAP = 30;

export function parseExpert(raw: string | null | undefined): boolean {
  return raw === '1';
}

/** Points taken off for play time over par: −5 per full 2 minutes over, at most −30. */
export function timeCost(playMs: number, parMin: number): number {
  const over = playMs / 60000 - parMin;
  if (over <= 0) return 0;
  return Math.min(TIME_CAP, Math.floor(over / TIME_EVERY_MIN) * TIME_STEP);
}

/**
 * The case as 숙련자 모드 plays it: a copy with the overlay applied. The input is never changed,
 * so the default path keeps its own case object.
 */
export function applyExpert(cs: CaseFile): CaseFile {
  const x: ExpertDef | undefined = cs.expert;
  if (!x) return cs;
  const hosts = cs.hosts.map((hd) => {
    const add = (x.files ?? []).filter((f) => f.host === hd.name).map((f) => f.file);
    const df = x.df?.find((d) => d.host === hd.name)?.lines;
    const tabs = (x.crontabs ?? []).filter((c) => c.host === hd.name);
    if (!add.length && !df && !tabs.length) return hd;
    const files: FileDef[] = hd.files.filter((f) => !add.some((a) => a.path === f.path)).concat(add);
    const crontabs = tabs.length ? { ...hd.crontabs, ...Object.fromEntries(tabs.map((c) => [c.user, c.content])) } : hd.crontabs;
    return { ...hd, files, df: df ?? hd.df, crontabs };
  });
  // a replaced history: the case's lines for that host and user go, the overlay's come in
  const replaced = new Set((x.history ?? []).map((r) => `${r.host}\u0000${r.user}`));
  const isReplaced = (e: Emit) => e.kind === 'history' && replaced.has(`${e.host}\u0000${e.user}`);
  const kept: TimelineEvent[] = replaced.size
    ? cs.timeline.flatMap((ev) => {
        if (!ev.emits?.some(isReplaced)) return [ev];
        const emits = ev.emits.filter((e) => !isReplaced(e));
        return emits.length ? [{ ...ev, emits }] : [];
      })
    : cs.timeline;
  const history: TimelineEvent[] = (x.history ?? []).flatMap((r) => r.lines.map((l) => ({ at: l.at, emits: [{ kind: 'history' as const, host: r.host, user: r.user, cmd: l.cmd }] })));
  const mails = x.mails?.length ? cs.mails.filter((m) => !x.mails!.some((n) => n.id === m.id)).concat(x.mails) : cs.mails;
  const slots = cs.accusation.slots.map((s) => {
    const extra = (x.options ?? []).filter((o) => o.slot === s.id);
    if (!extra.length) return s;
    const options = [...s.options];
    for (const o of extra) options.splice(o.at ?? options.length, 0, o.option);
    return { ...s, options };
  });
  const opening = cs.opening && x.after ? { ...cs.opening, objectives: { ...cs.opening.objectives, after: x.after } } : cs.opening;
  return {
    ...cs,
    hosts,
    timeline: [...kept, ...history, ...(x.timeline ?? [])],
    mails,
    terminalTabs: x.terminalTabs ?? cs.terminalTabs,
    stickies: x.stickies ?? cs.stickies,
    clues: [...cs.clues, ...(x.clues ?? [])],
    // per-field ✓/✗ only: the colleague's per-field hint lines would be unasked help
    accusation: { ...cs.accusation, slots, maxSubmissions: x.maxSubmissions, intro: x.intro ?? cs.accusation.intro, feedback: 'marks' },
    goal: x.goalIntro ? { ...cs.goal, intro: x.goalIntro } : cs.goal,
    opening,
    // no yellow clue lines: the player greps as in the main cases
    rail: cs.rail ? { ...cs.rail, highlightClues: false } : cs.rail,
  };
}
