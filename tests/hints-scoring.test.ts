import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HintLadder } from '../src/engine/hints.ts';
import { scoreSubmission, scoreSlot, grade, ATTEMPT_MULTIPLIER, missingCites } from '../src/engine/scoring.ts';
import { backing } from './case-integrity.ts';
import { caseFriday1802 as cs } from '../src/cases/friday-1802.ts';

const MIN = 60000;
const none = new Set<string>();

test('hint ladder: no idle nudge before the configured idle time (case 3: 6 min)', () => {
  const l = new HintLadder(cs.hints, 0);
  assert.equal(l.idleMs, 6 * MIN);
  assert.equal(l.tick(5 * MIN, none, false), null);
  const n = l.tick(6 * MIN, none, false);
  assert.equal(n?.id, 'idle-1');
  assert.equal(n?.from, 'jihoon');
  // the next one waits another full interval
  assert.equal(l.tick(9 * MIN, none, false), null);
  assert.equal(l.tick(12 * MIN, none, false)?.id, 'idle-2');
});

test('hint ladder: a clue found in the last minute holds the idle nudge', () => {
  const l = new HintLadder(cs.hints, 0);
  assert.equal(l.tick(6 * MIN, none, false, 5.5 * MIN), null, 'clue 30 s ago: held');
  assert.equal(l.tick(6.5 * MIN, none, false, 5.5 * MIN)?.id, 'idle-1', 'a minute later it fires');
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

test('hint ladder: panel steps are counted as hints (summaries free); cost only matters in senior mode', () => {
  const l = new HintLadder(cs.hints, 0);
  l.usePanel({ key: 'cause', rung: 'summary', index: 0, at: 1, cost: 0 });
  l.usePanel({ key: 'cause', rung: 'direction', index: 0, at: 2, cost: 10 });
  l.usePanel({ key: 'cause', rung: 'answer', index: 0, at: 3, cost: 30 });
  assert.equal(l.hintCount(), 2);
  assert.equal(l.totalCost(), 40);
  assert.equal(l.panelUses('cause').length, 3);
  assert.equal(l.panelUses('sequence').length, 0);
  // an old save with one-button hints still counts them
  const old = new HintLadder(cs.hints, 0, {}, { lastProgressAt: 0, idleFired: [], wrongFired: [], explicitUsed: [{ slot: 'cause', index: 0, at: 1, cost: 10 }] });
  assert.equal(old.hintCount(), 1);
  assert.equal(old.totalCost(), 10);
});

const { pins, cites } = backing(cs);
const correct = { cause: 'fd', sequence: 'true', responsibility: ['git-admins', 'cron', 'oncall', 'account', 'bottleneck', 'cover-seojin', 'cover-jihoon'], cites };

test('scoring: perfect first submission', () => {
  const r = scoreSubmission(cs, correct, { attempt: 1, pinnedKeyClues: 6, hintCost: 0, pins });
  assert.equal(r.allCorrect, true);
  assert.equal(r.base, 300);
  assert.equal(r.evidenceBonus, 30);
  assert.equal(r.total, 330);
  assert.equal(grade(r.total, r.max), 'S');
});

test('scoring: attempt multiplier, evidence cap and hint cost', () => {
  const r = scoreSubmission(cs, correct, { attempt: 3, pinnedKeyClues: 20, hintCost: 40, pins });
  assert.equal(r.multiplier, ATTEMPT_MULTIPLIER[2]);
  assert.equal(r.evidenceBonus, 30);
  assert.equal(r.total, Math.round(300 * 0.7) + 30 - 40);
});

test('scoring: blaming a person fails the responsibility slot even with all factors picked', () => {
  const r = scoreSubmission(cs, { ...correct, responsibility: [...correct.responsibility, 'blame-jihoon'] }, { attempt: 1, pinnedKeyClues: 0, hintCost: 0, pins });
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
  const r = scoreSubmission(cs, { ...correct, cause: 'approve' }, { attempt: 1, pinnedKeyClues: 0, hintCost: 0, pins });
  assert.equal(r.slots.cause?.correct, false);
  assert.deepEqual(r.blamed, ['seojin']);
  assert.equal(r.total, 200);
});

test('scoring never goes below zero', () => {
  const r = scoreSubmission(cs, { cause: null, sequence: null, responsibility: [] }, { attempt: 3, pinnedKeyClues: 0, hintCost: 90 });
  assert.equal(r.total, 0);
});

test('scoring: a right option needs a cited pin that meets the slot\'s evidence kinds', () => {
  const none = scoreSubmission(cs, { ...correct, cites: { ...cites, cause: [] } }, { attempt: 1, pinnedKeyClues: 0, hintCost: 0, pins });
  assert.equal(none.slots.cause?.cite, 'missing');
  assert.equal(none.slots.cause?.optionCorrect, true);
  assert.equal(none.slots.cause?.correct, false);
  assert.equal(none.slots.cause?.points, 0);
  assert.equal(none.allCorrect, false);
  // a pin proving a sequence clue does not back the cause slot
  const off = scoreSubmission(cs, { ...correct, cites: { ...cites, cause: ['test-sequence'] } }, { attempt: 1, pinnedKeyClues: 0, hintCost: 0, pins });
  assert.equal(off.slots.cause?.cite, 'unsupported');
  assert.equal(off.slots.sequence?.cite, 'ok');
  assert.deepEqual(missingCites(cs, { ...correct, cites: { cause: ['test-cause'] } }, pins), ['sequence', 'responsibility']);
});
