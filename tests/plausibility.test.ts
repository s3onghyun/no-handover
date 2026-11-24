// The season's one-line plausibility fixes: why 도윤's script sits in 은재's crontab (Case 1), why 도윤
// writes the CTO's report and that the PC is moved over, not returned (Case 3), what the sign means to 도윤,
// who told 은재 before her reply, what 도윤 leaves on the seat, and whose plant it is (Case 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { caseOneCron } from '../src/cases/case-1-cron.ts';
import { caseFriday1802 } from '../src/cases/friday-1802.ts';
import { caseFourKeys } from '../src/cases/case-4-keys.ts';
import { Game } from '../src/engine/game.ts';
import { cueFor, voiceLines } from '../src/engine/voices.ts';

test('Case 1: the homework memo says why the renew script is in 은재\'s crontab', () => {
  const calc = caseOneCron.notes.find((n) => n.id === 'calc')!;
  assert.ok(calc.lines.includes('내 계정은 cron.allow 에 없음 → 은재님 crontab 에 (은재님 OK)'));
});

test('Case 3: 오미래 says why the report is 도윤\'s, and the PC is moved over (이관), not returned', () => {
  const all = JSON.stringify(caseFriday1802);
  assert.ok(!all.includes('PC 반납 정리'), 'no "반납" for 은재\'s PC');
  const brief = caseFriday1802.mails.find((m) => m.body.includes('원인, 경위, 책임 소재'))!;
  assert.match(brief.body, /- 서진님이 휴가 중이고 기록이 은재님 세션에 남아 있어 도윤님께 부탁드립니다\.\n- 은재님 PC 이관 정리와 함께 원인 보고서를 오늘 21:00까지/);
});

test('Case 4: the sign page says what it means to 도윤; the crontab is left for the next person; the plant is the empty seat\'s', () => {
  const signs = caseFourKeys.notes.find((n) => n.id === 'signs')!;
  assert.equal(signs.unlock?.read, '도망쳐요 → 혼자 들고 있지 말라는 뜻?');
  const f = caseFourKeys.finale!;
  assert.match(f.crontab.byChoice.default.text, /^# 다음 사람: 지우지 말아 주세요\n/);
  assert.doesNotMatch(f.crontab.byChoice.nobody.text, /다음 사람/, 'the title ending keeps it to himself');
  assert.equal(f.bad.sub, '3주 뒤. 빈자리의 화분에 물 줄 때를 알려 줄 것은 그 한 줄뿐이었다. crontab -r 은 묻지 않고 전부 지운다.');
});

test('Case 4: 지훈 says he told 은재 just before her reply — voiced, once, and only where a reply comes', () => {
  const before = caseFourKeys.finale!.reply.before!;
  assert.equal(before.text, '은재 선배한테 v5 얘기 다 했어요 ㅋㅋ 🙏');
  const cue = cueFor(caseFourKeys, before.from, before.text);
  assert.equal(cue, 'voice.jihoon-5e4ed3ea');
  assert.ok(voiceLines(caseFourKeys).some((l) => l.cue === cue && l.from === 'jihoon'));
  for (const x of ['ogg', 'mp3']) assert.ok(existsSync(new URL(`../public/audio/voice/${cue}.${x}`, import.meta.url)), `${cue}.${x} shipped`);
  const g = new Game(caseFourKeys, null);
  g.finaleMessage(before);
  g.finaleMessage(before);
  assert.equal(g.st.live.filter((m) => m.text === before.text).length, 1, 'once, even if the step runs again');
  // the title ending 「인수인계 없음」 has no reply, so no DM before it
  assert.equal(caseFourKeys.finale!.reply.first.nobody, undefined);
});

test('tool guide: marks that hid on their timer come first, in the order they hid; junk in storage is ignored', async () => {
  const { guideOrder, parseMissed } = await import('../src/engine/tour.ts');
  const steps = [{ id: 'terminal' }, { id: 'messenger' }, { id: 'mail' }, { id: 'hint' }];
  assert.deepEqual(guideOrder(steps, ['mail', 'gone', 'messenger']).map((s) => s.id), ['mail', 'messenger', 'terminal', 'hint']);
  assert.deepEqual(guideOrder(steps, []).map((s) => s.id), ['terminal', 'messenger', 'mail', 'hint']);
  assert.deepEqual(parseMissed('["mail","mail",3]'), ['mail', '3']);
  assert.deepEqual(parseMissed('{oops'), []);
  assert.deepEqual(parseMissed(null), []);
});

test('finale record: says where 은재\'s drafts are while some are unread', async () => {
  const { DRAFTS_HOW } = await import('../src/ui/finale.ts');
  assert.match(DRAFTS_HOW, /「은재 메일 · 이 PC」 → 임시보관함/);
  assert.ok(caseFourKeys.mails.some((m) => m.account === 'pc' && m.folder === 'drafts' && m.password), 'the drafts are where it says');
});
