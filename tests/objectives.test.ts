// "오늘 할 일" objective state machine + its wiring into the Game (no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Objectives } from '../src/engine/objectives.ts';
import { Game, type SaveState } from '../src/engine/game.ts';
import { caseFriday1802 as cs } from '../src/cases/friday-1802.ts';
import type { ObjectiveDef } from '../src/engine/types.ts';

const ITEMS: ObjectiveDef[] = [
  { id: 'terminal', text: 't', any: [{ interact: 'terminal' }], pulse: 'terminal' },
  { id: 'last', text: 'l', any: [{ clue: 'c_history' }, { output: '갔다 와서 마저', host: 'pay-api-01' }] },
  { id: 'pins', text: 'p', any: [{ pins: 3 }] },
];

test('objectives: each condition kind ticks only its item, once', () => {
  const o = new Objectives(ITEMS);
  assert.equal(o.current()?.id, 'terminal');
  assert.equal(o.pulse(), 'terminal');
  assert.deepEqual(o.observe({ type: 'interact', app: 'mail' }, 1), []);
  assert.deepEqual(o.observe({ type: 'interact', app: 'terminal' }, 2), ['terminal']);
  assert.deepEqual(o.observe({ type: 'interact', app: 'terminal' }, 3), [], 'no double tick');
  assert.equal(o.pulse(), null, 'pulse stops once the pulsing item is done');
  // output regex respects host and ignores the typed line
  assert.deepEqual(o.observe({ type: 'cmd', host: 'bastion', line: 'x', output: ['# 갔다 와서 마저.'] }, 4), []);
  assert.deepEqual(o.observe({ type: 'cmd', host: 'pay-api-01', line: 'echo 갔다 와서 마저', output: [] }, 5), []);
  assert.deepEqual(o.observe({ type: 'pins', count: 2 }, 6), []);
  assert.equal(o.allDone(), false);
  assert.equal(o.fold(7), false, 'cannot fold before all are done');
  assert.deepEqual(o.observe({ type: 'cmd', host: 'pay-api-01', line: 'history', output: [' 4996  2026-11-13 17:52:31 # 갔다 와서 마저.'] }, 8), ['last']);
  assert.deepEqual(o.observe({ type: 'pins', count: 3 }, 9), ['pins']);
  assert.ok(o.allDone());
  assert.deepEqual(o.state.done, { terminal: 2, last: 8, pins: 9 });
  assert.equal(o.fold(10), true);
  assert.equal(o.fold(11), false, 'fold is one-shot');
  assert.equal(o.state.foldedAt, 10);
});

test('objectives: out-of-order ticks and cmd regex', () => {
  const o = new Objectives([
    { id: 'a', text: 'a', any: [{ cmd: '^\\s*history\\b' }] },
    { id: 'b', text: 'b', any: [{ cmd: '' }] },
    { id: 'c', text: 'c', any: [{ open: 'mail:brief' }] },
  ]);
  assert.deepEqual(o.observe({ type: 'open', key: 'mail:brief' }, 1), ['c']);
  assert.equal(o.current()?.id, 'a');
  assert.deepEqual(o.observe({ type: 'cmd', host: 'h', line: 'ls', output: [] }, 2), ['b'], "'' matches any command");
  assert.deepEqual(o.observe({ type: 'cmd', host: 'h', line: 'history | tail', output: [] }, 3), ['a']);
});

test('objectives: empty list never counts as done', () => {
  const o = new Objectives([]);
  assert.equal(o.allDone(), false);
  assert.equal(o.fold(1), false);
  assert.equal(o.pulse(), null);
});

test('case 1 opening: objective references resolve and the briefing fits 30–60 s', () => {
  const op = cs.opening!;
  assert.ok(cs.mails.some((m) => m.id === op.briefing.mail));
  assert.ok(op.briefing.caller in cs.people);
  assert.equal(op.objectives.items.length, 3);
  const clues = new Set(cs.clues.map((c) => c.id));
  for (const it of op.objectives.items)
    for (const c of it.any) {
      if ('clue' in c) assert.ok(clues.has(c.clue), c.clue);
      if ('output' in c) new RegExp(c.output);
    }
  // same arithmetic as src/ui/briefing.ts: 3.0 + 2.2 lock/ring, 72 ms per char, pauses, 4.2 mail, 1.3 reveal
  const chars = op.briefing.lines.reduce((a, l) => a + [...l.text].length, 0);
  const pauses = op.briefing.lines.reduce((a, l) => a + (l.pauseMs ?? 700), 0);
  const secs = (3000 + 2200 + chars * 72 + pauses + 4200 + 1300) / 1000;
  assert.ok(secs >= 30 && secs <= 60, `briefing ${secs}s`);
});

test('game: objectives tick from real commands, pins and window interaction; fold is logged', () => {
  const g = new Game(cs, null);
  const ticks: string[] = [];
  g.on('objective', (ids) => ticks.push(...(ids as string[])));
  g.briefingStart();
  g.tick(1000);
  g.briefingEnd(false, 31000, 'desk');
  g.focus('terminal'); // automatic focus on open does not count
  assert.deepEqual(ticks, []);
  g.interact('terminal');
  assert.deepEqual(ticks, ['terminal']);
  g.runCommand(0, 'crontab -');
  g.runCommand(0, 'history | tail -5');
  assert.deepEqual(ticks, ['terminal', 'last-command']);
  for (const text of ['a 1', 'b 2', 'c 3']) g.pin({ kind: 'line', text, source: 'x' });
  assert.deepEqual(ticks, ['terminal', 'last-command', 'pins']);
  assert.ok(g.foldObjectives());
  assert.ok(g.st.log.some((e) => e.type === 'objectives-folded'));
  const fm = g.playtestReport().summary as { firstMinutes: Record<string, unknown> };
  const f = fm.firstMinutes as { firstCommand: string; firstMeaningfulCommand: string; briefing: { skipped: boolean; watchedMs: number }; objectivesFoldedAt: number | null };
  assert.equal(f.firstCommand, 'crontab -');
  assert.equal(f.firstMeaningfulCommand, 'history | tail -5', 'the friction-only prefill is not meaningful');
  assert.equal(f.briefing.skipped, false);
  assert.equal(f.briefing.watchedMs, 31000);
  assert.notEqual(f.objectivesFoldedAt, null);
});

test('game: the rung-2 idle timer starts when the briefing ends, not at unlock', () => {
  const g = new Game(cs, null, { idleMinutes: 1 });
  g.briefingStart();
  g.tick(5000); // the UI does not tick during the briefing; simulate play time passing anyway
  g.briefingEnd(true, 4000, 'ring');
  assert.equal(g.ladder.state.lastProgressAt, g.st.briefing.endedAt);
  assert.equal(g.st.briefing.skipped, true);
  // 59 s after the briefing: no nudge yet; 61 s: first nudge
  for (let i = 0; i < 59; i++) g.tick(1000);
  assert.ok(!g.st.log.some((e) => e.type === 'rung2'));
  g.tick(2000);
  assert.ok(g.st.log.some((e) => e.type === 'rung2'));
  // a replay from the help menu does not reset the timer or the first-run record
  const before = { ...g.st.briefing };
  g.briefingStart(true);
  g.briefingEnd(false, 30000, 'desk', true);
  assert.equal(g.st.briefing.endedAt, before.endedAt);
  assert.equal(g.st.briefing.replays, 1);
});

test('game: saves from before the opening load with empty objectives', () => {
  const g = new Game(cs, null);
  const old = JSON.parse(g.serialize()) as Partial<SaveState>;
  delete old.objectives;
  delete old.briefing;
  delete old.facilitator;
  const g2 = new Game(cs, old as SaveState);
  assert.deepEqual(g2.st.objectives, { done: {}, foldedAt: null });
  assert.equal(g2.st.briefing.startedAt, null);
  g2.interact('terminal');
  assert.ok(g2.objectives.isDone('terminal'));
  assert.ok('terminal' in g2.st.objectives.done, 'state object is shared with the save');
});
