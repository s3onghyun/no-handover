import { clear, h, storage } from '../dom.ts';
import { t } from '../../i18n.ts';
import type { AppDef } from '../wm.ts';

export const notesApp: AppDef = {
  id: 'notes',
  title: () => t('app.notes'),
  icon: '📒',
  w: 560,
  h: 470,
  x: 820,
  y: 260,
  mount(body, ctx) {
    const g = ctx.game;
    let sel = g.cs.notes[0]?.id ?? '';
    const side = h('nav.side', { style: 'width:190px;background:#f5efd9' });
    const page = h('div.scroll.page');
    body.classList.add('notes');
    body.append(side, page);
    const key = `no-handover:memo:${g.cs.id}`;

    const render = () => {
      clear(side);
      for (const n of g.cs.notes) {
        side.appendChild(h(`button.item${n.id === sel ? '.sel' : ''}`, { onclick: () => ((sel = n.id), render()) }, n.title));
      }
      side.appendChild(h(`button.item${sel === '__mine' ? '.sel' : ''}`, { onclick: () => ((sel = '__mine'), render()) }, `✎ ${t('notes.mine')}`));
      clear(page);
      if (sel === '__mine') {
        const ta = h('textarea', { placeholder: t('notes.placeholder'), oninput: () => storage.set(key, ta.value) }) as HTMLTextAreaElement;
        ta.value = storage.get(key) ?? '';
        page.append(h('h3', null, t('notes.mine')), ta);
        return;
      }
      const n = g.cs.notes.find((x) => x.id === sel);
      if (!n) return;
      g.open(`note:${n.id}`);
      const revealed = g.st.notesRevealed.includes(n.id);
      page.appendChild(h('h3', null, n.title));
      n.lines.forEach((line, i) => {
        const hl = revealed && n.highlight === i;
        page.appendChild(h(`div.ln${hl ? '.hl' : ''}`, null, line || '​', line ? ctx.pinBtn({ kind: 'note', text: `도윤 메모 ${n.title}: ${line}`, source: t('app.notes'), sourceKey: `note:${n.id}` }) : null));
        if (hl && n.reveal) page.appendChild(h('div.ln.reveal', null, n.reveal));
      });
    };
    render();
    return {
      refresh: (type?: string) => {
        if (type === 'note' && sel !== '__mine') render();
      },
      open: (arg) => {
        if (typeof arg === 'string') {
          sel = arg;
          render();
        }
      },
    };
  },
};
