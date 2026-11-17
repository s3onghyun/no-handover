import { clear, download, h } from '../dom.ts';
import { t } from '../../i18n.ts';
import type { AppDef } from '../wm.ts';

export const dashboardApp: AppDef = {
  id: 'dashboard',
  title: () => t('app.dashboard'),
  icon: '📈',
  w: 760,
  h: 470,
  mount(body, ctx) {
    const pre = h('pre.dash', null, ctx.game.cs.dashboard.join('\n'));
    body.appendChild(pre);
    ctx.game.open('dashboard');
    return {};
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
        rung2: { t: number; nudge: string }[];
        rung3: { t: number; slot: string }[];
        frictionCount: number;
        cluesFound: { id: string }[];
        keyCluesTotal: number;
        submissions: unknown[];
        causeCorrectAt: number | null;
        appSeconds: Record<string, number>;
      };
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
          h('tr', null, h('th', null, '2단(동료 넛지)'), h('td', null, s.rung2.map((x) => `${mmss(x.t)} ${x.nudge}`).join(', ') || '—')),
          h('tr', null, h('th', null, '3단(명시 힌트)'), h('td', null, s.rung3.map((x) => `${mmss(x.t)} ${x.slot}`).join(', ') || '—')),
          h('tr', null, h('th', null, '명령 막힘(오타·미지원·차단)'), h('td', null, String(s.frictionCount))),
          h('tr', null, h('th', null, '핵심 단서'), h('td', null, `${keyFound} / ${s.keyCluesTotal}`)),
          h('tr', null, h('th', null, '제출'), h('td', null, String(s.submissions.length))),
          h('tr', null, h('th', null, '원인 칸 정답 시각'), h('td', null, mmss(s.causeCorrectAt))),
          h('tr', null, h('th', null, '앱별 시간(초)'), h('td', null, Object.entries(s.appSeconds).map(([k, v]) => `${k} ${v}`).join(' · ') || '—')),
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
    return { refresh: (type?: string) => (type === 'clue' || type === 'accuse' || type === 'message' ? render() : undefined) };
  },
};
