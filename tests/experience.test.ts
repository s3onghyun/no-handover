// First-run choice "터미널이 익숙해요 / 처음이에요": parsing, when to ask, what each choice turns off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPERIENCE_KEY, experienceRules, parseExperience, shouldAskExperience } from '../src/engine/experience.ts';
import { Game } from '../src/engine/game.ts';
import { caseZeroWiki } from '../src/cases/case-0-wiki.ts';

test('experience: only the two choices parse; anything else means "not asked yet"', () => {
  assert.equal(EXPERIENCE_KEY, 'no-handover:experience');
  assert.equal(parseExperience('familiar'), 'familiar');
  assert.equal(parseExperience('new'), 'new');
  for (const raw of [null, undefined, '', 'yes', '"familiar"', 'FAMILIAR']) assert.equal(parseExperience(raw), null, String(raw));
});

test('experience: asked once on a fresh profile, never over a case in progress', () => {
  assert.equal(shouldAskExperience(null, false), true);
  assert.equal(shouldAskExperience(null, true), false, 'a resumed case keeps its old behaviour');
  assert.equal(shouldAskExperience('new', false), false);
  assert.equal(shouldAskExperience('familiar', false), false);
});

test('experience: familiar folds the coach marks and holds automatic windows; new and unknown keep the tour', () => {
  assert.deepEqual(experienceRules('familiar'), { coachMarks: false, autoWindows: false });
  assert.deepEqual(experienceRules('new'), { coachMarks: true, autoWindows: true });
  assert.deepEqual(experienceRules(null), { coachMarks: true, autoWindows: true });
});

test('experience: the playtest summary carries the last choice', () => {
  const g = new Game(caseZeroWiki);
  const summary = () => (g.playtestReport() as { summary: { experience: unknown } }).summary.experience;
  assert.equal(summary(), null);
  g.log('experience', { choice: 'new', via: 'boot' });
  g.log('experience', { choice: 'familiar', via: 'help' });
  assert.equal(summary(), 'familiar');
});
