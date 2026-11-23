// Observability-style panel components shared by the evidence board and the dashboard app:
// panel chrome (title + kebab menu), toolbar with a time-range picker and refresh against the
// in-game clock, stat panels, hand-rolled SVG time-series with threshold lines and vertical
// annotations, the evidence lane timeline and a log panel with level badges and a search box.
// Colour is never the only signal: thresholds carry labels, levels carry text, kinds carry shapes.

import { clear, h } from '../dom.ts';
import { DUR, reducedMotion } from '../motion.ts';
import type { Pin } from '../../engine/game.ts';
import type { AnnotationKind, StatPanelDef, TimeSeriesPanelDef } from '../../engine/types.ts';
import {
  changePoints, dayLines, fmtDayHM, fmtHM, fmtLogTs, fmtRange, fmtValue, spansYears, KIND_GLYPH, KIND_LABEL, KIND_SHAPE, LEVEL_LABEL, pinKind, pinLevel,
  lastSample, placeAnnotations, sampleSeries, spansAbove, summarizePanel, timeTicks, xOf, yExtent,
  type Annotation, type Level, type Range, type RangeId, type RangeOption, type Sample,
} from './derive.ts';

const NS = 'http://www.w3.org/2000/svg';
type Attrs = Record<string, string | number | undefined>;
function s(tag: string, attrs: Attrs = {}, ...kids: (SVGElement | string | null)[]): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v));
  for (const c of kids) if (c !== null) el.append(c);
  return el;
}

let uid = 0;
const nextId = (p: string) => `${p}${++uid}`;

// ------------------------------------------------------------------ chrome

export interface MenuItem {
  label: string;
  run: () => void;
}

/** "⋮" panel menu: keyboard reachable (Enter/Space opens, arrows move, Escape closes). */
export function kebab(title: string, items: MenuItem[]): HTMLElement {
  const btn = h('button.obs-kebab', { type: 'button', 'aria-label': `${title} — 패널 메뉴`, 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: '패널 메뉴' }, '⋮');
  const entries = items.map((it) => h('button.obs-mi', { type: 'button', role: 'menuitem', onclick: () => (close(true), it.run()) }, it.label));
  const menu = h('div.obs-menu', { role: 'menu', 'aria-label': title, hidden: true }, ...entries);
  const outside = (e: Event) => !wrap.contains(e.target as Node) && close(false);
  function close(focus: boolean) {
    if (menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (focus) btn.focus();
  }
  btn.addEventListener('click', () => {
    if (!menu.hidden) return close(false);
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
    entries[0]?.focus();
  });
  menu.addEventListener('keydown', (e) => {
    const i = entries.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), close(true));
    else if (e.key === 'ArrowDown') (e.preventDefault(), entries[(i + 1) % entries.length].focus());
    else if (e.key === 'ArrowUp') (e.preventDefault(), entries[(i - 1 + entries.length) % entries.length].focus());
    else if (e.key === 'Tab') close(false);
  });
  const wrap = h('div.obs-kebabwrap', null, btn, menu);
  return wrap;
}

export type Span = 'full' | 'half' | 'third' | 'twothirds' | 'quarter' | 'sixth';

export interface PanelOpts {
  title: string;
  span?: Span;
  cls?: string;
  /** Extra header controls (search box, toggles) before the menu. */
  tools?: HTMLElement[];
  menu?: MenuItem[];
  description?: string;
  /** Data table toggled from the menu ("데이터 표"). */
  table?: () => HTMLElement;
}

/** A panel: header (title, tools, ⋮ menu with 확대 / 데이터 표 / 설명) and a body. */
export function panel(o: PanelOpts, ...body: (HTMLElement | null)[]): HTMLElement {
  const id = nextId('obs-pt-');
  const extra = h('div.obs-extra');
  const el = h(`section.obs-panel.span-${o.span ?? 'full'}${o.cls ? `.${o.cls}` : ''}`, { 'aria-labelledby': id });
  const toggleExtra = (key: string, make: () => HTMLElement) => {
    const cur = extra.dataset.show;
    clear(extra);
    if (cur === key) return void delete extra.dataset.show;
    extra.dataset.show = key;
    extra.appendChild(make());
  };
  const items: MenuItem[] = [
    { label: '확대 보기 / 원래 크기', run: () => el.classList.toggle('full') },
    ...(o.table ? [{ label: '데이터 표', run: () => toggleExtra('table', o.table!) }] : []),
    ...(o.description ? [{ label: '설명', run: () => toggleExtra('desc', () => h('p.obs-desc', null, o.description!)) }] : []),
    ...(o.menu ?? []),
  ];
  el.append(
    h('header.obs-ph', null, h('h3', { id }, o.title), h('div.obs-tools', null, ...(o.tools ?? [])), kebab(o.title, items)),
    h('div.obs-pb', null, ...body),
    extra,
  );
  return el;
}

export interface ToolbarOpts {
  crumbs: string[];
  options: RangeOption[];
  value: RangeId;
  onRange: (id: RangeId) => void;
  onRefresh: () => void;
  /** In-game clock text of the last refresh. */
  refreshedAt: number;
  badge?: string;
  extra?: HTMLElement[];
}

/** Top bar: breadcrumb, optional badge, time-range picker (in-game clock) and refresh. */
export function toolbar(o: ToolbarOpts): HTMLElement {
  const sel = h(
    'select.obs-range',
    { 'aria-label': '시간 범위', onchange: (e: Event) => o.onRange((e.target as HTMLSelectElement).value as RangeId) },
    ...o.options.map((opt) => h('option', { value: opt.id, selected: opt.id === o.value }, `${opt.label} · ${fmtRange(opt.range)}`)),
  ) as HTMLSelectElement;
  return h(
    'div.obs-bar',
    null,
    h('nav.obs-crumbs', { 'aria-label': '위치' }, ...o.crumbs.flatMap((c, i) => (i ? [h('span.obs-sep', { 'aria-hidden': 'true' }, '›'), h('span', null, c)] : [h('strong', null, c)]))),
    o.badge ? h('span.obs-badge', null, o.badge) : null,
    h('span.obs-sp'),
    ...(o.extra ?? []),
    h('label.obs-rangewrap', null, h('span.obs-clock', { 'aria-hidden': 'true' }, '🕒'), sel),
    h('button.obs-btn.obs-refresh', { type: 'button', onclick: o.onRefresh, 'aria-label': `새로고침 (게임 시계 ${fmtDayHM(o.refreshedAt)} 기준)`, title: `게임 시계 ${fmtDayHM(o.refreshedAt)} 기준` }, '⟳ ', h('span.obs-rt', null, fmtHM(o.refreshedAt))),
  );
}

// ------------------------------------------------------------------ stat

const STATE_WORD = { ok: '정상', warn: '주의', crit: '위험', none: '' } as const;

/** `word` overrides the state word ('정상' / '주의' / '위험'); '' shows none. */
export function statPanel(def: StatPanelDef & { span?: Span; word?: string; blink?: boolean }): HTMLElement {
  const state = def.value === null ? 'none' : (def.state ?? 'none');
  const word = def.word ?? STATE_WORD[state];
  return panel(
    { title: def.title, span: def.span ?? 'quarter', cls: `obs-stat.st-${state}${def.blink && state === 'crit' && !reducedMotion() ? '.blink' : ''}` },
    h('div.obs-sv', null, def.value ?? '데이터 없음'),
    h('div.obs-ss', null, word ? h('span.obs-sw', null, word) : null, def.note ? h('span', null, def.note) : null),
  );
}

// ------------------------------------------------------------------ SVG helpers

function shape(kind: AnnotationKind, x: number, y: number, r = 5): SVGElement {
  const cls = `obs-shape k-${kind}`;
  switch (KIND_SHAPE[kind]) {
    case 'diamond': return s('path', { class: cls, d: `M${x} ${y - r - 1}L${x + r + 1} ${y}L${x} ${y + r + 1}L${x - r - 1} ${y}Z` });
    case 'triangle': return s('path', { class: cls, d: `M${x} ${y - r - 1}L${x + r + 1} ${y + r}L${x - r - 1} ${y + r}Z` });
    case 'square': return s('rect', { class: cls, x: x - r, y: y - r, width: r * 2, height: r * 2 });
    case 'cross': return s('path', { class: `${cls} obs-x`, d: `M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}` });
    default: return s('circle', { class: cls, cx: x, cy: y, r });
  }
}

/** Calls draw(width) now and whenever the host resizes (charts are drawn at their real pixel size). */
function sized(host: HTMLElement, draw: (w: number) => void): void {
  let last = -1;
  const run = () => {
    if (!host.isConnected || !host.clientWidth) return; // not laid out yet: the observer calls again
    const w = Math.max(240, Math.floor(host.clientWidth));
    if (w === last) return;
    last = w;
    draw(w);
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(run).observe(host);
  requestAnimationFrame(run);
  run();
}

function niceY(lo: number, hi: number): number[] {
  const raw = (hi - lo) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

function xAxis(svg: SVGElement, r: Range, x0: number, w: number, y: number, top: number, marks: number[]): void {
  const markX = marks.map((m) => xOf(m, r, w)).filter((x): x is number => x !== null);
  for (const t of timeTicks(r, w)) {
    const tx = xOf(t.ts, r, w)!;
    const x = x0 + tx;
    svg.append(s('line', { class: 'obs-gl', x1: x, x2: x, y1: top, y2: y }));
    // a labelled mark (03:15) wins over a nearby round tick label
    if (!markX.some((mx) => Math.abs(mx - tx) < 40)) svg.append(s('text', { class: 'obs-ax', x, y: y + 14, 'text-anchor': 'middle' }, t.label));
  }
  // marks closer than a label apart keep their tick, the later one loses its label
  let lastLabel = -Infinity;
  for (const m of [...marks].sort((a, b) => a - b)) {
    const x = xOf(m, r, w);
    if (x === null) continue;
    svg.append(s('line', { class: 'obs-mark', x1: x0 + x, x2: x0 + x, y1: y, y2: y + 4 }));
    if (x - lastLabel < 40) continue;
    lastLabel = x;
    svg.append(s('text', { class: 'obs-ax obs-axm', x: x0 + x, y: y + 14, 'text-anchor': 'middle' }, fmtHM(m)));
  }
}

function nowLine(svg: SVGElement, now: number | undefined, r: Range, x0: number, w: number, top: number, bottom: number): void {
  if (now === undefined) return;
  const x = xOf(now, r, w);
  if (x === null) return;
  svg.append(s('line', { class: 'obs-now', x1: x0 + x, x2: x0 + x, y1: top, y2: bottom }), s('text', { class: 'obs-nowt', x: x0 + x - 3, y: top + 9, 'text-anchor': 'end' }, '지금'));
}

function annLines(svg: SVGElement, anns: Annotation[], r: Range, x0: number, w: number, stripTop: number, plotTop: number, plotBottom: number, onAnn?: (a: Annotation) => void): number {
  const placed = placeAnnotations(anns, r, w, 12, 2);
  for (const p of placed) {
    const x = x0 + p.x;
    const y = stripTop + 6 + p.row * 12;
    const g = s('g', { class: `obs-ann k-${p.item.kind}${p.item.recurring ? ' rec' : ''}` }, s('title', {}, `${fmtDayHM(p.item.ts, spansYears(r))} · ${KIND_LABEL[p.item.kind]} · ${p.item.label}`), s('line', { x1: x, x2: x, y1: y, y2: plotBottom }), shape(p.item.kind, x, y, 4));
    if (onAnn && p.item.pinId) g.addEventListener('click', () => onAnn(p.item));
    svg.append(g);
  }
  void plotTop;
  return placed.length;
}

// ------------------------------------------------------------------ time series

export interface TimeSeriesOpts {
  def: TimeSeriesPanelDef;
  range: Range;
  stepMin: number;
  anns: Annotation[];
  marks?: number[];
  now?: number;
  /** Where the dashboard has data (see dataWindow); samples outside are gaps. */
  data?: Range;
  span?: Span;
  onAnn?: (a: Annotation) => void;
  /** Note under the title ("대시보드에서 연결"). */
  linked?: string;
  /** Blink the threshold once on the first draw when it is crossed in range. */
  blinkOnMount?: boolean;
}

export interface LiveUpdate {
  range: Range;
  now: number;
  data?: Range;
}

/** In-place updaters of time-series panels (live graphs): panel element -> update(range, now). */
export const liveUpdaters = new WeakMap<HTMLElement, (u: LiveUpdate) => void>();

const PALETTE = ['green', 'yellow', 'blue', 'purple', 'red', 'grey'] as const;

/** Time-series panel: series lines + area, threshold lines with labels, annotations, hover readout. */
export function timeSeriesPanel(o: TimeSeriesOpts): HTMLElement {
  const { def } = o;
  const unit = def.unit ?? '';
  const st = { range: o.range, now: o.now, data: o.data, step: 1, samples: [] as Sample[][], blinkUntil: o.blinkOnMount ? Infinity : 0, tail: false, width: 0 };
  const compute = () => {
    // sample at the snapshot step, but never more than ~600 points across the range
    st.step = Math.max(o.stepMin, Math.ceil((st.range.to - st.range.from) / 60000 / 600));
    st.samples = def.series.map((sr) => sampleSeries(sr, st.range, st.step, `${def.id}:${sr.name}`, st.data));
  };
  compute();
  const host = h('div.obs-chart', { role: 'img' });
  const tip = h('div.obs-tip', { hidden: true, 'aria-hidden': 'true' });
  const legend = h('ul.obs-legend', { 'aria-label': `${def.title} 범례` });
  const overTxt = h('p.obs-over-txt', { hidden: true });
  const crossed = () => (def.thresholds ?? []).some((t) => st.samples.some((x) => spansAbove(x, t.value).length));
  const text = () => {
    host.setAttribute('aria-label', summarizePanel(def, st.range, st.samples, o.anns));
    const last = lastSample(st.samples[0] ?? []);
    host.dataset.last = last ? String(last.ts) : '';
    clear(legend);
    def.series.forEach((sr, i) => {
      const vals = st.samples[i].map((x) => x.v).filter((v): v is number => v !== null);
      const cur = lastSample(st.samples[i]);
      legend.appendChild(h('li', null, h(`span.obs-sw.c-${sr.color ?? PALETTE[i % PALETTE.length]}`, { 'aria-hidden': 'true' }), sr.name, h('span.obs-lv', null, vals.length ? `최대 ${fmtValue(Math.max(...vals), unit)} · 마지막 ${fmtValue(cur!.v!, unit)}` : '데이터 없음')));
    });
    for (const t of def.thresholds ?? []) legend.appendChild(h('li', null, h('span.obs-sw.thr', { 'aria-hidden': 'true' }), `┄ ${t.label}`));
    const overs = (def.thresholds ?? []).flatMap((t) => st.samples.flatMap((x) => spansAbove(x, t.value)).map((sp) => `${t.label} 이상 ${fmtHM(sp.from)}–${fmtHM(sp.to)}`));
    overTxt.hidden = !overs.length;
    overTxt.textContent = overs.length ? `⚠ ${overs.join(' · ')}` : '';
  };
  text();

  const draw = (W: number) => {
    st.width = W;
    clear(host);
    host.appendChild(tip);
    const { range, samples, step } = st;
    const H = 190;
    const left = 46;
    const right = 10;
    const strip = 26;
    const top = 6 + strip;
    const bottom = H - 22;
    const w = W - left - right;
    const [lo, hi] = yExtent(def, samples);
    const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', focusable: 'false' });
    const clipId = nextId('obs-clip-');
    for (const v of niceY(lo, hi)) svg.append(s('line', { class: 'obs-gl', x1: left, x2: left + w, y1: y(v), y2: y(v) }), s('text', { class: 'obs-ax', x: left - 6, y: y(v) + 4, 'text-anchor': 'end' }, fmtValue(v)));
    xAxis(svg, range, left, w, bottom, top, o.marks ?? []);
    const thr = def.thresholds?.[0];
    if (thr) {
      const ty = y(thr.value);
      svg.append(
        s('defs', {}, s('clipPath', { id: clipId }, s('rect', { x: left, y: top - 2, width: w, height: Math.max(0, ty - top + 2) }))),
        s('rect', { class: 'obs-thr-zone', x: left, y: top, width: w, height: Math.max(0, ty - top) }),
      );
    }
    const hasData = samples.some((ss) => ss.some((x) => x.v !== null));
    if (!hasData) svg.append(s('text', { class: 'obs-nodata', x: left + w / 2, y: (top + bottom) / 2, 'text-anchor': 'middle' }, '이 구간에는 데이터가 없어요'));
    def.series.forEach((sr, i) => {
      const color = sr.color ?? PALETTE[i % PALETTE.length];
      const segs: string[][] = [];
      let cur: string[] | null = null;
      for (const p of samples[i]) {
        if (p.v === null) {
          cur = null;
          continue;
        }
        if (!cur) segs.push((cur = []));
        cur.push(`${(left + xOf(p.ts, range, w)!).toFixed(1)} ${y(Math.min(hi, p.v)).toFixed(1)}`);
      }
      for (const seg of segs) {
        if (!seg.length) continue;
        const line = `M${seg.join('L')}`;
        const first = seg[0].split(' ')[0];
        const last = seg[seg.length - 1].split(' ')[0];
        svg.append(s('path', { class: `obs-area c-${color}`, d: `${line}L${last} ${bottom}L${first} ${bottom}Z` }), s('path', { class: `obs-line c-${color}`, d: line }));
        if (thr) svg.append(s('path', { class: 'obs-line obs-over', d: line, 'clip-path': `url(#${clipId})` }));
      }
      // live: the newest point arrives with a short pulse
      const lp = st.tail ? lastSample(samples[i]) : null;
      if (lp && st.data && lp.ts >= st.data.to - step * 60000) svg.append(s('circle', { class: `obs-tail c-${color}${reducedMotion() ? '' : ' arrive'}`, cx: left + xOf(lp.ts, range, w)!, cy: y(Math.min(hi, lp.v!)), r: 3 }));
    });
    // the blink runs from the first real draw for DUR.blink; redraws inside that window keep it
    if (st.blinkUntil === Infinity) st.blinkUntil = performance.now() + DUR.blink;
    const blink = performance.now() < st.blinkUntil && !reducedMotion() && crossed();
    for (const t of def.thresholds ?? []) {
      const ty = y(t.value);
      svg.append(s('g', { class: `obs-thrg${blink ? ' blink' : ''}` }, s('line', { class: 'obs-thr', x1: left, x2: left + w, y1: ty, y2: ty }), s('text', { class: 'obs-thrt', x: left + w - 4, y: ty - 4, 'text-anchor': 'end' }, `┄ ${t.label}`)));
    }
    st.tail = false;
    annLines(svg, o.anns, range, left, w, 4, top, bottom, o.onAnn);
    nowLine(svg, st.now, range, left, w, top, bottom);
    // hover readout
    const cross = s('line', { class: 'obs-cross', x1: 0, x2: 0, y1: top, y2: bottom, visibility: 'hidden' });
    const hit = s('rect', { x: left, y: top, width: w, height: bottom - top, fill: 'transparent' });
    svg.append(cross, hit);
    hit.addEventListener('pointermove', (e) => {
      const bx = (e as PointerEvent).offsetX - left;
      const first = st.samples[0]?.[0]?.ts ?? range.from;
      const ts = range.from + (bx / w) * (range.to - range.from);
      const idx = Math.max(0, Math.min((st.samples[0]?.length ?? 1) - 1, Math.round((ts - first) / (st.step * 60000))));
      const at = st.samples[0]?.[idx]?.ts ?? ts;
      const x = left + (xOf(at, range, w) ?? bx);
      cross.setAttribute('x1', String(x));
      cross.setAttribute('x2', String(x));
      cross.setAttribute('visibility', 'visible');
      clear(tip);
      tip.append(h('b', null, fmtDayHM(at, spansYears(st.range))), ...def.series.map((sr, i) => h('div', null, `${sr.name}: ${st.samples[i][idx]?.v == null ? '—' : fmtValue(st.samples[i][idx].v!, unit)}`)));
      tip.hidden = false;
      tip.style.left = `${Math.min(W - 170, x + 10)}px`;
    });
    hit.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    });
    host.appendChild(svg);
  };
  sized(host, draw);

  const table = () =>
    h(
      'table.obs-table',
      null,
      h('caption', null, `${def.title} — 값이 바뀌는 시각`),
      h('tr', null, h('th', { scope: 'col' }, '시각'), h('th', { scope: 'col' }, '시리즈'), h('th', { scope: 'col' }, '값')),
      ...def.series.flatMap((sr) => changePoints(sr, st.range).map((p) => h('tr', null, h('td', null, fmtDayHM(p.ts, spansYears(st.range))), h('td', null, sr.name), h('td', null, p.v === null ? '데이터 없음' : fmtValue(p.v, unit))))),
      ...o.anns.filter((a) => a.ts >= st.range.from && a.ts <= st.range.to).map((a) => h('tr', null, h('td', null, fmtDayHM(a.ts, spansYears(st.range))), h('td', null, `${KIND_GLYPH[a.kind]} ${KIND_LABEL[a.kind]}`), h('td', null, a.label))),
    );
  const el = panel(
    { title: def.title, span: o.span ?? def.width ?? 'full', cls: 'obs-tsp', description: def.description, table },
    o.linked ? h('p.obs-linked', null, o.linked) : null,
    host,
    legend,
    overTxt,
  );
  liveUpdaters.set(el, (u) => {
    const before = lastSample(st.samples[0] ?? [])?.ts ?? null;
    const wasCrossed = crossed();
    st.range = u.range;
    st.now = u.now;
    st.data = u.data;
    compute();
    const after = lastSample(st.samples[0] ?? [])?.ts ?? null;
    st.tail = after !== null && after !== before;
    // a threshold newly crossed while watching blinks once
    if (!wasCrossed && crossed()) st.blinkUntil = Infinity;
    text();
    if (st.width) draw(st.width);
  });
  return el;
}

// ------------------------------------------------------------------ evidence lanes

const LANES: AnnotationKind[] = ['deploy', 'cron', 'alert', 'error', 'event'];

export interface LaneOpts {
  range: Range;
  anns: Annotation[];
  now?: number;
  marks?: number[];
  onAnn?: (a: Annotation) => void;
  tooMany?: number;
  /** Pins that just arrived: their markers snap into place. */
  snap?: Set<string>;
}

/** Evidence timeline: one lane per annotation kind; each pin is a focusable marker at its time. */
export function laneChart(o: LaneOpts): HTMLElement {
  const { range, anns } = o;
  const shown = anns.filter((a) => a.ts >= range.from && a.ts <= range.to);
  const counts = LANES.map((k) => [k, shown.filter((a) => a.kind === k).length] as const).filter(([, n]) => n);
  const year = spansYears(range);
  const label = `증거 타임라인, ${fmtRange(range)}. ${shown.length ? `주석 ${shown.length}개: ${counts.map(([k, n]) => `${KIND_LABEL[k]} ${n}`).join(', ')}.` : '이 구간에 핀한 증거가 없어요.'}`;
  const host = h('div.obs-chart.obs-lanes', { role: 'group', 'aria-label': label });
  sized(host, (W) => {
    clear(host);
    const left = 84;
    const right = 12;
    const top = 8;
    const laneH = 30;
    const bottom = top + laneH * LANES.length;
    const H = bottom + 22;
    const w = W - left - right;
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'presentation' });
    LANES.forEach((k, i) => {
      const cy = top + laneH * i + laneH / 2;
      svg.append(
        s('rect', { class: `obs-lane${i % 2 ? ' alt' : ''}`, x: left, y: top + laneH * i, width: w, height: laneH }),
        shape(k, 12, cy, 4),
        s('text', { class: 'obs-ax obs-lanet', x: 24, y: cy + 4 }, KIND_LABEL[k]),
      );
    });
    xAxis(svg, range, left, w, bottom, top, o.marks ?? []);
    // day boundaries (only while a day is wide enough for its label; the ticks carry longer ranges)
    for (const dl of dayLines(range, w, o.now)) {
      const x = left + xOf(dl.ts, range, w)!;
      svg.append(s('line', { class: 'obs-day', x1: x, x2: x, y1: top, y2: bottom }));
      if (dl.label) svg.append(s('text', { class: 'obs-dayt', x: x + 3, y: top + 9 }, dl.label));
    }
    // markers: same-lane markers closer than 14 px stack vertically inside the lane
    for (const [li, k] of LANES.entries()) {
      const placed = placeAnnotations(shown.filter((a) => a.kind === k), range, w, 14, 3);
      for (const p of placed) {
        const x = left + p.x;
        const cy = top + laneH * li + laneH / 2 + (p.row - (placed.some((q) => q.row) ? 1 : 0)) * 8;
        const a = p.item;
        const name = `${fmtDayHM(a.ts, year)} ${KIND_LABEL[a.kind]}${a.recurring ? ' (반복)' : ''}: ${a.label}`;
        if (a.recurring) svg.append(s('line', { class: `obs-recline k-${a.kind}`, x1: x, x2: x, y1: top, y2: bottom }));
        const g = s('g', { class: `obs-mk k-${a.kind}${a.pinId && o.snap?.has(a.pinId) && !reducedMotion() ? ' snap' : ''}`, tabindex: a.pinId && o.onAnn ? 0 : undefined, role: a.pinId && o.onAnn ? 'button' : 'img', 'aria-label': name, 'data-pin': a.pinId }, s('title', {}, name), s('circle', { class: 'obs-halo', cx: x, cy, r: 9 }), shape(a.kind, x, cy, 5));
        if (a.pinId && o.onAnn) {
          g.addEventListener('click', () => o.onAnn!(a));
          g.addEventListener('keydown', (e) => ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') && (e.preventDefault(), o.onAnn!(a)));
        }
        svg.append(g);
      }
    }
    nowLine(svg, o.now, range, left, w, top, bottom);
    if (!shown.length) svg.append(s('text', { class: 'obs-nodata', x: left + w / 2, y: (top + bottom) / 2, 'text-anchor': 'middle' }, '이 구간에 핀한 증거가 없어요'));
    host.appendChild(svg);
  });
  return host;
}

// ------------------------------------------------------------------ logs

export interface LogsOpts {
  rows: Pin[];
  query: string;
  levels: Set<Level>;
  counts: Record<Level, number>;
  onQuery: (q: string) => void;
  onLevel: (l: Level) => void;
  /** Per-row extra controls (board: time edit, to tray, note, remove). */
  actions?: (p: Pin) => HTMLElement | null;
  keyIds?: Set<string>;
  draggable?: boolean;
  empty: string;
  hiddenOutside?: number;
  onShowAll?: () => void;
}

const KIND_ICON: Record<Pin['kind'], string> = { line: '⌨️', message: '💬', mail: '✉', file: '📄', commit: '⎇', note: '📒', notification: '🔔' };

function marked(text: string, q: string): (string | HTMLElement)[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [text];
  const out: (string | HTMLElement)[] = [];
  let i = 0;
  const low = text.toLowerCase();
  for (let j = low.indexOf(needle); j >= 0; j = low.indexOf(needle, i)) {
    out.push(text.slice(i, j), h('mark', null, text.slice(j, j + needle.length)));
    i = j + needle.length;
  }
  out.push(text.slice(i));
  return out;
}

/** Search box + level toggles for a logs panel header. */
export function logTools(o: Pick<LogsOpts, 'query' | 'levels' | 'counts' | 'onQuery' | 'onLevel'>, label: string): HTMLElement[] {
  const q = h('input.obs-search', { type: 'search', value: o.query, placeholder: '검색 (텍스트·출처·메모)', 'aria-label': label }) as HTMLInputElement;
  q.addEventListener('input', () => o.onQuery(q.value));
  const lv = (['error', 'warn', 'info'] as Level[]).map((l) =>
    h(`button.obs-lvbtn.lv-${l}`, { type: 'button', 'aria-pressed': String(o.levels.has(l)), onclick: () => o.onLevel(l), title: `${LEVEL_LABEL[l]} 줄 보이기/숨기기` }, `${LEVEL_LABEL[l]} ${o.counts[l]}`),
  );
  return [q, h('div.obs-lvs', { role: 'group', 'aria-label': '레벨' }, ...lv)];
}

/** One log row per pin: time, level badge (text), kind glyph + source, text, note, actions. */
export function logRow(p: Pin, o: Pick<LogsOpts, 'query' | 'actions' | 'keyIds' | 'draggable'>): HTMLElement {
  const lvl = pinLevel(p);
  const kind = pinKind(p);
  const isKey = p.clueIds.some((c) => o.keyIds?.has(c));
  const prose = p.kind === 'message' || p.kind === 'mail' || p.kind === 'note' || p.kind === 'notification';
  const el = h(
    `div.card.obs-row.lv-${lvl}`,
    { draggable: o.draggable ? true : undefined, dataset: { pin: p.id, kind } },
    h('span.obs-ts', null, p.ts !== null ? fmtLogTs(p.ts) : '—'),
    h(`span.obs-lvl.lv-${lvl}`, null, LEVEL_LABEL[lvl]),
    h(
      'div.obs-msg',
      null,
      h('div.obs-src', null, h(`span.obs-kg.k-${kind}`, { title: KIND_LABEL[kind], 'aria-label': KIND_LABEL[kind] }, KIND_GLYPH[kind]), h('span', { 'aria-hidden': 'true' }, KIND_ICON[p.kind]), h('span', null, p.source), isKey ? h('span.star', { title: '핵심 증거', 'aria-label': '핵심 증거' }, '★') : null),
      h(`div.tx${prose ? '.prose' : ''}`, { title: p.text }, ...marked(p.text, o.query)),
      p.note ? h('div.nt', null, '📝 ', ...marked(p.note, o.query)) : null,
    ),
    o.actions?.(p) ?? null,
  );
  if (o.draggable) el.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/pin', p.id));
  return el;
}

export function logsBody(o: LogsOpts): HTMLElement {
  const list = h('div.obs-logs', { role: 'list' });
  for (const p of o.rows) {
    const r = logRow(p, o);
    r.setAttribute('role', 'listitem');
    list.appendChild(r);
  }
  if (!o.rows.length) list.appendChild(h('p.obs-empty', null, o.empty));
  if (o.hiddenOutside) list.appendChild(h('p.obs-empty', null, `시간 범위 밖에 ${o.hiddenOutside}개 더 있어요. `, o.onShowAll ? h('button.obs-link', { type: 'button', onclick: o.onShowAll }, '핀 전체 보기') : null));
  return list;
}
