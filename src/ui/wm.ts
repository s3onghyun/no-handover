// Window manager: draggable/resizable DOM windows, focus order, taskbar entries.

import { h } from './dom.ts';
import type { Game, Pin } from '../engine/game.ts';
import { t } from '../i18n.ts';

export interface AppInstance {
  refresh?(type?: string): void;
  open?(arg?: unknown): void;
  focus?(): void;
}

export interface UiCtx {
  game: Game;
  wm: WM;
  toast(html: string | Node, onClick?: () => void): HTMLElement;
  pinBtn(p: Omit<Pin, 'id' | 'ts' | 'onTimeline' | 'clueIds' | 'at'> & { sourceKey?: string; ts?: number | null }): HTMLElement;
  avatar(personId: string, size?: number): HTMLElement;
  name(personId: string): string;
  /** The next playable case in the campaign, if any (debrief "다음 사건 →" button). */
  nextCase?: () => { label: string; go(): void } | null;
  /** 'Case 0 · 튜토리얼', 'Case 3' (result card). */
  caseLabel?: string;
}

export interface AppDef {
  id: string;
  title: () => string;
  icon: string;
  w: number;
  h: number;
  x?: number;
  y?: number;
  mount(body: HTMLElement, ctx: UiCtx): AppInstance;
}

interface Win {
  def: AppDef;
  el: HTMLElement;
  body: HTMLElement;
  inst: AppInstance;
  task: HTMLElement;
}

export class WM {
  private wins = new Map<string, Win>();
  /** Taskbar entries kept while their window is closed (the evidence board): one click opens or raises it. */
  private pinned = new Map<string, HTMLElement>();
  private z = 10;
  private cascade = 0;
  focused: string | null = null;
  readonly apps = new Map<string, AppDef>();
  ctx!: UiCtx;
  onFocus: (id: string | null) => void = () => {};
  /** Window opened / closed (sound cues, onboarding pulse). */
  onOpen: (id: string) => void = () => {};
  onClose: (id: string) => void = () => {};
  /** Windows moved, resized, stacked, opened, closed or minimized (toasts keep off the 📌 columns, covered icons). */
  onLayout: () => void = () => {};
  /** Width at the desktop's right edge that new windows keep clear of (the "오늘 할 일" sticky, which sits above every window). */
  reserveRight: () => number = () => 0;
  readonly root: HTMLElement;
  readonly tasks: HTMLElement;

  private layoutPending = false;
  private readonly ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.relayout()) : null;

  constructor(root: HTMLElement, tasks: HTMLElement) {
    this.root = root;
    this.tasks = tasks;
  }

  /** Windows changed: exposure and taskbar wording now, the rest batched to the next frame. */
  relayout(): void {
    this.syncExposure();
    if (this.layoutPending) return;
    this.layoutPending = true;
    requestAnimationFrame(() => {
      this.layoutPending = false;
      this.syncExposure(); // a window that sized itself after opening
      this.onLayout();
    });
  }

  /**
   * A window behind another one whose centre, prompt or titlebar buttons are covered leaves the
   * accessibility tree until it comes to the front. Snapshot-driven tools click at an element's
   * centre, so a covered control would hand the click to the window in front (the playtesters'
   * "minimize hit the board and the terminal jumped forward"). The taskbar entry says where each
   * window is: in front, behind another window, or minimized.
   */
  syncExposure(): void {
    const shown = [...this.wins.entries()].filter(([, w]) => !w.el.classList.contains('min')).sort((a, b) => +b[1].el.style.zIndex - +a[1].el.style.zIndex);
    const above: DOMRect[] = [];
    const inside = (x: number, y: number) => above.some((r) => x > r.left && x < r.right && y > r.top && y < r.bottom);
    const centre = (r: DOMRect) => [r.left + r.width / 2, r.top + r.height / 2] as const;
    for (const [, w] of shown) {
      const keys = [w.el, ...w.el.querySelectorAll<HTMLElement>('.titlebar button, .tin input')].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
      const covered = keys.some((r) => inside(...centre(r)));
      if (covered) w.el.setAttribute('aria-hidden', 'true');
      else w.el.removeAttribute('aria-hidden');
      w.task.title = covered ? t('wm.behind', { app: w.def.title() }) : w.def.title();
      w.el.dataset.covered = covered ? '1' : '';
      above.push(w.el.getBoundingClientRect());
    }
    for (const w of this.wins.values()) if (w.el.classList.contains('min')) w.task.title = t('wm.minimized', { app: w.def.title() });
  }

  register(def: AppDef): void {
    this.apps.set(def.id, def);
  }

  isOpen(id: string): boolean {
    return this.wins.has(id);
  }

  open(id: string, arg?: unknown): AppInstance | null {
    const existing = this.wins.get(id);
    if (existing) {
      existing.el.classList.remove('min');
      this.focus(id);
      if (arg !== undefined) existing.inst.open?.(arg);
      return existing.inst;
    }
    const def = this.apps.get(id);
    if (!def) return null;
    const vw = this.root.clientWidth || window.innerWidth;
    const vh = this.root.clientHeight || window.innerHeight - 40;
    let w = Math.min(def.w, vw - 16);
    const hh = Math.min(def.h, vh - 16);
    const x = def.x ?? Math.max(8, Math.min(vw - w - 8, 120 + (this.cascade % 6) * 28));
    // stop short of the sticky so the right edge (pin buttons, ✕) stays clickable, unless that leaves a sliver
    const limit = vw - this.reserveRight() - 8;
    if (x + w > limit && limit - x >= Math.min(def.w, 480)) w = limit - x;
    const y = def.y ?? Math.max(8, Math.min(vh - hh - 8, 20 + (this.cascade % 6) * 24));
    this.cascade++;
    const title = h('span.title', null, def.title());
    const body = h('div.wbody');
    const el = h(
      'div.window',
      { style: { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hh}px` }, dataset: { app: id }, role: 'dialog', 'aria-label': def.title() },
      h(
        'div.titlebar',
        { ondblclick: () => this.toggleMax(id) },
        h('span', null, def.icon),
        title,
        // the description names the window: tools list every window's controls, and "minimize" alone could be any of them
        h('button', { title: t('wm.min', { app: def.title() }), 'aria-label': 'minimize', onclick: (e: Event) => (e.stopPropagation(), this.minimize(id)) }, '–'),
        h('button', { title: t('wm.max', { app: def.title() }), 'aria-label': 'maximize', onclick: (e: Event) => (e.stopPropagation(), this.toggleMax(id)) }, '▢'),
        h('button.close', { title: t('wm.close', { app: def.title() }), 'aria-label': 'close', onclick: (e: Event) => (e.stopPropagation(), this.close(id)) }, '✕'),
      ),
      body,
    );
    el.addEventListener('pointerdown', () => this.focus(id), true);
    // keyboard focus or a tool's fill() landing in a window behind brings that window to the front
    el.addEventListener('focusin', () => {
      if (this.focused !== id && !el.classList.contains('min')) this.focus(id);
    });
    this.drag(el, el.querySelector('.titlebar') as HTMLElement);
    this.root.appendChild(el);
    const task = this.pinned.get(id) ?? h('button.task', { onclick: () => this.taskClick(id), dataset: { app: id } }, `${def.icon} ${def.title()}`);
    task.classList.add('open');
    if (!task.isConnected) this.tasks.appendChild(task);
    const inst = def.mount(body, this.ctx);
    this.wins.set(id, { def, el, body, inst, task });
    this.ro?.observe(el);
    this.focus(id);
    if (arg !== undefined) inst.open?.(arg);
    this.onOpen(id);
    this.relayout();
    return inst;
  }

  /**
   * Move window `id` sideways so it does not cover the right-hand column of window `of` (where
   * the terminal's 📌 buttons sit): beside it when there is room, otherwise left of that column.
   */
  keepClearOf(id: string, of: string, column = 48): void {
    const a = this.wins.get(id)?.el;
    const b = this.wins.get(of)?.el;
    // a maximized `of` counts too: it stops short of the checklist, and its 📌 column is still at its right edge
    if (!a || !b || b.classList.contains('min') || a.classList.contains('max')) return;
    const bRight = b.offsetLeft + b.offsetWidth;
    const colLeft = bRight - column;
    const covers =
      a.offsetTop < b.offsetTop + b.offsetHeight && a.offsetTop + a.offsetHeight > b.offsetTop &&
      a.offsetLeft < bRight && a.offsetLeft + a.offsetWidth > colLeft;
    if (!covers) return;
    const limit = (this.root.clientWidth || window.innerWidth) - this.reserveRight() - 8;
    const x = limit - bRight - 8 >= a.offsetWidth ? bRight + 8 : colLeft - 8 - a.offsetWidth;
    if (x >= 8) a.style.left = `${x}px`;
    this.relayout();
  }

  /**
   * Maximize / restore. A maximized window stops short of the "오늘 할 일" sticky (it sits above
   * every window), as a newly opened one does, so its ✕ and the right-hand 📌 column stay clickable;
   * unless that would leave too narrow a window.
   */
  toggleMax(id: string): void {
    const el = this.wins.get(id)?.el;
    if (!el) return;
    const on = el.classList.toggle('max');
    const vw = this.root.clientWidth || window.innerWidth;
    const r = on ? this.reserveRight() : 0;
    el.style.setProperty('--max-right', r && vw - r - 8 >= 480 ? `${r + 8}px` : '0px');
    this.relayout();
  }

  /**
   * Keep a taskbar entry for app `id` even while its window is closed, so it can be reached when
   * other windows cover its desktop icon. Returns the entry (callers add a badge or hide it).
   */
  pinTask(id: string): HTMLElement | null {
    const def = this.apps.get(id);
    if (!def) return null;
    let task = this.pinned.get(id);
    if (!task) {
      task = h('button.task.pinned', { type: 'button', onclick: () => this.taskClick(id), dataset: { app: id }, title: def.title() }, h('span.task-label', null, `${def.icon} ${def.title()}`));
      this.pinned.set(id, task);
      this.tasks.prepend(task);
    }
    return task;
  }

  private taskClick(id: string): void {
    const w = this.wins.get(id);
    if (!w) {
      this.open(id);
      return;
    }
    if (this.focused === id && !w.el.classList.contains('min')) this.minimize(id);
    else {
      w.el.classList.remove('min');
      this.focus(id);
    }
  }

  focus(id: string): void {
    const w = this.wins.get(id);
    if (!w) return;
    w.el.style.zIndex = String(++this.z);
    for (const [k, x] of this.wins) {
      x.el.classList.toggle('focused', k === id);
      x.task.classList.toggle('active', k === id);
    }
    if (this.focused !== id) {
      this.focused = id;
      this.onFocus(id);
      w.inst.focus?.();
    }
    this.relayout();
  }

  minimize(id: string): void {
    const w = this.wins.get(id);
    if (!w) return;
    w.el.classList.add('min');
    w.task.classList.remove('active');
    // keyboard focus must not stay inside a hidden window (typing would go nowhere visible)
    if (w.el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    if (this.focused === id) this.focusTop();
    this.relayout();
  }

  close(id: string): void {
    const w = this.wins.get(id);
    if (!w) return;
    this.ro?.unobserve(w.el);
    w.el.remove();
    if (this.pinned.has(id)) {
      w.task.classList.remove('open', 'active');
      w.task.title = w.def.title();
    }
    else w.task.remove();
    this.wins.delete(id);
    if (this.focused === id) this.focusTop();
    this.onClose(id);
    this.relayout();
  }

  private focusTop(): void {
    let best: string | null = null;
    let bz = -1;
    for (const [k, w] of this.wins) {
      if (w.el.classList.contains('min')) continue;
      const z = +w.el.style.zIndex;
      if (z > bz) {
        bz = z;
        best = k;
      }
    }
    this.focused = null;
    if (best) this.focus(best);
    else this.onFocus(null);
  }

  refreshAll(type?: string): void {
    for (const w of this.wins.values()) w.inst.refresh?.(type);
  }

  instance(id: string): AppInstance | undefined {
    return this.wins.get(id)?.inst;
  }

  private drag(el: HTMLElement, handle: HTMLElement): void {
    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button') || el.classList.contains('max')) return;
      const sx = e.clientX;
      const sy = e.clientY;
      const ox = el.offsetLeft;
      const oy = el.offsetTop;
      handle.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const maxX = this.root.clientWidth - 60;
        const maxY = this.root.clientHeight - 34;
        el.style.left = `${Math.max(-el.offsetWidth + 80, Math.min(maxX, ox + ev.clientX - sx))}px`;
        el.style.top = `${Math.max(0, Math.min(maxY, oy + ev.clientY - sy))}px`;
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        this.relayout();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }
}
