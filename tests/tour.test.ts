// Tool tour rules, the aha moment and the goal card data (Cases 0-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextTourStep, parseTourState } from '../src/engine/tour.ts';
import { Game } from '../src/engine/game.ts';
import { CAMPAIGN } from '../src/cases/index.ts';
import { caseOneCron } from '../src/cases/case-1-cron.ts';
import { caseZeroWiki } from '../src/cases/case-0-wiki.ts';
import { goalLines } from '../src/engine/goal.ts';

const steps = caseZeroWiki.tour!.steps;
const env = (o: Partial<{ done: string[]; min: number; hidden: string[] }> = {}) => ({
  done: (id: string) => (o.done ?? []).includes(id),
  playMin: o.min ?? 0,
  visible: (app: string) => !(o.hidden ?? []).includes(app),
});

test('tour: steps come in data order, wait for their objective, minute and anchor, and stop when skipped', () => {
  const st = parseTourState(null);
  assert.equal(nextTourStep(steps, st, env())?.app, 'terminal');
  st.seen.push(nextTourStep(steps, st, env())!.id);
  const second = nextTourStep(steps, st, env())!;
  assert.notEqual(second.app, 'terminal');
  // a step whose anchor is not on screen (icon still locked) is passed over, not lost
  const dash = steps.find((s) => s.app === 'dashboard')!;
  const all = { seen: steps.filter((s) => s !== dash).map((s) => s.id), skipped: false };
  const ticked = caseZeroWiki.opening!.objectives.items.map((i) => i.id);
  assert.equal(nextTourStep(steps, all, env({ done: ticked, hidden: ['dashboard'] })), null);
  assert.equal(nextTourStep(steps, all, env({ done: ticked }))?.id, dash.id);
  // a later tool waits for its checklist item even when its anchor is somehow on screen
  assert.equal(nextTourStep(steps, all, env({ done: ['history', 'df', 'tail'] })), null);
  assert.equal(nextTourStep(steps, { seen: [], skipped: true }, env()), null);
  assert.deepEqual(parseTourState('nope'), { seen: [], skipped: false });
  assert.deepEqual(parseTourState('{"seen":["a"],"skipped":true}'), { seen: ['a'], skipped: true });
});

test('tour: Case 0 introduces every tool once, at the moment its icon unlocks', () => {
  const apps = steps.map((s) => s.app);
  for (const a of ['terminal', 'messenger', 'mail', 'notes', 'board', 'dashboard', 'hint', 'report']) assert.ok(apps.includes(a), a);
  assert.equal(new Set(steps.map((s) => s.id)).size, steps.length);
  const icons = caseZeroWiki.desktop!.icons;
  for (const i of icons) {
    const s = steps.find((x) => x.app === i.app)!;
    assert.ok(s, `${i.app} has a mark`);
    assert.equal(s.after, i.after, `${i.app}: the mark waits for the same checklist item as its icon`);
    assert.equal(s.afterMin, undefined);
  }
  // 💡: as soon as the first checklist item is ticked (the panel then has a 요약 to show)
  assert.equal(steps.find((s) => s.app === 'hint')!.after, caseZeroWiki.opening!.objectives.items[0].id);
  for (const s of steps) assert.ok(s.text.length <= 90, `${s.id} is short`);
});

test('tour: Case 1 repeats no tool mark, keeps only the goal card; Cases 2 and 3 have none', () => {
  const zero = new Set(steps.map((s) => s.id));
  const one = caseOneCron.tour!.steps;
  assert.deepEqual(one.map((s) => s.app), ['goal']);
  for (const s of one) assert.ok(!zero.has(s.id), `${s.id} is not a Case 0 mark`);
  // every Case 1 icon was already introduced in Case 0
  for (const i of caseOneCron.desktop!.icons) assert.ok(steps.some((s) => s.app === i.app), i.app);
  for (const e of CAMPAIGN.filter((x) => x.slot >= 2 && x.cs)) assert.equal(e.cs!.tour, undefined, e.id);
});

test('aha: one decisive clue per playable case, a key clue, fired once with a log entry', () => {
  for (const e of CAMPAIGN.filter((x) => x.cs)) {
    const aha = e.cs!.clues.filter((c) => c.aha);
    assert.equal(aha.length, 1, e.id);
    assert.ok(aha[0].key, `${e.id}: the aha clue is a key clue`);
  }
  const g = new Game(caseOneCron);
  let n = 0;
  g.on('aha', () => n++);
  g.runCommand(0, 'cat ~/wiki-clean.log');
  g.runCommand(0, 'cat ~/wiki-clean.log');
  assert.equal(n, 1);
  assert.equal(g.st.log.filter((e) => e.type === 'aha').length, 1);
});

test('goal card: lists exactly the report slots (title + prompt), never an answer', () => {
  for (const e of CAMPAIGN.filter((x) => x.cs)) {
    const cs = e.cs!;
    const g = goalLines(cs);
    assert.deepEqual(g.items.map((i) => i.title), cs.accusation.slots.map((s) => s.title), e.id);
    assert.ok(g.intro.length > 0);
    const text = JSON.stringify(g);
    for (const s of cs.accusation.slots) for (const o of s.options) assert.ok(!text.includes(o.text), `${e.id}: no option text in the goal card`);
  }
  assert.ok(CAMPAIGN.filter((x) => x.slot >= 1 && x.cs).every((x) => x.cs!.goal?.intro), 'Cases 1-3 have their own intro line');
});
