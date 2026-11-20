// Web-escape polish (analysis §9 items 4, 5, 6, 8, 11, 12, 14): ask a colleague, the three-step
// hint panel, hints as a record, the procedural room tone and key clicks, the typing indicator and
// the written-then-deleted line, bundled report feedback, the spoiler-free result card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cited } from './case-integrity.ts';
import { ASK_BEAT_MS, Game, typingMs } from '../src/engine/game.ts';
import { DEFAULT_ANSWER_COST, slotAnswer } from '../src/engine/hintpanel.ts';
import { feedbackMode, wrongReply } from '../src/engine/scoring.ts';
import { fmtDuration, playRecord, recordLine, resultCard } from '../src/engine/record.ts';
import { renderRoomTone, rmsDb, ROOMTONE_DEFAULTS } from '../src/audio/roomtone.ts';
import { peakDb, AudioManager, type CtxLike } from '../src/audio/audio.ts';
import { MANIFEST, type CueDef } from '../src/audio/manifest.ts';
import { caseFriday1802 as c3 } from '../src/cases/friday-1802.ts';
import { caseZeroWiki as c0 } from '../src/cases/case-0-wiki.ts';

const run = (g: Game, cmd: string, tab = 0) => g.runCommand(tab, cmd);
const tickFor = (g: Game, ms: number, step = 100) => {
  for (let t = 0; t < ms; t += step) g.tick(step);
};

// ------------------------------------------------------------------ (b) three-step hint panel

test('hint panel: 요약 → 방향 → 정답 in order, per slot; summary lists found clues and is free', () => {
  const g = new Game(c3);
  const cause = () => g.hintPanel().find((s) => s.key === 'cause')!;
  assert.deepEqual(g.hintPanel().map((s) => s.key), ['cause', 'sequence', 'responsibility'], 'Case 3: slots only (no checklist section)');
  assert.equal(g.openHint('cause', 'direction'), null, '방향 waits for 요약');
  assert.equal(g.openHint('cause', 'answer'), null, '정답 waits too');
  assert.ok(g.openHint('cause', 'summary'));
  assert.deepEqual(cause().summary, [], 'nothing found yet');
  assert.equal(g.hintCount(), 0, 'the summary is free');
  run(g, 'crontab -l');
  assert.ok(cause().summary.some((l) => l.startsWith('crontab -l')), 'live summary from found clues');
  assert.equal(cause().answerReady, false, '정답 needs a 방향 first');
  // 방향: the first line whose clues are not all found (c_cron is found, so the history line comes next)
  const d = g.openHint('cause', 'direction')!;
  assert.match(d.text, /history의 4984~4990/);
  assert.equal(g.hintCount(), 1);
  assert.equal(cause().answerReady, true);
  const a = g.openHint('cause', 'answer')!;
  const [pick, ...rest] = a.text.split('\n');
  assert.equal(pick, c3.accusation.slots[0].options.find((o) => o.correct)!.text, '정답 names the correct option first');
  assert.ok(rest.includes(c3.hints.answers!.cause!), 'then the specifics the option leaves out');
  assert.match(rest.at(-1)!, /^📌 근거로 인정: .*자원 한도/, 'and the evidence the slot accepts');
  assert.equal(a.cost, DEFAULT_ANSWER_COST);
  assert.equal(g.openHint('cause', 'answer'), null, 'once');
  assert.equal(g.hintCount(), 2);
  assert.ok(g.st.log.some((e) => e.type === 'rung3' && e.rung === 'answer' && e.key === 'cause'));
  assert.ok(g.st.log.some((e) => e.type === 'hint-summary'));
});

test('hint panel: every direction can be opened one by one; multi-slot answer lists the factors', () => {
  const g = new Game(c3);
  g.openHint('responsibility', 'summary');
  const n = c3.hints.explicit.filter((x) => x.slot === 'responsibility').length;
  for (let i = 0; i < n; i++) assert.ok(g.openHint('responsibility', 'direction'));
  assert.equal(g.openHint('responsibility', 'direction'), null);
  assert.equal(g.hintPanel().find((s) => s.key === 'responsibility')!.directions.length, n);
  const ans = slotAnswer(c3, c3.accusation.slots[2]);
  assert.match(ans, /git-admins/);
  assert.doesNotMatch(ans, /범인이다/, 'blame options are not part of the answer');
});

test('hint panel (Case 0): the current checklist item comes first; 방향 names the tool, 정답 the command', () => {
  const g = new Game(c0);
  const first = g.hintPanel()[0];
  assert.equal(first.key, 'obj:history');
  assert.equal(first.kind, 'objective');
  g.openHint('obj:history', 'summary');
  assert.equal(g.openHint('obj:history', 'direction')!.text, c0.opening!.objectives.items[0].hint);
  assert.match(g.openHint('obj:history', 'answer')!.text, /Enter/);
  run(g, 'history');
  const now = g.hintPanel()[0];
  assert.equal(now.key, 'obj:df', 'the section follows the checklist');
  assert.equal(now.summaryOpen, false, 'fresh steps for the new item');
  g.openHint('obj:df', 'summary');
  assert.deepEqual(g.hintPanel()[0].summary, ['✓ Enter — 은재님 history 보기']);
  const df = c0.opening!.objectives.items[1];
  assert.equal(g.openHint('obj:df', 'direction')!.text, df.direction, '방향 is the item\'s own direction, not the checklist nudge');
  assert.notEqual(df.direction, df.hint);
  assert.equal(g.openHint('obj:df', 'answer')!.text, '터미널에 그대로 치세요: df -h');
  assert.equal(g.hintCount(), 4);
  assert.equal(g.ladder.totalCost(), 0, 'checklist hints never cost points');
});

// ------------------------------------------------------------------ (c) hints as a record

test('hint record: no score penalty by default; senior mode (?senior=1) takes the cost again', () => {
  const sub = { cause: 'fd', sequence: 'true', responsibility: ['git-admins', 'cron', 'oncall', 'account', 'bottleneck', 'cover-seojin', 'cover-jihoon'] };
  const open = (g: Game) => {
    g.openHint('cause', 'summary');
    g.openHint('cause', 'direction');
    g.openHint('cause', 'answer');
  };
  const g = new Game(c3);
  open(g);
  const r = g.submit(cited(g, sub))!;
  assert.equal(r.hintCost, 0);
  assert.equal(r.hints, 2);
  assert.equal(r.total, 300);
  const rec = playRecord(g);
  assert.equal(rec.hints, 2);
  assert.equal(rec.solved, true);
  assert.equal(rec.senior, false);
  const s = new Game(c3, null, { senior: true });
  open(s);
  const rs = s.submit(cited(s, sub))!;
  assert.equal(rs.hintCost, 10 + DEFAULT_ANSWER_COST);
  assert.equal(rs.total, 300 - 40);
  assert.equal(playRecord(s).senior, true);
});

test('hint record: time and commands stop at the finish; "힌트 단계 N개 · 소요 · 명령 수"', () => {
  const g = new Game(c0);
  run(g, 'history');
  tickFor(g, 65_000, 1000);
  run(g, 'df -h');
  g.submit(cited(g, { cause: 'disk', sequence: 'true', responsibility: [] }));
  tickFor(g, 30_000, 1000);
  run(g, 'pwd'); // after the finish: not counted
  const r = playRecord(g);
  assert.equal(r.commands, 2);
  assert.equal(r.playMs, 65_000);
  assert.equal(r.hints, 0);
  assert.equal(recordLine(r), '힌트 단계 0개 · 1분 05초 · 명령 2개');
  assert.equal(fmtDuration(48_400), '48초');
  assert.deepEqual((g.playtestReport() as { summary: { record: unknown } }).summary.record, r);
});

// ------------------------------------------------------------------ (g) result card

test('result card: title, case, time, commands, hints, badge — and nothing from the solution', () => {
  const g = new Game(c3);
  run(g, 'crontab -l');
  g.submit(cited(g, { cause: 'fd', sequence: 'true', responsibility: ['git-admins', 'cron', 'oncall', 'account'] }));
  const card = resultCard(g, 'Case 3');
  assert.equal(card.caseTitle, c3.title);
  assert.equal(card.headline, '인수인계 완료');
  assert.equal(card.badge, '힌트 단계 0');
  assert.deepEqual(card.stats.map((s) => s.label), ['소요', '명령', '힌트 단계', '제출']);
  const text = JSON.stringify(card);
  const spoilers = [
    ...c3.accusation.slots.flatMap((s) => s.options.map((o) => o.text)),
    ...c3.clues.map((c) => c.label),
    c3.debrief.headline,
    c3.debrief.principle,
    'LimitNOFILE',
    'crontab',
    'too many open files',
  ];
  for (const s of spoilers) assert.ok(!text.includes(s), `no spoiler: ${s.slice(0, 40)}`);
  const h = new Game(c3);
  h.openHint('cause', 'summary');
  h.openHint('cause', 'direction');
  h.submit(cited(h, { cause: 'fd', sequence: 'true', responsibility: ['git-admins', 'cron', 'oncall', 'account'] }));
  assert.equal(resultCard(h, 'Case 3').badge, null, 'the badge is only for zero hints');
});

// ------------------------------------------------------------------ (a) ask a colleague

test('ask (Case 3): the next idle nudge arrives at once from its own colleague, free, logged; the timer restarts', () => {
  const g = new Game(c3);
  tickFor(g, 30_000, 1000);
  const where = g.ask('뭐부터 봐요?')!;
  assert.deepEqual(where, { channel: 'me-dm-jihoon', from: 'jihoon' });
  assert.equal(g.st.live.at(-1)?.from, 'doyun', "the player's quick reply shows first");
  assert.equal(g.st.live.at(-1)?.text, '뭐부터 봐요?');
  tickFor(g, ASK_BEAT_MS + typingMs(c3.hints.idle[0].askText!) + 100);
  assert.equal(g.st.live.at(-1)?.text, c3.hints.idle[0].askText, 'answered in the asked voice');
  assert.ok(g.st.log.some((e) => e.type === 'rung2' && e.why === 'ask' && e.nudge === 'idle-1'));
  assert.equal(g.hintCount(), 0, 'asking is free');
  assert.equal(playRecord(g).asks, 1);
  // the timed nudge still exists: it waits a full interval from the ask
  assert.equal(g.ladder.state.lastProgressAt, 30_000);
  assert.equal(g.ladder.msUntilNudge(g.st.playMs), 6 * 60_000 - (g.st.playMs - 30_000));
  // next ask: Seojin's line, in her channel
  assert.equal(g.ask('막혔어요')!.from, 'seojin');
  tickFor(g, 3000);
  assert.equal(g.st.live.at(-1)?.text, c3.hints.idle[1].text);
});

test('ask: nudges already covered by found clues are skipped; with none left, `ask.none` answers', () => {
  const g = new Game(c3);
  run(g, 'crontab -l');
  run(g, 'fds');
  run(g, 'systemctl show payment-api -p LimitNOFILE');
  const w = g.ask('막혔어요')!;
  assert.equal(w.channel, c3.hints.ask!.none.channel);
  tickFor(g, 3000);
  assert.equal(g.st.live.at(-1)?.text, c3.hints.ask!.none.text);
  assert.equal(g.st.log.filter((e) => e.type === 'rung2').length, 0);
});

test('ask (Case 0): while the checklist is open, 지훈 names the current step and points at history / 💡; nothing after the finish', () => {
  const g = new Game(c0);
  run(g, 'history');
  tickFor(g, 3000);
  const w = g.ask('뭐부터 봐요?')!;
  assert.deepEqual(w, { channel: 'me-dm-jihoon', from: 'jihoon' });
  tickFor(g, 3000);
  assert.equal(g.st.live.at(-1)?.text, '지금은 디스크 차례예요!! 명령은 은재 선배 history 에 있고, 그래도 모르겠으면 💡 ㅋㅋ 🙏');
  g.submit(cited(g, { cause: 'disk', sequence: 'true', responsibility: [] }));
  assert.equal(g.ask('뭐부터 봐요?'), null);
});

// ------------------------------------------------------------------ (e) typing indicator + written-then-deleted

test('typing indicator: 1–2 s before a nudge or rail line, then the message; the player never "types"', () => {
  assert.equal(typingMs('ㅋ'), 1020);
  assert.equal(typingMs('x'.repeat(200)), 2000);
  assert.equal(typingMs(''), 1000);
  const g = new Game(c0);
  let events = 0;
  g.on('typing', () => events++);
  run(g, 'history'); // the rail queues 지훈's line for the df step
  const text = c0.opening!.objectives.items[1].say!;
  const due = g.st.playMs + 300 + typingMs(text);
  assert.deepEqual(g.typing(), [], 'a short beat first');
  tickFor(g, 300 + 50, 50);
  assert.deepEqual(g.typing(), [{ channel: 'me-dm-jihoon', from: 'jihoon' }]);
  assert.ok(events >= 1, "'typing' is emitted when it starts");
  const before = g.st.live.length;
  tickFor(g, due - g.st.playMs - 50, 50);
  assert.equal(g.st.live.length, before, 'still typing');
  tickFor(g, 100, 50);
  assert.equal(g.st.live.at(-1)?.text, text);
  assert.deepEqual(g.typing(), []);
  // the player's own question in an ask has no indicator
  g.ask('뭐부터 봐요?');
  assert.ok(!g.typing().some((x) => x.from === 'doyun'));
});

test('typing indicator: trigger messages with a delay show it during their last 1–2 s', () => {
  const g = new Game(c0);
  run(g, 'journalctl -u wiki --since "2026-11-09 21:00" --until "2026-11-09 21:20"'); // c0_start → 지훈 in 8 s
  tickFor(g, 6000, 100);
  assert.ok(!g.typing().length, 'not yet');
  tickFor(g, 1200, 100);
  assert.deepEqual(g.typing(), [{ channel: 'me-dm-jihoon', from: 'jihoon' }]);
});

test("written, then deleted: 지훈's '설마' line in Case 3 appears and is deleted a few seconds later", () => {
  const g = new Game(c3);
  run(g, 'cd /srv/git/pay-config.git', 3);
  run(g, 'git log --format=fuller -1', 3); // s_commit
  tickFor(g, 6500, 250);
  const m = g.st.live.find((x) => x.text.includes('설마'))!;
  assert.ok(m, 'the line lands');
  assert.equal(m.deletedAt, undefined);
  tickFor(g, 3200, 250);
  assert.ok(m.deletedAt !== undefined, 'then the sender deletes it');
  assert.ok(g.st.log.some((e) => e.type === 'unsend' && e.from === 'jihoon'));
  tickFor(g, 5000, 250);
  assert.equal(g.st.live.at(-1)?.text, '아 아니에요 ㅋㅋ 도윤님 화이팅!! 👍');
  // a reload keeps it deleted
  const g2 = new Game(c3, JSON.parse(g.serialize()));
  assert.ok(g2.st.live.find((x) => x.id === m.id)!.deletedAt !== undefined);
});

// ------------------------------------------------------------------ (f) bundled confirmation

test('bundled confirmation: Case 3 never says which slot or how many; Case 0 keeps per-slot feedback', () => {
  assert.equal(feedbackMode(c3), 'bundled');
  assert.equal(feedbackMode(c0), 'per-slot');
  const g = new Game(c3);
  const oneWrong = g.submit(cited(g, { cause: 'fd', sequence: 'sneaky', responsibility: ['git-admins', 'cron', 'oncall', 'account'] }))!;
  const allWrong = (() => { const x = new Game(c3); return x.submit(cited(x, { cause: 'disk', sequence: 'sneaky', responsibility: ['blame-eunjae'] }))!; })();
  const a = wrongReply(c3, oneWrong);
  const b = wrongReply(c3, allWrong);
  assert.equal(a, b, 'one wrong slot and three wrong slots read the same');
  assert.match(a, /어딘가/);
  for (const s of c3.accusation.slots) assert.ok(!a.includes(s.title.split(' ')[0]), `no slot name (${s.title})`);
  assert.doesNotMatch(a, /\d/, 'no count');
  const z = (() => { const x = new Game(c0); return x.submit(cited(x, { cause: 'disk', sequence: 'slow', responsibility: [] }))!; })();
  assert.equal(wrongReply(c0, z), '2칸 중 1칸이 로그랑 안 맞아요. 다시요.');
});

// ------------------------------------------------------------------ (d) sound

test('room tone: non-silent, bounded level, stereo, seamless at the loop point, deterministic', () => {
  const SR = 22050;
  const [l, r] = renderRoomTone(SR);
  assert.equal(l.length, ROOMTONE_DEFAULTS.seconds * SR);
  assert.equal(r.length, l.length);
  for (const ch of [l, r]) {
    const rms = rmsDb(ch);
    assert.ok(rms > -32 && rms < -20, `rms ${rms.toFixed(1)} dBFS`);
    assert.ok(peakDb(ch) <= ROOMTONE_DEFAULTS.peakDb + 0.01, `peak ${peakDb(ch).toFixed(1)} dBFS`);
    let maxStep = 0;
    for (let i = 1; i < ch.length; i++) maxStep = Math.max(maxStep, Math.abs(ch[i] - ch[i - 1]));
    const seam = Math.abs(ch[0] - ch[ch.length - 1]);
    assert.ok(seam <= maxStep, `loop seam ${seam} within the largest natural step ${maxStep}`);
    let mean = 0;
    for (const v of ch) mean += v;
    assert.ok(Math.abs(mean / ch.length) < 1e-3, 'no DC');
  }
  let diff = 0;
  for (let i = 0; i < l.length; i += 97) diff += Math.abs(l[i] - r[i]);
  assert.ok(diff > 0, 'left and right differ (stereo)');
  assert.deepEqual(renderRoomTone(SR, { seconds: 1 })[0].slice(0, 64), renderRoomTone(SR, { seconds: 1 })[0].slice(0, 64));
});

function fakeCtx() {
  const sources: { loop: boolean; channels: number; rate: number }[] = [];
  const pans: number[] = [];
  const param = () => ({ value: 1, setTargetAtTime: () => {} });
  const node = () => ({ connect: () => {}, disconnect: () => {} });
  const ctx: CtxLike = {
    currentTime: 0,
    sampleRate: 8000,
    state: 'running',
    destination: {},
    onstatechange: null,
    resume: async () => {},
    createGain: () => ({ ...node(), gain: param() }),
    createStereoPanner: () => {
      const p = { ...node(), pan: { value: 0, setTargetAtTime: () => {} } };
      queueMicrotask(() => pans.push(p.pan.value));
      return p;
    },
    createBufferSource: () => {
      const s = {
        ...node(),
        buffer: null as unknown as { channels?: number },
        loop: false,
        playbackRate: { value: 1 },
        start: () => sources.push({ loop: s.loop, channels: s.buffer?.channels ?? 1, rate: s.playbackRate.value }),
        stop: () => {},
      };
      return s as never;
    },
    createBuffer: (c: number, len: number, sr: number) => {
      const data = Array.from({ length: c }, () => new Float32Array(len));
      return { channels: c, duration: len / sr, getChannelData: (i: number) => data[i] } as never;
    },
    decodeAudioData: async () => ({ duration: 2 }),
  };
  return { ctx, sources, pans };
}

test('audio: amb.office without a file loops the synthesised room tone (stereo, no pitch wobble)', async () => {
  const f = fakeCtx();
  const a = new AudioManager(MANIFEST, { createContext: () => f.ctx, fetchBytes: async () => null });
  a.unlock();
  assert.equal(await a.source('amb.office'), 'synth');
  a.loop('amb.office');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(a.isLooping('amb.office'), true);
  assert.deepEqual(a.history.find((h) => h.id === 'amb.office'), { id: 'amb.office', status: 'synth' });
  assert.deepEqual(f.sources.at(-1), { loop: true, channels: 2, rate: 1 });
});

test('audio: music never loops by default (stings are one-shots), only with musicLoops', async () => {
  const M: Record<string, CueDef> = { 'music.bed': { class: 'music', loop: true, where: '' }, 'amb.a': { class: 'ambience', loop: true, where: '' } };
  const f = fakeCtx();
  const a = new AudioManager(M, { createContext: () => f.ctx, fetchBytes: async () => new ArrayBuffer(8) });
  a.unlock();
  a.loop('music.bed');
  a.loop('amb.a');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(a.isLooping('music.bed'), false);
  assert.ok(a.history.some((h) => h.id === 'music.bed' && h.status === 'off'));
  assert.equal(a.isLooping('amb.a'), true, 'ambience still loops');
  await a.play('music.bed');
  assert.equal(f.sources.at(-1)!.loop, false, 'a music file marked loop plays once');
  const g = fakeCtx();
  const b = new AudioManager(M, { createContext: () => g.ctx, fetchBytes: async () => new ArrayBuffer(8), musicLoops: true });
  b.unlock();
  b.loop('music.bed');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(b.isLooping('music.bed'), true);
});

test('audio: key-click variants exist and play with a stereo pan', async () => {
  const keys = Object.keys(MANIFEST).filter((id) => /^sfx\.key-\d$/.test(id));
  assert.equal(keys.length, 3);
  const f = fakeCtx();
  const a = new AudioManager(MANIFEST, { createContext: () => f.ctx, fetchBytes: async () => null });
  a.unlock();
  await a.play('sfx.key-2', { pan: 0.2 });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(f.pans, [0.2]);
  await a.play('sfx.key-1');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(f.pans.length, 1, 'no panner without a pan');
});

// ------------------------------------------------------------------ panel opens vs hint steps

test('hint record: opening the 💡 panel is counted apart from hint steps and never touches the record line or badge', () => {
  const g = new Game(c3);
  // the UI logs one 'hint-panel' per opening (tray, report slot, `hint`); a summary is free too
  g.log('hint-panel', { focus: null });
  g.log('hint-panel', { focus: 'cause' });
  g.openHint('cause', 'summary');
  g.log('hint-panel', { focus: null });
  let r = playRecord(g);
  assert.equal(r.panelOpens, 3);
  assert.equal(r.hints, 0, 'opening the panel and reading the summary are not hint steps');
  assert.match(recordLine(r), /^힌트 단계 0개 · /);
  assert.ok(!recordLine(r).includes('3'), 'panel opens stay out of the record line');
  g.submit(cited(g, { cause: 'fd', sequence: 'true', responsibility: ['git-admins', 'cron', 'oncall', 'account'] }));
  assert.equal(resultCard(g, 'Case 3').badge, '힌트 단계 0', 'panel opens do not cost the badge');
  tickFor(g, 2000, 1000);
  g.log('hint-panel', { focus: null }); // after the finish: not counted
  r = playRecord(g);
  assert.equal(r.panelOpens, 3);
  const d = new Game(c3);
  d.log('hint-panel', { focus: null });
  d.openHint('cause', 'summary');
  d.openHint('cause', 'direction');
  assert.deepEqual([playRecord(d).panelOpens, playRecord(d).hints], [1, 1]);
});
