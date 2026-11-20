// Evidence board as an observability dashboard: stat row, an evidence timeline (one lane per
// annotation kind), the case's dashboard panels with the pins drawn as annotations, a log
// panel of timed pins (search + level toggles) and the tray of pins without a time. Pins move
// between the log panel and the tray by drag and drop or with the buttons on each row.

import { clear, h } from '../dom.ts';
import { t } from '../../i18n.ts';
import type { AppDef } from '../wm.ts';
import type { Pin } from '../../engine/game.ts';
import { parseLocal, pad } from '../../engine/time.ts';
import {
  caseAnnotations, cronExpr, dataWindow, cronOccurrences, fmtDayHM, logRows, nextCron, pinAnnotations, pinLevel, rangeOptions,
  type Annotation, type Level, type RangeId,
} from '../dashboard/derive.ts';
import { play, DUR } from '../motion.ts';
import { laneChart, logRow, logsBody, logTools, panel, statPanel, timeSeriesPanel, toolbar } from '../dashboard/panels.ts';

/** 'MM-DD HH:MM' <-> local ms (year from the case clock). */
function fmtEdit(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export const boardApp: AppDef = {
  id: 'board',
  title: () => t('app.board'),
  icon: '📌',
  w: 1100,
  h: 680,
  x: 90,
  y: 20,
  mount(body, ctx) {
    const g = ctx.game;
    const year = new Date(g.start).getUTCFullYear();
    const root = h('div.obs.obs-board');
    body.appendChild(root);
    const keyIds = new Set(g.cs.clues.filter((c) => c.key).map((c) => c.id));
    const marks = (g.cs.panels?.marks ?? []).map(parseLocal);
    let rangeId: RangeId = 'fit';
    let query = '';
    const levels = new Set<Level>(['error', 'warn', 'info']);
    let refreshedAt = g.now();
    let linkedOpen = true;
    // pins seen on the last render (id -> on the timeline): new or moved pins snap into place
    let seen: Map<string, boolean> | null = null;

    const parseEdit = (v: string): number | null => {
      const m = /^(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/.exec(v.trim());
      if (!m) return null;
      try {
        return parseLocal(`${year}-${pad(+m[1])}-${pad(+m[2])}T${pad(+m[3])}:${m[4]}`);
      } catch {
        return null;
      }
    };

    const dropZone = (el: HTMLElement, onTimeline: boolean) => {
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.classList.add('drop');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drop'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drop');
        const id = e.dataTransfer?.getData('text/pin');
        const p = id ? g.st.pins.find((x) => x.id === id) : undefined;
        if (!p) return;
        if (onTimeline && p.ts === null) {
          const v = prompt(`${t('board.setTime')} (MM-DD HH:MM)`, '11-14 03:15');
          const ts = v ? parseEdit(v) : null;
          if (ts === null) return;
          g.updatePin(p.id, { ts, onTimeline: true });
        } else g.updatePin(p.id, { onTimeline });
      });
    };

    const actions = (p: Pin) => {
      const timeInput = h('input', { type: 'text', value: p.ts !== null ? fmtEdit(p.ts) : '', placeholder: 'MM-DD HH:MM', 'aria-label': `${t('board.setTime')} (MM-DD HH:MM)` }) as HTMLInputElement;
      timeInput.addEventListener('change', () => {
        const ts = parseEdit(timeInput.value);
        if (ts === null && timeInput.value.trim()) {
          timeInput.setAttribute('aria-invalid', 'true');
          timeInput.classList.add('bad');
          return;
        }
        g.updatePin(p.id, { ts, onTimeline: ts !== null && p.onTimeline });
      });
      const onTl = p.onTimeline && p.ts !== null;
      return h(
        'div.acts',
        null,
        timeInput,
        h('button', { type: 'button', onclick: () => g.updatePin(p.id, { onTimeline: !onTl && p.ts !== null }), disabled: !onTl && p.ts === null, title: !onTl && p.ts === null ? '먼저 시각을 넣으세요' : undefined }, onTl ? t('board.toTray') : t('board.toTimeline')),
        h('button', { type: 'button', onclick: () => { const v = prompt(t('board.note'), p.note ?? ''); if (v !== null) g.updatePin(p.id, { note: v }); } }, t('board.note')),
        h('button', { type: 'button', onclick: () => g.unpin(p.id), 'aria-label': `${t('board.remove')}: ${p.text.slice(0, 40)}`, title: t('board.remove') }, '✕'),
      );
    };

    const flash = (pinId: string) => {
      const el = root.querySelector<HTMLElement>(`.card[data-pin="${CSS.escape(pinId)}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      el.tabIndex = -1;
      el.focus({ preventScroll: true });
      play(el, 'flash', DUR.flash);
    };
    const onAnn = (a: Annotation) => a.pinId && flash(a.pinId);

    const render = () => {
      clear(root);
      const pins = g.st.pins;
      const now = g.now();
      const opts = rangeOptions({ now, pins, panels: g.cs.panels, rel: ['6h', '24h', '3d', '7d'] });
      const opt = opts.find((o) => o.id === rangeId) ?? opts[0];
      const range = opt.range;
      const { anns, tooMany } = pinAnnotations(pins, range);
      const onTl = pins.filter((p) => p.onTimeline && p.ts !== null);
      const inTray = pins.filter((p) => !p.onTimeline || p.ts === null);
      const keys = g.pinnedKeyClues();
      const snap = new Set(seen ? pins.filter((p) => seen!.get(p.id) !== (p.onTimeline && p.ts !== null)).map((p) => p.id) : []);
      seen = new Map(pins.map((p) => [p.id, p.onTimeline && p.ts !== null]));

      root.appendChild(
        toolbar({
          crumbs: [t('app.board'), g.cs.title],
          options: opts,
          value: opt.id,
          onRange: (id) => ((rangeId = id), render()),
          onRefresh: () => ((refreshedAt = g.now()), render()),
          refreshedAt,
          extra: [h('button.primary-btn', { type: 'button', onclick: () => ctx.wm.open('report') }, t('board.write'))],
        }),
      );
      const grid = h('div.obs-grid');
      root.appendChild(grid);

      grid.append(
        statPanel({ title: '📌 핀', value: String(pins.length), state: 'none' }),
        statPanel({ title: `★ ${t('board.keyCount')}`, value: String(keys), state: keys ? 'ok' : 'none', word: '' }),
        statPanel({ title: t('board.timeline'), value: String(onTl.length), state: 'none', note: '시각이 있는 증거' }),
        statPanel({ title: '시각 없음', value: String(inTray.length), state: inTray.length ? 'warn' : 'none', note: inTray.length ? '시각을 넣으면 타임라인에 올라가요' : undefined }),
      );

      const cronPins = pins.filter((p) => cronExpr(p.text));
      grid.appendChild(
        panel(
          {
            title: `증거 타임라인 · ${fmtDayHM(range.from)} → ${fmtDayHM(range.to)}`,
            cls: 'obs-tl',
            description: '핀한 증거가 종류별 줄에 시각대로 놓입니다. ◆ 변경(커밋·배포) ▲ 크론(크론탭 줄은 실행 시각마다 반복 표시) ■ 알림 ✖ 오류·경고 ● 그 밖의 이벤트. 표시를 누르면 아래 로그 줄로 이동합니다.',
          },
          laneChart({ range, anns, now: refreshedAt, marks, onAnn, tooMany: tooMany.length, snap }),
          h('p.obs-hint', null, 'ⓘ 카드를 끌어 보관함 ↔ 타임라인으로 옮기거나, 시각을 고쳐 순서를 맞추세요.', cronPins.length ? ` 크론탭 줄 ${cronPins.length}개는 실행 시각마다 ▲ 로 표시돼요.` : ''),
        ),
      );

      const cp = g.cs.panels;
      if (cp?.timeseries.length) {
        const rowBtn = h('button.obs-row-h', { type: 'button', 'aria-expanded': String(linkedOpen), onclick: () => ((linkedOpen = !linkedOpen), render()) }, linkedOpen ? '▾ ' : '▸ ', `${t('app.dashboard')} 패널 · 핀이 주석으로 겹쳐 보여요 (${cp.timeseries.length})`);
        grid.appendChild(h('div.obs-rowhdr', null, rowBtn));
        if (linkedOpen) {
          const all = [...anns, ...caseAnnotations(cp)];
          for (const def of cp.timeseries) grid.appendChild(timeSeriesPanel({ def, range, stepMin: cp.stepMin, anns: all, marks, now: refreshedAt, data: dataWindow(cp, refreshedAt), span: 'half', onAnn, linked: `${cp.title}에서 연결` }));
        }
      }

      // logs panel (timed pins) — re-rendered on search/level without rebuilding the header
      const logsHost = h('div.obs-logshost', { 'aria-live': 'polite' });
      const counts = () => {
        const c: Record<Level, number> = { error: 0, warn: 0, info: 0 };
        for (const p of onTl) if (p.ts! >= range.from && p.ts! <= range.to) c[pinLevel(p)]++;
        return c;
      };
      const tools = logTools(
        {
          query,
          levels,
          counts: counts(),
          onQuery: (q) => ((query = q), fillLogs()),
          onLevel: (l) => {
            if (levels.has(l)) levels.delete(l);
            else levels.add(l);
            for (const b of root.querySelectorAll<HTMLButtonElement>('.obs-lvbtn')) b.setAttribute('aria-pressed', String(levels.has(b.className.match(/lv-(\w+)/)![1] as Level)));
            fillLogs();
          },
        },
        '타임라인 증거 검색',
      );
      const fillLogs = () => {
        clear(logsHost);
        const rows = logRows(pins, range, { query, levels });
        const outside = onTl.filter((p) => p.ts! < range.from || p.ts! > range.to).length;
        logsHost.appendChild(
          logsBody({ rows, query, levels, counts: counts(), onQuery: () => {}, onLevel: () => {}, actions, keyIds, draggable: true, empty: pins.length ? '조건에 맞는 줄이 없어요.' : t('board.empty'), hiddenOutside: outside, onShowAll: () => ((rangeId = 'fit'), render()) }),
        );
      };
      fillLogs();
      const logs = panel({ title: `${t('board.timeline')} — 증거 로그`, span: 'twothirds', cls: 'obs-logp', tools }, logsHost);
      dropZone(logs, true);
      grid.appendChild(logs);

      const trayList = h('div.obs-logs.tray', { role: 'list', 'aria-label': t('board.tray') });
      for (const p of inTray) {
        const row = logRow(p, { query: '', actions, keyIds, draggable: true });
        row.setAttribute('role', 'listitem');
        row.classList.add('obs-traycard');
        const cron = cronExpr(p.text);
        if (cron) {
          const runs = cronOccurrences(cron, range).length;
          const next = nextCron(cron, refreshedAt);
          const last = cronOccurrences(cron, { from: refreshedAt - 8 * 86_400_000, to: refreshedAt }, 400).pop();
          row.querySelector('.obs-msg')!.appendChild(
            h('div.obs-cron', null, `▲ 크론 ${cron} · 지금 구간 ${runs > 24 ? '24회 넘게' : `${runs}회`} 실행`, last ? ` · 지난 실행 ${fmtDayHM(last)}` : '', next ? ` · 다음 ${fmtDayHM(next)}` : ''),
          );
        }
        trayList.appendChild(row);
      }
      if (!inTray.length) trayList.appendChild(h('p.obs-empty', null, pins.length ? '모든 증거가 타임라인에 있어요.' : t('board.empty')));
      const tray = panel({ title: t('board.tray'), span: 'third', cls: 'obs-trayp', description: '시각을 알 수 없는 증거. 시각을 넣거나 타임라인 패널로 끌어 놓으세요.' }, trayList);
      dropZone(tray, false);
      grid.appendChild(tray);
      for (const id of snap) play(root.querySelector(`.card[data-pin="${CSS.escape(id)}"]`), 'snap', DUR.snap);
    };
    render();
    return { refresh: (type?: string) => (type === 'pins' ? render() : undefined) };
  },
};
