import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HintLadder } from '../src/engine/hints.ts';
import { scoreSubmission, scoreSlot, grade, ATTEMPT_MULTIPLIER } from '../src/engine/scoring.ts';
import { caseFriday1802 as cs } from '../src/cases/friday-1802.ts';

const MIN = 60000;
const none = new Set<string>();

test('hint ladder: no idle nudge before the configured idle time (default 10 min)', () => {
  const l = new HintLadder(cs.hints, 0);
  assert.equal(l.idleMs, 10 * MIN);
  assert.equal(l.tick(9 * MIN, none, false), null);
  const n = l.tick(10 * MIN, none, false);
  assert.equal(n?.id, 'idle-1');
  assert.equal(n?.from, 'jihoon');
  // the next one waits another full interval
  assert.equal(l.tick(15 * MIN, none, false), null);
  assert.equal(l.tick(20 * MIN, none, false)?.id, 'idle-2');
});

test('hint ladder: progress (new key evidence) restarts the stuck timer', () => {
  const l = new HintLadder(cs.hints, 0, { idleMs: 2 * MIN });
  l.progress(1.5 * MIN);
  assert.equal(l.tick(3 * MIN, none, false), null);
  assert.equal(l.msUntilNudge(3 * MIN), 0.5 * MIN);
  assert.ok(l.tick(3.5 * MIN, none, false));
});

test('hint ladder: nudges whose clues are already found are skipped; solved cause stops idle nudges', () => {
  const l = new HintLadder(cs.hints, 0, { idleMs: MIN });
  const found = new Set(['c_cron']);
  assert.equal(l.tick(MIN, found, false)?.id, 'idle-4');
  const l2 = new HintLadder(cs.hints, 0, { idleMs: MIN });
  assert.equal(l2.tick(5 * MIN, none, true), null);
});

test('hint ladder: wrong accusation picks the blamed person\'s voice, once each, then default', () => {
  const l = new HintLadder(cs.hints, 0);
  assert.equal(l.onWrong(['seojin'], 1)?.id, 'wrong-seojin');
  assert.equal(l.onWrong(['seojin'], 2)?.id, 'wrong-default');
  assert.equal(l.onWrong(['jihoon'], 3)?.id, 'wrong-jihoon');
  assert.equal(l.onWrong([], 4), null);
});

test('hint ladder: explicit hints are per slot, in order, each with a cost', () => {
  const l = new HintLadder(cs.hints, 0);
  const a = l.useExplicit('cause', 1);
  const b = l.useExplicit('cause', 2);
  assert.ok(a && b && a.text !== b.text);
  l.useExplicit('cause', 3);
  assert.equal(l.useExplicit('cause', 4), null);
  assert.equal(l.totalCost(), 30);
  assert.equal(l.usedExplicit('cause').length, 3);
  assert.equal(l.nextExplicit('sequence')?.index, 0);
});

const correct = { cause: 'fd', sequence: 'true', responsibility: ['git-admins', 'cron', 'oncall', 'account', 'bottleneck', 'cover-seojin', 'cover-jihoon'] };

test('scoring: perfect first submission', () => {
  const r = scoreSubmission(cs, correct, { attempt: 1, pinnedKeyClues: 6, hintCost: 0 });
  assert.equal(r.allCorrect, true);
  assert.equal(r.base, 300);
  assert.equal(r.evidenceBonus, 30);
  assert.equal(r.total, 330);
  assert.equal(grade(r.total, r.max), 'S');
});

test('scoring: attempt multiplier, evidence cap and hint cost', () => {
  const r = scoreSubmission(cs, correct, { attempt: 3, pinnedKeyClues: 20, hintCost: 40 });
  assert.equal(r.multiplier, ATTEMPT_MULTIPLIER[2]);
  assert.equal(r.evidenceBonus, 30);
  assert.equal(r.total, Math.round(300 * 0.7) + 30 - 40);
});

test('scoring: blaming a person fails the responsibility slot even with all factors picked', () => {
  const r = scoreSubmission(cs, { ...correct, responsibility: [...correct.responsibility, 'blame-jihoon'] }, { attempt: 1, pinnedKeyClues: 0, hintCost: 0 });
  assert.equal(r.slots.responsibility?.correct, false);
  assert.deepEqual(r.blamed, ['jihoon']);
  assert.equal(r.slots.responsibility?.points, 60);
});

test('scoring: responsibility passes at 70 without negatives', () => {
  const slot = cs.accusation.slots.find((s) => s.id === 'responsibility')!;
  assert.equal(scoreSlot(slot, ['git-admins', 'cron', 'oncall', 'account']).correct, true);
  assert.equal(scoreSlot(slot, ['git-admins', 'cron', 'oncall']).correct, false);
});

test('scoring: wrong cause blames the person in the option', () => {
  const r = scoreSubmission(cs, { ...correct, cause: 'approve' }, { attempt: 1, pinnedKeyClues: 0, hintCost: 0 });
  assert.equal(r.slots.cause?.correct, false);
  assert.deepEqual(r.blamed, ['seojin']);
  assert.equal(r.total, 200);
});

test('scoring never goes below zero', () => {
  const r = scoreSubmission(cs, { cause: null, sequence: null, responsibility: [] }, { attempt: 3, pinnedKeyClues: 0, hintCost: 90 });
  assert.equal(r.total, 0);
});
