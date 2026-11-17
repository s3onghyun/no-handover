import { clear, h } from '../dom.ts';
import { t } from '../../i18n.ts';
import type { AppDef } from '../wm.ts';
import type { Pin } from '../../engine/game.ts';
import { fmtKoShort, parseLocal, pad } from '../../engine/time.ts';

const KIND_ICON: Record<Pin['kind'], string> = { line: '⌨', message: '💬', mail: '✉', file: '📄', commit: '⎇', note: '📒', notification: '🔔' };
const KO_DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 'MM-DD HH:MM' <-> local ms (year from the case clock). */
function fmtEdit(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export const boardApp: AppDef = {
  id: 'board',
  title: () => t('app.board'),
  icon: '📌',
  w: 980,
  h: 600,
  x: 100,
  y: 30,
  mount(body, ctx) {
    const g = ctx.game;
    const year = new Date(g.start).getUTCFullYear();
    const bar = h('div.boardbar');
    const tray = h('div.col.tray', { 'aria-label': t('board.tray') });
    const tl = h('div.col', { 'aria-label': t('board.timeline') });
    const grid = h('div.board', null, tray, tl);
    body.appendChild(h('div.main', null, bar, grid));

    const keyIds = new Set(g.cs.clues.filter((c) => c.key).map((c) => c.id));

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
        if (!id) return;
        const p = g.st.pins.find((x) => x.id === id);
        if (!p) return;
        if (onTimeline && p.ts === null) {
          const v = prompt(`${t('board.setTime')} (MM-DD HH:MM)`, '11-14 03:15');
          const ts = v ? parseEdit(v) : null;
          if (ts === null) return;
          g.updatePin(id, { ts, onTimeline: true });
        } else g.updatePin(id, { onTimeline });
      });
    };
    dropZone(tray, false);
    dropZone(tl, true);

    const parseEdit = (v: string): number | null => {
      const m = /^(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/.exec(v.trim());
      if (!m) return null;
      try {
        return parseLocal(`${year}-${pad(+m[1])}-${pad(+m[2])}T${pad(+m[3])}:${m[4]}`);
      } catch {
        return null;
      }
    };

    const card = (p: Pin) => {
      const isKey = p.clueIds.some((c) => keyIds.has(c));
      const timeInput = h('input', { type: 'text', value: p.ts !== null ? fmtEdit(p.ts) : '', placeholder: 'MM-DD HH:MM', 'aria-label': t('board.setTime') }) as HTMLInputElement;
      timeInput.addEventListener('change', () => {
        const ts = parseEdit(timeInput.value);
        if (ts === null && timeInput.value.trim()) {
          timeInput.style.borderColor = 'var(--warn)';
          return;
        }
        g.updatePin(p.id, { ts, onTimeline: ts !== null && p.onTimeline });
      });
      const prose = p.kind === 'message' || p.kind === 'mail' || p.kind === 'note' || p.kind === 'notification';
      const el = h(
        'div.card',
        { draggable: true, dataset: { pin: p.id } },
        h('div.k', null, h('span', null, KIND_ICON[p.kind]), h('span', null, p.source), isKey ? h('span.star', { title: t('board.keyCount') }, '★') : null),
        h(`div.tx${prose ? '.prose' : ''}`, { title: p.text }, p.text),
        p.note ? h('div.nt', null, p.note) : null,
        h(
          'div.acts',
          null,
          h('span.muted', { style: 'font-size:11px' }, `${t('board.setTime')}:`),
          timeInput,
          h('button', { onclick: () => g.updatePin(p.id, { onTimeline: !p.onTimeline && p.ts !== null }) , disabled: !p.onTimeline && p.ts === null }, p.onTimeline ? t('board.toTray') : t('board.toTimeline')),
          h('button', { onclick: () => { const v = prompt(t('board.note'), p.note ?? ''); if (v !== null) g.updatePin(p.id, { note: v }); } }, t('board.note')),
          h('button', { onclick: () => g.unpin(p.id), 'aria-label': t('board.remove') }, '✕'),
        ),
      );
      el.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/pin', p.id));
      return el;
    };

    const render = () => {
      clear(bar);
      clear(tray);
      clear(tl);
      const pins = g.st.pins;
      const keys = g.pinnedKeyClues();
      bar.append(
        h('span', null, `📌 ${pins.length}`),
        h('span', null, `★ ${t('board.keyCount')} ${keys}`),
        h('span.muted', null, 'ⓘ 카드를 끌어 보관함 ↔ 타임라인으로 옮기거나, 시각을 고쳐 순서를 맞추세요.'),
        h('span.sp'),
        h('button.primary-btn', { onclick: () => ctx.wm.open('report') }, t('board.write')),
      );
      tray.appendChild(h('h3', null, t('board.tray')));
      tl.appendChild(h('h3', null, t('board.timeline'), h('span.muted', { style: 'font-weight:400' }, '목 → 월')));
      const inTray = pins.filter((p) => !p.onTimeline || p.ts === null);
      const onTl = pins.filter((p) => p.onTimeline && p.ts !== null).sort((a, b) => a.ts! - b.ts!);
      if (!pins.length) tray.appendChild(h('p.muted', null, t('board.empty')));
      for (const p of inTray) tray.appendChild(card(p));
      const line = h('div.tl');
      let day = '';
      for (const p of onTl) {
        const d = new Date(p.ts!);
        const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${KO_DOW[d.getUTCDay()]})`;
        if (label !== day) {
          line.appendChild(h('div.dayhdr', null, label));
          day = label;
        }
        line.appendChild(h('div', { style: 'font:600 11.5px var(--mono);color:var(--ink-2);margin:0 0 2px' }, fmtKoShort(p.ts!).split(' ').pop()));
        line.appendChild(card(p));
      }
      tl.appendChild(line);
    };
    render();
    return { refresh: (type?: string) => (type === 'pins' ? render() : undefined) };
  },
};
