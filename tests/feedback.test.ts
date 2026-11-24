// The in-game feedback entry: one exact link to the game repo's GitHub issue chooser, opened in
// a new tab with no referrer and no query string; the lock screen, ❓ help, every debrief and the
// season record carry it (the browser run in scripts/e2e.mjs checks the rendered links).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEEDBACK_URL } from '../src/ui/feedback.ts';
import { setLang, t } from '../src/i18n.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const URL_ = 'https://github.com/s3onghyun/no-handover/issues/new/choose';

test('feedback: the exact chooser URL, no query or fragment', () => {
  assert.equal(FEEDBACK_URL, URL_);
  assert.equal(new URL(FEEDBACK_URL).search, '');
  assert.equal(new URL(FEEDBACK_URL).hash, '');
});

test('feedback: new tab, noopener noreferrer, a spoiler-free label in both languages', () => {
  const f = src('src/ui/feedback.ts');
  assert.match(f, /target: '_blank', rel: 'noopener noreferrer'/);
  setLang('ko');
  assert.equal(t('feedback.link'), '의견·기여');
  assert.doesNotMatch(src('src/ui/feedback.ts') + src('src/i18n.ts'), /no-handover-feedback/);
  assert.equal(t('feedback.line'), '막힌 곳이나 다음 사건 아이디어를 GitHub 이슈로 남겨 주세요.');
  assert.match(t('feedback.aria'), /새 탭/);
  setLang('en');
  assert.match(t('feedback.aria'), /new tab/);
  setLang('ko');
});

test('feedback: placed on the lock screen, in ❓ help, under the debrief and the season record', () => {
  const main = src('src/main.ts');
  assert.match(main, /h\('div\.boot-feedback', null, feedbackLink\(\)\)/);
  assert.match(main, /h\('div\.help-feedback', null, feedbackLink\(\)\)/);
  assert.match(src('src/ui/apps/report.ts'), /feedbackLine\(\),\n    \),\n  \);\n\}/);
  assert.match(src('src/ui/finale.ts'), /feedbackLine\(\),\n    \);/);
});
