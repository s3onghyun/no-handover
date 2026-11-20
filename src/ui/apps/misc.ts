import { clear, download, h } from '../dom.ts';
import { t } from '../../i18n.ts';
import type { AppDef } from '../wm.ts';
import { parseLocal } from '../../engine/time.ts';
import { caseAnnotations, dataWindow, fmtHM, logRows, pinAnnotations, pinLevel, rangeOptions, type Level, type RangeId } from '../dashboard/derive.ts';
import { liveUpdaters, logsBody, logTools, panel, statPanel, timeSeriesPanel, toolbar } from '../dashboard/panels.ts';
import { LIVE_TICK_MS } from '../motion.ts';

export const dashboardApp: AppDef = {
  id: 'dashboard',
  title: () => t('app.dashboard'),
  icon: '📈',
  w: 1000,
  h: 640,
  mount(body, ctx) {
    const g = ctx.game;
    const cp = g.cs.panels;
    const root = h('div.obs.obs-dash');
    body.appendChild(root);
    const keyIds = new Set(g.cs.clues.filter((c) => c.key).map((c) => c.id));
    const marks = (cp?.marks ?? []).map(parseLocal);
    let rangeId: RangeId = cp ? 'panel' : 'fit';
    let refreshedAt = g.now();
    let showPins = true;
    let live = !!cp?.live;
    let mounted = false;
    let query = '';
    const levels = new Set<Level>(['error', 'warn', 'info']);
    const tsPanels: HTMLElement[] = [];
    const currentRange = () => {
      const opts = rangeOptions({ now: g.now(), pins: g.st.pins, panels: cp, rel: ['1h', '3h', '12h', '24h', '3d'], panelLabel: '스냅샷 전체' });
      return { opts, opt: opts.find((o) => o.id === rangeId) ?? opts[0] };
    };

    const render = () => {
      clear(root);
      tsPanels.length = 0;
      const pins = g.st.pins;
      const { opts, opt } = currentRange();
      const range = opt.range;
      const data = cp ? dataWindow(cp, refreshedAt) : undefined;
      const anns = [...(showPins ? pinAnnotations(pins, range).anns : []), ...caseAnnotations(cp)];
      const pinToggle = h('label.obs-check', null, h('input', { type: 'checkbox', checked: showPins, onchange: (e: Event) => ((showPins = (e.target as HTMLInputElement).checked), render()) }), ' 핀 주석');
      const liveBtn = cp?.live
        ? h('button.obs-btn.obs-live', { type: 'button', 'aria-pressed': String(live), title: '게임 시계를 따라 그래프를 계속 갱신', onclick: () => ((live = !live), render()) }, h('span.obs-dot', { 'aria-hidden': 'true' }), live ? ' 실시간' : ' 일시정지')
        : null;
      root.appendChild(
        toolbar({
          crumbs: [t('app.dashboard'), cp?.title ?? g.cs.title],
          badge: cp?.live ? undefined : '보관본',
          options: opts,
          value: opt.id,
          onRange: (id) => ((rangeId = id), render()),
          onRefresh: () => ((refreshedAt = g.now()), render()),
          refreshedAt,
          extra: [pinToggle, ...(liveBtn ? [liveBtn] : [])],
        }),
      );
      const grid = h('div.obs-grid');
      root.appendChild(grid);
      if (cp) {
        const stats = cp.stats ?? [];
        const span = stats.length <= 2 ? 'half' : stats.length === 3 ? 'third' : stats.length === 4 ? 'quarter' : 'sixth';
        for (const st of stats) grid.appendChild(statPanel({ ...st, span, blink: !mounted }));
        for (const def of cp.timeseries) {
          const el = timeSeriesPanel({ def, range, stepMin: cp.stepMin, anns, marks, now: refreshedAt, data, blinkOnMount: !mounted });
          tsPanels.push(el);
          grid.appendChild(el);
        }
      } else {
        grid.appendChild(panel({ title: g.cs.dashboard[0] ?? t('app.dashboard'), cls: 'obs-text' }, h('pre.dash', null, g.cs.dashboard.slice(1).join('\n'))));
      }
      const counts: Record<Level, number> = { error: 0, warn: 0, info: 0 };
      for (const p of logRows(pins, range, { query: '', levels: new Set(['error', 'warn', 'info']) })) counts[pinLevel(p)]++;
      const host = h('div.obs-logshost', { 'aria-live': 'polite' });
      const fill = () => {
        clear(host);
        const rows = logRows(pins, range, { query, levels });
        const outside = pins.filter((p) => p.onTimeline && p.ts !== null).length - logRows(pins, range, { query: '', levels: new Set(['error', 'warn', 'info']) }).length;
        host.appendChild(logsBody({ rows, query, levels, counts, onQuery: () => {}, onLevel: () => {}, keyIds, empty: pins.length ? '이 구간에 핀한 증거가 없어요.' : t('board.empty'), hiddenOutside: outside, onShowAll: () => ((rangeId = 'fit'), render()) }));
      };
      fill();
      const tools = logTools(
        {
          query,
          levels,
          counts,
          onQuery: (q) => ((query = q), fill()),
          onLevel: (l) => {
            if (levels.has(l)) levels.delete(l);
            else levels.add(l);
            for (const b of root.querySelectorAll<HTMLButtonElement>('.obs-lvbtn')) b.setAttribute('aria-pressed', String(levels.has(b.className.match(/lv-(\w+)/)![1] as Level)));
            fill();
          },
        },
        '핀한 증거 검색',
      );
      grid.appendChild(panel({ title: '핀한 증거 — 증거 보드와 연결', cls: 'obs-logp', tools, menu: [{ label: `${t('app.board')} 열기`, run: () => ctx.wm.open('board') }] }, host));
      mounted = true;
    };
    render();
    // live graphs: the in-game clock drives new points; only the charts redraw (focus, menus and
    // the search box stay put). Paused by the 실시간 toggle, a minimised window or a hidden tab.
    const timer = setInterval(() => {
      if (!root.isConnected) return clearInterval(timer);
      if (!live || !cp || document.hidden || root.closest('.window.min')) return;
      refreshedAt = g.now();
      const { opt } = currentRange();
      const data = dataWindow(cp, refreshedAt);
      if (opt.range.to < data.from) return;
      for (const el of tsPanels) liveUpdaters.get(el)?.({ range: opt.range, now: refreshedAt, data });
      const rt = root.querySelector('.obs-rt');
      if (rt) rt.textContent = fmtHM(refreshedAt);
    }, LIVE_TICK_MS);
    g.open('dashboard');
    return { refresh: (type?: string) => (type === 'pins' ? render() : undefined) };
  },
};

const mmss = (ms: number | null | unknown) => {
  if (typeof ms !== 'number') return '—';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const playtestApp: AppDef = {
  id: 'playtest',
  title: () => t('app.playtest'),
  icon: '📋',
  w: 560,
  h: 520,
  mount(body, ctx) {
    const g = ctx.game;
    const root = h('div.pt');
    body.appendChild(root);
    const render = () => {
      clear(root);
      const rep = g.playtestReport() as { summary: Record<string, unknown> };
      const s = rep.summary as {
        rung1At: number | null;
        rung2: { t: number; nudge: string; why?: string }[];
        rung3: { t: number; slot?: string; key?: string; rung?: string }[];
        asks?: { t: number; prompt: string; from: string }[];
        record?: { hints: number; panelOpens?: number; asks: number; commands: number; playMs: number };
        frictionCount: number;
        cluesFound: { id: string }[];
        keyCluesTotal: number;
        submissions: unknown[];
        causeCorrectAt: number | null;
        appSeconds: Record<string, number>;
        firstMinutes: {
          briefing: { startedAt: number | null; skipped: boolean; watchedMs: number; replays: number };
          firstCommandAt: number | null;
          firstMeaningfulCommandAt: number | null;
          firstMeaningfulCommand: string | null;
          terminalInteractAt: number | null;
          objectives: { id: string; t: number | null }[];
          objectivesFoldedAt: number | null;
        };
        campaign: { known: boolean; playedTutorialFirst?: boolean | null; solvedBefore?: string[]; skippedBefore?: string[] };
      };
      const fm = s.firstMinutes;
      const fac = (key: string, label: string, options?: string[]) => {
        const save = (v: string) => {
          g.st.facilitator[key] = v;
          g.log('facilitator', { key, value: v });
        };
        const field = options
          ? (h('select', { onchange: (e: Event) => save((e.target as HTMLSelectElement).value) }, h('option', { value: '' }, '—'), ...options.map((o) => h('option', { value: o, selected: g.st.facilitator[key] === o }, o))) as HTMLSelectElement)
          : (h('input', { type: 'text', value: g.st.facilitator[key] ?? '', oninput: (e: Event) => (g.st.facilitator[key] = (e.target as HTMLInputElement).value), onchange: (e: Event) => save((e.target as HTMLInputElement).value) }) as HTMLInputElement);
        return h('label', null, label, field);
      };
      const briefingText = fm.briefing.startedAt === null ? '—' : fm.briefing.skipped ? `건너뜀 (${mmss(fm.briefing.watchedMs)} 시청)` : `끝까지 봄 (${mmss(fm.briefing.watchedMs)})`;
      const idle = h('input', { type: 'number', min: 1, max: 120, value: g.st.settings.idleMinutes }) as HTMLInputElement;
      const rate = h('input', { type: 'number', min: 1, max: 120, value: g.st.settings.clockRate }) as HTMLInputElement;
      idle.onchange = () => {
        g.st.settings.idleMinutes = Math.max(1, +idle.value || 10);
        g.ladder.idleMs = g.st.settings.idleMinutes * 60000;
        g.log('settings', { ...g.st.settings });
      };
      rate.onchange = () => {
        g.st.settings.clockRate = Math.max(1, +rate.value || 16);
        g.log('settings', { ...g.st.settings });
      };
      const found = new Set(s.cluesFound.map((c) => c.id));
      const keyFound = g.cs.clues.filter((c) => c.key && found.has(c.id)).length;
      root.append(
        h('h3', { style: 'margin:0 0 8px' }, t('pt.title')),
        h('p.muted', null, t('pt.privacy')),
        h('label', null, t('pt.idle'), idle),
        h('label', null, t('pt.rate'), rate, h('span.muted', null, '(16 = 45분 플레이에 09:00→21:00)')),
        h(
          'table',
          null,
          h('tr', null, h('th', null, '플레이 시간'), h('td', null, mmss(g.st.playMs))),
          h('tr', null, h('th', null, '1단(환경 흔적) 첫 도달'), h('td', null, mmss(s.rung1At))),
          h('tr', null, h('th', null, '2단(동료 넛지)'), h('td', null, s.rung2.map((x) => `${mmss(x.t)} ${x.nudge}${x.why === 'ask' ? ' (물어봄)' : ''}`).join(', ') || '—')),
          h('tr', null, h('th', null, '"뭐부터 봐요?"'), h('td', null, (s.asks ?? []).map((x) => `${mmss(x.t)} → ${x.from}`).join(', ') || '—')),
          h('tr', null, h('th', null, '3단(💡 방향·정답)'), h('td', null, s.rung3.map((x) => `${mmss(x.t)} ${x.key ?? x.slot}${x.rung ? `·${x.rung === 'answer' ? '정답' : '방향'}` : ''}`).join(', ') || '—')),
          h('tr', null, h('th', null, '기록 (힌트 단계 · 명령)'), h('td', null, s.record ? `힌트 단계 ${s.record.hints}개 · 명령 ${s.record.commands}개 · 💡 패널 ${s.record.panelOpens ?? 0}번 열람(세지 않음)` : '—')),
          h('tr', null, h('th', null, '명령 막힘(오타·미지원·차단)'), h('td', null, String(s.frictionCount))),
          h('tr', null, h('th', null, '핵심 단서'), h('td', null, `${keyFound} / ${s.keyCluesTotal}`)),
          h('tr', null, h('th', null, '제출'), h('td', null, String(s.submissions.length))),
          h('tr', null, h('th', null, '원인 칸 정답 시각'), h('td', null, mmss(s.causeCorrectAt))),
          h('tr', null, h('th', null, '앱별 시간(초)'), h('td', null, Object.entries(s.appSeconds).map(([k, v]) => `${k} ${v}`).join(' · ') || '—')),
          h('tr', null, h('th', null, 'Case 0(튜토리얼)을 먼저 했나 (자동)'), h('td', null, !s.campaign.known ? '—' : s.campaign.playedTutorialFirst === null ? '이 사건이 튜토리얼' : s.campaign.playedTutorialFirst ? '예 — 풀고 왔음' : (s.campaign.skippedBefore ?? []).length ? '아니오 — 건너뜀' : '아니오')),
        ),
        h('h4', { style: 'margin:14px 0 4px' }, t('pt.first')),
        h(
          'table',
          null,
          h('tr', null, h('th', null, '오프닝 브리핑'), h('td', null, briefingText + (fm.briefing.replays ? ` · 다시 보기 ${fm.briefing.replays}회` : ''))),
          h('tr', null, h('th', null, '터미널 첫 클릭'), h('td', null, mmss(fm.terminalInteractAt))),
          h('tr', null, h('th', null, '첫 명령 / 첫 의미 있는 명령'), h('td', null, `${mmss(fm.firstCommandAt)} / ${mmss(fm.firstMeaningfulCommandAt)}${fm.firstMeaningfulCommand ? ` (${fm.firstMeaningfulCommand})` : ''}`)),
          h('tr', null, h('th', null, '오늘 할 일 체크'), h('td', null, fm.objectives.map((o) => `${o.id} ${mmss(o.t)}`).join(' · ') + (fm.objectivesFoldedAt !== null ? ` → 접힘 ${mmss(fm.objectivesFoldedAt)}` : ''))),
          h('tr', null, h('th', null, '소리'), h('td', null, `${(window as unknown as { __audio?: { muted: boolean; volume: number } }).__audio?.muted ? '음소거' : '켜짐'} · ${Math.round(((window as unknown as { __audio?: { volume: number } }).__audio?.volume ?? 0) * 100)}%`)),
        ),
        h(
          'div.ptfirst',
          null,
          h('p.muted', { style: 'margin:8px 0 2px' }, t('pt.firstNote')),
          fac('foundTerminal', '터미널을 도움 없이 찾았나', ['도움 없이', '진행자가 도움', '못 찾음']),
          fac('checkboxes', '체크박스 3개를 이해했나', ['이해함', '일부만', '못 봄 / 이해 못 함']),
          fac('audioPref', '소리 선호', ['켜 두고 싶음', '끄고 싶음', '상관없음']),
          fac('whatToDo', '"처음에 뭘 해야 한다고 생각했어요?" (답 그대로)'),
          fac('playedCase0', 'Case 0(튜토리얼)을 먼저 했나', ['끝까지 함', '하다가 건너뜀', '처음부터 건너뜀', '안 함 (?case= 로 바로)']),
          fac('case0Stall', 'Case 0: 어디서 멈췄나 (명령·단계)'),
          fac('firstNote', '첫 3분 메모'),
        ),
        h(
          'div.submitbar',
          { style: 'margin-top:14px' },
          h('button.primary-btn', { onclick: () => download(`no-handover-playtest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(g.playtestReport(), null, 2)) }, t('pt.save')),
          h('button.ghost-btn', { onclick: () => confirm(t('pt.reset') + '?') && document.dispatchEvent(new CustomEvent('nh-reset')) }, t('pt.reset')),
        ),
      );
    };
    render();
    return { refresh: (type?: string) => (type === 'clue' || type === 'accuse' || type === 'message' || type === 'objective' ? render() : undefined) };
  },
};
