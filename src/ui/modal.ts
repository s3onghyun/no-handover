// In-game modal dialog (replaces the browser's confirm()/alert()): role="alertdialog" with a
// labelled title and description, focus kept inside while open, Esc or a click outside cancels,
// and focus goes back to where it was. Small motion only (a short fade; none with reduced motion).

import { h } from './dom.ts';

export interface ModalOpts {
  title: string;
  body: string | string[];
  /** Primary button label. */
  ok: string;
  /** Secondary button label; omit for a notice with one button. */
  cancel?: string;
  /** Start keyboard focus on the cancel button (the choice that changes nothing). */
  focusCancel?: boolean;
  /** Extra class for e2e and styling, e.g. 'modal-submit'. */
  kind?: string;
}

let seq = 0;

/** Resolves true for the primary button, false for cancel / Esc / a click outside. */
export function modal(o: ModalOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const back = document.activeElement as HTMLElement | null;
    const id = `modal-${++seq}`;
    const paras = (Array.isArray(o.body) ? o.body : [o.body]).filter(Boolean);
    const okBtn = h('button.primary-btn.modal-ok', { type: 'button' }, o.ok);
    const cancelBtn = o.cancel ? h('button.ghost-btn.modal-cancel', { type: 'button' }, o.cancel) : null;
    const box = h(
      `div.modal${o.kind ? '.' + o.kind : ''}`,
      { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-t`, 'aria-describedby': `${id}-d` },
      h(`h3#${id}-t`, null, o.title),
      h(`div.modal-body#${id}-d`, null, ...paras.map((p) => h('p', null, p))),
      h('div.modal-acts', null, cancelBtn, okBtn),
    );
    const wrap = h('div.modal-back', null, box);
    let done = false;
    const close = (v: boolean) => {
      if (done) return;
      done = true;
      wrap.remove();
      if (back?.isConnected) back.focus({ preventScroll: true });
      resolve(v);
    };
    okBtn.addEventListener('click', () => close(true));
    cancelBtn?.addEventListener('click', () => close(false));
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target === wrap) close(false);
    });
    wrap.addEventListener('keydown', (e) => {
      // the modal owns the keyboard while open: nothing behind it reacts (coach marks, terminal)
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        close(!cancelBtn); // a notice has nothing to cancel
      } else if (e.key === 'Tab') {
        const btns = [cancelBtn, okBtn].filter((b): b is HTMLButtonElement => !!b);
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        btns[(i + (e.shiftKey ? btns.length - 1 : 1)) % btns.length].focus();
      }
    });
    document.body.appendChild(wrap);
    ((o.focusCancel && cancelBtn) || okBtn).focus({ preventScroll: true });
  });
}

/** One-button notice (was alert()). */
export function notice(title: string, body: string | string[], ok: string): Promise<void> {
  return modal({ title, body, ok, kind: 'modal-notice' }).then(() => undefined);
}
