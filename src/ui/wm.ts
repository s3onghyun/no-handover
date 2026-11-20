// Window manager: draggable/resizable DOM windows, focus order, taskbar entries.

import { h } from './dom.ts';
import type { Game, Pin } from '../engine/game.ts';

export interface AppInstance {
  refresh?(type?: string): void;
  open?(arg?: unknown): void;
  focus?(): void;
}

export interface UiCtx {
  game: Game;
  wm: WM;
  toast(html: string | Node, onClick?: () => void): void;
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
  private z = 10;
  private cascade = 0;
  focused: string | null = null;
  readonly apps = new Map<string, AppDef>();
  ctx!: UiCtx;
  onFocus: (id: string | null) => void = () => {};
  /** Window opened / closed (sound cues, onboarding pulse). */
  onOpen: (id: string) => void = () => {};
  onClose: (id: string) => void = () => {};
  /** Width at the desktop's right edge that new windows keep clear of (the "오늘 할 일" sticky, which sits above every window). */
  reserveRight: () => number = () => 0;
  readonly root: HTMLElement;
  readonly tasks: HTMLElement;

  constructor(root: HTMLElement, tasks: HTMLElement) {
    this.root = root;
    this.tasks = tasks;
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
        h('button', { title: '최소화', 'aria-label': 'minimize', onclick: (e: Event) => (e.stopPropagation(), this.minimize(id)) }, '–'),
        h('button', { title: '최대화', 'aria-label': 'maximize', onclick: (e: Event) => (e.stopPropagation(), this.toggleMax(id)) }, '▢'),
        h('button.close', { title: '닫기', 'aria-label': 'close', onclick: (e: Event) => (e.stopPropagation(), this.close(id)) }, '✕'),
      ),
      body,
    );
    el.addEventListener('pointerdown', () => this.focus(id), true);
    this.drag(el, el.querySelector('.titlebar') as HTMLElement);
    this.root.appendChild(el);
    const task = h('button.task', { onclick: () => this.taskClick(id) }, `${def.icon} ${def.title()}`);
    this.tasks.appendChild(task);
    const inst = def.mount(body, this.ctx);
    this.wins.set(id, { def, el, body, inst, task });
    this.focus(id);
    if (arg !== undefined) inst.open?.(arg);
    this.onOpen(id);
    return inst;
  }

  /**
   * Move window `id` sideways so it does not cover the right-hand column of window `of` (where
   * the terminal's 📌 buttons sit): beside it when there is room, otherwise left of that column.
   */
  keepClearOf(id: string, of: string, column = 48): void {
    const a = this.wins.get(id)?.el;
    const b = this.wins.get(of)?.el;
    if (!a || !b || b.classList.contains('min') || a.classList.contains('max') || b.classList.contains('max')) return;
    const bRight = b.offsetLeft + b.offsetWidth;
    const colLeft = bRight - column;
    const covers =
      a.offsetTop < b.offsetTop + b.offsetHeight && a.offsetTop + a.offsetHeight > b.offsetTop &&
      a.offsetLeft < bRight && a.offsetLeft + a.offsetWidth > colLeft;
    if (!covers) return;
    const limit = (this.root.clientWidth || window.innerWidth) - this.reserveRight() - 8;
    const x = limit - bRight - 8 >= a.offsetWidth ? bRight + 8 : colLeft - 8 - a.offsetWidth;
    if (x >= 8) a.style.left = `${x}px`;
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
  }

  private taskClick(id: string): void {
    const w = this.wins.get(id);
    if (!w) return;
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
  }

  minimize(id: string): void {
    const w = this.wins.get(id);
    if (!w) return;
    w.el.classList.add('min');
    w.task.classList.remove('active');
    if (this.focused === id) this.focusTop();
  }

  close(id: string): void {
    const w = this.wins.get(id);
    if (!w) return;
    w.el.remove();
    w.task.remove();
    this.wins.delete(id);
    if (this.focused === id) this.focusTop();
    this.onClose(id);
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
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }
}
