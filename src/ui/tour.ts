// Guided tool tour: one short coach mark at a time, anchored by app id (a window, its desktop
// icon, or a tray control with data-tour="<id>"), never blocking — no overlay, no focus theft.
// Each mark is shown once; the seen state lives in localStorage (no-handover:tour:<case id>).
// Esc or "알겠어요" dismisses the current mark, "투어 건너뛰기" ends the tour for this case.

import { nextTourStep, parseTourState, type TourState } from '../engine/tour.ts';
import type { TourStep } from '../engine/types.ts';
import type { Game } from '../engine/game.ts';
import { h, storage } from './dom.ts';
import { t } from '../i18n.ts';

export const tourKey = (caseId: string) => `no-handover:tour:${caseId}`;
const AUTO_HIDE_MS = 15000;

export function mountTour(game: Game, opts: { blocked: () => boolean }): { refresh(): void } | null {
  const steps = game.cs.tour?.steps;
  if (!steps?.length) return null;
  const key = tourKey(game.cs.id);
  const st: TourState = parseTourState(storage.get(key));
  const save = () => storage.set(key, JSON.stringify(st));
  let cur: { step: TourStep; el: HTMLElement; timer: number } | null = null;

  const anchor = (app: string): HTMLElement | null =>
    (document.querySelector(`.window[data-app="${app}"]:not(.min)`) as HTMLElement | null) ??
    (document.querySelector(`.icon[data-app="${app}"]`) as HTMLElement | null) ??
    (document.querySelector(`[data-tour="${app}"]`) as HTMLElement | null);

  const place = (el: HTMLElement, a: HTMLElement) => {
    const r = a.getBoundingClientRect();
    const w = el.offsetWidth || 280;
    const hgt = el.offsetHeight || 120;
    const isWindow = a.classList.contains('window');
    // windows: inside their top-left corner; icons and tray buttons: beside / above them
    let x = isWindow ? r.left + 24 : r.right + 12;
    let y = isWindow ? r.top + 44 : r.top;
    if (a.closest('#taskbar')) {
      x = r.left + r.width / 2 - w / 2;
      y = r.top - hgt - 12;
    }
    x = Math.max(8, Math.min(x, innerWidth - w - 8));
    y = Math.max(8, Math.min(y, innerHeight - hgt - 56));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  };

  const close = (how: 'ok' | 'skip' | 'auto') => {
    if (!cur) return;
    const { step, el, timer } = cur;
    clearTimeout(timer);
    el.remove();
    cur = null;
    if (!st.seen.includes(step.id)) st.seen.push(step.id);
    if (how === 'skip') st.skipped = true;
    save();
    game.log(how === 'skip' ? 'tour-skip' : 'tour-step', { step: step.id, how });
    setTimeout(refresh, 400);
  };

  const show = (step: TourStep, a: HTMLElement) => {
    const ok = h('button.tour-ok', { onclick: () => close('ok') }, t('tour.ok'));
    const el = h(
      'div.tour',
      { role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': `tour-t-${step.id}`, 'aria-describedby': `tour-d-${step.id}`, dataset: { step: step.id, app: step.app } },
      h('div.tour-head', null, h('b', { id: `tour-t-${step.id}` }, step.title), h('span.tour-n', null, `${steps.indexOf(step) + 1}/${steps.length}`)),
      h('p', { id: `tour-d-${step.id}` }, step.text),
      h('div.tour-acts', null, h('button.tour-skip', { onclick: () => close('skip') }, t('tour.skip')), ok),
    );
    document.body.appendChild(el);
    place(el, a);
    cur = { step, el, timer: window.setTimeout(() => close('auto'), AUTO_HIDE_MS) };
    a.classList.add('tour-target');
    setTimeout(() => a.classList.remove('tour-target'), 1600);
  };

  function refresh(): void {
    if (cur) {
      // keep the mark next to its anchor while windows move
      const a = anchor(cur.step.app);
      if (a) place(cur.el, a);
      return;
    }
    if (opts.blocked() || st.skipped) return;
    const step = nextTourStep(steps!, st, { done: (id) => game.objectives.isDone(id) || game.objectives.folded(), playMin: game.st.playMs / 60000, visible: (app) => !!anchor(app) });
    if (!step) return;
    show(step, anchor(step.app)!);
  }

  // Esc closes the current mark (the terminal does not use Esc)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cur && !opts.blocked()) close('ok');
  });
  return { refresh };
}
