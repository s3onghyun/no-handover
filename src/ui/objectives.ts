// "오늘 할 일" sticky: pinned top-right, three checkboxes ticked by engine events, a hint line
// under the current item, and a pulse on the window the current item points at. When every item
// is ticked it plays the done cue, folds toward the notebook icon and moves into the notebook
// (notes app, page '__today'); the pulse and hint scaffolding stop with it.

import { clear, h } from './dom.ts';
import { t } from '../i18n.ts';
import type { AudioManager } from '../audio/audio.ts';
import type { UiCtx } from './wm.ts';
import type { ObjectiveDef } from '../engine/types.ts';
import { hasEvidence, kindsFor, uncoveredSlots } from '../engine/evidence.ts';
import { slotName } from '../engine/scoring.ts';

/** `steps: false` ("터미널이 익숙해요"): the goal line and the count only; the numbered steps open on "단계 보기". */
export function mountObjectives(desktop: HTMLElement, ctx: UiCtx, audio: AudioManager, opts: { steps?: () => boolean } = {}): { refresh(): void; show(): void } {
  const g = ctx.game;
  const def = g.cs.opening?.objectives;
  const el = h('section.todo', { 'aria-label': def?.title ?? '' });
  let collapsed = false;
  /** Steps unfolded by hand on the goals-only sticky (this page only). */
  let stepsShown = false;
  let folding = false;
  /** All ticked and the report not open yet: the sticky waits with "📝 보고서 쓰기" (fold timer). */
  let waitTimer: number | null = null;
  const fresh = new Set<string>();
  /** The last item is "증거 N개 핀 → 보고서 쓰기": once it ticks, the report is the next thing to do. */
  const hasPinsItem = () => !!def?.items.some((it) => it.any.some((c) => 'pins' in c));
  const reportOpen = () => !!desktop.querySelector('.window[data-app="report"]:not(.min)');
  const toReport = () =>
    h('button.todo-report', { type: 'button', onclick: () => { ctx.wm.open('report'); foldNow(); } }, t('obj.toReport'));

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

  /** The "증거 N개" item: how many pins count, and (while current) which kinds count, met or missing. */
  const pinsGoal = (it: ObjectiveDef) => it.any.reduce((n, c) => ('pins' in c ? Math.max(n, c.pins) : n), 0);
  const evidenceLines = () => {
    const slots = g.cs.accusation.slots.filter((sl) => sl.evidence?.length).map((sl) => ({ sl, kinds: kindsFor(sl, g.st.pins) }));
    const full = slots.map(({ sl, kinds }) => `${slotName(sl)}: ${kinds.map(({ kind, pins }) => `${pins.length ? '✓' : '○'} ${kind.label}`).join(' · ')}`).join('\n');
    // one compact line (the sticky must not grow over windows); the board shows each kind
    return h(
      'button.todo-ev',
      { type: 'button', title: full, 'aria-label': `${t('obj.evidence')} — ${full}`, onclick: () => ctx.wm.open('board') },
      `${t('obj.evidence')}: `,
      ...slots.map(({ sl, kinds }, i) => {
        const met = kinds.filter((k) => k.pins.length).length;
        return h(`span.${met ? 'met' : 'miss'}`, null, `${i ? ' · ' : ''}${slotName(sl)} ${met}/${kinds.length}`);
      }),
      ' 📌',
    );
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
    const goalsOnly = !(opts.steps?.() ?? true) && !stepsShown;
    // what the report asks, one click from the checklist (the goal card, no answers); always there when the steps are folded away
    if (g.cs.goal || goalsOnly) el.appendChild(h('button.todo-goal', { onclick: () => document.dispatchEvent(new CustomEvent('nh-goal')), title: t('goal.open') }, `🎯 ${t('goal.short')}: ${g.cs.accusation.slots.map((s) => s.title.replace(/\s*\(.*\)$/, '')).join(' · ')}`));
    if (goalsOnly) {
      el.classList.add('goals-only');
      el.appendChild(h('button.todo-steps', { type: 'button', 'aria-expanded': 'false', onclick: () => ((stepsShown = true), render()) }, `${t('obj.showSteps')} ▾`));
      if (waitTimer !== null) el.appendChild(toReport());
      fresh.clear();
      return;
    }
    el.classList.remove('goals-only');
    const ol = h('ol');
    def.items.forEach((it, i) => {
      const done = g.objectives.isDone(it.id);
      const goal = pinsGoal(it);
      // enough pins but a field with none: say so (the report asks every field for one)
      const open = goal && !done ? uncoveredSlots(g.cs, g.st.pins) : 0;
      const n = g.evidencePins().length;
      const counted = goal && !done ? h('span.todo-count', null, ` (${Math.min(goal, n)}/${goal}${n >= goal && open ? ` · ${t('obj.uncovered', { n: String(open) })}` : ''})`) : null;
      ol.appendChild(
        h(
          `li${done ? '.done' : ''}${fresh.has(it.id) ? '.just' : ''}${cur === it ? '.cur' : ''}`,
          { dataset: { id: it.id } },
          h('span.box', { 'aria-hidden': 'true' }, done ? '✓' : ''),
          h('span.tx', null, h('span.num', null, `${i + 1}. `), it.text, counted),
          cur === it && it.hint && !folding ? h('small.hint', null, it.hint) : null,
          goal && !done && cur === it && !folding && hasEvidence(g.cs) ? evidenceLines() : null,
          goal && done && waitTimer !== null && !folding ? toReport() : null,
        ),
      );
    });
    el.appendChild(ol);
    fresh.clear();
  };

  const fold = () => {
    if (waitTimer !== null) window.clearTimeout(waitTimer);
    waitTimer = null;
    if (folding || g.objectives.folded()) return;
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

  /** Fold soon (the report just opened, or the CTA was used). */
  function foldNow(): void {
    if (waitTimer === null) return;
    window.clearTimeout(waitTimer);
    waitTimer = null;
    window.setTimeout(fold, 400);
  }
  /**
   * Every box ticked: with a pins item and the report not open yet, the sticky stays a little
   * longer with "📝 보고서 쓰기" on that item (it folds when the report opens, or after WAIT_MS);
   * otherwise it folds as before.
   */
  const WAIT_MS = 12000;
  const allTicked = (delay: number) => {
    if (!g.objectives.allDone() || g.objectives.folded() || folding || waitTimer !== null) return;
    if (hasPinsItem() && !g.st.finished && !reportOpen()) {
      waitTimer = window.setTimeout(fold, WAIT_MS);
      render();
    } else window.setTimeout(fold, delay);
  };

  g.on('objective', (ids) => {
    for (const id of ids as string[]) {
      fresh.add(id);
      void audio.play('sfx.tick');
    }
    render();
    allTicked(1400);
  });

  // reloaded between the last tick and the fold
  allTicked(600);

  return {
    refresh: () => {
      if (folding) return syncPulse();
      if (waitTimer !== null && reportOpen()) foldNow();
      render();
    },
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
