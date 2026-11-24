import { clear, h, storage } from '../dom.ts';
import { t } from '../../i18n.ts';
import type { AppDef } from '../wm.ts';
import { NOTE_CHAR_MS } from '../../engine/game.ts';
import { reducedMotion } from '../motion.ts';

/**
 * Write a line in letter by letter (the last scene, src/engine/game.ts NOTE_CHAR_MS per character;
 * reduced motion = at once). Tells the page how long it writes ('nh-writing', main.ts clicks keys).
 */
function writeIn(el: HTMLElement | null | undefined): void {
  if (!el) return;
  const text = el.textContent ?? '';
  el.closest('.ln')?.classList.add('written');
  if (reducedMotion() || !text) return;
  const chars = [...text];
  el.textContent = '';
  el.classList.add('writing');
  let i = 0;
  const timer = setInterval(() => {
    if (!el.isConnected) return clearInterval(timer);
    el.textContent += chars[i++];
    if (i >= chars.length) {
      clearInterval(timer);
      el.classList.remove('writing');
    }
  }, NOTE_CHAR_MS);
  document.dispatchEvent(new CustomEvent('nh-writing', { detail: chars.length * NOTE_CHAR_MS }));
}

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

    const today = g.cs.opening?.objectives;
    const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;

    const render = () => {
      clear(side);
      // the "오늘 할 일" sticky folds into the notebook once all its boxes are ticked
      if (today && g.objectives.folded()) side.appendChild(h(`button.item${sel === '__today' ? '.sel' : ''}`, { onclick: () => ((sel = '__today'), render()) }, t('obj.notebook', { title: today.title })));
      if (sel === '__today' && !(today && g.objectives.folded())) sel = g.cs.notes[0]?.id ?? '';
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
      if (sel === '__today' && today) {
        page.appendChild(h('h3', null, t('obj.notebook', { title: today.title })));
        for (const it of today.items) {
          const at = g.st.objectives.done[it.id];
          page.appendChild(h('div.ln.todo-done', null, `☑ ${it.text}`, at !== undefined ? h('span.muted', { style: 'font-size:12px;margin-left:8px' }, mmss(at)) : null));
        }
        page.appendChild(h('div.ln', null, '​'));
        for (const line of today.after) page.appendChild(h('div.ln', null, line));
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
        if (hl && n.reveal) page.appendChild(h('div.ln.reveal', null, h('span.ln-text', null, n.reveal)));
      });
      // lines the last scene wrote in (src/engine/game.ts)
      for (const line of g.st.noteLines?.[n.id] ?? []) page.appendChild(h('div.ln.added', null, h('span.ln-text', null, line), ctx.pinBtn({ kind: 'note', text: `도윤 메모 ${n.title}: ${line}`, source: t('app.notes'), sourceKey: `note:${n.id}` })));
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
        } else if (arg && typeof arg === 'object' && 'id' in arg) {
          // the last scene: open the page and write its newest line (or the reveal line) in again
          const a = arg as { id: string; write?: 'line' | 'reveal' };
          sel = a.id;
          render();
          const target = a.write === 'reveal' ? page.querySelector<HTMLElement>('.ln.reveal .ln-text') : a.write === 'line' ? [...page.querySelectorAll<HTMLElement>('.ln.added .ln-text')].at(-1) : null;
          writeIn(target);
          target?.scrollIntoView({ block: 'nearest' });
        }
      },
    };
  },
};
