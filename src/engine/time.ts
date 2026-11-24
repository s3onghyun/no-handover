// Case time is naive local wall-clock time. Internally we keep "local ms": the local time
// read as if it were UTC, so formatting uses getUTC* and never depends on the browser zone.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

/** Parse 'YYYY-MM-DDTHH:MM[:SS]' (or with a space) to local ms. */
export function parseLocal(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s.trim());
  if (!m) throw new Error(`bad local time: ${s}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
}

export function tzOffsetMs(tz: string): number {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(tz);
  if (!m) return 0;
  const v = (+m[2] * 60 + +m[3]) * 60000;
  return m[1] === '-' ? -v : v;
}

/** Unix epoch seconds for a local ms in the given zone. */
export const toEpoch = (ms: number, tz: string): number => Math.floor((ms - tzOffsetMs(tz)) / 1000);

const d = (ms: number) => new Date(ms);

export function fmtIso(ms: number): string {
  const x = d(ms);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:${pad(x.getUTCSeconds())}`;
}

/** journald short format: 'Nov 14 03:15:40' */
export function fmtSyslog(ms: number): string {
  const x = d(ms);
  return `${MON[x.getUTCMonth()]} ${pad(x.getUTCDate())} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:${pad(x.getUTCSeconds())}`;
}

/** nginx combined: '14/Nov/2026:02:10:07 +0900' */
export function fmtNginx(ms: number, tz: string): string {
  const x = d(ms);
  return `${pad(x.getUTCDate())}/${MON[x.getUTCMonth()]}/${x.getUTCFullYear()}:${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:${pad(x.getUTCSeconds())} ${tz.replace(':', '')}`;
}

/** git default: 'Fri Nov 13 18:02:11 2026 +0900' */
export function fmtGit(ms: number, tz: string): string {
  const x = d(ms);
  return `${DOW[x.getUTCDay()]} ${MON[x.getUTCMonth()]} ${x.getUTCDate()} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:${pad(x.getUTCSeconds())} ${x.getUTCFullYear()} ${tz.replace(':', '')}`;
}

/** `date` output: 'Mon Nov 16 09:12:03 KST 2026' */
export function fmtDate(ms: number, zoneName: string): string {
  const x = d(ms);
  return `${DOW[x.getUTCDay()]} ${MON[x.getUTCMonth()]} ${pad(x.getUTCDate())} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:${pad(x.getUTCSeconds())} ${zoneName} ${x.getUTCFullYear()}`;
}

/** ls -l: 'Nov 13 15:47' */
export function fmtLs(ms: number): string {
  const x = d(ms);
  return `${MON[x.getUTCMonth()]} ${String(x.getUTCDate()).padStart(2, ' ')} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
}

export function fmtHM(ms: number): string {
  const x = d(ms);
  return `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
}

const KO_DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** '11/16 (월) 09:12' */
export function fmtKoShort(ms: number): string {
  const x = d(ms);
  return `${x.getUTCMonth() + 1}/${x.getUTCDate()} (${KO_DOW[x.getUTCDay()]}) ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
}

export function formatTs(ms: number, format: 'syslog' | 'nginx' | 'iso' | 'raw', tz: string): string {
  switch (format) {
    case 'syslog': return fmtSyslog(ms);
    case 'nginx': return fmtNginx(ms, tz);
    case 'iso': return fmtIso(ms);
    default: return '';
  }
}

/**
 * Parse a journalctl --since/--until value relative to `now` (local ms).
 * Supports: 'YYYY-MM-DD', 'YYYY-MM-DD HH:MM[:SS]', 'HH:MM[:SS]' (today), today, yesterday, now, -Nd/-Nh/-Nm.
 */
export function parseSince(v: string, now: number): number | null {
  const s = v.trim().toLowerCase();
  const day = Math.floor(now / 86400000) * 86400000;
  if (s === 'today') return day;
  if (s === 'yesterday') return day - 86400000;
  if (s === 'now') return now;
  let m = /^-(\d+)\s*(d|h|m|min|days?|hours?|minutes?)$/.exec(s) ?? /^(\d+)\s*(d|h|m|min|days?|hours?|minutes?)\s+ago$/.exec(s);
  if (m) {
    const n = +m[1];
    const u = m[2][0];
    return now - n * (u === 'd' ? 86400000 : u === 'h' ? 3600000 : 60000);
  }
  m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) return day + ((+m[1] * 60 + +m[2]) * 60 + +(m[3] ?? 0)) * 1000;
  try {
    return parseLocal(s);
  } catch {
    return null;
  }
}

/** Best-effort timestamp detection inside a log line, message or commit (for the evidence board). */
export function detectTime(text: string, year = 2026): number | null {
  let m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  m = /(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (m && MON.includes(m[2])) return Date.UTC(+m[3], MON.indexOf(m[2]), +m[1], +m[4], +m[5], +m[6]);
  m = /\b(?:\w{3} )?(\w{3}) +(\d{1,2}) (\d{2}):(\d{2})(?::(\d{2}))?(?: (\d{4}))?/.exec(text);
  if (m && MON.includes(m[1])) return Date.UTC(m[6] ? +m[6] : year, MON.indexOf(m[1]), +m[2], +m[3], +m[4], +(m[5] ?? 0));
  return null;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * systemd's relative time for a past moment, as `systemctl status` prints it after the timestamp
 * ("42min ago", "1h 12min ago", "22h ago", "1 day 3h ago", "1 week 3 days ago"). `diffMs` = now − then.
 */
export function systemdAgo(diffMs: number): string {
  const s = Math.max(0, Math.floor(diffMs / 1000));
  const min = Math.floor(s / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const pl = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (day >= 30) return `${Math.floor(day / 30)} month${day >= 60 ? 's' : ''} ${pl(day % 30, 'day')} ago`;
  if (day >= 7) return `${pl(Math.floor(day / 7), 'week')} ${pl(day % 7, 'day')} ago`;
  if (day >= 2) return `${day} days ago`;
  if (hr >= 25) return `1 day ${hr - 24}h ago`;
  if (hr >= 6) return `${hr}h ago`;
  if (hr >= 1) return `${hr}h ${min % 60}min ago`;
  if (min >= 5) return `${min}min ago`;
  if (min >= 1) return `${min}min ${s % 60}s ago`;
  return `${s}s ago`;
}

/** A `systemctl status` line "… since Tue 2026-11-10 08:47:41 KST; 42min ago" with the relative part as of `now` (local ms). */
export function statusAgo(line: string, now: number): string {
  const m = /^(.* since \w{3} (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) [A-Z]{2,5}); .+ ago$/.exec(line);
  if (!m) return line;
  const then = parseLocal(`${m[2]}T${m[3]}`);
  return now >= then ? `${m[1]}; ${systemdAgo(now - then)}` : line;
}
