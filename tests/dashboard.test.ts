// Observability board/dashboard: data -> panel derivation (ranges, series, thresholds, pin
// level/kind, cron recurrences) and annotation placement on the shared time axis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Pin } from '../src/engine/game.ts';
import { parseLocal } from '../src/engine/time.ts';
import type { CaseFile, SeriesDef } from '../src/engine/types.ts';
import { caseFriday1802 } from '../src/cases/friday-1802.ts';
import { caseZeroWiki } from '../src/cases/case-0-wiki.ts';
import { CAMPAIGN } from '../src/cases/index.ts';
import { DUR, LIVE_TICK_MS } from '../src/ui/motion.ts';
import { readFileSync } from 'node:fs';
import {
  caseAnnotations, cronExpr, dataWindow, lastSample, cronOccurrences, fitRange, fmtLogTs, logRows, nextCron, panelRange, parseCron, pinAnnotations, pinKind, pinLevel,
  placeAnnotations, rangeOptions, sampleSeries, spansAbove, summarizePanel, timeTicks, valueAt, xOf, yExtent,
} from '../src/ui/dashboard/derive.ts';

const L = parseLocal;
let n = 0;
const pin = (text: string, ts: string | null, extra: Partial<Pin> = {}): Pin => ({ id: `p${++n}`, kind: 'line', text, source: 'test', ts: ts ? L(ts) : null, onTimeline: ts !== null, clueIds: [], at: 0, ...extra });

test('pin level: explicit level tokens first, then keywords; text is the signal, not colour', () => {
  assert.equal(pinLevel({ text: 'Nov 14 03:15:40 pay-api-01 payment-api[2817]: http: Accept error: accept tcp [::]:8080: accept4: too many open files; retrying in 1s' }), 'error');
  assert.equal(pinLevel({ text: '2026-11-09 21:14:03 WARN thumbnail attach/8812 failed: PDF parse error (retrying)' }), 'warn');
  assert.equal(pinLevel({ text: '2026-11-09 21:14:02 INFO upload attach/8812 주간회의_1109.pdf' }), 'info');
  assert.equal(pinLevel({ text: '2026/11/10 08:47:20 [error] 911#911: connect() failed (111: Connection refused)' }), 'error');
  assert.equal(pinLevel({ text: '10.20.5.29 - - [10/Nov/2026:08:47:20 +0900] "GET /wiki/Home HTTP/1.1" 502 166 "-" "Mozilla/5.0"' }), 'error');
  assert.equal(pinLevel({ text: '/dev/sdb1        20G   19G     0 100% /var' }), 'warn');
  assert.equal(pinLevel({ text: 'LimitNOFILE=4096' }), 'info');
});

test('pin kind: commits are changes, crontab lines are cron, alerts are alerts, failures are errors', () => {
  assert.equal(pinKind({ kind: 'line', text: 'AuthorDate: Fri Nov 13 18:02:11 2026 +0900' }), 'deploy');
  assert.equal(pinKind({ kind: 'commit', text: 'pool: raise max connections' }), 'deploy');
  assert.equal(pinKind({ kind: 'line', text: '15 3 * * 6 /home/eunjae/bin/ledger-backup.sh >> /home/eunjae/log/backup.log 2>&1' }), 'cron');
  assert.equal(pinKind({ kind: 'line', text: 'Nov 14 03:15:01 pay-api-01 CRON[4411]: (eunjae) CMD (/home/eunjae/bin/ledger-backup.sh)' }), 'cron');
  assert.equal(pinKind({ kind: 'notification', text: '[P1] payment-api 5xx > 20% — 확인 필요 (1/37)' }), 'alert');
  assert.equal(pinKind({ kind: 'line', text: 'accept4: too many open files' }), 'error');
  assert.equal(pinKind({ kind: 'line', text: '10.8.3.41 - sjkang [14/Nov/2026:02:10:07 +0900] "POST /review/412/approve HTTP/1.1" 303 0' }), 'event');
  // lines that only look like five fields are not crontabs
  assert.equal(cronExpr('/dev/sdb1        20G   19G     0 100% /var'), null);
  assert.equal(cronExpr('Nov 14 03:15:40 pay-api-01 payment-api[2817]: x'), null);
  assert.equal(cronExpr('# 15 3 * * 6 commented out'), null);
});

test('cron: fields, lists, ranges, steps, names, macros and the dom/dow OR rule', () => {
  const wk = { from: L('2026-11-09T00:00'), to: L('2026-11-15T23:59') }; // Mon..Sun
  assert.deepEqual(cronOccurrences('15 3 * * 6', wk), [L('2026-11-14T03:15')]);
  assert.deepEqual(cronOccurrences('0 9 * * mon-fri', wk).length, 5);
  assert.equal(cronOccurrences('*/15 * * * *', { from: L('2026-11-14T03:00'), to: L('2026-11-14T03:59') }).length, 4);
  assert.deepEqual(cronOccurrences('@daily', wk).length, 7);
  // dom 14 OR Sunday
  assert.deepEqual(cronOccurrences('0 12 14 * 0', wk), [L('2026-11-14T12:00'), L('2026-11-15T12:00')]);
  assert.equal(parseCron('61 * * * *'), null);
  assert.equal(parseCron('* * *'), null);
  assert.equal(nextCron('15 3 * * 6', L('2026-11-16T09:00')), L('2026-11-21T03:15'));
  // capped: max + 1 runs so callers can tell "too many"
  assert.equal(cronOccurrences('* * * * *', wk, 24).length, 25);
});

test('ranges against the in-game clock: fit pins (padded), dashboard window, relative to now', () => {
  const now = L('2026-11-16T09:00');
  const pins = [pin('a', '2026-11-13T18:02'), pin('b', '2026-11-14T03:15'), pin('tray', null)];
  const fit = fitRange(pins, now);
  assert.ok(fit.from < L('2026-11-13T18:02') && fit.to > L('2026-11-14T03:15'));
  assert.ok(fit.from > L('2026-11-13T17:00') && fit.to < L('2026-11-14T04:00'), 'padding is a few percent');
  const one = fitRange([pin('x', '2026-11-14T03:15')], now);
  assert.ok(one.to - one.from >= 3_600_000, 'at least an hour');
  assert.deepEqual(fitRange([], now, caseFriday1802.panels), panelRange(caseFriday1802.panels));
  assert.deepEqual(fitRange([], now), { from: now - 86_400_000, to: now });
  const opts = rangeOptions({ now, pins, panels: caseFriday1802.panels, rel: ['6h', '7d'] });
  assert.deepEqual(opts.map((o) => o.id), ['fit', 'panel', '6h', '7d']);
  assert.deepEqual(opts[2].range, { from: now - 6 * 3_600_000, to: now });
  assert.deepEqual(opts[1].range, { from: L('2026-11-14T02:00'), to: L('2026-11-14T07:00') });
});

test('series: step and linear values, gaps, deterministic jitter that never tops the highest point', () => {
  const s: SeriesDef = { name: 'x', points: [['2026-11-14T02:00', 10], ['2026-11-14T03:00', 30], ['2026-11-14T04:00', null]] };
  assert.equal(valueAt(s, L('2026-11-14T01:59')), null);
  assert.equal(valueAt(s, L('2026-11-14T02:30')), 10);
  assert.equal(valueAt({ ...s, interp: 'linear' }, L('2026-11-14T02:30')), 20);
  assert.equal(valueAt(s, L('2026-11-14T04:30')), null);
  const win = { from: L('2026-11-14T02:00'), to: L('2026-11-14T05:00') };
  const a = sampleSeries({ ...s, jitter: 0.1 }, win, 5);
  const b = sampleSeries({ ...s, jitter: 0.1 }, win, 5);
  assert.deepEqual(a, b, 'seeded');
  assert.equal(a.length, 37);
  assert.ok(a.every((x) => x.v === null || x.v <= 30));
  assert.ok(a.filter((x) => x.ts >= L('2026-11-14T04:00')).every((x) => x.v === null));
});

test('Case 3 panels: 5xx crosses the 20% alert line 03:16–05:39 and open_fds sits on the 4096 limit', () => {
  const cp = caseFriday1802.panels!;
  const win = panelRange(cp)!;
  const err = cp.timeseries.find((p) => p.id === 'err')!;
  const smp = sampleSeries(err.series[0], win, cp.stepMin, 'err:5xx');
  assert.deepEqual(spansAbove(smp, 20).map((r) => [r.from, r.to]), [[L('2026-11-14T03:16'), L('2026-11-14T05:39')]]);
  const fds = cp.timeseries.find((p) => p.id === 'fds')!;
  const f = sampleSeries(fds.series[0], win, 1);
  assert.deepEqual(spansAbove(f, 4096).map((r) => [r.from, r.to]), [[L('2026-11-14T03:16'), L('2026-11-14T05:39')]]);
  assert.deepEqual(yExtent(fds, [f]), [0, 4400]);
  const text = summarizePanel(err, win, [smp], []);
  assert.match(text, /^5xx 비율 \(%\), 11\/14 \(토\) 02:00 → 07:00\./);
  assert.match(text, /알림 기준 20% 이상: 03:16–05:39\./);
});

test('every case with panels keeps its points inside the window and in order (existing cases need none)', () => {
  for (const cs of CAMPAIGN.map((c) => c.cs).filter(Boolean) as CaseFile[]) {
    if (!cs.panels) continue;
    const win = panelRange(cs.panels)!;
    assert.ok(win.to > win.from, cs.id);
    for (const p of cs.panels.timeseries)
      for (const s of p.series) {
        const ts = s.points.map(([at]) => L(at));
        assert.deepEqual(ts, [...ts].sort((a, b) => a - b), `${cs.id} ${p.id}`);
        assert.ok(ts.every((t) => t >= win.from && t <= win.to), `${cs.id} ${p.id} in window`);
      }
    for (const m of cs.panels.marks ?? []) assert.ok(L(m) >= win.from && L(m) <= win.to);
  }
  assert.ok(caseZeroWiki.panels && caseFriday1802.panels);
});

test('pin annotations: timed pins at their time, crontab lines repeat per run, tray and out-of-range pins stay off', () => {
  const r = { from: L('2026-11-13T17:00'), to: L('2026-11-14T04:00') };
  const pins = [
    pin('AuthorDate: Fri Nov 13 18:02:11 2026 +0900', '2026-11-13T18:02:11'),
    pin('15 3 * * 6 /home/eunjae/bin/ledger-backup.sh', null),
    pin('accept4: too many open files', '2026-11-14T03:15:40'),
    pin('held back', '2026-11-14T03:20', { onTimeline: false }),
    pin('* * * * * /bin/true', null),
  ];
  const { anns, tooMany } = pinAnnotations(pins, r);
  assert.deepEqual(anns.map((a) => [a.ts, a.kind, !!a.recurring]), [
    [L('2026-11-13T18:02:11'), 'deploy', false],
    [L('2026-11-14T03:15'), 'cron', true],
    [L('2026-11-14T03:15:40'), 'error', false],
  ]);
  assert.match(anns[1].label, /^⟳ 15 3 \* \* 6 · /);
  assert.deepEqual(tooMany, [pins[4].id]);
  assert.deepEqual(caseAnnotations(undefined), []);
});

test('annotation placement: x is proportional to time, close markers stack, outside the range is skipped', () => {
  const r = { from: L('2026-11-14T02:00'), to: L('2026-11-14T07:00') };
  assert.equal(xOf(L('2026-11-14T04:30'), r, 600), 300);
  assert.equal(xOf(L('2026-11-14T08:00'), r, 600), null);
  const items = [{ ts: L('2026-11-14T03:15') }, { ts: L('2026-11-14T03:15:40') }, { ts: L('2026-11-14T03:16') }, { ts: L('2026-11-14T05:40') }, { ts: L('2026-11-14T09:00') }];
  const placed = placeAnnotations(items, r, 600, 12, 2);
  assert.equal(placed.length, 4);
  assert.deepEqual(placed.map((p) => p.row), [0, 1, 1, 0]);
  assert.equal(Math.round(placed[0].x), 150);
  assert.equal(Math.round(placed[3].x), 440);
});

test('time ticks and log timestamps', () => {
  const ticks = timeTicks({ from: L('2026-11-14T02:00'), to: L('2026-11-14T07:00') }, 600);
  assert.deepEqual(ticks.map((t) => t.label), ['02:00', '03:00', '04:00', '05:00', '06:00', '07:00']);
  const multi = timeTicks({ from: L('2026-11-13T17:00'), to: L('2026-11-14T04:00') }, 900);
  assert.ok(multi.some((t) => t.label === '11/14'), 'midnight shows the date');
  assert.equal(fmtLogTs(L('2026-11-14T03:15:40')), '11-14 03:15:40');
  assert.equal(fmtLogTs(L('2026-11-13T18:02')), '11-13 18:02');
});

test('logs panel rows: range, search (text, source, note), level toggles, oldest first', () => {
  const pins = [
    pin('b ERROR boom', '2026-11-14T03:15'),
    pin('a INFO started', '2026-11-14T02:10', { note: '승인 직후' }),
    pin('c WARN slow', '2026-11-14T09:00'),
    pin('tray', null),
  ];
  const all = new Set(['error', 'warn', 'info'] as const);
  const r = { from: L('2026-11-14T02:00'), to: L('2026-11-14T07:00') };
  assert.deepEqual(logRows(pins, r, { query: '', levels: new Set(all) }).map((p) => p.text), ['a INFO started', 'b ERROR boom']);
  assert.deepEqual(logRows(pins, null, { query: '', levels: new Set(all) }).length, 3);
  assert.deepEqual(logRows(pins, r, { query: '승인', levels: new Set(all) }).map((p) => p.text), ['a INFO started']);
  assert.deepEqual(logRows(pins, r, { query: '', levels: new Set(['error'] as const) }).map((p) => p.text), ['b ERROR boom']);
});

test('Case 3 through the Game: the pinned crontab line and the 03:15:40 error line up on the 5xx spike', () => {
  const g = new Game(caseFriday1802);
  const cron = g.runCommand(0, 'crontab -l').lines.find((l) => /^15 3 \* \* 6/.test(l.text))!;
  g.pin({ kind: 'line', text: cron.text, source: 'pay-api-01 · crontab -l' });
  const err = g.runCommand(0, 'journalctl -u payment-api --since "2026-11-14 03:14" --until "2026-11-14 03:18"').lines.find((l) => /03:15:40 .*too many open files/.test(l.text))!;
  g.pin({ kind: 'line', text: err.text, source: 'pay-api-01 · journalctl' });
  const win = panelRange(caseFriday1802.panels)!;
  const { anns } = pinAnnotations(g.st.pins, win);
  assert.deepEqual(anns.map((a) => [a.kind, a.ts]), [['cron', L('2026-11-14T03:15')], ['error', L('2026-11-14T03:15:40')]]);
  const err5xx = caseFriday1802.panels!.timeseries[0];
  const spike = spansAbove(sampleSeries(err5xx.series[0], win, 1), 20)[0];
  assert.ok(anns.every((a) => a.ts <= spike.from && spike.from - a.ts <= 60_000), 'both markers sit right before the 5xx crossing');
});

test('live graphs: data stops at the snapshot end, or follows the in-game clock when live; points stay put as the range slides', () => {
  const cp = caseFriday1802.panels!;
  const now = L('2026-11-16T09:00');
  assert.equal(cp.live, true);
  assert.deepEqual(dataWindow(cp, now), { from: L('2026-11-14T02:00'), to: now });
  assert.deepEqual(dataWindow({ ...cp, live: false }, now), { from: L('2026-11-14T02:00'), to: L('2026-11-14T07:00') });
  // never past the in-game clock (Case 0 starts at the snapshot's last minute)
  const c0 = caseZeroWiki.panels!;
  assert.equal(dataWindow(c0, L('2026-11-10T09:00')).to, L('2026-11-10T09:00'));
  const s5xx = cp.timeseries[0].series[0];
  const hour = (end: number) => ({ from: end - 3_600_000, to: end });
  const a = sampleSeries(s5xx, hour(now), 1, 'err:5xx', dataWindow(cp, now));
  const later = now + 16 * 60_000; // ~1 s of play at rate 16
  const b = sampleSeries(s5xx, hour(later), 1, 'err:5xx', dataWindow(cp, later));
  assert.equal(lastSample(a)!.ts, now);
  assert.equal(lastSample(b)!.ts, later, 'new points arrive with the clock');
  const shared = a.filter((x) => b.some((y) => y.ts === x.ts));
  assert.ok(shared.length > 40);
  assert.ok(shared.every((x) => b.find((y) => y.ts === x.ts)!.v === x.v), 'existing points do not wiggle');
  // an archive keeps the weekend only
  const arch = sampleSeries(s5xx, hour(now), 1, 'err:5xx', dataWindow({ ...cp, live: false }, now));
  assert.equal(lastSample(arch), null);
});

test('motion tokens: every investigation-time animation is under a second and the CSS uses the same numbers', () => {
  for (const [k, v] of Object.entries(DUR)) assert.ok(v > 0 && v < 1000, `${k} ${v}`);
  assert.ok(LIVE_TICK_MS >= 500);
  const css = readFileSync(new URL('../src/ui/style.css', import.meta.url), 'utf8');
  for (const [k, v] of Object.entries(DUR)) assert.match(css, new RegExp(`--motion-${k}: ${v}ms`), k);
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{[^}]*\.obs-row\.flash[\s\S]*?\.obs-row\.snap, \.obs-mk\.snap, \.obs-thrg\.blink, \.obs-stat\.blink, \.obs-tail\.arrive \{ animation: none; \}/);
});
