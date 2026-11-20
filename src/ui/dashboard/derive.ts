// Data -> panel derivation for the observability-style evidence board and dashboard app.
// DOM-free (runs in node tests): time ranges against the in-game clock, series sampling,
// threshold spans, pin classification (log level + annotation kind), cron recurrences,
// annotation placement on a time axis, time ticks and the text summaries used as chart labels.

import type { Pin } from '../../engine/game.ts';
import type { AnnotationKind, DashboardDef, SeriesDef, TimeSeriesPanelDef } from '../../engine/types.ts';
import { parseLocal, pad } from '../../engine/time.ts';

export interface Range {
  from: number;
  to: number;
}

export type Level = 'error' | 'warn' | 'info';

export interface Annotation {
  ts: number;
  kind: AnnotationKind;
  label: string;
  /** Pinned evidence this marker stands for (links the marker to its log row). */
  pinId?: string;
  /** Derived from a crontab line: one marker per run inside the range. */
  recurring?: boolean;
  /** Came from the case's dashboard snapshot rather than the player's pins. */
  fromCase?: boolean;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const KO_DOW = ['일', '월', '화', '수', '목', '금', '토'];

// ------------------------------------------------------------------ formatting

const d = (ms: number) => new Date(ms);
export const fmtHM = (ms: number): string => `${pad(d(ms).getUTCHours())}:${pad(d(ms).getUTCMinutes())}`;
export const fmtMD = (ms: number): string => `${d(ms).getUTCMonth() + 1}/${d(ms).getUTCDate()}`;
/** '11/14 (토) 03:15' */
export const fmtDayHM = (ms: number): string => `${fmtMD(ms)} (${KO_DOW[d(ms).getUTCDay()]}) ${fmtHM(ms)}`;
/** Log-row timestamp: 'MM-DD HH:MM[:SS]'. */
export function fmtLogTs(ms: number): string {
  const x = d(ms);
  const s = x.getUTCSeconds();
  return `${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())} ${fmtHM(ms)}${s ? `:${pad(s)}` : ''}`;
}
export function fmtRange(r: Range): string {
  const sameDay = Math.floor(r.from / DAY) === Math.floor(r.to / DAY);
  return sameDay ? `${fmtDayHM(r.from)} → ${fmtHM(r.to)}` : `${fmtDayHM(r.from)} → ${fmtDayHM(r.to)}`;
}
export function fmtValue(v: number, unit = ''): string {
  const abs = Math.abs(v);
  const txt = abs >= 1000 ? Math.round(v).toLocaleString('en-US') : abs >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
  return `${txt}${unit}`;
}

// ------------------------------------------------------------------ time ranges (in-game clock)

export type RangeId = 'fit' | 'panel' | '1h' | '3h' | '6h' | '12h' | '24h' | '3d' | '7d';

export interface RangeOption {
  id: RangeId;
  label: string;
  range: Range;
}

export type RelId = Exclude<RangeId, 'fit' | 'panel'>;

const REL: Record<RelId, { ms: number; label: string }> = {
  '1h': { ms: HOUR, label: '최근 1시간' },
  '3h': { ms: 3 * HOUR, label: '최근 3시간' },
  '6h': { ms: 6 * HOUR, label: '최근 6시간' },
  '12h': { ms: 12 * HOUR, label: '최근 12시간' },
  '24h': { ms: DAY, label: '최근 24시간' },
  '3d': { ms: 3 * DAY, label: '최근 3일' },
  '7d': { ms: 7 * DAY, label: '최근 7일' },
};

export function panelRange(p: DashboardDef | undefined): Range | null {
  return p ? { from: parseLocal(p.from), to: parseLocal(p.to) } : null;
}

/**
 * The range that shows every timed pin (padded 4 %, at least one hour). Falls back to the
 * dashboard window, then to the last 24 h of the in-game clock.
 */
export function fitRange(pins: Pin[], now: number, panels?: DashboardDef): Range {
  const ts = pins.filter((p) => p.ts !== null && p.onTimeline).map((p) => p.ts!);
  if (!ts.length) return panelRange(panels) ?? { from: now - DAY, to: now };
  let from = Math.min(...ts);
  let to = Math.max(...ts);
  const span = Math.max(HOUR, to - from);
  const mid = (from + to) / 2;
  if (to - from < HOUR) {
    from = mid - span / 2;
    to = mid + span / 2;
  }
  const padMs = Math.max(5 * MIN, span * 0.04);
  return { from: Math.floor((from - padMs) / MIN) * MIN, to: Math.ceil((to + padMs) / MIN) * MIN };
}

/** Range picker options; relative ones end at the in-game `now`. */
export function rangeOptions(o: { now: number; pins: Pin[]; panels?: DashboardDef; rel: RelId[]; fit?: boolean; panelLabel?: string }): RangeOption[] {
  const out: RangeOption[] = [];
  const pr = panelRange(o.panels);
  if (o.fit !== false) out.push({ id: 'fit', label: '핀 전체', range: fitRange(o.pins, o.now, o.panels) });
  if (pr) out.push({ id: 'panel', label: o.panelLabel ?? '대시보드 구간', range: pr });
  for (const id of o.rel) out.push({ id, label: REL[id].label, range: { from: o.now - REL[id].ms, to: o.now } });
  return out;
}

export const inRange = (ts: number, r: Range): boolean => ts >= r.from && ts <= r.to;

// ------------------------------------------------------------------ series

/** Small deterministic PRNG (mulberry32) seeded from a string. */
function rng(seed: string): () => number {
  let a = 2166136261;
  for (const ch of seed) a = Math.imul(a ^ ch.charCodeAt(0), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value of a series definition at `ts` (no jitter); null = no data. */
export function valueAt(s: SeriesDef, ts: number): number | null {
  const pts = s.points.map(([at, v]) => [parseLocal(at), v] as const);
  if (!pts.length || ts < pts[0][0]) return null;
  let i = 0;
  while (i + 1 < pts.length && pts[i + 1][0] <= ts) i++;
  const [t0, v0] = pts[i];
  if (v0 === null) return null;
  if (s.interp === 'linear' && i + 1 < pts.length) {
    const [t1, v1] = pts[i + 1];
    if (v1 !== null && t1 > t0) return v0 + ((v1 - v0) * (ts - t0)) / (t1 - t0);
  }
  return v0;
}

export interface Sample {
  ts: number;
  v: number | null;
}

/** Sample a series every `stepMin` minutes across `win`, with seeded jitter. */
export function sampleSeries(s: SeriesDef, win: Range, stepMin: number, seed = s.name): Sample[] {
  const step = Math.max(1, stepMin) * MIN;
  const r = rng(seed);
  // noise never lifts a value above the series' highest defined point (a saturated gauge stays flat)
  const cap = Math.max(...s.points.map(([, v]) => v ?? -Infinity));
  const out: Sample[] = [];
  for (let ts = win.from; ts <= win.to; ts += step) {
    const base = valueAt(s, ts);
    const n = r();
    out.push({ ts, v: base === null ? null : s.jitter && base !== 0 ? Math.min(cap, Math.max(0, base * (1 + s.jitter * (n * 2 - 1)))) : base });
  }
  return out;
}

/** Y-axis extent for a panel: [min, max] including thresholds, with a little headroom. */
export function yExtent(panel: TimeSeriesPanelDef, samples: Sample[][]): [number, number] {
  const vals = samples.flat().map((s) => s.v).filter((v): v is number => v !== null);
  for (const t of panel.thresholds ?? []) vals.push(t.value);
  const lo = panel.min ?? Math.min(0, ...vals);
  const hiRaw = panel.max ?? (vals.length ? Math.max(...vals) * 1.1 : 1);
  return [lo, hiRaw > lo ? hiRaw : lo + 1];
}

/** Contiguous spans where samples are at or above the threshold. */
export function spansAbove(samples: Sample[], threshold: number): Range[] {
  const out: Range[] = [];
  let start: number | null = null;
  let last = 0;
  for (const s of samples) {
    if (s.v !== null && s.v >= threshold) {
      if (start === null) start = s.ts;
      last = s.ts;
    } else if (start !== null) {
      out.push({ from: start, to: last });
      start = null;
    }
  }
  if (start !== null) out.push({ from: start, to: last });
  return out;
}

/** Change points of a series definition inside the range (for the "데이터 표" view). */
export function changePoints(s: SeriesDef, r: Range): { ts: number; v: number | null }[] {
  return s.points.map(([at, v]) => ({ ts: parseLocal(at), v })).filter((p) => inRange(p.ts, r));
}

/** One-sentence text alternative for a time-series chart (aria-label + screen-reader summary). */
export function summarizePanel(panel: TimeSeriesPanelDef, r: Range, samples: Sample[][], anns: Annotation[]): string {
  const unit = panel.unit ?? '';
  const parts: string[] = [`${panel.title}, ${fmtRange(r)}.`];
  panel.series.forEach((s, i) => {
    const vals = samples[i].map((x) => x.v).filter((v): v is number => v !== null);
    parts.push(vals.length ? `${s.name}: 최소 ${fmtValue(Math.min(...vals), unit)}, 최대 ${fmtValue(Math.max(...vals), unit)}.` : `${s.name}: 데이터 없음.`);
  });
  for (const t of panel.thresholds ?? []) {
    const spans = samples.flatMap((x) => spansAbove(x, t.value));
    parts.push(spans.length ? `${t.label} 이상: ${spans.map((sp) => `${fmtHM(sp.from)}–${fmtHM(sp.to)}`).join(', ')}.` : `${t.label} 이상 없음.`);
  }
  const shown = anns.filter((a) => inRange(a.ts, r));
  if (shown.length) parts.push(`주석 ${shown.length}개: ${shown.slice(0, 6).map((a) => `${fmtHM(a.ts)} ${KIND_LABEL[a.kind]}`).join(', ')}${shown.length > 6 ? ' …' : ''}.`);
  return parts.join(' ');
}

// ------------------------------------------------------------------ pins -> level, kind

export const KIND_LABEL: Record<AnnotationKind, string> = { deploy: '변경', cron: '크론', alert: '알림', error: '오류·경고', event: '이벤트' };
/** Shape drawn for each kind, so colour is never the only signal. */
export const KIND_SHAPE: Record<AnnotationKind, 'diamond' | 'triangle' | 'square' | 'cross' | 'circle'> = { deploy: 'diamond', cron: 'triangle', alert: 'square', error: 'cross', event: 'circle' };
export const KIND_GLYPH: Record<AnnotationKind, string> = { deploy: '◆', cron: '▲', alert: '■', error: '✖', event: '●' };
export const LEVEL_LABEL: Record<Level, string> = { error: 'ERR', warn: 'WARN', info: 'INFO' };

const ERROR_RE = /\b(error|err|fatal|crit(ical)?|fail(ed|ure|s)?|panic|refused|denied|exception|unavailable)\b|too many open files|no space left|errno|"\s5\d\d\s|\s5\d\d\s\d+\s"|\[P1\]|실패|오류|장애/i;
const WARN_RE = /\b(warn(ing)?|retry(ing)?|timeout|timed out|degraded|slow)\b|\b(9[5-9]|100)%|\[P[23]\]|경고|재시도/i;
const CRON_LINE_RE = /^\s*(@(yearly|annually|monthly|weekly|daily|hourly)|(\S+\s+){4}\S+)\s+\/?\S/;
const CRON_FIELD = /^[\d*,/\-a-z]+$/i;

/** An explicit level token wins ('WARN thumbnail … failed' is a warning); otherwise keywords decide. */
export function pinLevel(p: Pick<Pin, 'text'>): Level {
  const tok = /\b(ERROR|ERR|FATAL|CRIT|CRITICAL|EMERG|PANIC|WARN|WARNING|INFO|DEBUG|NOTICE)\b|\[(error|crit|alert|emerg|warn|notice|info)\]/.exec(p.text);
  if (tok) {
    const k = (tok[1] ?? tok[2]).toLowerCase();
    return /^(warn|warning)$/.test(k) ? 'warn' : /^(info|debug|notice)$/.test(k) ? 'info' : 'error';
  }
  if (ERROR_RE.test(p.text)) return 'error';
  if (WARN_RE.test(p.text)) return 'warn';
  return 'info';
}

/** A crontab schedule in the pinned text ('15 3 * * 6 /path …'), or null. */
export function cronExpr(text: string): string | null {
  const line = text.split('\n').find((l) => !/^\s*#/.test(l) && CRON_LINE_RE.test(l));
  if (!line) return null;
  const f = line.trim().split(/\s+/);
  if (f[0].startsWith('@')) return f[0];
  const five = f.slice(0, 5);
  if (!five.every((x) => CRON_FIELD.test(x)) || !/[\d*]/.test(five[0]) || !/[\d*]/.test(five[1])) return null;
  return parseCron(five.join(' ')) ? five.join(' ') : null;
}

export function pinKind(p: Pick<Pin, 'kind' | 'text'>): AnnotationKind {
  const tx = p.text;
  if (p.kind === 'commit' || /^(commit\s+[0-9a-f]{7,}|AuthorDate:|CommitDate:|Merge:)|\bgit (push|merge|revert)\b|\bdeploy(ed|ment)?\b|배포|\brevert\b|pre-receive/im.test(tx)) return 'deploy';
  if (/CRON\[\d+\]|\bcron(tab)?\b/i.test(tx) || cronExpr(tx)) return 'cron';
  if (p.kind === 'notification' || /\b(alert|alarm|on-?call|paged?)\b|\[P\d\]|알림|온콜|호출/i.test(tx)) return 'alert';
  if (pinLevel(p) !== 'info') return 'error';
  return 'event';
}

// ------------------------------------------------------------------ cron

interface Cron {
  min: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  mon: Set<number>;
  dow: Set<number>;
  domAny: boolean;
  dowAny: boolean;
}

const NAMES: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MACROS: Record<string, string> = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@hourly': '0 * * * *' };

function field(src: string, lo: number, hi: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of src.toLowerCase().split(',')) {
    const m = /^(\*|([a-z0-9]+)(?:-([a-z0-9]+))?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    const num = (x: string) => (x in NAMES ? NAMES[x] : /^\d+$/.test(x) ? +x : NaN);
    let a = lo;
    let b = hi;
    if (m[1] !== '*') {
      a = num(m[2]);
      b = m[3] !== undefined ? num(m[3]) : m[4] ? hi : a;
    }
    const step = m[4] ? +m[4] : 1;
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < lo || b > hi || a > b || step < 1) return null;
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expr: string): Cron | null {
  const src = MACROS[expr] ?? expr;
  const f = src.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [min, hour, dom, mon, dowRaw] = [field(f[0], 0, 59), field(f[1], 0, 23), field(f[2], 1, 31), field(f[3], 1, 12), field(f[4], 0, 7)];
  if (!min || !hour || !dom || !mon || !dowRaw) return null;
  const dow = new Set([...dowRaw].map((x) => x % 7));
  return { min, hour, dom, mon, dow, domAny: f[2] === '*', dowAny: f[4] === '*' };
}

/** Runs of a cron schedule inside the range (local ms), at most `max` + 1 (to detect "too many"). */
export function cronOccurrences(expr: string, r: Range, max = 24): number[] {
  const c = parseCron(expr);
  if (!c) return [];
  const out: number[] = [];
  const hours = [...c.hour].sort((a, b) => a - b);
  const mins = [...c.min].sort((a, b) => a - b);
  for (let day = Math.floor(r.from / DAY) * DAY; day <= r.to; day += DAY) {
    const x = d(day);
    if (!c.mon.has(x.getUTCMonth() + 1)) continue;
    const domOk = c.dom.has(x.getUTCDate());
    const dowOk = c.dow.has(x.getUTCDay());
    const dayOk = c.domAny && c.dowAny ? true : c.domAny ? dowOk : c.dowAny ? domOk : domOk || dowOk;
    if (!dayOk) continue;
    for (const h of hours)
      for (const m of mins) {
        const ts = day + h * HOUR + m * MIN;
        if (ts < r.from || ts > r.to) continue;
        out.push(ts);
        if (out.length > max) return out;
      }
  }
  return out;
}

/** Next run of the schedule at or after `from` (searches a year ahead). */
export function nextCron(expr: string, from: number): number | null {
  return cronOccurrences(expr, { from, to: from + 366 * DAY }, 0)[0] ?? null;
}

// ------------------------------------------------------------------ annotations

const short = (s: string, n = 60) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

/**
 * Annotations for pinned evidence: one marker per timed pin on the timeline, plus one marker
 * per run of every pinned crontab line inside the range (they need no time of their own).
 * `tooMany` lists cron pins whose schedule is too dense to draw.
 */
export function pinAnnotations(pins: Pin[], r: Range): { anns: Annotation[]; tooMany: string[] } {
  const anns: Annotation[] = [];
  const tooMany: string[] = [];
  for (const p of pins) {
    const kind = pinKind(p);
    if (p.ts !== null && p.onTimeline) anns.push({ ts: p.ts, kind, label: short(p.text), pinId: p.id });
    const cron = cronExpr(p.text);
    if (cron) {
      const runs = cronOccurrences(cron, r);
      if (runs.length > 24) tooMany.push(p.id);
      else for (const ts of runs) anns.push({ ts, kind: 'cron', label: `⟳ ${cron} · ${short(p.text.replace(cron, '').trim(), 40)}`, pinId: p.id, recurring: true });
    }
  }
  anns.sort((a, b) => a.ts - b.ts);
  return { anns, tooMany };
}

export function caseAnnotations(panels?: DashboardDef): Annotation[] {
  return (panels?.annotations ?? []).map((a) => ({ ts: parseLocal(a.at), kind: a.kind, label: a.label, fromCase: true }));
}

export interface Placed<T> {
  item: T;
  x: number;
  /** Stacking row in the marker strip (0 = top), so close markers do not overlap. */
  row: number;
}

/** x position of a time on an axis of `width` px; null when outside the range. */
export function xOf(ts: number, r: Range, width: number): number | null {
  if (ts < r.from || ts > r.to || r.to <= r.from) return null;
  return ((ts - r.from) / (r.to - r.from)) * width;
}

/** Place annotations on the axis; markers closer than `gap` px move to the next row (max `rows`). */
export function placeAnnotations<T extends { ts: number }>(items: T[], r: Range, width: number, gap = 12, rows = 3): Placed<T>[] {
  const lastX: number[] = Array(rows).fill(-Infinity);
  const out: Placed<T>[] = [];
  for (const item of [...items].sort((a, b) => a.ts - b.ts)) {
    const x = xOf(item.ts, r, width);
    if (x === null) continue;
    let row = lastX.findIndex((lx) => x - lx >= gap);
    if (row < 0) row = rows - 1;
    lastX[row] = x;
    out.push({ item, x, row });
  }
  return out;
}

// ------------------------------------------------------------------ ticks

const STEPS = [MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 30 * DAY, 365 * DAY];

/** Round time ticks for an axis about `width` px wide (one per ~90 px). */
export function timeTicks(r: Range, width: number): { ts: number; label: string }[] {
  const want = Math.max(2, Math.floor(width / 90));
  const step = STEPS.find((s) => (r.to - r.from) / s <= want) ?? STEPS[STEPS.length - 1];
  const out: { ts: number; label: string }[] = [];
  const multiDay = r.to - r.from > DAY || Math.floor(r.from / DAY) !== Math.floor(r.to / DAY);
  for (let ts = Math.ceil(r.from / step) * step; ts <= r.to; ts += step) {
    const midnight = ts % DAY === 0;
    out.push({ ts, label: step >= DAY ? fmtMD(ts) : multiDay && midnight ? fmtMD(ts) : fmtHM(ts) });
  }
  return out;
}

// ------------------------------------------------------------------ logs panel

export interface LogFilter {
  query: string;
  levels: Set<Level>;
}

/** Timed pins on the timeline, inside the range, matching the search box and level toggles, oldest first. */
export function logRows(pins: Pin[], r: Range | null, f: LogFilter): Pin[] {
  const q = f.query.trim().toLowerCase();
  return pins
    .filter((p) => p.onTimeline && p.ts !== null && (!r || inRange(p.ts, r)))
    .filter((p) => f.levels.has(pinLevel(p)))
    .filter((p) => !q || `${p.text}\n${p.source}\n${p.note ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => a.ts! - b.ts!);
}
