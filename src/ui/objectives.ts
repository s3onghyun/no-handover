// "오늘 할 일" sticky: pinned top-right, three checkboxes ticked by engine events, a hint line
// under the current item, and a pulse on the window the current item points at. When every item
// is ticked it plays the done cue, folds toward the notebook icon and moves into the notebook
// (notes app, page '__today'); the pulse and hint scaffolding stop with it.

import { clear, h } from './dom.ts';
import { t } from '../i18n.ts';
import type { AudioManager } from '../audio/audio.ts';
import type { UiCtx } from './wm.ts';

export function mountObjectives(desktop: HTMLElement, ctx: UiCtx, audio: AudioManager): { refresh(): void; show(): void } {
  const g = ctx.game;
  const def = g.cs.opening?.objectives;
  const el = h('section.todo', { 'aria-label': def?.title ?? '' });
  let collapsed = false;
  let folding = false;
  const fresh = new Set<string>();

  const syncPulse = () => {
    const target = folding ? null : g.objectives.pulse();
    for (const w of desktop.querySelectorAll('.window.pulse, .icon.pulse')) {
      if ((w as HTMLElement).dataset.app !== target) w.classList.remove('pulse');
    }
    if (!target) return;
    // pulse the window when it is visible, otherwise its desktop icon
    const win = desktop.querySelector(`.window[data-app="${target}"]:not(.min)`);
    if (win) win.classList.add('pulse');
    else desktop.querySelector(`.icon[data-app="${target}"]`)?.classList.add('pulse');
  };

  const render = () => {
    syncPulse();
    if (!def || g.objectives.folded()) {
      el.remove();
      return;
    }
    if (!el.isConnected) desktop.appendChild(el);
    clear(el);
    el.classList.toggle('collapsed', collapsed);
    const cur = g.objectives.current();
    const doneN = def.items.filter((i) => g.objectives.isDone(i.id)).length;
    el.append(
      h(
        'header',
        null,
        h('b', null, `📌 ${def.title}`),
        h('span.todo-n', null, `${doneN}/${def.items.length}`),
        h('button.todo-toggle', { title: collapsed ? t('obj.expand') : t('obj.collapse'), 'aria-label': collapsed ? t('obj.expand') : t('obj.collapse'), 'aria-expanded': String(!collapsed), onclick: () => ((collapsed = !collapsed), render()) }, collapsed ? '▾' : '▴'),
      ),
    );
    if (collapsed) return;
    // what the report asks, one click from the checklist (the goal card, no answers)
    if (g.cs.goal) el.appendChild(h('button.todo-goal', { onclick: () => document.dispatchEvent(new CustomEvent('nh-goal')), title: t('goal.open') }, `🎯 ${t('goal.short')}: ${g.cs.accusation.slots.map((s) => s.title.replace(/\s*\(.*\)$/, '')).join(' · ')}`));
    const ol = h('ol');
    def.items.forEach((it, i) => {
      const done = g.objectives.isDone(it.id);
      ol.appendChild(
        h(
          `li${done ? '.done' : ''}${fresh.has(it.id) ? '.just' : ''}${cur === it ? '.cur' : ''}`,
          { dataset: { id: it.id } },
          h('span.box', { 'aria-hidden': 'true' }, done ? '✓' : ''),
          h('span.tx', null, h('span.num', null, `${i + 1}. `), it.text),
          cur === it && it.hint && !folding ? h('small.hint', null, it.hint) : null,
        ),
      );
    });
    el.appendChild(ol);
    fresh.clear();
  };

  const fold = () => {
    folding = true;
    render();
    void audio.play('sfx.done');
    // fly toward the notebook icon
    const icon = desktop.querySelector('.icon[data-app="notes"]') as HTMLElement | null;
    const from = el.getBoundingClientRect();
    if (icon) {
      const to = icon.getBoundingClientRect();
      el.style.setProperty('--fx', `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
      el.style.setProperty('--fy', `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
    }
    el.classList.add('folding');
    window.setTimeout(() => {
      g.foldObjectives();
      folding = false;
      el.remove();
      icon?.classList.add('bump');
      window.setTimeout(() => icon?.classList.remove('bump'), 900);
      ctx.toast(h('div', null, h('b', null, '📒 '), t('obj.done')), () => ctx.wm.open('notes', '__today'));
      ctx.wm.instance('notes')?.refresh?.('note');
    }, 900);
  };

  g.on('objective', (ids) => {
    for (const id of ids as string[]) {
      fresh.add(id);
      void audio.play('sfx.tick');
    }
    render();
    if (g.objectives.allDone() && !g.objectives.folded()) window.setTimeout(fold, 1400);
  });

  // reloaded between the last tick and the fold
  if (g.objectives.allDone() && !g.objectives.folded()) window.setTimeout(fold, 600);

  return {
    refresh: () => (folding ? syncPulse() : render()),
    show: () => {
      if (g.objectives.folded()) ctx.wm.open('notes', '__today');
      else {
        collapsed = false;
        render();
        el.classList.remove('wiggle');
        void el.offsetWidth;
        el.classList.add('wiggle');
      }
    },
  };
}
