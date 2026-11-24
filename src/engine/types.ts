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
  /** Swappable art (paths relative to public/). Missing images fall back to `initial`. */
  avatar?: string;
  /** Small avatar for message bubbles (64px). */
  avatarSmall?: string;
  /** Full-body portrait (debrief cast cards). */
  portrait?: string;
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
  /**
   * Apparent size in bytes when the file is much bigger than its sample `content` (an 11G log
   * whose last lines are readable). Used by ls -l, du; cat refuses files over 50 MB in-world.
   */
  size?: number;
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
  /**
   * Files this process still holds open after their name was removed (fdSample entries ending in
   * " (deleted)"): what `ls -lL /proc/<pid>/fd/<n>`, `du -L` and `/proc/<pid>/fdinfo/<n>` see.
   */
  deleted?: { path: string; size: number; owner: string; group: string; mode: string; mtime: LocalTime; ino: number }[];
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

/** An X.509 certificate as openssl and curl print it. Times are UTC ('2026-11-11T00:00:04'). */
export interface CertDef {
  /** OpenSSL 3 one-line form: 'CN = wiki.example.com'. */
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  /** Hex, no colons. */
  serial: string;
  san?: string[];
  /** 'C8:34:…' as `-fingerprint` prints it. */
  sha1?: string;
  /** The full `-text` dump of the real certificate (otherwise a short one is built from the fields). */
  text?: string[];
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
  /**
   * HTTPS endpoints for `curl https://…` (Case 1): 'wiki.example.com' or 'host:port' -> the
   * certificate the server presents and the body it answers once the handshake passes (-k).
   */
  tls?: Record<string, { ip: string; cert: CertDef; body: string }>;
  /** X.509 certificates `openssl x509 -in <path>` reads (the PEM file itself is in `files`). */
  certs?: Record<string, CertDef>;
  /** Users whose home dirs require sudo to read. */
  sudoRead?: boolean;
  /**
   * Login-shell environment of the session user on this host, merged over the defaults
   * (PATH=/usr/local/bin:/usr/bin:/bin …). E.g. a PATH that ~/.bashrc extends: `echo $PATH`,
   * `which`, `env` and command lookup use it; cron does not (Case 1).
   */
  env?: Record<string, string>;
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
  /**
   * The decisive clue: the one line that makes it click. Its text is the "aha" moment shown once
   * when the clue is found (src/ui/motion.ts; one per case).
   */
  aha?: string;
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
  /**
   * Shown in the report only once all these clues are found (or, for a trigger id, the trigger
   * has fired): a red herring that names a fact the player has to come across first. Never on a correct option (its appearing would give it
   * away); tests/report-options.test.ts checks both.
   */
  needs?: string[];
}

/**
 * One kind of evidence a report slot accepts ("디스크 사용량 증거", "실행 기록"). A pin meets the
 * kind when it proves one of `clues`. The board shows each kind as met / missing, the checklist's
 * "증거 N개" counts only pins that meet some kind, and a slot's citation must be such a pin.
 */
export interface EvidenceKind {
  id: string;
  /** Neutral evidence type shown from the start — never the answer itself. */
  label: string;
  /** Clue ids whose pins count as this kind (red herrings stay out). */
  clues: string[];
}

export interface SlotDef {
  id: SlotId;
  title: string;
  prompt: string;
  type: 'single' | 'multi';
  options: OptionDef[];
  /** Multi: minimum weight sum that counts as correct (no negative picks allowed). */
  pass?: number;
  /**
   * Multi: how many options the report takes — exactly this many (the report stops at N). The
   * slot is correct with N picks, none negative (and `pass`, if given); the best N positive
   * weights make 100; every pick beyond N costs EXTRA_PICK_COST points, so ticking every
   * plausible line never scores 100 (src/engine/scoring.ts).
   */
  picks?: number;
  /**
   * Kinds of evidence this slot accepts. When present the report asks for at least one pinned
   * item per slot as its citation, and the slot only counts as correct when a cited pin meets one
   * of these kinds (src/engine/evidence.ts).
   */
  evidence?: EvidenceKind[];
}

export interface NudgeDef {
  id: string;
  from: string;
  /** Channel id (account 'me') where it lands. */
  channel: string;
  text: string;
  /** Idle nudge is skipped if all of these clues are already found. */
  unlessClues?: string[];
  /** Text when the player asked for it (the quick reply "뭐부터 봐요?"); default `text`. */
  askText?: string;
}

/** Rung 2 on request: quick replies in the messenger composer (docs/case-format.md §9). */
export interface AskDef {
  /** Quick-reply chips the player can send, e.g. ['뭐부터 봐요?', '막혔어요']. */
  prompts: string[];
  /** Tutorial: while the rail has a current item, its guide answers with this; `{next}` = the item's `next`. */
  rail?: string;
  /** Answer once every idle nudge is used or already covered by found clues. */
  none: { from: string; channel: string; text: string };
}

/** One "방향" (direction) line of the hint panel for a report slot. */
export interface DirectionDef {
  slot: SlotId;
  text: string;
  /** Senior mode only: points taken off when it is revealed. */
  cost: number;
  /** Shown first while these clues are not all found yet ("where to look next"). */
  unlessClues?: string[];
  /**
   * Second part of the same direction: what to put side by side once you are there (two facts,
   * or a fact against the report's options), never the conclusion. `text` is the first part: the
   * concrete place (host or tab, command, file, panel, pin). The panel opens `text` first, then
   * this; when `unlessClues` are already found it opens this straight away (src/engine/hintpanel.ts).
   */
  compare?: string;
}

export interface HintsDef {
  idleMinutes: number;
  /** Fired in order while the player is stuck on the cause slot. */
  idle: NudgeDef[];
  /** person id -> nudge when an accusation blames that person; 'default' for other wrong answers. */
  wrong: Record<string, NudgeDef>;
  /**
   * Rung 3, the 💡 panel's "방향" lines per slot (also the old explicit hints). The panel also has
   * "요약" (found clues, generated) and "정답" (`answers`, default: the correct option text).
   */
  explicit: DirectionDef[];
  /**
   * "정답" rung per slot: the specifics (times, files, numbers) shown under the correct option(s),
   * which stay hypotheses without them. The step always names the correct option(s) and the
   * evidence kinds the slot accepts.
   */
  answers?: Partial<Record<SlotId, string>>;
  /** Senior mode only: points taken off for a revealed answer (default 30). */
  answerCost?: number;
  /** Rung 2 on request ("ask a colleague"). Omitted = no quick replies. */
  ask?: AskDef;
  /** The 💡 panel also covers the current "오늘 할 일" item while the checklist is open (Case 0). */
  objectivePanel?: boolean;
}

export type TriggerWhen = { clue: string } | { afterMin: number } | { allClues: string[] };
export type TriggerAction =
  /** `deleteAfterSec`: the sender deletes it again after this long (written, then deleted). */
  | { message: { channel: string; from: string; text: string; delaySec?: number; deleteAfterSec?: number } }
  | { mail: string }
  | { note: string }
  | { toast: string };

export interface TriggerDef {
  id: string;
  when: TriggerWhen;
  actions: TriggerAction[];
}

/**
 * The case's last scene (docs/case-format.md §15): after the final report (right, or out of
 * submissions) and before the debrief, 15–30 s that end the case on a feeling rather than a score.
 * Beats play in order, each `wait` seconds after the previous one has landed; Esc skips to the
 * debrief. 은재 does not speak: she appears only as what 도윤 writes down.
 */
export interface EndingDef {
  beats: EndingBeat[];
}

export type EndingBeat = { wait: number } & (
  /** A colleague's message, seen typing first (voiced like any other line: src/engine/voices.ts). */
  | { message: { channel: string; from: string; text: string } }
  /**
   * 도윤's notebook opens on this page and `line` is written in under the last line, letter by
   * letter (`{hm}` = the game clock). Without `line` the page's `reveal` line is written again.
   */
  | { note: string; line?: string }
  /** This mail arrives (if it has not yet) and opens. */
  | { mail: string }
  /**
   * The player acts: the terminal tab's prompt holds `prefill` and the desktop sticky `sticky`
   * (index) pulses; the scene waits until a command in that tab matches `until` (then `note`, a
   * notebook line, is written) or `timeoutSec` passes (nothing is written).
   */
  | { act: { tab: number; prefill: string; until: string; timeoutSec?: number; sticky?: number; note?: { id: string; line: string } } }
);

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
  /** Character cards on the debrief: person id + one line on what they hid and why. */
  cast?: { who: string; text: string }[];
}

export interface CaseFile {
  id: string;
  title: string;
  subtitle: string;
  company: string;
  /** Mail domain for git authors etc. (use a reserved .example domain). */
  domain: string;
  /** `rate`: game-clock speed (default 16 = 45 min of play for 09:00→21:00). */
  clock: { start: LocalTime; deadline: LocalTime; tz: string; rate?: number };
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
  /** Dashboard snapshot as ASCII lines (shown as a text panel when `panels` is absent). */
  dashboard: string[];
  /**
   * Optional structured dashboard (docs/case-format.md §6): time-series, stat panels and
   * annotations drawn by the dashboard app and linked to the evidence board. Without it the
   * ASCII `dashboard` lines are shown in a text panel.
   */
  panels?: DashboardDef;
  clues: ClueDef[];
  /**
   * Report slots (any subset of cause / sequence / responsibility, in display order).
   * `maxSubmissions: 0` = unlimited. `intro` and `reply` override the CTO framing of case 3.
   */
  accusation: {
    slots: SlotDef[];
    maxSubmissions: number;
    intro?: string;
    /**
     * Reply after a wrong report: who answers and the signature. `lines`: the short line under the
     * per-field ✓/✗ marks when `feedback` is 'marks' (one per attempt, in turn, so a second wrong
     * report does not hear the same words).
     */
    reply?: { from: string; sign: string; lines?: string[] };
    /**
     * A wrong report always shows each field ✓/✗ (the score still pays for the attempt).
     * 'marks' (default): the marks and one short line. 'hints' (Cases 0–2 outside 숙련자 모드): the
     * colleague also says, per field, what does not fit yet (the field's kind — cause, timeline,
     * contributing factors — and an evidence kind with no pin on the board), never which option.
     */
    feedback?: 'marks' | 'hints';
  };
  hints: HintsDef;
  triggers: TriggerDef[];
  debrief: DebriefDef;
  /** The last scene between the final report and the debrief (optional). */
  ending?: EndingDef;
  /** First minutes: briefing scene + "오늘 할 일" objectives (optional; see docs/case-format.md §12). */
  opening?: OpeningDef;
  /** Tutorial shell: only these commands run; other real commands answer in-world (docs/case-format.md §13). */
  shell?: ShellDef;
  /** Lock-screen texts (default: case 3's security-team framing from src/i18n.ts). */
  boot?: { status?: string; unlock?: string; note?: string };
  /** Terminal tabs shown as closed sessions next to the live ones (atmosphere only). */
  deadTabs?: string[];
  /** Tutorial rail: a colleague walks the player through the objectives (docs/case-format.md §13). */
  rail?: RailDef;
  /**
   * Desktop icons for this case, in order. `after` = an objective id: the icon appears once that
   * item is ticked (or the checklist folds). Default: all seven apps from the start.
   */
  desktop?: { icons: { app: string; after?: string }[] };
  /** Guided tool tour: short coach marks anchored to apps, each shown once (docs/case-format.md §13). */
  tour?: TourDef;
  /**
   * "이번 사건에서 밝혀낼 것": the goal card lists the report's slots (title + prompt, no answers).
   * `intro` is the line above them; default: who the report goes to and how many submissions.
   */
  goal?: { intro?: string };
  /**
   * 숙련자 모드 (docs/campaign-ladder.md §숙련자 모드): what changes when the player chose the
   * harder mode. Applied by src/engine/expert.ts over a copy of the case; the default path never
   * sees any of it.
   */
  expert?: ExpertDef;
}

/**
 * 숙련자 모드 overlay for one case. Besides these fields the mode folds the "오늘 할 일" checklist
 * from the start (no steps, no rail), sends no unasked colleague nudges, and charges hint steps,
 * recaps and asks (src/engine/expert.ts).
 */
export interface ExpertDef {
  /** Submissions in this mode (the default path keeps `accusation.maxSubmissions`). */
  maxSubmissions: number;
  /** Play minutes before the time cost starts (−5 for every full 2 minutes over, at most −30). */
  parMin: number;
  /** Texts that name the submission count, rewritten for this mode. */
  intro?: string;
  goalIntro?: string;
  after?: string[];
  /** Extra or replaced files (same path = replaced), per host. */
  files?: { host: string; file: FileDef }[];
  /** `df` output replaced, per host. */
  df?: { host: string; lines: string[] }[];
  /** Extra timeline events (journal lines, messages) appended to the case's. */
  timeline?: TimelineEvent[];
  /**
   * A user's shell history on a host, replaced: the case's history lines for that host and user
   * are dropped and these are used instead (the shorter record a senior has to read into).
   */
  history?: { host: string; user: string; lines: { at: LocalTime; cmd: string }[] }[];
  /** A user's crontab on a host, replaced. */
  crontabs?: { host: string; user: string; content: string }[];
  /** Extra or replaced mails (same id = replaced). */
  mails?: MailDef[];
  /** Terminal tabs, replaced (the frozen screen and the pre-typed command). */
  terminalTabs?: TabDef[];
  /** Desktop stickies, replaced. */
  stickies?: Sticky[];
  /** Extra clues (the red herring and what rules it out; never in an evidence kind). */
  clues?: ClueDef[];
  /** Extra report options (the red herring), inserted into a slot at `at` (default: the end). */
  options?: { slot: SlotId; at?: number; option: OptionDef }[];
}

/** One coach mark: what an app is for, shown when it first matters. Anchored by app id only. */
export interface TourStep {
  id: string;
  /** App id ('terminal', 'notes', …) or a tray control ('hint', 'help', 'goal'). */
  app: string;
  title: string;
  text: string;
  /** Wait until this objective is ticked (or the checklist folds). */
  after?: string;
  /** Wait until this many minutes of play. */
  afterMin?: number;
}

export interface TourDef {
  steps: TourStep[];
}

export interface RailDef {
  /** Person id and channel (account 'me') of the guide. */
  from: string;
  channel: string;
  /** One-line redirect for a command that found nothing while an item is current; `{next}` = the item's `next`. Once per item. */
  offRail: string;
  /** Commands that never count as off-rail (help, man …). */
  quiet?: string[];
  /** Sent when every item is ticked. */
  done?: string;
  /** Terminal lines that match a clue are highlighted (yellow), like clmystery's CLUE marker. */
  highlightClues?: boolean;
}

export interface ShellDef {
  /** Command names that run. Anything else that exists answers with `refuse`. */
  allow: string[];
  /** In-world refusal for a real command outside `allow`; `{cmd}` is replaced by its name. */
  refuse: string;
  /** Lines printed by `help` instead of the full tool list. */
  help?: string[];
}

// ------------------------------------------------------------------ opening (first 3 minutes)

/** One condition that ticks an objective. Evaluated by src/engine/objectives.ts. */
export type ObjectiveCond =
  /** The player clicked or typed inside this app's window (auto-focus on open does not count). */
  | { interact: string }
  /** A terminal command was run; `cmd` is a regex on the typed line ('' = any command). */
  | { cmd: string; host?: string }
  /** A terminal output line (not the typed line) matched this regex. */
  | { output: string; host?: string }
  /** A clue was found. */
  | { clue: string }
  /** The player opened something (same keys as clue `open` matches). */
  | { open: string }
  /**
   * At least this many pins on the evidence board that count as evidence: pins that meet some
   * report slot's evidence kind (any pin when the case defines no kinds), and every slot with
   * kinds backed by at least one of them (the report asks each slot for a citation).
   */
  | { pins: number };

export interface ObjectiveDef {
  id: string;
  /** Checkbox label on the sticky. */
  text: string;
  /** Small scaffolding line shown only while this is the current (first unticked) item: a nudge, not the command. */
  hint?: string;
  /** 💡 panel "방향" for this item (`hints.objectivePanel`): names the tool and what to look at; default: `hint`. */
  direction?: string;
  /** Any one condition ticks the item. */
  any: ObjectiveCond[];
  /** App window to pulse while this item is current (e.g. 'terminal'). */
  pulse?: string;
  /** Rail (tutorial): the guide's message when this item becomes the current one. */
  say?: string;
  /** Rail: what to look at next, named in the off-rail redirect and the ask reply ("{next}부터 봐요"); a nudge, not the command. */
  next?: string;
  /**
   * Rail: command lines (regex) that are on the way to this item even when they find no new clue
   * (e.g. a second `du` one level down), so they never get the off-rail redirect.
   */
  onTrack?: string[];
  /** 💡 panel "정답" for this item (`hints.objectivePanel`): the exact command; default: "터미널에 그대로 치세요: {next}". */
  answer?: string;
}

export interface BriefingLine {
  text: string;
  /** Pause after the line is typed out (ms, default 700). */
  pauseMs?: number;
}

export interface OpeningDef {
  briefing: {
    /** Lock-screen clock text, e.g. '09:00', and date line. */
    lockTime: string;
    lockDate: string;
    /** Person id of the caller and how the call is framed. */
    caller: string;
    kind: 'voice' | 'call';
    /** Audio manifest id of the recorded line; plays if the file exists, otherwise the subtitles carry it. */
    voiceCue?: string;
    /** Subtitle lines, typed out one by one (case content, Korean). */
    lines: BriefingLine[];
    /** Mail id that slides in as a notification near the end. */
    mail: string;
    /** One-line preview under the mail subject. */
    mailPreview: string;
  };
  objectives: {
    title: string;
    items: ObjectiveDef[];
    /** Lines added under the folded checklist in the notebook (what to do next). */
    after: string[];
  };
}

// ------------------------------------------------------------------ dashboard panels (optional)

/** Named series colour (the UI maps it to its palette; the shape/label carries the meaning too). */
export type SeriesColor = 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'grey';

export interface SeriesDef {
  name: string;
  /**
   * Value changes as [time, value]; `null` = no data from that time on. With `interp: 'step'`
   * (default) a value holds until the next point; 'linear' draws a ramp between points.
   */
  points: [LocalTime, number | null][];
  interp?: 'step' | 'linear';
  /** Deterministic noise, as a fraction of the value (0.05 = ±5 %). */
  jitter?: number;
  color?: SeriesColor;
}

export interface ThresholdDef {
  value: number;
  /** Shown on the line, e.g. '알림 기준 20%' or '한도 4096'. */
  label: string;
}

export interface TimeSeriesPanelDef {
  id: string;
  title: string;
  /** Appended to values: '%', 'ms', '/분' … */
  unit?: string;
  min?: number;
  max?: number;
  series: SeriesDef[];
  thresholds?: ThresholdDef[];
  /** 'half' panels sit two per row on wide screens; default 'full'. */
  width?: 'full' | 'half';
  /** Shown from the panel menu ("설명"). */
  description?: string;
}

export interface StatPanelDef {
  title: string;
  /** Display text ('42%', '0건'); `null` = the panel has no data ("데이터 없음"). */
  value: string | null;
  /** Colour plus a word on the panel; 'none' = neutral. */
  state?: 'ok' | 'warn' | 'crit' | 'none';
  note?: string;
}

export type AnnotationKind = 'deploy' | 'cron' | 'alert' | 'error' | 'event';

export interface DashboardDef {
  title: string;
  /** Window the snapshot covers and its sample step (minutes). */
  from: LocalTime;
  to: LocalTime;
  stepMin: number;
  /**
   * Live dashboard: after `to` the series keep their last values up to the in-game clock and
   * the graphs grow as the clock runs. Without it the panels stop at `to` (an archive).
   */
  live?: boolean;
  timeseries: TimeSeriesPanelDef[];
  stats?: StatPanelDef[];
  /** Annotations already on the archived dashboard (what the snapshot itself shows). */
  annotations?: { at: LocalTime; label: string; kind: AnnotationKind }[];
  /** Extra labelled ticks on the time axis (like the ASCII snapshot's 03:15 / 05:40). */
  marks?: LocalTime[];
}
