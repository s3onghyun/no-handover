// "오늘 할 일" objectives: the first-minutes checklist. Pure state machine (no DOM, no clock):
// the Game feeds it observations and gets back the items that just ticked.
//
//   observe({ type: 'interact', app: 'terminal' })            -> ['terminal']
//   observe({ type: 'cmd', host, line, output: [...] })        -> items whose cmd/output regex matched
//   observe({ type: 'clue', id }) / ({ type: 'open', key }) / ({ type: 'pins', count, uncovered })
//
// Items can tick in any order. When all are done the sticky "folds" into the notebook; that is a
// separate step (fold()) so the UI can play its little animation first.

import type { ObjectiveCond, ObjectiveDef } from './types.ts';

export interface ObjectiveState {
  /** item id -> play ms when ticked */
  done: Record<string, number>;
  /** play ms when the sticky folded into the notebook, or null */
  foldedAt: number | null;
}

export type Observation =
  | { type: 'interact'; app: string }
  | { type: 'cmd'; host: string; line: string; output: string[] }
  | { type: 'clue'; id: string }
  | { type: 'open'; key: string }
  /** `count` pins that count as evidence; `uncovered` report fields that no pin backs yet. */
  | { type: 'pins'; count: number; uncovered?: number };

export function emptyObjectiveState(): ObjectiveState {
  return { done: {}, foldedAt: null };
}

export class Objectives {
  readonly items: ObjectiveDef[];
  state: ObjectiveState;
  private regex = new Map<ObjectiveCond, RegExp>();

  constructor(items: ObjectiveDef[], state?: ObjectiveState) {
    this.items = items;
    this.state = state ?? emptyObjectiveState();
    for (const it of items)
      for (const c of it.any) {
        if ('cmd' in c) this.regex.set(c, new RegExp(c.cmd, 'imu'));
        else if ('output' in c) this.regex.set(c, new RegExp(c.output, 'imu'));
      }
  }

  isDone(id: string): boolean {
    return id in this.state.done;
  }

  allDone(): boolean {
    return this.items.length > 0 && this.items.every((i) => this.isDone(i.id));
  }

  folded(): boolean {
    return this.state.foldedAt !== null;
  }

  /** First unticked item (drives the per-item hint line and the window pulse). */
  current(): ObjectiveDef | null {
    return this.items.find((i) => !this.isDone(i.id)) ?? null;
  }

  /** App id that should pulse right now, or null once the scaffolding is gone. */
  pulse(): string | null {
    if (this.folded()) return null;
    return this.current()?.pulse ?? null;
  }

  private matches(c: ObjectiveCond, o: Observation): boolean {
    switch (o.type) {
      case 'interact':
        return 'interact' in c && c.interact === o.app;
      case 'cmd':
        if ('cmd' in c) return (!c.host || c.host === o.host) && this.regex.get(c)!.test(o.line);
        if ('output' in c) {
          const re = this.regex.get(c)!;
          return (!c.host || c.host === o.host) && o.output.some((l) => re.test(l));
        }
        return false;
      case 'clue':
        return 'clue' in c && c.clue === o.id;
      case 'open':
        return 'open' in c && c.open === o.key;
      case 'pins':
        return 'pins' in c && o.count >= c.pins && !o.uncovered;
    }
  }

  /** Feed one observation; returns the ids that ticked now (in item order). */
  observe(o: Observation, now: number): string[] {
    const ticked: string[] = [];
    for (const it of this.items) {
      if (this.isDone(it.id)) continue;
      if (it.any.some((c) => this.matches(c, o))) {
        this.state.done[it.id] = now;
        ticked.push(it.id);
      }
    }
    return ticked;
  }

  /** Fold the finished sticky into the notebook. No-op unless all items are done. */
  fold(now: number): boolean {
    if (!this.allDone() || this.folded()) return false;
    this.state.foldedAt = now;
    return true;
  }
}
