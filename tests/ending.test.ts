// The last scene (case `ending`, docs/case-format.md §15): after the final report and before the
// debrief, beats play in order on play time; an act waits for the player; Esc lands the rest quietly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN } from '../src/cases/index.ts';
import { ACT_TIMEOUT_S, ENDING_LEAD_MS, ENDING_TAIL_MS, Game } from '../src/engine/game.ts';
import { applyExpert } from '../src/engine/expert.ts';
import { voiceLines } from '../src/engine/voices.ts';
import type { CaseFile } from '../src/engine/types.ts';

const CASES = CAMPAIGN.flatMap((e) => (e.cs ? [e.cs] : []));
const byId = (id: string) => CASES.find((c) => c.id === id)!;

/** A game whose case just finished (as a last right report does) with its events recorded. */
function finished(cs: CaseFile) {
  const g = new Game(cs, null);
  g.st.unlocked = true;
  const events: string[] = [];
  for (const ev of ['ending', 'ending-note', 'ending-mail', 'ending-act', 'message', 'mail']) g.on(ev, (p) => events.push(`${ev}:${typeof p === 'string' ? p : JSON.stringify(p)}`));
  g.st.finished = true;
  assert.equal(g.startEnding(), true);
  return { g, events };
}
const run = (g: Game, ms: number) => {
  for (let t = 0; t < ms; t += 250) g.tick(250);
};

test('ending: Cases 0-3 each have a last scene whose beats point at real channels, notes, mails, tabs and stickies', () => {
  for (const id of ['case0-wiki', 'case1-cron-env', 'case2-deleted-open', 'friday-1802']) {
    const cs = byId(id);
    assert.ok(cs.ending?.beats.length, `${id}: has a last scene`);
    for (const b of cs.ending!.beats) {
      assert.ok(b.wait >= 0, id);
      if ('message' in b) {
        assert.ok(cs.channels.some((c) => c.id === b.message.channel && c.account === 'me'), `${id}: ${b.message.channel}`);
        assert.ok(b.message.from in cs.people && b.message.from !== cs.player && b.message.from !== cs.owner, `${id}: 은재 does not speak, 도윤 is not voiced`);
      }
      if ('note' in b) {
        const n = cs.notes.find((x) => x.id === b.note);
        assert.ok(n, `${id}: note ${b.note}`);
        if (b.line === undefined) assert.ok(n!.reveal, `${id}: a note beat without a line writes the page's reveal again`);
      }
      if ('mail' in b) assert.ok(cs.mails.some((m) => m.id === b.mail && m.account === 'me'), `${id}: mail ${b.mail}`);
      if ('act' in b) {
        assert.ok(cs.terminalTabs[b.act.tab], `${id}: tab ${b.act.tab}`);
        assert.ok(b.act.sticky === undefined || cs.stickies[b.act.sticky], `${id}: sticky ${b.act.sticky}`);
        assert.doesNotThrow(() => new RegExp(b.act.until));
      }
    }
    // the scene's colleague lines are on the voice list (and so need recorded files: tests/voices.test.ts)
    for (const b of cs.ending!.beats) if ('message' in b) assert.ok(voiceLines(cs).some((l) => l.from === b.message.from && l.text === b.message.text), `${id}: ${b.message.text}`);
    // 숙련자 모드 plays the same scene
    assert.deepEqual(applyExpert(cs).ending, cs.ending);
  }
});

test('ending: beats land in order on play time, then the debrief may open (Case 0)', () => {
  const { g, events } = finished(byId('case0-wiki'));
  assert.equal(g.endingActive(), true);
  run(g, ENDING_LEAD_MS - 300);
  assert.equal(g.st.live.length, 0, 'nothing before the result moment has had its time');
  run(g, 60_000);
  assert.equal(g.endingActive(), false);
  assert.equal(g.st.ending!.done, true);
  assert.equal(g.st.ending!.skipped, false);
  const live = g.st.live.map((m) => `${m.from}:${m.text}`);
  assert.deepEqual(live, ['seojin:봤어요. 맞아요. 위키 살아났어요. 숙제는 오늘 밤 cron으로.', 'jihoon:도윤님!! 위키 살았다면서요 ㅋㅋ 점심 제가 쏩니다 🍕']);
  assert.deepEqual(g.st.noteLines, { today: ['10:33 은재님 회의 끝나고 자리로 오심. 화면에 남은 내 다섯 줄 보시고 고개만 끄덕. 말은 없으셨음. (근데 알 것 같음)'] });
  const order = events.filter((e) => /^(message|ending-note|ending):/.test(e)).map((e) => e.split(':')[0] + (e.startsWith('ending:') ? `:${e.split(':')[1]}` : ''));
  assert.deepEqual(order, ['ending:start', 'message', 'ending-note', 'message', 'ending:done']);
  assert.equal(g.startEnding(), false, 'the scene plays once');
  assert.ok(g.st.log.some((e) => e.type === 'ending' && e.action === 'done'));
});

test('ending: Case 3 waits for 물주기 in 은재\'s tab (prefilled), writes the time in the notebook, then the security mail', () => {
  const { g, events } = finished(byId('friday-1802'));
  run(g, 25_000);
  const act = g.endingAwaits();
  assert.ok(act, 'waiting on the act');
  assert.equal(g.st.tabs[act!.tab].input, '물주기', 'the prompt holds the alias');
  assert.ok(events.includes(`ending-note:${JSON.stringify({ id: 'farewell', quiet: false })}`), 'the farewell memo is written again first');
  assert.ok(events.includes(`ending-mail:${JSON.stringify({ id: 'closing', quiet: false })}`));
  assert.ok(g.st.live.some((m) => m.from === 'seojin' && m.text === '도윤님. 오늘 고마웠어요.'));
  assert.equal(g.st.mailsDelivered.includes('sec-done'), false);
  g.runCommand(0, 'ls');
  assert.ok(g.endingAwaits(), 'another command does not count');
  const r = g.runCommand(0, '물주기');
  assert.ok(r.lines.some((l) => l.text === '🌱'));
  assert.equal(g.endingAwaits(), null);
  assert.match(g.st.noteLines!.today[0], /^\d\d:\d\d 몬스테라 물 줌 🌱$/);
  run(g, 20_000);
  assert.ok(g.st.mailsDelivered.includes('sec-done'), '"서버 키: 해당 없음" — the seed of Case 4');
  assert.match(g.cs.mails.find((m) => m.id === 'sec-done')!.body, /서버 키: 해당 없음/);
  assert.equal(g.endingActive(), false);
});

test('ending: an act nobody does times out (nothing written) and the scene goes on', () => {
  const { g } = finished(byId('friday-1802'));
  run(g, 25_000);
  assert.ok(g.endingAwaits());
  run(g, ACT_TIMEOUT_S * 1000 + ENDING_TAIL_MS + 5_000);
  assert.equal(g.endingActive(), false);
  assert.equal(g.st.noteLines?.today, undefined);
  assert.ok(g.st.mailsDelivered.includes('sec-done'));
  assert.ok(g.st.log.some((e) => e.type === 'ending' && e.action === 'act-timeout'));
});

test('ending: skipping lands every remaining beat at once and quietly (no typing, no act), and the debrief may open', () => {
  const { g, events } = finished(byId('case2-deleted-open'));
  run(g, ENDING_LEAD_MS + 5_200); // the mail opened and 지훈 is typing his first line
  assert.equal(g.typing().length, 1);
  g.skipEnding();
  assert.equal(g.endingActive(), false);
  assert.equal(g.st.ending!.skipped, true);
  assert.equal(g.typing().length, 0);
  assert.equal(g.st.live.length, 3, 'every scene line is in the channel');
  assert.equal(g.st.noteLines!.today.length, 1);
  run(g, 30_000);
  assert.equal(g.st.live.length, 3, 'nothing lands twice');
  const log = g.st.log.filter((e) => e.type === 'message').map((e) => e.reason);
  assert.deepEqual(log, ['ending-skip', 'ending-skip', 'ending-skip']);
  assert.ok(events.includes('ending:done'));
  // Case 3 skipped while waiting: 물주기 is not written for the player
  const c3 = finished(byId('friday-1802')).g;
  run(c3, 25_000);
  c3.skipEnding();
  assert.equal(c3.st.noteLines?.today, undefined);
  assert.ok(c3.st.mailsDelivered.includes('sec-done'));
});

test('ending: a save finished before the scene existed opens on the debrief; a reload mid-scene carries on', () => {
  const g = new Game(byId('case1-cron-env'), null);
  g.st.finished = true;
  assert.equal(g.endingActive(), false);
  const { g: a } = finished(byId('case1-cron-env'));
  run(a, ENDING_LEAD_MS + 500);
  const b = new Game(byId('case1-cron-env'), JSON.parse(a.serialize()));
  assert.equal(b.endingActive(), true);
  run(b, 60_000);
  assert.equal(b.endingActive(), false);
  assert.equal(b.st.noteLines!.today.length, 1);
});
