// Game orchestrator: world + shell sessions + clues + triggers + hint ladder + scoring + playtest log.
// UI-free (no DOM) so it runs in node tests and the e2e. All timers run on "play time" (ms of
// active play, advanced by tick()) so reloads and backgrounded tabs do not skip ahead.

import { buildWorld, type Message, type World } from './build.ts';
import { HintLadder, type LadderState } from './hints.ts';
import { emptyObjectiveState, Objectives, type Observation, type ObjectiveState } from './objectives.ts';
import { scoreSubmission, type ScoreResult, type Submission } from './scoring.ts';
import { Shell, type OutLine, type RunResult, type Session, type ShellEvent } from './shell.ts';
import { detectTime, parseLocal } from './time.ts';
import type { CaseFile, ClueDef, MailDef, NudgeDef, SlotId, TriggerAction } from './types.ts';

export const SAVE_VERSION = 1;

export interface Pin {
  id: string;
  kind: 'line' | 'message' | 'mail' | 'file' | 'commit' | 'note' | 'notification';
  text: string;
  source: string;
  /** Detected local time (ms) or null; the player can edit it on the board. */
  ts: number | null;
  onTimeline: boolean;
  clueIds: string[];
  note?: string;
  at: number;
}

export interface TabState {
  label: string;
  session: Session;
  lines: OutLine[];
  input: string;
}

export interface LogEvent {
  t: number;
  type: string;
  [k: string]: unknown;
}

export interface Settings {
  idleMinutes: number;
  clockRate: number;
}

export interface SaveState {
  v: number;
  caseId: string;
  createdAt: string;
  playMs: number;
  settings: Settings;
  unlocked: boolean;
  clues: Record<string, { at: number; via: string }>;
  pins: Pin[];
  live: Message[];
  mailsDelivered: string[];
  notesRevealed: string[];
  triggersFired: string[];
  queue: { due: number; trigger: string; action: TriggerAction }[];
  ladder: LadderState;
  submissions: { at: number; sub: Submission; score: ScoreResult }[];
  finished: boolean;
  opened: string[];
  readUpTo: Record<string, number>;
  tabs: { label: string; session: Session; lines: OutLine[]; input: string }[];
  appTime: Record<string, number>;
  focusedApp: string | null;
  log: LogEvent[];
  /** "오늘 할 일" checklist (added after v1 saves; filled in on load when missing). */
  objectives: ObjectiveState;
  /** Opening briefing: whether it ran, was skipped, and for how long. */
  briefing: { startedAt: number | null; endedAt: number | null; skipped: boolean; watchedMs: number; replays: number };
  /** Facilitator's first-minutes observations typed into the playtest panel. */
  facilitator: Record<string, string>;
  /** Campaign progress when this case was first opened (set by the UI; "played Case 0 first?"). */
  campaignAtStart?: { solved: string[]; skipped: string[]; tutorial?: string } | null;
  /** Tutorial rail: items whose guide line was sent, items that already got an off-rail redirect. */
  rail?: { said: string[]; redirected: string[] };
}

type Listener = (payload?: unknown) => void;

const MAX_TAB_LINES = 600;

export class Game {
  readonly cs: CaseFile;
  readonly world: World;
  readonly shell: Shell;
  readonly start: number;
  ladder: HintLadder;
  objectives: Objectives;
  st: SaveState;
  private listeners = new Map<string, Set<Listener>>();
  private clueRegex = new Map<string, { re: RegExp; host?: string }[]>();

  constructor(cs: CaseFile, saved?: SaveState | null, settings?: Partial<Settings>) {
    this.cs = cs;
    this.world = buildWorld(cs);
    this.start = parseLocal(cs.clock.start);
    this.shell = new Shell(this.world, () => this.now());
    for (const c of cs.clues) {
      this.clueRegex.set(
        c.id,
        c.match.flatMap((m) => ('output' in m ? [{ re: new RegExp(m.output, m.cs ? 'mu' : 'imu'), host: m.host }] : [])),
      );
    }
    const s = saved && saved.v === SAVE_VERSION && saved.caseId === cs.id ? saved : null;
    this.st = s ?? this.fresh(settings);
    // saves written before the opening existed
    this.st.objectives ??= emptyObjectiveState();
    this.st.briefing ??= { startedAt: null, endedAt: null, skipped: false, watchedMs: 0, replays: 0 };
    this.st.facilitator ??= {};
    this.st.rail ??= { said: [], redirected: [] };
    this.objectives = new Objectives(cs.opening?.objectives.items ?? [], this.st.objectives);
    this.st.objectives = this.objectives.state;
    if (settings) this.st.settings = { ...this.st.settings, ...settings };
    this.ladder = new HintLadder(cs.hints, 0, { idleMs: this.st.settings.idleMinutes * 60000 }, this.st.ladder);
    this.st.ladder = this.ladder.state;
    // Re-apply live terminal side effects that live in the world (sudo lines in auth.log).
    for (const e of this.st.log) {
      if (e.type === 'sudo-auth') this.world.hosts.get(e.host as string)?.vfs.appendLine('/var/log/auth.log', e.line as string);
    }
  }

  private fresh(settings?: Partial<Settings>): SaveState {
    const tabs = this.cs.terminalTabs.map((t, i) => {
      const session = this.shell.newSession(`tab${i}`, t.host, t.cwd);
      return { label: t.label, session, lines: (t.scrollback ?? []).map((text) => ({ text, cls: 'dim' as const })), input: t.prefill ?? '' };
    });
    return {
      v: SAVE_VERSION,
      caseId: this.cs.id,
      createdAt: new Date().toISOString(),
      playMs: 0,
      settings: { idleMinutes: this.cs.hints.idleMinutes, clockRate: this.cs.clock.rate ?? 16, ...settings },
      unlocked: false,
      clues: {},
      pins: [],
      live: [],
      mailsDelivered: [],
      notesRevealed: [],
      triggersFired: [],
      queue: [],
      ladder: { lastProgressAt: 0, idleFired: [], wrongFired: [], explicitUsed: [] },
      submissions: [],
      finished: false,
      opened: [],
      readUpTo: {},
      tabs,
      appTime: {},
      focusedApp: null,
      log: [{ t: 0, type: 'start', case: this.cs.id }],
      objectives: emptyObjectiveState(),
      briefing: { startedAt: null, endedAt: null, skipped: false, watchedMs: 0, replays: 0 },
      facilitator: {},
    };
  }

  // ---------------------------------------------------------------- events

  on(type: string, fn: Listener): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
    return () => this.listeners.get(type)!.delete(fn);
  }

  private emit(type: string, payload?: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) fn(payload);
    if (type !== 'change') for (const fn of this.listeners.get('change') ?? []) fn({ type, payload });
  }

  log(type: string, data: Record<string, unknown> = {}): void {
    this.st.log.push({ t: Math.round(this.st.playMs), type, ...data });
  }

  // ---------------------------------------------------------------- clock

  /** Case-local wall clock (ms), advancing clockRate x faster than play time. */
  now(): number {
    return this.start + this.st.playMs * this.st.settings.clockRate;
  }

  deadline(): number {
    return parseLocal(this.cs.clock.deadline);
  }

  /** Advance play time by dt ms (capped to avoid jumps after sleep) and run timers. */
  tick(dt: number): void {
    const step = Math.max(0, Math.min(dt, 5000));
    this.st.playMs += step;
    if (this.st.focusedApp) this.st.appTime[this.st.focusedApp] = (this.st.appTime[this.st.focusedApp] ?? 0) + step;
    this.runTimers();
  }

  private runTimers(): void {
    const t = this.st.playMs;
    // delayed trigger actions
    const due = this.st.queue.filter((q) => q.due <= t);
    if (due.length) {
      this.st.queue = this.st.queue.filter((q) => q.due > t);
      for (const q of due) this.apply(q.trigger, q.action);
    }
    // time-based triggers
    for (const tr of this.cs.triggers) {
      if ('afterMin' in tr.when && !this.st.triggersFired.includes(tr.id) && t >= tr.when.afterMin * 60000) this.fire(tr.id);
    }
    // rung 2 idle nudges
    if (!this.st.finished) {
      const lastClueAt = Math.max(-Infinity, ...Object.values(this.st.clues).map((c) => c.at));
      const n = this.ladder.tick(t, this.foundSet(), this.causeSolved(), lastClueAt);
      if (n) this.deliverNudge(n, 'idle');
    }
  }

  // ---------------------------------------------------------------- clues

  foundSet(): Set<string> {
    return new Set(Object.keys(this.st.clues));
  }

  causeSolved(): boolean {
    return this.cs.clues.filter((c) => c.slot === 'cause' && c.key).every((c) => c.id in this.st.clues);
  }

  clue(id: string): ClueDef | undefined {
    return this.cs.clues.find((c) => c.id === id);
  }

  private discover(c: ClueDef, via: string): void {
    if (c.id in this.st.clues) return;
    this.st.clues[c.id] = { at: this.st.playMs, via };
    this.log('clue', { clue: c.id, slot: c.slot, key: !!c.key, trace: !!c.trace, via });
    if (c.trace && !this.st.log.some((e) => e.type === 'rung1')) this.log('rung1', { clue: c.id });
    if (c.key) this.ladder.progress(this.st.playMs);
    this.emit('clue', c);
    this.observe({ type: 'clue', id: c.id });
    for (const tr of this.cs.triggers) {
      if (this.st.triggersFired.includes(tr.id)) continue;
      if ('clue' in tr.when && tr.when.clue === c.id) this.fire(tr.id);
      else if ('allClues' in tr.when && tr.when.allClues.every((x) => x in this.st.clues)) this.fire(tr.id);
    }
  }

  /** Match output lines (terminal) against clue regexes. */
  observeOutput(host: string, lines: string[], via: string): void {
    for (const c of this.cs.clues) {
      if (c.id in this.st.clues) continue;
      const res = this.clueRegex.get(c.id)!;
      if (res.some((m) => (!m.host || m.host === host) && lines.some((l) => m.re.test(l)))) this.discover(c, via);
    }
  }

  /** The player opened something: 'msg:E05', 'mail:summary', 'note:farewell', 'notif:E06', 'channel:alerts'. */
  open(key: string): void {
    if (!this.st.opened.includes(key)) {
      this.st.opened.push(key);
      this.log('open', { key });
    }
    for (const c of this.cs.clues) if (!(c.id in this.st.clues) && c.match.some((m) => 'open' in m && m.open === key)) this.discover(c, key);
    this.observe({ type: 'open', key });
    this.emit('save');
  }

  /** Which clues a piece of pinned text proves. */
  cluesFor(text: string, sourceKey?: string): string[] {
    const out: string[] = [];
    for (const c of this.cs.clues) {
      const res = this.clueRegex.get(c.id)!;
      if (res.some((m) => m.re.test(text)) || (sourceKey && c.match.some((m) => 'open' in m && m.open === sourceKey))) out.push(c.id);
    }
    return out;
  }

  // ---------------------------------------------------------------- triggers

  private fire(id: string): void {
    const tr = this.cs.triggers.find((x) => x.id === id);
    if (!tr || this.st.triggersFired.includes(id)) return;
    this.st.triggersFired.push(id);
    this.log('trigger', { trigger: id });
    for (const a of tr.actions) {
      const delay = 'message' in a ? (a.message.delaySec ?? 0) * 1000 : 0;
      if (delay > 0) this.st.queue.push({ due: this.st.playMs + delay, trigger: id, action: a });
      else this.apply(id, a);
    }
  }

  private apply(trigger: string, a: TriggerAction): void {
    if ('message' in a) this.pushLive({ channel: a.message.channel, from: a.message.from, text: a.message.text }, trigger);
    else if ('mail' in a) this.deliverMail(a.mail);
    else if ('note' in a) {
      if (!this.st.notesRevealed.includes(a.note)) this.st.notesRevealed.push(a.note);
      this.emit('note', a.note);
    } else if ('toast' in a) this.emit('toast', a.toast);
    this.emit('save');
  }

  private pushLive(m: { channel: string; from: string; text: string }, reason: string): Message {
    const msg: Message = { id: `live${this.st.live.length}`, channel: m.channel, from: m.from, text: m.text, ts: this.now(), live: true };
    this.st.live.push(msg);
    this.log('message', { channel: m.channel, from: m.from, reason });
    this.emit('message', msg);
    return msg;
  }

  deliverMail(id: string): void {
    if (this.st.mailsDelivered.includes(id)) return;
    this.st.mailsDelivered.push(id);
    this.log('mail', { mail: id });
    this.emit('mail', id);
  }

  private deliverNudge(n: NudgeDef, why: 'idle' | 'wrong'): void {
    this.log('rung2', { nudge: n.id, why, from: n.from });
    this.pushLive({ channel: n.channel, from: n.from, text: n.text }, `nudge:${n.id}`);
  }

  // ---------------------------------------------------------------- messenger / mail queries

  messages(channel: string): Message[] {
    return [...this.world.messages.filter((m) => m.channel === channel), ...this.st.live.filter((m) => m.channel === channel)];
  }

  unread(channel: string): number {
    return Math.max(0, this.messages(channel).length - (this.st.readUpTo[channel] ?? 0));
  }

  markRead(channel: string): void {
    this.st.readUpTo[channel] = this.messages(channel).length;
    this.open(`channel:${channel}`);
  }

  mails(account: 'pc' | 'me', folder: 'inbox' | 'drafts'): MailDef[] {
    return this.cs.mails
      .filter((m) => m.account === account && m.folder === folder && (!m.later || this.st.mailsDelivered.includes(m.id)))
      .sort((a, b) => parseLocal(b.at) - parseLocal(a.at));
  }

  // ---------------------------------------------------------------- terminal

  tab(i: number): TabState {
    return this.st.tabs[i];
  }

  runCommand(tabIndex: number, line: string): RunResult {
    const tab = this.st.tabs[tabIndex];
    const host = this.shell.frame(tab.session).host;
    const prompt = this.shell.prompt(tab.session);
    const authBefore = new Map([...this.world.hosts].map(([h, hw]) => [h, String(hw.vfs.lookup('/var/log/auth.log')?.content ?? '')]));
    const r = this.shell.run(tab.session, line);
    // persist sudo lines appended to auth.log (so a reload keeps the player's own trace)
    for (const [h, before] of authBefore) {
      const after = String(this.world.hosts.get(h)!.vfs.lookup('/var/log/auth.log')?.content ?? '');
      if (after.length > before.length) for (const l of after.slice(before.length).split('\n').filter(Boolean)) this.log('sudo-auth', { host: h, line: l });
    }
    tab.lines.push({ text: `${prompt} ${line}`, cls: 'sys' });
    if (r.clear) tab.lines = [];
    tab.lines.push(...r.lines);
    if (tab.lines.length > MAX_TAB_LINES) tab.lines = tab.lines.slice(-MAX_TAB_LINES);
    tab.input = '';
    this.log('cmd', { tab: tab.label, host, line, expanded: r.expanded !== line ? r.expanded : undefined, lines: r.lines.length, events: r.events.length ? r.events : undefined });
    for (const e of r.events) this.logShellEvent(e);
    const output = r.lines.filter((l) => l.cls !== 'err').map((l) => l.text);
    const progressBefore = Object.keys(this.st.clues).length + Object.keys(this.st.objectives.done).length;
    this.observeOutput(host, [line, ...output], `cmd:${line}`);
    this.observe({ type: 'cmd', host, line, output });
    const progressed = Object.keys(this.st.clues).length + Object.keys(this.st.objectives.done).length > progressBefore;
    // first command that showed the player evidence (found a clue or ticked an objective)
    if (progressed && !this.st.log.some((e) => e.type === 'meaningful')) this.log('meaningful', { line });
    if (!progressed) this.railOffTrack(line);
    this.emit('save');
    return r;
  }

  private logShellEvent(e: ShellEvent): void {
    const { type, ...rest } = e;
    if (type === 'notfound' || type === 'blocked' || type === 'syntax') {
      this.log('friction', { kind: type, ...rest });
      this.emit('friction', type);
    }
    else if (type === 'private') this.log('private', rest);
    else if (type === 'hint') {
      this.log('hint-cmd');
      this.emit('hint-panel');
    }
  }

  // ---------------------------------------------------------------- evidence board

  pin(p: Omit<Pin, 'id' | 'ts' | 'onTimeline' | 'clueIds' | 'at'> & { ts?: number | null; sourceKey?: string }): Pin {
    const existing = this.st.pins.find((x) => x.text === p.text && x.source === p.source);
    if (existing) return existing;
    const pin: Pin = {
      id: `p${Date.now().toString(36)}${this.st.pins.length}`,
      kind: p.kind,
      text: p.text,
      source: p.source,
      ts: p.ts ?? detectTime(p.text),
      onTimeline: false,
      clueIds: this.cluesFor(p.text, p.sourceKey),
      at: this.st.playMs,
    };
    pin.onTimeline = pin.ts !== null;
    this.st.pins.push(pin);
    this.log('pin', { kind: pin.kind, source: pin.source, clues: pin.clueIds, text: pin.text.slice(0, 160) });
    this.emit('pinned', pin);
    this.emit('pins');
    this.observe({ type: 'pins', count: this.st.pins.length });
    this.emit('save');
    return pin;
  }

  updatePin(id: string, patch: Partial<Pick<Pin, 'ts' | 'onTimeline' | 'note'>>): void {
    const p = this.st.pins.find((x) => x.id === id);
    if (!p) return;
    Object.assign(p, patch);
    this.log('pin-edit', { pin: id, ...patch });
    this.emit('pins');
    this.emit('save');
  }

  unpin(id: string): void {
    this.st.pins = this.st.pins.filter((x) => x.id !== id);
    this.log('unpin', { pin: id });
    this.emit('pins');
    this.emit('save');
  }

  pinnedKeyClues(): number {
    const ids = new Set(this.st.pins.flatMap((p) => p.clueIds));
    return this.cs.clues.filter((c) => c.key && ids.has(c.id)).length;
  }

  // ---------------------------------------------------------------- hints (rung 3)

  useHint(slot: SlotId): { text: string; cost: number } | null {
    const h = this.ladder.useExplicit(slot, this.st.playMs);
    if (!h) return null;
    this.log('rung3', { slot, index: h.index, cost: h.cost });
    this.emit('save');
    return h;
  }

  // ---------------------------------------------------------------- accusation

  /** Infinity when the case allows unlimited submissions (`maxSubmissions: 0`, the tutorial). */
  submissionsLeft(): number {
    const max = this.cs.accusation.maxSubmissions;
    return max > 0 ? max - this.st.submissions.length : Infinity;
  }

  submit(sub: Submission): ScoreResult | null {
    if (this.st.finished || this.submissionsLeft() <= 0) return null;
    const attempt = this.st.submissions.length + 1;
    const score = scoreSubmission(this.cs, sub, { attempt, pinnedKeyClues: this.pinnedKeyClues(), hintCost: this.ladder.totalCost() });
    this.st.submissions.push({ at: this.st.playMs, sub, score });
    const correct = Object.fromEntries(Object.entries(score.slots).map(([k, v]) => [k, v!.correct]));
    this.log('accuse', { attempt, sub, correct, total: score.total, blamed: score.blamed });
    if (score.allCorrect || this.submissionsLeft() <= 0) {
      this.st.finished = true;
      this.deliverMail(this.cs.debrief.closingMail);
      this.log('finish', { attempt, total: score.total, solved: score.allCorrect });
    } else {
      const n = this.ladder.onWrong(score.blamed, this.st.playMs);
      if (n) this.deliverNudge(n, 'wrong');
    }
    this.emit('accuse', score);
    this.emit('save');
    return score;
  }

  // ---------------------------------------------------------------- opening: briefing + objectives

  /** Feed the "오늘 할 일" checklist; emits 'objective' with the ids that ticked. */
  private observe(o: Observation): void {
    if (this.objectives.folded()) return;
    const ticked = this.objectives.observe(o, this.st.playMs);
    if (!ticked.length) return;
    for (const id of ticked) this.log('objective', { id });
    this.emit('objective', ticked);
    this.railNext();
  }

  /** Rail: the guide names the next command when an item becomes current (and once at the end). */
  private railNext(): void {
    const rail = this.cs.rail;
    if (!rail) return;
    const st = this.st.rail!;
    const cur = this.objectives.current();
    const key = cur ? cur.id : '__done';
    const text = cur ? cur.say : rail.done;
    if (!text || st.said.includes(key)) return;
    st.said.push(key);
    this.st.queue.push({ due: this.st.playMs + 1500, trigger: `rail:${key}`, action: { message: { channel: rail.channel, from: rail.from, text } } });
  }

  /** Rail: a command that found nothing gets one redirect per item, in the guide's voice. */
  private railOffTrack(line: string): void {
    const rail = this.cs.rail;
    if (!rail || this.objectives.folded()) return;
    const name = line.trim().split(/\s+/)[0] ?? '';
    if (!name || (rail.quiet ?? []).includes(name)) return;
    const cur = this.objectives.current();
    const st = this.st.rail!;
    if (!cur?.next || st.redirected.includes(cur.id)) return;
    st.redirected.push(cur.id);
    this.log('rail-redirect', { item: cur.id, line });
    this.st.queue.push({ due: this.st.playMs + 1200, trigger: `rail-off:${cur.id}`, action: { message: { channel: rail.channel, from: rail.from, text: rail.offRail.replace(/\{next\}/g, cur.next) } } });
  }

  /** The player clicked or typed inside an app window (not the automatic focus on open). */
  interact(app: string): void {
    if (!this.st.log.some((e) => e.type === 'interact' && e.app === app)) this.log('interact', { app });
    this.observe({ type: 'interact', app });
  }

  /** Fold the finished checklist into the notebook (the UI calls this after its tick animation). */
  foldObjectives(): boolean {
    if (!this.objectives.fold(this.st.playMs)) return false;
    this.log('objectives-folded');
    this.emit('objectives-folded');
    this.emit('save');
    return true;
  }

  briefingStart(replay = false): void {
    if (replay) this.st.briefing.replays++;
    else this.st.briefing.startedAt = this.st.playMs;
    this.log('briefing', { action: replay ? 'replay' : 'start' });
  }

  /**
   * Briefing finished or skipped. The first time, the rung-2 idle timer starts from here, so
   * the stuck clock never runs while the player is still being briefed.
   */
  briefingEnd(skipped: boolean, watchedMs: number, step: string, replay = false): void {
    this.log('briefing', { action: skipped ? 'skip' : 'end', watchedMs: Math.round(watchedMs), step, replay: replay || undefined });
    if (replay) return;
    this.st.briefing.endedAt = this.st.playMs;
    this.st.briefing.skipped = skipped;
    this.st.briefing.watchedMs = Math.round(watchedMs);
    this.ladder.progress(this.st.playMs);
    this.emit('save');
  }

  /** First-minutes summary for the playtest log (docs/playtest.md, Q8–Q12). */
  firstMinutes(): Record<string, unknown> {
    const L = this.st.log;
    const cmds = L.filter((e) => e.type === 'cmd');
    const meaningful = L.find((e) => e.type === 'meaningful');
    const audio = L.filter((e) => e.type === 'audio');
    const lastAudio = audio[audio.length - 1];
    return {
      briefing: { ...this.st.briefing },
      firstCommandAt: cmds[0]?.t ?? null,
      firstCommand: cmds[0]?.line ?? null,
      firstMeaningfulCommandAt: meaningful?.t ?? null,
      firstMeaningfulCommand: meaningful?.line ?? null,
      terminalInteractAt: L.find((e) => e.type === 'interact' && e.app === 'terminal')?.t ?? null,
      objectives: (this.cs.opening?.objectives.items ?? []).map((i) => ({ id: i.id, t: this.st.objectives.done[i.id] ?? null })),
      objectivesFoldedAt: this.st.objectives.foldedAt,
      helpOpenedAt: L.find((e) => e.type === 'help')?.t ?? null,
      audio: { changes: audio.map((e) => ({ t: e.t, muted: e.muted, volume: e.volume })), mutedAtEnd: lastAudio ? !!lastAudio.muted : null, volumeAtEnd: lastAudio ? lastAudio.volume : null },
      facilitator: { ...this.st.facilitator },
    };
  }

  // ---------------------------------------------------------------- focus + playtest export

  focus(app: string | null): void {
    if (app === this.st.focusedApp) return;
    this.st.focusedApp = app;
    this.log('focus', { app });
  }

  playtestReport(): Record<string, unknown> {
    const L = this.st.log;
    const first = (type: string) => L.find((e) => e.type === type)?.t ?? null;
    const commands = L.filter((e) => e.type === 'cmd').map((e) => ({ t: e.t, host: e.host, line: e.line }));
    const friction = L.filter((e) => e.type === 'friction');
    return {
      schema: 'no-handover.playtest.v1',
      case: this.cs.id,
      exportedAt: new Date().toISOString(),
      createdAt: this.st.createdAt,
      settings: this.st.settings,
      playMinutes: +(this.st.playMs / 60000).toFixed(1),
      summary: {
        solved: this.st.submissions.some((s) => s.score.allCorrect),
        causeCorrectAt: this.st.submissions.find((s) => s.score.slots.cause?.correct)?.at ?? null,
        submissions: this.st.submissions.map((s) => ({ t: s.at, sub: s.sub, total: s.score.total, slots: s.score.slots })),
        frictionCount: friction.length,
        frictionByKind: friction.reduce<Record<string, number>>((a, e) => ((a[String(e.kind)] = (a[String(e.kind)] ?? 0) + 1), a), {}),
        rung1At: first('rung1'),
        rung2: L.filter((e) => e.type === 'rung2').map((e) => ({ t: e.t, nudge: e.nudge, why: e.why })),
        rung3: L.filter((e) => e.type === 'rung3').map((e) => ({ t: e.t, slot: e.slot, cost: e.cost })),
        cluesFound: Object.entries(this.st.clues).map(([id, v]) => ({ id, t: v.at, via: v.via })).sort((a, b) => a.t - b.t),
        keyCluesTotal: this.cs.clues.filter((c) => c.key).length,
        pins: this.st.pins.length,
        pinnedKeyClues: this.pinnedKeyClues(),
        appSeconds: Object.fromEntries(Object.entries(this.st.appTime).map(([k, v]) => [k, Math.round(v / 1000)])),
        firstMinutes: this.firstMinutes(),
        campaign: this.campaignSummary(),
      },
      commands,
      friction,
      events: L,
    };
  }

  /** Which cases were solved or skipped before this one was opened (docs/playtest.md, Case 0 block). */
  campaignSummary(): Record<string, unknown> {
    const c = this.st.campaignAtStart;
    if (!c) return { known: false };
    const others = (ids: string[]) => ids.filter((id) => id !== this.cs.id);
    // null for the tutorial itself; otherwise whether the tutorial had been solved (not skipped) first
    const playedTutorialFirst = !c.tutorial || c.tutorial === this.cs.id ? null : c.solved.includes(c.tutorial);
    return { known: true, playedTutorialFirst, solvedBefore: others(c.solved), skippedBefore: others(c.skipped) };
  }

  serialize(): string {
    return JSON.stringify(this.st);
  }
}
