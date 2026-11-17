// Simulated bash for the investigation session. Real syntax and output formats for a fixed
// set of read-only tools; everything that would change the machine is refused in-world.

import { expandAliases, parse, ParseError, type ListItem, type SimpleCmd, type Word } from './parser.ts';
import type { HistEntry, HostWorld, World } from './build.ts';
import { errText, Vfs, type VNode, type Who } from './vfs.ts';
import { fmtDate, fmtGit, fmtIso, fmtLs, fmtSyslog, parseLocal, parseSince } from './time.ts';
import { manFor } from './manpages.ts';
import type { CommitDef, RepoDef } from './types.ts';

export interface Frame {
  host: string;
  user: string;
  cwd: string;
  prevCwd: string;
  typed: HistEntry[];
  ulimitN?: number;
}

export interface Session {
  id: string;
  frames: Frame[];
  sudoNoted: boolean;
  privateOk: string[];
  lastCode: number;
}

export type ShellEvent =
  | { type: 'notfound'; name: string; suggestion?: string }
  | { type: 'blocked'; cmd: string }
  | { type: 'sudo'; cmd: string; allowed: boolean }
  | { type: 'ssh'; host: string }
  | { type: 'exit'; host: string }
  | { type: 'private'; path: string; opened: boolean }
  | { type: 'syntax'; msg: string }
  | { type: 'hint' };

export interface OutLine {
  text: string;
  cls?: 'err' | 'dim' | 'sys';
}

export interface RunResult {
  lines: OutLine[];
  clear?: boolean;
  events: ShellEvent[];
  /** The line after alias expansion (for logs). */
  expanded: string;
}

interface IO {
  out: string[];
  err: string[];
  code: number;
}

interface Ctx {
  s: Session;
  f: Frame;
  hw: HostWorld;
  args: string[];
  stdin: string[] | null;
  sudo: boolean;
  events: ShellEvent[];
  sys: OutLine[];
}

type Cmd = (c: Ctx) => IO;

const ok = (out: string[] = []): IO => ({ out, err: [], code: 0 });
const fail = (err: string | string[], code = 1, out: string[] = []): IO => ({ out, err: Array.isArray(err) ? err : [err], code });

/** Real tools that exist on a Linux box but are disabled or absent in the investigation session. */
const BLOCKED: Record<string, string> = {
  vim: '파일 보기는 cat / less 를 쓰세요.', vi: '파일 보기는 cat / less 를 쓰세요.', nano: '파일 보기는 cat / less 를 쓰세요.', emacs: '파일 보기는 cat / less 를 쓰세요.',
  rm: '', mv: '', cp: '', touch: '', mkdir: '', rmdir: '', chmod: '', chown: '', ln: '', tee: '', dd: '', truncate: '',
  kill: '', killall: '', pkill: '', reboot: '', shutdown: '', service: 'systemctl status / show 는 쓸 수 있어요.',
  apt: '', 'apt-get': '', yum: '', dnf: '', pip: '', npm: '',
  top: 'ps aux 로 한 번에 보세요.', htop: 'ps aux 로 한 번에 보세요.', watch: '', screen: '', tmux: '',
  lsof: '이 서버에는 lsof가 설치되어 있지 않아요. 대신: ls -l /proc/<PID>/fd',
  strace: '', gdb: '', tcpdump: '', nc: '', telnet: '', wget: 'curl 은 쓸 수 있어요.', scp: '', rsync: '',
  docker: '이 서버에는 컨테이너가 없어요.', kubectl: '이 서버에는 쿠버네티스가 없어요.',
  su: 'sudo (읽기 전용) 만 허용돼요.', passwd: '', useradd: '', usermod: '', crontab_e: '',
  python: '', python3: '', perl: '', node: '', awk: 'grep / head / tail / wc / sort / uniq 로 대신해 보세요.', sed: 'grep / head / tail / wc / sort / uniq 로 대신해 보세요.',
  mount: '', fdisk: '', ip: '', ifconfig: '', netstat: 'ss 를 쓰세요 (netstat의 후속 도구).', dig: '', nslookup: '', host: '', traceroute: '',
};

/** Files bigger than this are not dumped by cat (the player is pointed at head/tail instead). */
export const CAT_LIMIT = 50 * 1024 * 1024;

const SUDO_OK = new Set(['cat', 'less', 'more', 'head', 'tail', 'ls', 'grep', 'wc', 'journalctl', 'crontab', 'ss', 'find', 'sort', 'uniq', 'last', 'id', 'whoami']);

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  return dp[a.length][b.length];
}

/** Closest known command within edit distance 2 (transpositions count as 1). */
export function suggest(name: string, known: string[]): string | undefined {
  let best: string | undefined;
  let bd = 3;
  for (const k of known) {
    if (Math.abs(k.length - name.length) > 2) continue;
    const d = lev(name, k);
    if (d < bd && d <= (name.length <= 3 ? 1 : 2)) {
      bd = d;
      best = k;
    }
  }
  return best;
}

/** Convert a grep basic/extended regex to a JS RegExp source. */
export function grepRegex(pat: string, opts: { E: boolean; F: boolean; w: boolean; i: boolean }): RegExp {
  let src: string;
  if (opts.F) src = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  else if (opts.E) src = pat;
  else {
    // BRE: \| \( \) \{ \} \+ \? are operators; bare ones are literals.
    src = '';
    for (let i = 0; i < pat.length; i++) {
      const c = pat[i];
      if (c === '\\' && i + 1 < pat.length) {
        const nx = pat[i + 1];
        if ('|(){}+?'.includes(nx)) src += nx;
        else src += '\\' + nx;
        i++;
      } else if ('|(){}+?'.includes(c)) src += '\\' + c;
      else src += c;
    }
  }
  if (opts.w) src = `(?<![\\w])(?:${src})(?![\\w])`;
  try {
    return new RegExp(src, opts.i ? 'iu' : 'u');
  } catch {
    return new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), opts.i ? 'iu' : 'u');
  }
}

function human(n: number): string {
  if (n < 1024) return String(n);
  const u = ['K', 'M', 'G', 'T'];
  let v = n;
  let i = -1;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + u[i];
}

/** Parse short flags (-abc, -n 5, -n5) and long flags; returns flags map + positional args. */
function getopt(args: string[], withValue: string[] = [], longWithValue: string[] = []) {
  const flags = new Map<string, string | true>();
  const pos: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      pos.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=');
      if (eq > 0) flags.set(a.slice(2, eq), a.slice(eq + 1));
      else if (longWithValue.includes(a.slice(2)) && i + 1 < args.length) flags.set(a.slice(2), args[++i]);
      else flags.set(a.slice(2), true);
    } else if (a.startsWith('-') && a.length > 1 && !/^-\d+$/.test(a)) {
      for (let j = 1; j < a.length; j++) {
        const ch = a[j];
        if (withValue.includes(ch)) {
          const rest = a.slice(j + 1);
          flags.set(ch, rest || args[++i] || '');
          break;
        }
        flags.set(ch, true);
      }
    } else if (/^-\d+$/.test(a)) flags.set('num', a.slice(1));
    else pos.push(a);
  }
  return { flags, pos };
}

export class Shell {
  readonly commands: Record<string, Cmd>;
  readonly world: World;
  readonly now: () => number;
  constructor(world: World, now: () => number) {
    this.world = world;
    this.now = now;
    this.commands = this.makeCommands();
  }

  newSession(id: string, host: string, cwd: string): Session {
    const hw = this.host(host);
    return { id, frames: [{ host, user: hw.def.user, cwd, prevCwd: cwd, typed: [] }], sudoNoted: false, privateOk: [], lastCode: 0 };
  }

  host(name: string): HostWorld {
    const h = this.world.hosts.get(name);
    if (!h) throw new Error(`no host ${name}`);
    return h;
  }

  frame(s: Session): Frame {
    return s.frames[s.frames.length - 1];
  }

  prompt(s: Session): string {
    const f = this.frame(s);
    const home = `/home/${f.user}`;
    const cwd = f.cwd === home ? '~' : f.cwd.startsWith(home + '/') ? '~' + f.cwd.slice(home.length) : f.cwd;
    return `${f.user}@${f.host}:${cwd}$`;
  }

  who(f: Frame, sudo = false): Who {
    const hw = this.host(f.host);
    const groups = [f.user];
    const g = hw.vfs.lookup('/etc/group');
    if (g && typeof g.content === 'string')
      for (const line of g.content.split('\n')) {
        const [name, , , members] = line.split(':');
        if (members?.split(',').includes(f.user)) groups.push(name);
      }
    return { user: f.user, groups, sudo };
  }

  /** Commands the player can run here (the tutorial narrows this to its allow list). */
  knownCommands(): string[] {
    const allow = this.world.cs.shell?.allow;
    return Object.keys(this.commands).filter((c) => !allow || allow.includes(c));
  }

  /** Run one input line. Records it in the frame's history (bash records even failing lines). */
  run(s: Session, line: string): RunResult {
    const f = this.frame(s);
    const events: ShellEvent[] = [];
    const trimmed = line.trim();
    if (trimmed && !line.startsWith(' ')) f.typed.push({ n: 0, ts: this.now(), cmd: trimmed });
    if (!trimmed) return { lines: [], events, expanded: '' };

    // history expansion: !! and !n
    let src = trimmed;
    if (/^!!$|^!\d+$/.test(src)) {
      const all = this.historyOf(f);
      const prev = src === '!!' ? all[all.length - 2] : all.find((h) => h.n === +src.slice(1));
      if (!prev) return { lines: [{ text: `bash: ${src}: event not found`, cls: 'err' }], events, expanded: src };
      src = prev.cmd;
      f.typed[f.typed.length - 1].cmd = src;
    }

    const aliases = this.host(f.host).aliases.get(f.user) ?? new Map();
    const expanded = expandAliases(src, aliases);
    let items: ListItem[];
    try {
      items = parse(expanded);
    } catch (e) {
      const msg = e instanceof ParseError ? e.message : String(e);
      events.push({ type: 'syntax', msg });
      return { lines: [{ text: `bash: ${msg}`, cls: 'err' }], events, expanded };
    }
    const lines: OutLine[] = [];
    if (expanded !== src) lines.push({ text: `→ ${expanded}`, cls: 'dim' });
    let clear = false;
    let prevCode = 0;
    let prevNext: ListItem['next'] = null;
    for (const it of items) {
      if (prevNext === '&&' && prevCode !== 0) {
        prevNext = it.next;
        continue;
      }
      if (prevNext === '||' && prevCode === 0) {
        prevNext = it.next;
        continue;
      }
      const sys: OutLine[] = [];
      const r = this.runPipeline(s, it.pipeline.cmds, events, sys);
      if (r.clear) {
        clear = true;
        lines.length = 0;
      }
      lines.push(...sys);
      for (const l of r.out) lines.push({ text: l });
      for (const l of r.err) lines.push({ text: l, cls: 'err' });
      prevCode = r.code;
      prevNext = it.next;
    }
    s.lastCode = prevCode;
    return { lines, clear, events, expanded };
  }

  private runPipeline(s: Session, cmds: SimpleCmd[], events: ShellEvent[], sys: OutLine[]): IO & { clear?: boolean } {
    let stdin: string[] | null = null;
    let last: IO = ok();
    const errs: string[] = [];
    let clear = false;
    for (let k = 0; k < cmds.length; k++) {
      const c = cmds[k];
      const f = this.frame(s);
      let argv: string[];
      try {
        argv = c.words.flatMap((w) => this.expandWord(s, w, events));
      } catch (e) {
        return { out: [], err: [String((e as Error).message)], code: 1 };
      }
      // redirections
      let discardErr = false;
      let errToOut = false;
      for (const r of c.redirs) {
        const target = r.target ? this.expandWord(s, r.target, events).join(' ') : '';
        if (r.op === '2>&1') errToOut = true;
        else if ((r.op === '2>' || r.op === '2>>') && target === '/dev/null') discardErr = true;
        else if ((r.op === '>' || r.op === '>>' || r.op === '&>') && target === '/dev/null') {
          if (r.op === '&>') discardErr = true;
          argv.push('\u0000devnull');
        } else if (r.op === '<') {
          const txt = this.host(f.host).vfs.readFile(Vfs.normalize(target, f.cwd, `/home/${f.user}`), this.who(f));
          if (typeof txt === 'string' && !(txt in errText)) stdin = txt.split('\n');
          else return fail(`bash: ${target}: ${errText[txt as keyof typeof errText] ?? 'No such file or directory'}`);
        } else {
          events.push({ type: 'blocked', cmd: `> ${target}` });
          return fail([`bash: ${target}: Read-only file system`, '  (조사 모드: 파일을 쓰거나 바꿀 수 없는 읽기 전용 세션이에요)']);
        }
      }
      const devnull = argv.includes('\u0000devnull');
      argv = argv.filter((a) => a !== '\u0000devnull');
      if (argv.length === 0) {
        last = ok();
        stdin = [];
        continue;
      }
      if (argv[0] === 'clear') {
        clear = true;
        last = ok();
        stdin = [];
        continue;
      }
      const r = this.exec(s, argv, stdin, false, events, sys);
      if (!discardErr) {
        if (errToOut) r.out.push(...r.err);
        else errs.push(...r.err);
      }
      last = { out: devnull ? [] : r.out, err: [], code: r.code };
      stdin = last.out;
    }
    return { out: last.out, err: errs, code: last.code, clear };
  }

  expandWord(s: Session, w: Word, events: ShellEvent[]): string[] {
    const f = this.frame(s);
    let text = '';
    let globbable = false;
    let anyQuoted = false;
    let splitParts: string[] | null = null;
    w.forEach((p, idx) => {
      if (p.t === 'lit') {
        let v = p.v;
        if (!p.q && idx === 0 && (v === '~' || v.startsWith('~/'))) v = `/home/${f.user}` + v.slice(1);
        if (!p.q && /[*?]/.test(v)) globbable = true;
        if (p.q) anyQuoted = true;
        text += v;
      } else if (p.t === 'var') {
        const env = this.env(s);
        text += env[p.name] ?? '';
        if (p.q) anyQuoted = true;
      } else {
        const sub = this.run(this.cloneForSub(s), p.src);
        events.push(...sub.events);
        const out = sub.lines.filter((l) => l.cls !== 'err' && l.cls !== 'dim').map((l) => l.text).join('\n').replace(/\n+$/, '');
        if (w.length === 1) splitParts = out.split(/\s+/).filter(Boolean);
        text += out;
      }
    });
    if (splitParts) return splitParts;
    if (globbable && !anyQuoted) {
      const g = this.glob(f, text);
      if (g.length) return g;
    }
    if (text === '' && !anyQuoted) return [];
    return [text];
  }

  private cloneForSub(s: Session): Session {
    // command substitution runs in a subshell: same cwd, history not recorded
    const f = this.frame(s);
    return { ...s, frames: [{ ...f, typed: [] }] };
  }

  private glob(f: Frame, pattern: string): string[] {
    const hw = this.host(f.host);
    const abs = pattern.startsWith('/');
    const full = Vfs.normalize(pattern, f.cwd, `/home/${f.user}`);
    const dir = Vfs.dirname(full);
    const base = Vfs.basename(full);
    if (/[*?]/.test(dir)) return [];
    const list = hw.vfs.readDir(dir, this.who(f));
    if (typeof list === 'string') return [];
    const re = new RegExp('^' + base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'u');
    const hits = list.filter((n) => re.test(n.name) && (base.startsWith('.') || !n.name.startsWith('.'))).map((n) => n.name);
    if (!hits.length) return [];
    const prefix = abs ? (dir === '/' ? '/' : dir + '/') : pattern.includes('/') ? pattern.slice(0, pattern.lastIndexOf('/') + 1) : '';
    return hits.map((h) => prefix + h);
  }

  env(s: Session): Record<string, string> {
    const f = this.frame(s);
    return {
      HOME: `/home/${f.user}`,
      USER: f.user,
      LOGNAME: f.user,
      PWD: f.cwd,
      HOSTNAME: f.host,
      SHELL: '/bin/bash',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      HISTTIMEFORMAT: '%F %T ',
      HISTSIZE: '100000',
      TERM: 'xterm-256color',
      LANG: 'ko_KR.UTF-8',
      '?': String(s.lastCode),
      $: '31337',
    };
  }

  historyOf(f: Frame): HistEntry[] {
    const base = this.host(f.host).history.get(f.user) ?? [];
    let n = base.length ? base[base.length - 1].n + 1 : 1;
    return [...base, ...f.typed.map((t) => ({ ...t, n: n++ }))];
  }

  exec(s: Session, argv: string[], stdin: string[] | null, sudo: boolean, events: ShellEvent[], sys: OutLine[]): IO {
    const f = this.frame(s);
    const name = argv[0];
    const fn = this.commands[name];
    const tut = this.world.cs.shell;
    if (tut && !tut.allow.includes(name) && (name in this.commands || name in BLOCKED)) {
      // a real tool, just not part of today's lesson: answer in-world instead of "command not found"
      events.push({ type: 'blocked', cmd: name });
      return fail(tut.refuse.replace(/\{cmd\}/g, name).split('\n'), 126);
    }
    if (!fn) {
      if (name in BLOCKED) {
        events.push({ type: 'blocked', cmd: name });
        const tip = BLOCKED[name];
        return fail([`조사 모드: '${name}' 은(는) 이 세션에서 쓸 수 없어요 (읽기 전용).${tip ? ' ' + tip : ''}`], 126);
      }
      if (name.includes('/') && !name.startsWith('/')) {
        return fail(`bash: ${name}: Permission denied`, 126);
      }
      const sug = suggest(name, [...this.knownCommands(), ...(this.host(f.host).aliases.get(f.user)?.keys() ?? [])]);
      events.push({ type: 'notfound', name, suggestion: sug });
      const err = [`${name}: command not found`];
      if (sug) err.push(`  혹시 '${sug}' 인가요? (설치된 명령 목록: help)`);
      else err.push('  (설치된 명령 목록: help)');
      return fail(err, 127);
    }
    return fn({ s, f, hw: this.host(f.host), args: argv.slice(1), stdin, sudo, events, sys });
  }

  // ---------------------------------------------------------------- helpers for commands

  private path(c: Ctx, p: string): string {
    return Vfs.normalize(p, c.f.cwd, `/home/${c.f.user}`);
  }

  private read(c: Ctx, cmd: string, p: string): string | IO {
    const abs = this.path(c, p);
    const node = c.hw.vfs.resolve(abs, this.who(c.f, c.sudo));
    if (typeof node === 'string') return fail(`${cmd}: ${p}: ${errText[node]}`);
    if (node.type === 'dir') return fail(`${cmd}: ${p}: Is a directory`);
    const txt = c.hw.vfs.readFile(abs, this.who(c.f, c.sudo));
    if (txt === 'EACCES') return fail(`${cmd}: ${p}: Permission denied`);
    if (node.private && !c.s.privateOk.includes(abs)) {
      c.s.privateOk.push(abs);
      c.events.push({ type: 'private', path: abs, opened: false });
      return fail(['(도윤: 이건 사적인 파일 같다… 조사에 꼭 필요할까? 그래도 열려면 같은 명령을 한 번 더 입력하세요.)'], 1);
    }
    if (node.private) c.events.push({ type: 'private', path: abs, opened: true });
    if (node.binary) return fail(`${cmd}: ${p}: ${node.binary}`, 1);
    if (cmd === 'cat' && Vfs.size(node) > CAT_LIMIT) {
      c.events.push({ type: 'blocked', cmd: `cat ${p} (${human(Vfs.size(node))})` });
      return fail([`cat: ${p}: 파일이 너무 커요 (${human(Vfs.size(node))}). 다 출력하면 터미널이 멈춰요.`, `  (도윤: 끝부분만 보자 → tail -n 20 ${p}   앞부분은 → head ${p})`], 1);
    }
    return txt;
  }

  private inputs(c: Ctx, cmd: string, files: string[]): { name: string; lines: string[] }[] | IO {
    if (!files.length) return [{ name: '(standard input)', lines: c.stdin ?? [] }];
    const out: { name: string; lines: string[] }[] = [];
    const errs: string[] = [];
    for (const p of files) {
      const t = this.read(c, cmd, p);
      if (typeof t === 'string') out.push({ name: p, lines: t === '' ? [] : t.split('\n') });
      else errs.push(...t.err);
    }
    if (errs.length && !out.length) return fail(errs);
    if (errs.length) c.sys.push(...errs.map((e) => ({ text: e, cls: 'err' as const })));
    return out;
  }

  private repo(c: Ctx, dirOverride?: string): RepoDef | null {
    const cwd = dirOverride ? this.path(c, dirOverride) : c.f.cwd;
    return c.hw.repos.find((r) => cwd === r.path || cwd.startsWith(r.path + '/')) ?? null;
  }

  private person(id: string): { name: string; email: string } {
    const p = this.world.cs.people[id];
    const login = p?.login ?? id;
    return { name: p?.name ?? id, email: `${login}@${this.world.cs.domain}` };
  }

  // ---------------------------------------------------------------- commands

  private makeCommands(): Record<string, Cmd> {
    const cmds: Record<string, Cmd> = {};

    cmds.help = () =>
      this.world.cs.shell?.help ? ok(this.world.cs.shell.help) : ok([
        `${this.world.cs.company} 조사 모드 셸 — 보안팀 승인, 읽기 전용 세션 (남은재 계정)`,
        '이 PC와 서버들에 깔려 있고, 조사 모드에서 허용된 도구들:',
        '  파일    ls  cd  pwd  cat  less  head  tail  grep  wc  sort  uniq  find',
        '  기록    history  journalctl  last',
        '  예약    crontab -l',
        '  코드    git log | show | branch | status',
        '  시스템  systemctl show|status|cat   ps  pgrep  df  free  ulimit  ss  curl  ping',
        '          id  whoami  hostname  date  uptime  getent  echo',
        '  이동    ssh <호스트>   exit',
        '  기타    man <명령>   help   clear   sudo <읽기 명령> (모든 사용이 auth.log에 남음)',
        '바꾸는 명령(rm, vim, kill, systemctl restart, crontab -e …)은 조사 모드에서 막혀 있어요.',
        '팁: man journalctl 처럼 예시를 볼 수 있어요. ↑/↓ 이전 명령, Tab 자동완성, 줄 위의 📌 로 증거 보드에 핀.',
      ]);

    // `hint`: the engineer's way into the 💡 panel (the UI opens it on this event)
    cmds.hint = (c) => {
      c.events.push({ type: 'hint' });
      return ok(['💡 힌트 패널을 열었어요 (작업 표시줄 💡).', '   그 전에: history 와 ~/README.txt, 메신저의 동료 메시지도 힌트예요.']);
    };

    cmds.man = (c) => {
      if (!c.args.length) return fail('What manual page do you want?\nFor example, try \'man man\'.'.split('\n'));
      const page = manFor(c.args[c.args.length - 1]);
      if (!page) return fail(`No manual entry for ${c.args[c.args.length - 1]}`, 16);
      return ok(page);
    };

    cmds.pwd = (c) => ok([c.f.cwd]);
    cmds.whoami = (c) => ok([c.sudo ? 'root' : c.f.user]);
    cmds.hostname = (c) => ok([c.f.host]);
    cmds.date = () => ok([fmtDate(this.now(), 'KST')]);
    cmds.uptime = (c) => {
      const t = new Date(this.now());
      return ok([` ${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}:${String(t.getUTCSeconds()).padStart(2, '0')} ${c.hw.def.uptime ?? 'up 14 days,  3:02,  1 user,  load average: 0.41, 0.38, 0.35'}`]);
    };
    cmds.echo = (c) => {
      let a = c.args;
      let nl = true;
      if (a[0] === '-n') {
        nl = false;
        a = a.slice(1);
      }
      if (a[0] === '-e') a = a.slice(1);
      void nl;
      return ok(a.join(' ').split('\\n'));
    };
    cmds.true = () => ok();
    cmds.false = () => fail([], 1);
    cmds.history = (c) => {
      if (c.args[0] === '-c' || c.args[0] === '-d' || c.args[0] === '-w') {
        c.events.push({ type: 'blocked', cmd: 'history ' + c.args[0] });
        return fail('조사 모드: 기록은 지우거나 덮어쓸 수 없어요.');
      }
      const all = this.historyOf(c.f);
      const rc = c.hw.vfs.lookup(`/home/${c.f.user}/.bashrc`);
      const stamped = rc && typeof rc.content === 'string' && /HISTTIMEFORMAT/.test(rc.content);
      let list = all;
      if (c.args[0] && /^\d+$/.test(c.args[0])) list = all.slice(-+c.args[0]);
      return ok(list.map((h) => `${String(h.n).padStart(5)}  ${stamped ? fmtIso(h.ts) + ' ' : ''}${h.cmd}`));
    };

    cmds.cd = (c) => {
      const target = c.args[0] === undefined || c.args[0] === '~' ? `/home/${c.f.user}` : c.args[0] === '-' ? c.f.prevCwd : this.path(c, c.args[0]);
      const n = c.hw.vfs.resolve(target, this.who(c.f));
      if (typeof n === 'string') return fail(`bash: cd: ${c.args[0]}: ${errText[n]}`);
      if (n.type !== 'dir') return fail(`bash: cd: ${c.args[0]}: Not a directory`);
      if (!Vfs.can(n, this.who(c.f), 1)) return fail(`bash: cd: ${c.args[0]}: Permission denied`);
      c.f.prevCwd = c.f.cwd;
      c.f.cwd = target;
      return ok(c.args[0] === '-' ? [target] : []);
    };

    cmds.ls = (c) => {
      const { flags, pos } = getopt(c.args);
      const all = flags.has('a') || flags.has('all');
      const almost = flags.has('A');
      const long = flags.has('l');
      const hum = flags.has('h');
      const dirOnly = flags.has('d');
      const one = flags.has('1');
      const targets = pos.length ? pos : ['.'];
      const out: string[] = [];
      const errs: string[] = [];
      const who = this.who(c.f, c.sudo);
      const fmt = (n: VNode, label: string) => {
        if (!long) return label;
        const size = Vfs.size(n);
        return `${Vfs.modeString(n)} ${n.type === 'dir' ? 2 : 1} ${n.owner.padEnd(7)} ${n.group.padEnd(7)} ${(hum ? human(size) : String(size)).padStart(hum ? 4 : 6)} ${fmtLs(n.mtime)} ${label}${n.link ? ' -> ' + n.link : ''}`;
      };
      const files: string[] = [];
      const dirs: string[] = [];
      for (const t of targets) {
        const abs = this.path(c, t);
        const n = c.hw.vfs.resolve(abs, who);
        if (typeof n === 'string') {
          errs.push(`ls: cannot access '${t}': ${errText[n]}`);
          continue;
        }
        if (n.type === 'file' || dirOnly) files.push(fmt(n, t));
        else dirs.push(t);
      }
      out.push(...(one || long ? files : files.length ? [files.join('  ')] : []));
      for (const t of dirs) {
        const abs = this.path(c, t);
        const list = c.hw.vfs.readDir(abs, who);
        if (typeof list === 'string') {
          errs.push(`ls: cannot open directory '${t}': ${errText[list]}`);
          continue;
        }
        if (targets.length > 1) {
          if (out.length) out.push('');
          out.push(`${t}:`);
        }
        let entries = list.filter((n) => all || almost || !n.name.startsWith('.'));
        if (flags.has('t')) entries = [...entries].sort((a, b) => b.mtime - a.mtime);
        if (flags.has('r')) entries = [...entries].reverse();
        const node = c.hw.vfs.lookup(abs)!;
        const withDots: [VNode, string][] = all ? [[node, '.'], [c.hw.vfs.lookup(Vfs.dirname(abs)) ?? node, '..']] : [];
        const rows: [VNode, string][] = [...withDots, ...entries.map((n) => [n, n.name] as [VNode, string])];
        if (long) {
          const total = rows.reduce((acc, [n]) => acc + (n.link ? 0 : Math.ceil(Vfs.size(n) / 4096) * 4), 0);
          out.push(`total ${hum ? human(total * 1024) : total}`);
          out.push(...rows.map(([n, l]) => fmt(n, l)));
        } else if (one || c.stdin !== null || rows.length > 40) out.push(...rows.map(([, l]) => l));
        else {
          // wrap names into ~90 columns
          let line = '';
          for (const [, l] of rows) {
            if (line && line.length + l.length + 2 > 90) {
              out.push(line);
              line = '';
            }
            line += (line ? '  ' : '') + l;
          }
          if (line) out.push(line);
        }
      }
      return { out, err: errs, code: errs.length ? 2 : 0 };
    };

    cmds.cat = (c) => {
      const { flags, pos } = getopt(c.args);
      const ins = this.inputs(c, 'cat', pos);
      if (!Array.isArray(ins)) return ins;
      let lines = ins.flatMap((x) => x.lines);
      if (flags.has('n')) lines = lines.map((l, i) => `${String(i + 1).padStart(6)}\t${l}`);
      return ok(lines);
    };
    cmds.less = (c) => {
      const r = cmds.cat({ ...c, args: c.args.filter((a) => !a.startsWith('-') || a === '-N').map((a) => (a === '-N' ? '-n' : a)) });
      return r;
    };
    cmds.more = cmds.less;

    const headTail = (which: 'head' | 'tail'): Cmd => (c) => {
      const { flags, pos } = getopt(c.args, ['n', 'c']);
      if (which === 'tail' && (flags.has('f') || flags.has('F') || flags.has('follow'))) {
        c.sys.push({ text: 'tail: 조사 모드에서는 실시간 추적(-f)이 꺼져 있어요. 마지막 10줄만 보여 줄게요.', cls: 'dim' });
      }
      let nStr = (flags.get('n') as string | undefined) ?? (flags.get('num') as string | undefined) ?? '10';
      const fromStart = which === 'tail' && nStr.startsWith('+');
      const n = Math.abs(parseInt(nStr, 10));
      if (Number.isNaN(n)) return fail(`${which}: invalid number of lines: '${nStr}'`);
      const ins = this.inputs(c, which, pos);
      if (!Array.isArray(ins)) return ins;
      const out: string[] = [];
      ins.forEach((x, i) => {
        if (ins.length > 1) {
          if (i) out.push('');
          out.push(`==> ${x.name} <==`);
        }
        if (which === 'head') out.push(...x.lines.slice(0, n));
        else out.push(...(fromStart ? x.lines.slice(n - 1) : n === 0 ? [] : x.lines.slice(-n)));
      });
      return ok(out);
    };
    cmds.head = headTail('head');
    cmds.tail = headTail('tail');

    cmds.wc = (c) => {
      const { flags, pos } = getopt(c.args);
      const ins = this.inputs(c, 'wc', pos);
      if (!Array.isArray(ins)) return ins;
      const only = flags.has('l') || flags.has('w') || flags.has('c') || flags.has('m');
      const out: string[] = [];
      let tl = 0, tw = 0, tc = 0;
      for (const x of ins) {
        const l = x.lines.length;
        const w = x.lines.join(' ').split(/\s+/).filter(Boolean).length;
        const ch = new TextEncoder().encode(x.lines.join('\n') + (l ? '\n' : '')).length;
        tl += l; tw += w; tc += ch;
        const cols: string[] = [];
        if (!only || flags.has('l')) cols.push(String(l));
        if (!only || flags.has('w')) cols.push(String(w));
        if (!only || flags.has('c') || flags.has('m')) cols.push(String(ch));
        const name = pos.length ? ' ' + x.name : '';
        out.push((cols.length === 1 && !pos.length ? cols[0] : cols.map((v) => v.padStart(7)).join(' ')) + name);
      }
      if (ins.length > 1) out.push([tl, tw, tc].map((v) => String(v).padStart(7)).join(' ') + ' total');
      return ok(out);
    };

    cmds.sort = (c) => {
      const { flags, pos } = getopt(c.args, ['k', 't']);
      const ins = this.inputs(c, 'sort', pos);
      if (!Array.isArray(ins)) return ins;
      let lines = ins.flatMap((x) => x.lines);
      if (flags.has('n')) lines.sort((a, b) => parseFloat(a) - parseFloat(b));
      else lines.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      if (flags.has('r')) lines.reverse();
      if (flags.has('u')) lines = lines.filter((l, i) => i === 0 || l !== lines[i - 1]);
      return ok(lines);
    };

    cmds.uniq = (c) => {
      const { flags, pos } = getopt(c.args);
      const ins = this.inputs(c, 'uniq', pos);
      if (!Array.isArray(ins)) return ins;
      const lines = ins.flatMap((x) => x.lines);
      const out: string[] = [];
      let prev: string | null = null;
      let count = 0;
      const flush = () => {
        if (prev === null) return;
        if (flags.has('d') && count < 2) return;
        out.push(flags.has('c') ? `${String(count).padStart(7)} ${prev}` : prev);
      };
      for (const l of lines) {
        if (l === prev) count++;
        else {
          flush();
          prev = l;
          count = 1;
        }
      }
      flush();
      return ok(out);
    };

    cmds.grep = (c) => {
      const { flags, pos } = getopt(c.args, ['e', 'A', 'B', 'C', 'm'], ['regexp', 'max-count']);
      let pattern: string | undefined = (flags.get('e') as string) ?? (flags.get('regexp') as string);
      const rest = [...pos];
      if (pattern === undefined) pattern = rest.shift();
      if (pattern === undefined) return fail(['Usage: grep [OPTION]... PATTERNS [FILE]...', "Try 'grep --help' for more information."], 2);
      const re = grepRegex(pattern, { E: flags.has('E'), F: flags.has('F'), w: flags.has('w'), i: flags.has('i') || flags.has('ignore-case') });
      const recursive = flags.has('r') || flags.has('R');
      let files = rest;
      if (recursive) {
        const roots = rest.length ? rest : ['.'];
        files = [];
        const who = this.who(c.f, c.sudo);
        const walk = (p: string, shown: string) => {
          const n = c.hw.vfs.resolve(p, who);
          if (typeof n === 'string') return;
          if (n.type === 'file') {
            if (!n.binary && !n.link) files.push(shown);
            return;
          }
          if (n.list) return; // skip /proc dynamic dirs
          const list = c.hw.vfs.readDir(p, who);
          if (typeof list === 'string') {
            c.sys.push({ text: `grep: ${shown}: Permission denied`, cls: 'err' });
            return;
          }
          for (const ch of list) walk(p === '/' ? '/' + ch.name : p + '/' + ch.name, shown === '.' ? ch.name : `${shown.replace(/\/$/, '')}/${ch.name}`);
        };
        for (const r of roots) walk(this.path(c, r), r);
      }
      const ins = this.inputs(c, 'grep', files);
      if (!Array.isArray(ins)) return { ...ins, code: 2 };
      const showName = !flags.has('h') && (flags.has('H') || ins.length > 1 || recursive);
      const after = +(flags.get('A') ?? flags.get('C') ?? 0);
      const before = +(flags.get('B') ?? flags.get('C') ?? 0);
      const max = flags.has('m') ? +(flags.get('m') as string) : Infinity;
      const out: string[] = [];
      let total = 0;
      for (const x of ins) {
        let cnt = 0;
        let lastPrinted = -1;
        const hits: number[] = [];
        x.lines.forEach((l, i) => {
          if (cnt >= max) return;
          const m = re.test(l) !== flags.has('v');
          if (m) {
            cnt++;
            hits.push(i);
          }
        });
        total += cnt;
        if (flags.has('c')) {
          out.push(showName ? `${x.name}:${cnt}` : String(cnt));
          continue;
        }
        if (flags.has('l')) {
          if (cnt) out.push(x.name);
          continue;
        }
        for (const i of hits) {
          const from = Math.max(0, i - before, lastPrinted + 1);
          if ((before || after) && lastPrinted >= 0 && from > lastPrinted + 1) out.push('--');
          for (let k = from; k <= Math.min(x.lines.length - 1, i + after); k++) {
            if (k <= lastPrinted) continue;
            const sep = k === i || hits.includes(k) ? ':' : '-';
            const ln = flags.has('n') ? `${k + 1}${sep}` : '';
            if (flags.has('o') && k === i) {
              const g = new RegExp(re.source, re.flags + 'g');
              for (const mm of x.lines[k].matchAll(g)) out.push(`${showName ? x.name + sep : ''}${ln}${mm[0]}`);
            } else out.push(`${showName ? x.name + sep : ''}${ln}${x.lines[k]}`);
            lastPrinted = k;
          }
        }
      }
      return { out, err: [], code: total ? 0 : 1 };
    };

    cmds.find = (c) => {
      const args = [...c.args];
      const roots: string[] = [];
      while (args.length && !args[0].startsWith('-')) roots.push(args.shift()!);
      if (!roots.length) roots.push('.');
      let name: RegExp | null = null;
      let type: string | null = null;
      let user: string | null = null;
      let maxDepth = Infinity;
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        const v = args[i + 1];
        if (a === '-name' || a === '-iname') {
          name = new RegExp('^' + (v ?? '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', a === '-iname' ? 'iu' : 'u');
          i++;
        } else if (a === '-type') {
          type = v;
          i++;
        } else if (a === '-user') {
          user = v;
          i++;
        } else if (a === '-maxdepth') {
          maxDepth = +v;
          i++;
        } else return fail(`find: unknown predicate \`${a}'`);
      }
      const out: string[] = [];
      const errs: string[] = [];
      const who = this.who(c.f, c.sudo);
      const walk = (abs: string, shown: string, depth: number) => {
        const n = c.hw.vfs.resolve(abs, who);
        if (typeof n === 'string') {
          errs.push(`find: '${shown}': ${errText[n]}`);
          return;
        }
        const match = (!name || name.test(Vfs.basename(abs) === '/' ? '/' : n.name)) && (!type || (type === 'd' ? n.type === 'dir' : n.type === 'file')) && (!user || n.owner === user);
        if (match) out.push(shown);
        if (n.type !== 'dir' || n.list || depth >= maxDepth || abs.startsWith('/proc')) return;
        const list = c.hw.vfs.readDir(abs, who);
        if (typeof list === 'string') {
          errs.push(`find: '${shown}': Permission denied`);
          return;
        }
        for (const ch of list) walk(abs === '/' ? '/' + ch.name : abs + '/' + ch.name, shown === '/' ? '/' + ch.name : shown.replace(/\/$/, '') + '/' + ch.name, depth + 1);
      };
      for (const r of roots) walk(this.path(c, r), r, 0);
      return { out, err: errs, code: errs.length ? 1 : 0 };
    };

    cmds.journalctl = (c) => {
      const { flags, pos } = getopt(c.args, ['u', 'n', 'p', 'S', 'U', 'g', 't', 'o'], ['unit', 'since', 'until', 'lines', 'priority', 'grep', 'identifier', 'output']);
      void pos;
      if (flags.has('f') || flags.has('follow')) c.sys.push({ text: 'journalctl: 조사 모드에서는 실시간 추적(-f)이 꺼져 있어요. 지금까지의 기록만 보여 줄게요.', cls: 'dim' });
      const units: string[] = [];
      for (let i = 0; i < c.args.length; i++) {
        const a = c.args[i];
        if (a === '-u' || a === '--unit') units.push(c.args[i + 1] ?? '');
        else if (a.startsWith('--unit=')) units.push(a.slice(7));
        else if (a.startsWith('-u') && a.length > 2 && !a.startsWith('--')) units.push(a.slice(2));
        else if (/^-[a-zA-Z]*u$/.test(a) && a.length > 2) units.push(c.args[i + 1] ?? '');
      }
      const now = this.now();
      const sinceV = (flags.get('since') ?? flags.get('S')) as string | undefined;
      const untilV = (flags.get('until') ?? flags.get('U')) as string | undefined;
      const since = sinceV ? parseSince(sinceV, now) : null;
      const until = untilV ? parseSince(untilV, now) : null;
      if (sinceV && since === null) return fail(`Failed to parse timestamp: ${sinceV}`);
      if (untilV && until === null) return fail(`Failed to parse timestamp: ${untilV}`);
      const prioMap: Record<string, number> = { emerg: 0, alert: 1, crit: 2, err: 3, error: 3, warning: 4, warn: 4, notice: 5, info: 6, debug: 7 };
      const pv = (flags.get('p') ?? flags.get('priority')) as string | undefined;
      const prio = pv === undefined ? 7 : /^\d$/.test(pv) ? +pv : prioMap[pv.split('..').pop()!] ?? 7;
      const gv = (flags.get('g') ?? flags.get('grep')) as string | undefined;
      const g = gv ? new RegExp(gv, 'i') : null;
      const ident = (flags.get('t') ?? flags.get('identifier')) as string | undefined;
      const norm = (u: string) => (u.includes('.') ? u : u + '.service');
      const wanted = units.map(norm);
      let entries = c.hw.journal.filter(
        (e) =>
          e.ts <= now &&
          (!wanted.length || wanted.some((w) => w === norm(e.unit) || (w.endsWith('*.service') && norm(e.unit).startsWith(w.slice(0, -9))))) &&
          (since === null || e.ts >= since) &&
          (until === null || e.ts <= until) &&
          e.priority <= prio &&
          (!g || g.test(e.msg)) &&
          (!ident || e.ident === ident),
      );
      const nv = (flags.get('n') ?? flags.get('lines')) as string | true | undefined;
      if (nv !== undefined) entries = entries.slice(-(nv === true ? 10 : +nv || 10));
      if (flags.has('r') || flags.has('reverse')) entries = [...entries].reverse();
      if (!entries.length) return ok(['-- No entries --']);
      const iso = flags.get('o') === 'short-iso' || flags.get('output') === 'short-iso';
      return ok(
        entries.map((e) => {
          const t = iso ? fmtIso(e.ts).replace(' ', 'T') + this.world.tz.replace(':', '') : fmtSyslog(e.ts);
          return `${t} ${c.f.host} ${e.ident}${e.pid ? `[${e.pid}]` : ''}: ${e.msg}`;
        }),
      );
    };

    cmds.crontab = (c) => {
      const { flags } = getopt(c.args, ['u']);
      const target = (flags.get('u') as string | undefined) ?? c.f.user;
      if (flags.has('e') || flags.has('r') || flags.has('i')) {
        c.events.push({ type: 'blocked', cmd: 'crontab -' + (flags.has('e') ? 'e' : 'r') });
        return fail('crontab: 조사 모드에서는 crontab을 편집하거나 지울 수 없어요 (읽기 전용 세션). 보기만: crontab -l');
      }
      if (!flags.has('l')) {
        c.events.push({ type: 'blocked', cmd: 'crontab ' + c.args.join(' ') });
        return fail(['crontab: 조사 모드에서는 새 crontab을 설치할 수 없어요.', "  혹시 'crontab -l' (지금 등록된 목록 보기) 인가요?"]);
      }
      if (target !== c.f.user && !c.sudo) return fail('crontab: must be privileged to use -u');
      const node = c.hw.vfs.lookup(`/var/spool/cron/crontabs/${target}`);
      if (!node || typeof node.content !== 'string') return fail(`no crontab for ${target}`);
      return ok(node.content.split('\n'));
    };

    cmds.git = (c) => this.git(c);

    cmds.df = (c) => ok(c.hw.def.df ?? ['Filesystem      Size  Used Avail Use% Mounted on', '/dev/sda1        50G   20G   30G  40% /']);
    cmds.du = (c) => this.du(c);
    cmds.free = (c) => ok(c.hw.def.free ?? ['               total        used        free      shared  buff/cache   available', 'Mem:           7.7Gi       2.1Gi       3.0Gi        12Mi       2.6Gi       5.3Gi', 'Swap:             0B          0B          0B']);
    cmds.ulimit = (c) => {
      const { flags, pos } = getopt(c.args);
      const soft = c.f.ulimitN ?? c.hw.def.ulimitN ?? 1024;
      if (flags.has('a'))
        return ok([
          'core file size              (blocks, -c) 0',
          'file size                   (blocks, -f) unlimited',
          'max locked memory           (kbytes, -l) 8192',
          `open files                          (-n) ${soft}`,
          'pipe size                (512 bytes, -p) 8',
          'stack size                  (kbytes, -s) 8192',
          'max user processes                  (-u) 31523',
        ]);
      if (pos.length) {
        const v = +pos[0];
        if (Number.isNaN(v) || v > 1048576) return fail(`bash: ulimit: open files: cannot modify limit: Operation not permitted`);
        c.f.ulimitN = v;
        c.sys.push({ text: '(이 셸 자신의 한도만 바뀌었어요. 이미 떠 있는 서비스의 한도는 그대로예요.)', cls: 'dim' });
        return ok();
      }
      if (flags.has('H')) return ok(['1048576']);
      return ok([String(soft)]);
    };

    cmds.ss = (c) => {
      const { flags } = getopt(c.args);
      const d = c.hw.def;
      if (flags.has('s')) return ok(d.ssSummary ?? ['Total: 112', 'TCP:   9 (estab 2, closed 0, orphaned 0, timewait 0)']);
      const listen = [`LISTEN 0      4096         0.0.0.0:22          0.0.0.0:*`, `LISTEN 0      4096               *:8080              *:*`, `LISTEN 0      4096       127.0.0.1:9100        0.0.0.0:*`];
      const head = 'State  Recv-Q Send-Q    Local Address:Port    Peer Address:Port' + (flags.has('p') ? ' Process' : '');
      if (flags.has('l')) return ok([head, ...listen]);
      const out = [head];
      if (flags.has('a')) out.push(...listen);
      const conns = d.ssConns;
      if (conns) {
        const proc = flags.has('p') && c.sudo && conns.process ? ' ' + conns.process : '';
        for (let i = 0; i < conns.count; i++) out.push(`ESTAB  0      0      ${conns.local}:${40000 + ((i * 37) % 20000)}   ${conns.peer}${proc}`);
      }
      if (flags.has('p') && !c.sudo) c.sys.push({ text: '(Process 열은 다른 사용자의 소켓이라 비어 있어요. sudo ss -tanp 로 볼 수 있어요.)', cls: 'dim' });
      return ok(out);
    };

    cmds.last = (c) => {
      const { flags, pos } = getopt(c.args, ['n']);
      let lines = c.hw.def.last ?? [];
      if (pos.length) lines = lines.filter((l) => pos.some((u) => l.startsWith(u + ' ') || l.startsWith(u.padEnd(8))));
      const nv = (flags.get('n') ?? flags.get('num')) as string | undefined;
      if (nv) lines = lines.slice(0, +nv);
      return ok([...lines, '', `wtmp begins Sun Nov  1 03:12:44 2026`]);
    };

    cmds.id = (c) => {
      const who = this.who(c.f);
      const user = c.args[0] ?? c.f.user;
      if (user !== c.f.user) return ok([`uid=1002(${user}) gid=1002(${user}) groups=1002(${user})`]);
      const gl = (c.hw.vfs.lookup('/etc/group')?.content as string).split('\n');
      const gid = (g: string) => gl.find((l) => l.startsWith(g + ':'))?.split(':')[2] ?? '1001';
      return ok([`uid=1001(${c.f.user}) gid=1001(${c.f.user}) groups=${who.groups.map((g) => `${gid(g)}(${g})`).join(',')}`]);
    };

    cmds.getent = (c) => {
      const [db, key] = c.args;
      const file = db === 'group' ? '/etc/group' : db === 'passwd' ? '/etc/passwd' : null;
      if (!file) return fail(`Unknown database: ${db ?? ''}`, 1);
      const lines = String(c.hw.vfs.lookup(file)?.content ?? '').split('\n');
      if (!key) return ok(lines);
      const hit = lines.filter((l) => l.split(':')[0] === key);
      return hit.length ? ok(hit) : fail([], 2);
    };

    cmds.ps = (c) => {
      const procs = c.hw.def.procs ?? [];
      const out = ['USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND', 'root           1  0.0  0.1 167744 11880 ?        Ss   Nov02   0:41 /sbin/init', 'root         612  0.0  0.0   9500  2800 ?        Ss   Nov02   0:03 /usr/sbin/cron -f', 'root         701  0.0  0.1  15420  8900 ?        Ss   Nov02   0:00 sshd: /usr/sbin/sshd -D'];
      for (const p of procs) out.push(`${p.user.padEnd(10)} ${String(p.pid).padStart(5)}  3.1  6.2 2349876 498212 ?      Ssl  Nov02 312:44 ${p.cmd}`);
      out.push(`${c.f.user.padEnd(10)} 31337  0.0  0.0  10120  5400 pts/3    Ss   09:00   0:00 -bash`);
      return ok(out);
    };

    cmds.pgrep = (c) => {
      const { flags, pos } = getopt(c.args);
      const pat = pos[0];
      if (!pat) return fail(['Usage: pgrep [options] <pattern>'], 2);
      const re = new RegExp(pat);
      const procs = (c.hw.def.procs ?? []).filter((p) => (flags.has('f') ? re.test(p.cmd) : re.test(p.cmd.split(' ')[0].split('/').pop()!)));
      if (!procs.length) return fail([], 1);
      return ok(procs.map((p) => (flags.has('a') || flags.has('l') ? `${p.pid} ${flags.has('a') ? p.cmd : p.cmd.split(' ')[0].split('/').pop()}` : String(p.pid))));
    };
    cmds.pidof = (c) => {
      const procs = (c.hw.def.procs ?? []).filter((p) => p.cmd.split(' ')[0].split('/').pop() === c.args[0]);
      return procs.length ? ok([procs.map((p) => p.pid).join(' ')]) : fail([], 1);
    };

    cmds.systemctl = (c) => {
      const { flags, pos } = getopt(c.args, ['p'], ['property']);
      const [verb, unitArg] = pos;
      const units = c.hw.def.units ?? [];
      const find = (u?: string) => units.find((x) => x.name === u || x.name === `${u}.service`);
      const state = (u: (typeof units)[number]) => [u.props.ActiveState ?? 'active', u.props.SubState ?? 'running'];
      const failed = units.filter((u) => state(u)[0] === 'failed');
      if (!verb || verb === 'list-units' || flags.has('failed')) {
        const shown = flags.has('failed') ? failed : units;
        return ok([
          '  UNIT                      LOAD   ACTIVE SUB     DESCRIPTION',
          ...shown.map((u) => `${state(u)[0] === 'failed' ? '●' : ' '} ${u.name.padEnd(25)} loaded ${state(u)[0].padEnd(6)} ${state(u)[1].padEnd(7)} ${u.props.Description ?? ''}`),
          '',
          `${shown.length} loaded units listed.`,
        ]);
      }
      if (verb === 'status' && !unitArg)
        return ok([
          `● ${c.f.host}`,
          `    State: ${failed.length ? 'degraded' : 'running'}`,
          `    Units: ${units.length} loaded (서비스 ${units.length}개)`,
          `     Jobs: 0 queued`,
          `   Failed: ${failed.length} units${failed.length ? ` (${failed.map((u) => u.name).join(', ')})` : ''}`,
          '',
          `(서비스 하나를 자세히: systemctl status <서비스>${units[0] ? `  예) systemctl status ${units[0].name.replace(/\.service$/, '')}` : ''})`,
        ]);
      if (verb === 'list-timers')
        return ok([
          'NEXT                        LEFT          LAST                        PASSED       UNIT                         ACTIVATES',
          'Tue 2026-11-17 00:00:00 KST 14h left      Mon 2026-11-16 00:00:00 KST 9h ago       logrotate.timer              logrotate.service',
          'Tue 2026-11-17 06:12:40 KST 21h left      Mon 2026-11-16 06:31:02 KST 2h 41min ago apt-daily-upgrade.timer      apt-daily-upgrade.service',
          '',
          '2 timers listed.',
          '(참고: 사용자 crontab에 걸린 작업은 여기 나오지 않아요. crontab -l, /etc/cron.d/ 도 보세요.)',
        ]);
      if (['start', 'stop', 'restart', 'reload', 'edit', 'enable', 'disable', 'kill', 'daemon-reload', 'set-property', 'mask', 'unmask'].includes(verb)) {
        c.events.push({ type: 'blocked', cmd: `systemctl ${verb}` });
        return fail([`Failed to ${verb} ${unitArg ?? ''}: Interactive authentication required.`, '  (조사 모드: 서비스를 바꾸는 명령은 막혀 있어요. 보기만: systemctl status / show / cat)']);
      }
      const u = find(unitArg);
      if (!unitArg) return fail(`Too few arguments.`);
      if (!u) {
        if (verb === 'show') return ok(['LoadState=not-found']);
        return fail(`Unit ${unitArg}${unitArg.includes('.') ? '' : '.service'} could not be found.`, 4);
      }
      if (verb === 'cat') return ok([`# /etc/systemd/system/${u.name}`, ...u.unitFile.split('\n')]);
      if (verb === 'status') return ok(u.statusLines);
      if (verb === 'show') {
        const pv = ((flags.get('p') ?? flags.get('property')) as string | undefined)?.split(',');
        if (!pv) return ok(Object.entries(u.props).map(([k, v]) => `${k}=${v}`));
        return ok(pv.map((k) => `${k}=${u.props[k] ?? ''}`));
      }
      return fail(`Unknown command verb ${verb}.`);
    };

    cmds.curl = (c) => {
      const { pos } = getopt(c.args, ['o', 'H', 'X', 'd', 'm']);
      const url = pos[0];
      if (!url) return fail(["curl: try 'curl --help' for more information"], 2);
      const key = url.replace(/^https?:\/\//, '');
      const http = c.hw.def.http ?? {};
      if (key in http) return ok(http[key].split('\n'));
      const hostPart = key.split('/')[0];
      return fail(`curl: (7) Failed to connect to ${hostPart.split(':')[0]} port ${hostPart.split(':')[1] ?? 80} after 0 ms: Couldn't connect to server`, 7);
    };

    cmds.ping = (c) => {
      const { flags, pos } = getopt(c.args, ['c', 'W', 'i']);
      const target = pos[0];
      if (!target) return fail('ping: usage error: Destination address required', 2);
      const h = this.world.hosts.get(target);
      const ip = target === 'localhost' ? '127.0.0.1' : h?.def.ip ?? (/^\d+\.\d+\.\d+\.\d+$/.test(target) ? target : null);
      if (!ip) return fail(`ping: ${target}: Name or service not known`, 2);
      const n = Math.min(+(flags.get('c') ?? 4), 10);
      if (!flags.has('c')) c.sys.push({ text: '(조사 모드: ping은 -c 없이도 4번만 보내요)', cls: 'dim' });
      const out = [`PING ${target} (${ip}) 56(84) bytes of data.`];
      for (let i = 1; i <= n; i++) out.push(`64 bytes from ${target} (${ip}): icmp_seq=${i} ttl=64 time=0.${300 + ((i * 47) % 200)} ms`);
      out.push('', `--- ${target} ping statistics ---`, `${n} packets transmitted, ${n} received, 0% packet loss, time ${n * 1001 - 1000}ms`);
      return ok(out);
    };

    cmds.sudo = (c) => {
      const args = c.args.filter((a, i) => !(i === 0 && (a === '-i' || a === '-s' || a === '-u')));
      const cmdline = args.join(' ');
      if (!args.length) return fail(['usage: sudo -h | -K | -k | -V', 'usage: sudo [-AbEHknPS] [-u user] [command [arg ...]]']);
      const bin = args[0];
      const allowed = SUDO_OK.has(bin) && !(bin === 'crontab' && !args.includes('-l'));
      const pwd = c.f.cwd;
      const ts = fmtSyslog(this.now());
      const authPath = '/var/log/auth.log';
      if (!c.s.sudoNoted) {
        c.s.sudoNoted = true;
        c.sys.push({ text: '(도윤: 남의 기록인데… 조사 목적으로만 볼게요. 이 sudo는 auth.log에 그대로 남는다.)', cls: 'dim' });
      }
      if (!allowed) {
        c.hw.vfs.appendLine(authPath, `${ts} ${c.f.host} sudo:   ${c.f.user} : command not allowed ; TTY=pts/3 ; PWD=${pwd} ; USER=root ; COMMAND=/usr/bin/${cmdline}`, { group: 'adm', mode: 0o640 });
        c.events.push({ type: 'sudo', cmd: cmdline, allowed: false });
        return fail(`Sorry, user ${c.f.user} is not allowed to execute '/usr/bin/${cmdline}' as root on ${c.f.host}.`);
      }
      c.hw.vfs.appendLine(authPath, `${ts} ${c.f.host} sudo:   ${c.f.user} : TTY=pts/3 ; PWD=${pwd} ; USER=root ; COMMAND=/usr/bin/${cmdline}`, { group: 'adm', mode: 0o640 });
      c.events.push({ type: 'sudo', cmd: cmdline, allowed: true });
      return this.execSudo(c, args);
    };

    cmds.ssh = (c) => {
      const { pos } = getopt(c.args, ['p', 'i', 'l', 'o']);
      const dest = pos[0];
      if (!dest) return fail(['usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] destination [command [argument ...]]'], 255);
      const [u, h] = dest.includes('@') ? dest.split('@') : [c.f.user, dest];
      const hw = this.world.hosts.get(h);
      if (!hw) return fail(`ssh: Could not resolve hostname ${h}: Name or service not known`, 255);
      if (u !== 'eunjae' && u !== c.f.user) return fail(`${u}@${h}: Permission denied (publickey).`, 255);
      const remote = pos.slice(1);
      const nf: Frame = { host: h, user: u, cwd: `/home/${u}`, prevCwd: `/home/${u}`, typed: [] };
      if (remote.length) {
        const sub: Session = { ...c.s, frames: [nf] };
        const r = this.run(sub, remote.join(' '));
        c.events.push(...r.events);
        return { out: r.lines.filter((l) => l.cls !== 'err' && l.cls !== 'dim').map((l) => l.text), err: r.lines.filter((l) => l.cls === 'err').map((l) => l.text), code: sub.lastCode };
      }
      c.s.frames.push(nf);
      c.events.push({ type: 'ssh', host: h });
      return ok([...(hw.def.motd ?? [])]);
    };

    const exit: Cmd = (c) => {
      if (c.s.frames.length > 1) {
        const f = c.s.frames.pop()!;
        c.events.push({ type: 'exit', host: f.host });
        return ok(['logout', `Connection to ${f.host} closed.`]);
      }
      return ok(['(이 탭은 남은재의 세션이에요. 닫지 않고 둘게요.)']);
    };
    cmds.exit = exit;
    cmds.logout = exit;

    return cmds;
  }

  private execSudo(c: Ctx, args: string[]): IO {
    const fn = this.commands[args[0]];
    return fn({ ...c, args: args.slice(1), sudo: true });
  }

  // ---------------------------------------------------------------- git

  private git(c: Ctx): IO {
    let args = [...c.args];
    let dir: string | undefined;
    if (args[0] === '-C') {
      dir = args[1];
      args = args.slice(2);
    }
    const sub = args[0];
    if (!sub || sub === 'help' || sub === '--help') return ok(manFor('git') ?? []);
    const repo = this.repo(c, dir);
    if (!repo) return fail('fatal: not a git repository (or any of the parent directories): .git', 128);
    const byId = new Map(repo.commits.map((x) => [x.sha, x]));
    const resolve = (ref: string): CommitDef | undefined => {
      const r = ref.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\//, 'remotes/');
      if (r === 'HEAD') return byId.get(repo.refs[repo.branch]);
      const head = repo.refs[r] ?? repo.refs[`remotes/${r}`];
      if (head) return byId.get(head);
      const m = /^(.*?)(~(\d*)|\^)$/.exec(r);
      if (m) {
        let x = resolve(m[1]);
        const k = m[2] === '^' ? 1 : +(m[3] || 1);
        for (let i = 0; i < k && x; i++) x = x.parent ? byId.get(x.parent) : undefined;
        return x;
      }
      return repo.commits.find((x) => x.sha.startsWith(r) && r.length >= 4);
    };
    const decorations = (sha: string): string => {
      const names: string[] = [];
      for (const [k, v] of Object.entries(repo.refs)) {
        if (v !== sha) continue;
        const nm = k.replace(/^remotes\//, '');
        names.push(k === repo.branch ? `HEAD -> ${nm}` : nm);
      }
      names.sort((a, b) => (a.startsWith('HEAD') ? -1 : b.startsWith('HEAD') ? 1 : 0));
      return names.length ? ` (${names.join(', ')})` : '';
    };
    const tz = this.world.tz;
    const header = (x: CommitDef, fuller: boolean, deco: boolean): string[] => {
      const a = this.person(x.author);
      const cm = this.person(x.committer ?? x.author);
      const ad = fmtGit(parseLocal(x.authorDate), tz);
      const cd = fmtGit(parseLocal(x.commitDate ?? x.authorDate), tz);
      const out = [`commit ${x.sha}${deco ? decorations(x.sha) : ''}`];
      if (fuller) out.push(`Author:     ${a.name} <${a.email}>`, `AuthorDate: ${ad}`, `Commit:     ${cm.name} <${cm.email}>`, `CommitDate: ${cd}`);
      else out.push(`Author: ${a.name} <${a.email}>`, `Date:   ${ad}`);
      out.push('', `    ${x.subject}`);
      if (x.body) out.push('', ...x.body.split('\n').map((l) => (l ? `    ${l}` : '')));
      return out;
    };
    const blocked = ['commit', 'push', 'pull', 'fetch', 'merge', 'rebase', 'reset', 'revert', 'checkout', 'switch', 'cherry-pick', 'tag', 'stash', 'add', 'rm', 'mv', 'clean', 'restore', 'am', 'apply', 'gc'];
    if (blocked.includes(sub)) {
      c.events.push({ type: 'blocked', cmd: `git ${sub}` });
      return fail([`조사 모드: 저장소를 바꾸는 git 명령(git ${sub})은 막혀 있어요.`, '  보기만: git log / git show / git branch -a / git status']);
    }
    const { flags, pos } = getopt(args.slice(1), ['n'], ['format', 'pretty', 'max-count', 'author', 'grep', 'since']);
    switch (sub) {
      case 'status': {
        const up = repo.refs[`remotes/origin/${repo.branch}`] === repo.refs[repo.branch];
        return ok([`On branch ${repo.branch}`, up ? `Your branch is up to date with 'origin/${repo.branch}'.` : `Your branch is behind 'origin/${repo.branch}'.`, '', 'nothing to commit, working tree clean']);
      }
      case 'branch': {
        const showAll = flags.has('a') || flags.has('all');
        const showRemote = flags.has('r');
        const out: string[] = [];
        for (const k of Object.keys(repo.refs).sort()) {
          const remote = k.startsWith('remotes/');
          if (remote && !showAll && !showRemote) continue;
          if (!remote && showRemote) continue;
          const label = showRemote ? k.replace(/^remotes\//, '') : k;
          const verbose = flags.has('v') ? ` ${repo.refs[k].slice(0, 7)} ${byId.get(repo.refs[k])?.subject ?? ''}` : '';
          out.push(`${k === repo.branch ? '*' : ' '} ${label}${verbose}`);
        }
        return ok(out);
      }
      case 'remote':
        return ok(flags.has('v') ? ['origin\tpay-cfg:/srv/git/pay-config.git (fetch)', 'origin\tpay-cfg:/srv/git/pay-config.git (push)'] : ['origin']);
      case 'diff':
        return ok([]);
      case 'log': {
        const fmt = ((flags.get('format') ?? flags.get('pretty')) as string | undefined) ?? '';
        const oneline = flags.has('oneline') || fmt === 'oneline';
        const fuller = fmt === 'fuller';
        const nv = flags.get('n') ?? flags.get('max-count') ?? flags.get('num');
        const max = nv === undefined ? Infinity : +nv;
        const author = flags.get('author') as string | undefined;
        const grepV = flags.get('grep') as string | undefined;
        let starts: CommitDef[] = [];
        if (flags.has('all')) starts = Object.values(repo.refs).map((s) => byId.get(s)!).filter(Boolean);
        else if (pos.length) {
          for (const p of pos) {
            const x = resolve(p);
            if (!x) return fail([`fatal: ambiguous argument '${p}': unknown revision or path not in the working tree.`, "Use '--' to separate paths from revisions, like this:", "'git <command> [<revision>...] -- [<file>...]'"], 128);
            starts.push(x);
          }
        } else starts = [resolve('HEAD')!];
        const seen = new Set<string>();
        const list: CommitDef[] = [];
        const queue = [...starts];
        while (queue.length) {
          queue.sort((a, b) => parseLocal(b.commitDate ?? b.authorDate) - parseLocal(a.commitDate ?? a.authorDate));
          const x = queue.shift()!;
          if (seen.has(x.sha)) continue;
          seen.add(x.sha);
          list.push(x);
          if (x.parent && byId.has(x.parent)) queue.push(byId.get(x.parent)!);
        }
        const filtered = list.filter((x) => (!author || this.person(x.author).name.includes(author) || x.author.includes(author)) && (!grepV || new RegExp(grepV, 'i').test(x.subject + '\n' + (x.body ?? '')))).slice(0, max);
        const out: string[] = [];
        for (const x of filtered) {
          if (oneline) out.push(`${x.sha.slice(0, 7)}${decorations(x.sha)} ${x.subject}`);
          else {
            out.push(...header(x, fuller, true));
            if (flags.has('p') && x.diff) out.push('', ...x.diff.split('\n'));
            if (flags.has('stat') && x.diff) out.push('', ...this.stat(x.diff));
            out.push('');
          }
        }
        if (out[out.length - 1] === '') out.pop();
        return ok(out);
      }
      case 'show': {
        const fmt = ((flags.get('format') ?? flags.get('pretty')) as string | undefined) ?? '';
        const x = resolve(pos[0] ?? 'HEAD');
        if (!x) return fail([`fatal: ambiguous argument '${pos[0]}': unknown revision or path not in the working tree.`], 128);
        const out = header(x, fmt === 'fuller', true);
        if (flags.has('stat')) out.push('', ...this.stat(x.diff ?? ''));
        else if (x.diff) out.push('', ...x.diff.split('\n'));
        return ok(out);
      }
      case 'rev-parse':
        return ok([resolve(pos[0] ?? 'HEAD')?.sha ?? '']);
      default:
        return fail(`git: '${sub}' is not a git command. See 'git --help'.`, 1);
    }
  }

  private stat(diff: string): string[] {
    const files = [...diff.matchAll(/^\+\+\+ b\/(.*)$/gm)].map((m) => m[1]);
    const plus = (diff.match(/^\+(?!\+\+)/gm) ?? []).length;
    const minus = (diff.match(/^-(?!--)/gm) ?? []).length;
    return [...files.map((f) => ` ${f} | ${plus + minus} ${'+'.repeat(plus)}${'-'.repeat(minus)}`), ` ${files.length} file changed, ${plus} insertion(+), ${minus} deletion(-)`];
  }

  // ---------------------------------------------------------------- du

  /**
   * du: disk usage per directory, in 1K blocks (or -h human units). Sizes come from the VFS
   * (content length, or the file's declared apparent size), rounded up to 4K blocks like ext4.
   * Supports -s -h -a -c -d N / --max-depth=N; unreadable directories print the real error.
   */
  private du(c: Ctx): IO {
    const { flags, pos } = getopt(c.args, ['d'], ['max-depth']);
    const hum = flags.has('h') || flags.has('human-readable');
    const summarize = flags.has('s') || flags.has('summarize');
    const all = flags.has('a') || flags.has('all');
    const dv = (flags.get('d') ?? flags.get('max-depth')) as string | undefined;
    const maxDepth = summarize ? 0 : dv !== undefined ? +dv : Infinity;
    if (Number.isNaN(maxDepth)) return fail(`du: invalid maximum depth '${dv}'`);
    const who = this.who(c.f, c.sudo);
    const out: string[] = [];
    const errs: string[] = [];
    const blocks = (n: VNode) => (n.type === 'dir' ? 4096 : Math.ceil(Vfs.size(n) / 4096) * 4096);
    const fmt = (bytes: number, label: string) => `${hum ? (bytes === 0 ? '0' : human(bytes)) : String(Math.ceil(bytes / 1024))}\t${label}`;
    const walk = (abs: string, label: string, depth: number): number => {
      const node = c.hw.vfs.lookup(abs)!;
      if (node.type !== 'dir') {
        const b = blocks(node);
        if (depth === 0 || (all && depth <= maxDepth)) out.push(fmt(b, label));
        return b;
      }
      let total = blocks(node);
      const list = c.hw.vfs.readDir(abs, who);
      if (typeof list === 'string') errs.push(`du: cannot read directory '${label}': ${errText[list]}`);
      else for (const ch of list) total += walk(abs === '/' ? '/' + ch.name : `${abs}/${ch.name}`, label === '/' ? '/' + ch.name : `${label.replace(/\/$/, '')}/${ch.name}`, depth + 1);
      if (depth <= maxDepth) out.push(fmt(total, label));
      return total;
    };
    let grand = 0;
    for (const p of pos.length ? pos : ['.']) {
      const abs = this.path(c, p);
      const n = c.hw.vfs.resolve(abs, who);
      if (typeof n === 'string') {
        errs.push(`du: cannot access '${p}': ${errText[n]}`);
        continue;
      }
      grand += walk(abs, p, 0);
    }
    if (flags.has('c') || flags.has('total')) out.push(fmt(grand, 'total'));
    return { out, err: errs, code: errs.length ? 1 : 0 };
  }

  // ---------------------------------------------------------------- completion

  complete(s: Session, line: string): { replace: string; options: string[] } {
    const f = this.frame(s);
    const m = /(\S*)$/.exec(line)!;
    const word = m[1];
    const before = line.slice(0, line.length - word.length);
    const isCmd = !before.trim() || /[|;&]\s*$/.test(before);
    let options: string[];
    if (isCmd) {
      const aliases = [...(this.host(f.host).aliases.get(f.user)?.keys() ?? [])];
      options = [...new Set([...this.knownCommands(), ...aliases])].filter((x) => x.startsWith(word)).sort();
    } else if (/^ssh\s+\S*$/.test(line)) {
      options = [...this.world.hosts.keys()].filter((h) => h.startsWith(word));
    } else {
      const dirPart = word.includes('/') ? word.slice(0, word.lastIndexOf('/') + 1) : '';
      const base = word.slice(dirPart.length);
      const abs = Vfs.normalize(dirPart || '.', f.cwd, `/home/${f.user}`);
      const list = this.host(f.host).vfs.readDir(abs, this.who(f));
      options = typeof list === 'string' ? [] : list.filter((n) => n.name.startsWith(base) && (base.startsWith('.') || !n.name.startsWith('.'))).map((n) => dirPart + n.name + (n.type === 'dir' ? '/' : ''));
    }
    if (options.length === 1) return { replace: before + options[0] + (options[0].endsWith('/') ? '' : ' '), options };
    let common = word;
    if (options.length > 1) {
      common = options[0];
      for (const o of options) while (!o.startsWith(common)) common = common.slice(0, -1);
      if (common.length < word.length) common = word;
    }
    return { replace: before + common, options };
  }
}

