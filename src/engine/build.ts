// Builds the playable world from one CaseFile: VFS per host, journald entries, bash histories,
// log files and messenger messages. Pure and deterministic (same case -> same world).

import type { CaseFile, Emit, HostDef, LogFormat, RepoDef } from './types.ts';
import { Vfs, type VNode } from './vfs.ts';
import { formatTs, parseLocal, rng, toEpoch } from './time.ts';

export interface JournalEntry {
  ts: number;
  unit: string;
  ident: string;
  pid?: number;
  msg: string;
  priority: number;
}

export interface HistEntry {
  n: number;
  ts: number;
  cmd: string;
}

export interface Message {
  id: string;
  channel: string;
  from: string;
  text: string;
  ts: number;
  deletedAt?: number;
  /** Delivered live during play (nudges, triggers). */
  live?: boolean;
}

export interface HostWorld {
  def: HostDef;
  vfs: Vfs;
  journal: JournalEntry[];
  /** user -> history entries (sorted, numbered) */
  history: Map<string, HistEntry[]>;
  /** user -> alias table parsed from ~/.bashrc */
  aliases: Map<string, Map<string, string>>;
  repos: RepoDef[];
}

export interface World {
  cs: CaseFile;
  tz: string;
  start: number;
  hosts: Map<string, HostWorld>;
  messages: Message[];
}

const octal = (s: string | undefined, dflt: number) => (s ? parseInt(s, 8) : dflt);

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

/** Parse `alias name='value'` lines (value may contain spaces, $(), pipes). */
export function parseAliases(bashrc: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of bashrc.split('\n')) {
    const m = /^\s*alias\s+([^=\s]+)=(['"])(.*?)\2(?:\s+#.*)?\s*$/.exec(raw);
    if (m) out.set(m[1], m[3]);
  }
  return out;
}

function snapDaytime(ms: number, r: () => number): number {
  const day = Math.floor(ms / 86400000) * 86400000;
  let t = ms;
  let dow = new Date(day).getUTCDay();
  let d = day;
  while (dow === 0 || dow === 6) {
    d += 86400000;
    dow = new Date(d).getUTCDay();
  }
  const sec = (ms - day) / 1000;
  if (d !== day || sec < 9.5 * 3600 || sec > 18.5 * 3600) t = d + Math.floor((10 * 3600 + r() * 8 * 3600) * 1000);
  return t;
}

export function buildWorld(cs: CaseFile): World {
  const tz = cs.clock.tz;
  const start = parseLocal(cs.clock.start);
  const hosts = new Map<string, HostWorld>();
  const logLines = new Map<string, { ts: number; line: string; seq: number }[]>(); // key host|path
  let seq = 0;

  for (const def of cs.hosts) {
    const vfs = new Vfs(start - 30 * 86400000);
    hosts.set(def.name, { def, vfs, journal: [], history: new Map(), aliases: new Map(), repos: def.repos ?? [] });
  }
  const host = (name: string): HostWorld => {
    const h = hosts.get(name);
    if (!h) throw new Error(`unknown host in case data: ${name}`);
    return h;
  };

  const histRaw = new Map<string, { n?: number; ts: number; cmd: string }[]>(); // host|user
  const messages: Message[] = [];

  const pushLog = (h: string, path: string, format: LogFormat, ts: number, line: string) => {
    const key = `${h}|${path}`;
    if (!logLines.has(key)) logLines.set(key, []);
    logLines.get(key)!.push({ ts, line: fill(line, { ts: formatTs(ts, format, tz) }), seq: seq++ });
  };

  const applyEmit = (e: Emit, ts: number) => {
    switch (e.kind) {
      case 'journal': {
        const count = e.repeat?.count ?? 1;
        for (let i = 0; i < count; i++) {
          host(e.host).journal.push({
            ts: ts + i * (e.repeat?.everySec ?? 0) * 1000,
            unit: e.unit,
            ident: e.ident ?? e.unit.replace(/\.service$/, ''),
            pid: e.pid,
            msg: e.msg,
            priority: e.priority ?? 6,
          });
        }
        break;
      }
      case 'log':
        pushLog(e.host, e.path, e.format, ts, e.line);
        break;
      case 'history': {
        const key = `${e.host}|${e.user}`;
        if (!histRaw.has(key)) histRaw.set(key, []);
        histRaw.get(key)!.push({ n: e.n, ts, cmd: e.cmd });
        break;
      }
      case 'message':
        messages.push({
          id: e.id ?? `m${messages.length}`,
          channel: e.channel,
          from: e.from,
          text: e.text,
          ts,
          deletedAt: e.deletedAt ? parseLocal(e.deletedAt) : undefined,
        });
        break;
    }
  };

  for (const ev of cs.timeline) {
    const ts = parseLocal(ev.at);
    for (const e of ev.emits ?? []) applyEmit(e, ts);
  }

  // Generators
  const fillers: { key: string; pool: string[]; from: number; to: number; seed: number }[] = [];
  for (const g of cs.generators) {
    if (g.kind === 'sequence') {
      const r = rng(g.seed);
      let t = parseLocal(g.start);
      for (let i = 0; i < g.count; i++) {
        if (g.daytimeOnly) t = snapDaytime(t, r);
        let s = t;
        for (const step of g.steps) {
          s += Math.floor((step.afterSec[0] + r() * (step.afterSec[1] - step.afterSec[0])) * 1000);
          const line = fill(step.line, { i: String(i), n: String(i + 1), id: String((g.idBase ?? 0) + i), r2: String(10 + Math.floor(r() * 90)), r3: String(100 + Math.floor(r() * 900)) });
          if ('path' in g.target) pushLog(g.target.host, g.target.path, g.target.format, s, line);
          else {
            const j = g.target.journal;
            host(g.target.host).journal.push({ ts: s, unit: j.unit, ident: j.ident ?? j.unit, pid: j.pid, msg: line, priority: 6 });
          }
        }
        t += Math.floor((g.gapMin[0] + r() * (g.gapMin[1] - g.gapMin[0])) * 60000);
      }
    } else if (g.kind === 'periodic') {
      const from = parseLocal(g.from);
      const to = parseLocal(g.to);
      const steps = g.steps.map((s) => ({ from: parseLocal(s.from), v: s.v }));
      const skips = (g.skip ?? []).map(([a, b]) => [parseLocal(a), parseLocal(b)] as const);
      let k = 0;
      for (let t = from; t <= to; t += g.everyMin * 60000) {
        k++;
        if (skips.some(([a, b]) => t >= a && t <= b)) continue;
        let v = '';
        for (const s of steps) if (s.from <= t) v = s.v;
        const pid = String(20000 + ((k * 7919) % 30000));
        host(g.host).journal.push({ ts: t, unit: g.journal.unit, ident: g.journal.ident ?? g.journal.unit, pid: g.journal.pid, msg: fill(g.line, { v, k: pid }), priority: 6 });
      }
    } else {
      fillers.push({ key: `${g.host}|${g.user}`, pool: g.pool, from: parseLocal(g.from), to: parseLocal(g.to), seed: g.seed });
    }
  }

  // Number histories: explicit `n` anchors; gaps between anchors are filled from the pool.
  for (const [key, raw] of histRaw) {
    raw.sort((a, b) => a.ts - b.ts);
    const filler = fillers.find((f) => f.key === key);
    const r = rng(filler?.seed ?? 1);
    const out: HistEntry[] = [];
    let n = raw.find((x) => x.n !== undefined)?.n ?? 1;
    for (let i = 0; i < raw.length; i++) {
      const cur = raw[i];
      if (cur.n !== undefined && cur.n > n && filler && out.length) {
        const prevTs = out[out.length - 1].ts;
        const gap = cur.n - n;
        const lo = Math.max(prevTs, filler.from);
        const hi = Math.min(cur.ts, filler.to);
        const times: number[] = [];
        for (let k = 0; k < gap; k++) {
          let t = snapDaytime(lo + r() * Math.max(0, hi - lo), r);
          if (t <= lo || t >= hi) t = lo + 1000 + Math.floor(r() * Math.max(0, hi - lo - 2000));
          times.push(t);
        }
        times.sort((a, b) => a - b);
        for (const t of times) out.push({ n: n++, ts: t, cmd: filler.pool[Math.floor(r() * filler.pool.length)] });
      }
      n = cur.n ?? n;
      out.push({ n: n++, ts: cur.ts, cmd: cur.cmd });
    }
    const [h, user] = key.split('|');
    host(h).history.set(user, out);
  }

  // Static files, homes, system files
  for (const hw of hosts.values()) {
    const { def, vfs } = hw;
    vfs.mkdirp('/home', 'root', 'root', 0o755);
    vfs.mkdirp('/tmp', 'root', 'root', 0o777);
    const homes = new Set<string>([def.user]);
    for (const f of def.files) {
      const m = /^\/home\/([^/]+)\//.exec(f.path);
      if (m) homes.add(m[1]);
    }
    for (const [key] of histRaw) if (key.startsWith(def.name + '|')) homes.add(key.split('|')[1]);
    for (const u of homes) vfs.mkdirp(`/home/${u}`, u, u, u === def.user ? 0o750 : def.sudoRead ? 0o700 : 0o750);

    for (const f of def.files) {
      const owner = f.owner ?? (/^\/home\/([^/]+)\//.exec(f.path)?.[1] ?? 'root');
      // make intermediate dirs inside a home owned by that user
      const dir = Vfs.dirname(f.path);
      if (!vfs.lookup(dir)) vfs.mkdirp(dir, owner, f.group ?? owner, 0o755);
      vfs.writeFile(f.path, f.content, {
        owner,
        group: f.group ?? owner,
        mode: octal(f.mode, 0o644),
        mtime: f.mtime ? parseLocal(f.mtime) : undefined,
        private: f.private,
        binary: f.binary,
        size: f.size,
      });
    }

    // bash histories -> ~/.bash_history (raw, with #epoch lines when HISTTIMEFORMAT is set)
    for (const [user, entries] of hw.history) {
      const rc = vfs.lookup(`/home/${user}/.bashrc`);
      const rcText = rc && typeof rc.content === 'string' ? rc.content : '';
      const stamped = /HISTTIMEFORMAT/.test(rcText);
      const text = entries.map((e) => (stamped ? `#${toEpoch(e.ts, tz)}\n${e.cmd}` : e.cmd)).join('\n');
      const last = entries.length ? entries[entries.length - 1].ts : start;
      vfs.writeFile(`/home/${user}/.bash_history`, text, { owner: user, group: user, mode: 0o600, mtime: last });
    }

    // aliases per user
    for (const u of homes) {
      const rc = vfs.lookup(`/home/${u}/.bashrc`);
      if (rc && typeof rc.content === 'string') hw.aliases.set(u, parseAliases(rc.content));
    }

    // crontabs
    for (const [user, text] of Object.entries(def.crontabs ?? {})) {
      vfs.writeFile(`/var/spool/cron/crontabs/${user}`, text, { owner: user, group: 'crontab', mode: 0o600 });
    }
    vfs.lookup('/var/spool/cron/crontabs') && (vfs.lookup('/var/spool/cron/crontabs')!.mode = 0o1730);

    // groups / passwd
    const groups = def.groups ?? {};
    const groupLines = [
      'root:x:0:',
      'adm:x:4:syslog,' + def.user,
      'sudo:x:27:',
      ...Object.entries(groups).map(([g, v]) => `${g}:x:${v.gid}:${v.members.join(',')}`),
    ];
    if (!vfs.lookup('/etc/group')) vfs.writeFile('/etc/group', groupLines.join('\n'));
    const users = [...homes];
    if (!vfs.lookup('/etc/passwd')) {
      vfs.writeFile(
        '/etc/passwd',
        ['root:x:0:0:root:/root:/bin/bash', 'syslog:x:104:110::/home/syslog:/usr/sbin/nologin', ...users.map((u, i) => `${u}:x:${1001 + i}:${1001 + i}::/home/${u}:/bin/bash`)].join('\n'),
      );
    }
    vfs.writeFile('/etc/hostname', def.name);

    // systemd units
    for (const u of def.units ?? []) vfs.writeFile(`/etc/systemd/system/${u.name}`, u.unitFile);

    // /proc
    for (const p of def.procs ?? []) {
      const fdDir: VNode = {
        name: 'fd',
        type: 'dir',
        owner: p.user,
        group: p.user,
        // Simplification: real /proc/<pid>/fd needs same uid or root. The departed senior's `fds`
        // alias worked on Friday, so the investigation session may read it (docs/case-format.md).
        mode: 0o555,
        mtime: start,
        list: () => {
          const out: VNode[] = [];
          const sample = p.fdSample ?? [];
          for (let i = 0; i < p.fdCount; i++) {
            out.push({
              name: String(i),
              type: 'file',
              owner: p.user,
              group: p.user,
              mode: 0o700,
              mtime: start,
              link: i < sample.length ? sample[i] : `socket:[${48211 + i * 7}]`,
              content: '',
            });
          }
          return out.sort((a, b) => +a.name - +b.name);
        },
      };
      vfs.mount(`/proc/${p.pid}/fd`, fdDir);
      vfs.writeFile(`/proc/${p.pid}/cmdline`, p.cmd, { owner: p.user, group: p.user, mode: 0o444 });
      vfs.writeFile(
        `/proc/${p.pid}/limits`,
        [
          'Limit                     Soft Limit           Hard Limit           Units     ',
          'Max cpu time              unlimited            unlimited            seconds   ',
          'Max file size             unlimited            unlimited            bytes     ',
          'Max processes             31523                31523                processes ',
          `Max open files            ${String(p.limitNofile).padEnd(21)}${String(p.limitNofile).padEnd(21)}files     `,
          'Max locked memory         8388608              8388608              bytes     ',
        ].join('\n'),
        { owner: p.user, group: p.user, mode: 0o444 },
      );
    }

    // repos: mark .git
    for (const r of hw.repos) vfs.mkdirp(`${r.path}/.git`, def.user, def.user, 0o755);
  }

  // Log files from emits + generators (sorted by time; existing file content stays on top).
  for (const [key, lines] of logLines) {
    const [h, path] = key.split('|');
    const hw = host(h);
    lines.sort((a, b) => a.ts - b.ts || a.seq - b.seq);
    const existing = hw.vfs.lookup(path);
    const prefix = existing && typeof existing.content === 'string' && existing.content ? existing.content + '\n' : '';
    const owner = existing?.owner ?? (/^\/home\/([^/]+)\//.exec(path)?.[1] ?? 'root');
    const group = existing?.group ?? (path.startsWith('/var/log') ? 'adm' : owner);
    const mode = existing?.mode ?? (path.startsWith('/var/log') ? 0o640 : 0o644);
    hw.vfs.writeFile(path, prefix + lines.map((l) => l.line).join('\n'), { owner, group, mode, mtime: lines[lines.length - 1].ts });
  }

  for (const hw of hosts.values()) hw.journal.sort((a, b) => a.ts - b.ts);
  messages.sort((a, b) => a.ts - b.ts);
  return { cs, tz, start, hosts, messages };
}
