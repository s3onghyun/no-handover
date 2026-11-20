// Case list (round-2 playtest): locked / in progress / done with grade per case, and the next case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN } from '../src/cases/index.ts';
import { Campaign, parseGrades, parseProgress, saveInfo } from '../src/engine/campaign.ts';
import { Game } from '../src/engine/game.ts';
import { caseFriday1802 } from '../src/cases/friday-1802.ts';

const c = new Campaign(CAMPAIGN);
const [c0, c1, c2, c3] = c.playable().map((e) => e.id);

test('saveInfo: started, finished and the finishing grade, from a real save', () => {
  assert.equal(saveInfo(null), null);
  assert.equal(saveInfo('not json'), null);
  const g = new Game(caseFriday1802, null);
  assert.deepEqual(saveInfo(g.serialize()), { started: false, finished: false, grade: null });
  g.st.unlocked = true;
  g.st.playMs = 42_000;
  assert.deepEqual(saveInfo(g.serialize()), { started: true, finished: false, grade: null });
  g.st.finished = true;
  g.st.submissions.push({ at: 1, sub: {} as never, score: { total: 201, max: 330 } as never });
  assert.deepEqual(saveInfo(g.serialize()), { started: true, finished: true, grade: 'B' });
});

test('state: locked, new, playing, done, skipped; a restarted solved case reads playing', () => {
  let p = parseProgress(null);
  const started = { started: true, finished: false, grade: null };
  assert.equal(c.state(c0, p, null), 'new');
  assert.equal(c.state(c0, p, started), 'playing');
  assert.equal(c.state(c1, p, started), 'locked', 'a locked case stays locked whatever its save says');
  assert.equal(c.state('case4-keys', p, null), 'soon');
  p = c.solve(c0, p);
  assert.equal(c.state(c0, p, { started: true, finished: true, grade: 'S' }), 'done');
  assert.equal(c.state(c0, p, null), 'done', 'solved without a save (restarted, not reopened)');
  assert.equal(c.state(c0, p, started), 'playing', 'solved before, started again');
  assert.equal(c.state(c1, p, null), 'new');
  assert.equal(c.state(c0, c.skipTo(c1, parseProgress(null)), null), 'skipped');
});

test('upNext: the first open case not solved or skipped — the path Case N → N+1', () => {
  let p = parseProgress(null);
  assert.equal(c.upNext(p)?.id, c0);
  p = c.solve(c0, p);
  assert.equal(c.upNext(p)?.id, c1);
  assert.equal(c.upNext(c.skipTo(c1, parseProgress(null)))?.id, c1, 'a skipped tutorial is not "next"');
  p = c.solve(c2, c.solve(c1, p));
  assert.equal(c.upNext(p)?.id, c3);
  assert.equal(c.upNext(c.solve(c3, p)), null, 'placeholders are never next');
});

test('parseGrades keeps only S–D letters', () => {
  assert.deepEqual(parseGrades('{"a":"S","b":"Z","c":3}'), { a: 'S' });
  assert.deepEqual(parseGrades('[1]'), {});
  assert.deepEqual(parseGrades('oops'), {});
});
