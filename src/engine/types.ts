// Case data schema. One case = one object of type CaseFile (see docs/case-format.md).
// Everything the player can read (files, logs, history, messages, mails) is either written
// here literally or generated from `timeline` emits and `generators` by src/engine/build.ts.

/** Local wall-clock time in the case's timezone, 'YYYY-MM-DDTHH:MM[:SS]'. */
export type LocalTime = string;

export type SlotId = 'cause' | 'sequence' | 'responsibility';

export interface Person {
  name: string;
  role: string;
  /** Short avatar text (one syllable) and colour used by the messenger. */
  initial: string;
  color: string;
  /** Swappable avatar image (path relative to public/, e.g. 'avatars/doyun.png'). Falls back to `initial`. */
  avatar?: string;
  /** Unix login on the case hosts, if any. */
  login?: string;
}

export interface FileDef {
  path: string;
  content: string;
  owner?: string;
  group?: string;
  /** Octal permission string such as '644', '600', '750'. Default 644 (dirs 755). */
  mode?: string;
  mtime?: LocalTime;
  /** Personal file: the first `cat` asks the player to confirm (Doyun hesitates). */
  private?: boolean;
  /** Binary file: cat prints a short notice instead of content. */
  binary?: string;
}

export interface ProcDef {
  pid: number;
  user: string;
  cmd: string;
  /** Open file descriptors right now (Monday). /proc/<pid>/fd is generated from this. */
  fdCount: number;
  limitNofile: number;
  /** Optional first fds shown by `ls -l /proc/<pid>/fd` (the rest are sockets). */
  fdSample?: string[];
}

export interface UnitDef {
  name: string;
  unitFile: string;
  pid?: number;
  /** `systemctl show -p` properties. */
  props: Record<string, string>;
  statusLines: string[];
}

export interface CommitDef {
  sha: string;
  parent?: string;
  author: string;
  authorDate: LocalTime;
  committer?: string;
  commitDate?: LocalTime;
  subject: string;
  body?: string;
  diff?: string;
}

export interface RepoDef {
  /** Working tree path where `git` commands work (e.g. /home/eunjae/src/pay-config). */
  path: string;
  branch: string;
  /** Local and remote-tracking branch heads, e.g. { main: 'a1b2', 'remotes/origin/main': 'a1b2' }. */
  refs: Record<string, string>;
  commits: CommitDef[];
}

export interface HostDef {
  name: string;
  /** Login user for terminal sessions on this host. */
  user: string;
  ip: string;
  motd?: string[];
  files: FileDef[];
  /** user -> crontab text */
  crontabs?: Record<string, string>;
  groups?: Record<string, { gid: number; members: string[] }>;
  procs?: ProcDef[];
  units?: UnitDef[];
  repos?: RepoDef[];
  /** `last` output lines, newest first (without the trailing wtmp line). */
  last?: string[];
  df?: string[];
  free?: string[];
  /** Shell soft limit printed by `ulimit -n`. */
  ulimitN?: number;
  /** Lines for `ss -s`. */
  ssSummary?: string[];
  /** Established TCP connections listed by `ss -tan` (generated). */
  ssConns?: { count: number; local: string; peer: string; process?: string };
  uptime?: string;
  /** curl targets: 'localhost:8080/metrics' -> response body. */
  http?: Record<string, string>;
  /** Users whose home dirs require sudo to read. */
  sudoRead?: boolean;
}

export type LogFormat = 'syslog' | 'nginx' | 'iso' | 'raw';

export type Emit =
  | { kind: 'journal'; host: string; unit: string; ident?: string; pid?: number; msg: string; priority?: number; repeat?: { count: number; everySec: number } }
  | { kind: 'log'; host: string; path: string; format: LogFormat; line: string }
  | { kind: 'history'; host: string; user: string; n?: number; cmd: string }
  | { kind: 'message'; id?: string; channel: string; from: string; text: string; deletedAt?: LocalTime };

export interface TimelineEvent {
  at: LocalTime;
  /** Author-only note (not shown to the player; used by docs and the debrief editor). */
  note?: string;
  emits?: Emit[];
}

/** Repeating patterns for bulk, realistic noise. All seeded and deterministic. */
export type GeneratorDef =
  | {
      kind: 'sequence';
      target: { host: string; path: string; format: LogFormat } | { host: string; journal: { unit: string; ident?: string; pid?: number } };
      count: number;
      start: LocalTime;
      /** Gap between repetitions in minutes [min, max]; daytimeOnly snaps to 09:00-19:00. */
      gapMin: [number, number];
      daytimeOnly?: boolean;
      /** Step lines may use {ts}, {i} (0-based), {n} (1-based), {id} (idBase+i), {r2} (10-99), {r3} (100-999). */
      steps: { afterSec: [number, number]; line: string }[];
      idBase?: number;
      seed: number;
    }
  | {
      kind: 'periodic';
      host: string;
      journal: { unit: string; ident?: string; pid?: number };
      from: LocalTime;
      to: LocalTime;
      everyMin: number;
      /** `{v}` = value of the last step whose `from` <= t; `{k}` = a pid-like number that changes per tick. */
      line: string;
      steps: { from: LocalTime; v: string }[];
      /** Skip ticks inside these windows (they are written by timeline events instead). */
      skip?: [LocalTime, LocalTime][];
    }
  | {
      kind: 'historyFill';
      host: string;
      user: string;
      /** Commands to sample; timestamps are spread on weekdays 10:00-18:30 between from and to. */
      pool: string[];
      from: LocalTime;
      to: LocalTime;
      seed: number;
    };

export interface ChannelDef {
  id: string;
  /** Which messenger account sees it: the departed senior's live session, or the player's own. */
  account: 'pc' | 'me';
  kind: 'channel' | 'dm';
  title: string;
  /** For DMs: the other person (person id). */
  with?: string;
  /** Unsent text left in the input box (drafts folder lists these). */
  draft?: string;
  /** Collapse runs of messages from this sender ("알림 37건"). */
  collapseFrom?: string;
}

export interface MailDef {
  id: string;
  account: 'pc' | 'me';
  folder: 'inbox' | 'drafts';
  from: string;
  to: string;
  cc?: string;
  at: LocalTime;
  subject: string;
  body: string;
  locked?: string;
  /** Delivered later (see triggers); hidden until then. */
  later?: boolean;
}

export interface NoteDef {
  id: string;
  title: string;
  lines: string[];
  /** Line index highlighted when a `note` trigger fires. */
  highlight?: number;
  /** Line appended under the highlighted line when the trigger fires (Doyun's afterthought). */
  reveal?: string;
}

export interface Sticky {
  text: string;
  x: number;
  y: number;
  color?: string;
}

export interface NotificationDef {
  id: string;
  at: LocalTime;
  app: string;
  title: string;
  text: string;
}

export interface TabDef {
  label: string;
  host: string;
  cwd: string;
  prefill?: string;
  /** Lines shown above the prompt when the tab first opens (the frozen screen). */
  scrollback?: string[];
}

/** How a clue is detected. Regexes are strings (flags 'i' unless `cs`). */
export type Matcher =
  | { output: string; host?: string; cs?: boolean }
  | { command: string }
  | { open: string };

export interface ClueDef {
  id: string;
  label: string;
  slot: SlotId;
  /** Key clue: counts as progress, evidence bonus when pinned. */
  key?: boolean;
  /** Rung-1 diegetic trace (logged as "player reached rung 1"). */
  trace?: boolean;
  match: Matcher[];
}

export interface OptionDef {
  id: string;
  text: string;
  correct?: boolean;
  /** Multi-select scoring weight (responsibility slot). */
  weight?: number;
  /** Wrong option that blames a person: picks the colleague nudge. */
  blames?: string;
}

export interface SlotDef {
  id: SlotId;
  title: string;
  prompt: string;
  type: 'single' | 'multi';
  options: OptionDef[];
  /** Multi: minimum weight sum that counts as correct (no negative picks allowed). */
  pass?: number;
}

export interface NudgeDef {
  id: string;
  from: string;
  /** Channel id (account 'me') where it lands. */
  channel: string;
  text: string;
  /** Idle nudge is skipped if all of these clues are already found. */
  unlessClues?: string[];
}

export interface HintsDef {
  idleMinutes: number;
  /** Fired in order while the player is stuck on the cause slot. */
  idle: NudgeDef[];
  /** person id -> nudge when an accusation blames that person; 'default' for other wrong answers. */
  wrong: Record<string, NudgeDef>;
  /** Rung 3, per slot, in order. */
  explicit: { slot: SlotId; text: string; cost: number }[];
}

export type TriggerWhen = { clue: string } | { afterMin: number } | { allClues: string[] };
export type TriggerAction =
  | { message: { channel: string; from: string; text: string; delaySec?: number } }
  | { mail: string }
  | { note: string }
  | { toast: string };

export interface TriggerDef {
  id: string;
  when: TriggerWhen;
  actions: TriggerAction[];
}

export interface CommandCard {
  title: string;
  cmd: string;
  explain: string;
}

export interface DebriefDef {
  headline: string;
  story: { at: string; text: string }[];
  systemFactors: string[];
  principle: string;
  cards: CommandCard[];
  closingMail: string;
  doyunLine: string;
}

export interface CaseFile {
  id: string;
  title: string;
  subtitle: string;
  company: string;
  /** Mail domain for git authors etc. (use a reserved .example domain). */
  domain: string;
  clock: { start: LocalTime; deadline: LocalTime; tz: string };
  player: string;
  owner: string;
  people: Record<string, Person>;
  hosts: HostDef[];
  timeline: TimelineEvent[];
  generators: GeneratorDef[];
  channels: ChannelDef[];
  mails: MailDef[];
  notes: NoteDef[];
  stickies: Sticky[];
  notifications: NotificationDef[];
  terminalTabs: TabDef[];
  dashboard: string[];
  clues: ClueDef[];
  accusation: { slots: SlotDef[]; maxSubmissions: number };
  hints: HintsDef;
  triggers: TriggerDef[];
  debrief: DebriefDef;
}
