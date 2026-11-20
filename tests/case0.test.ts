// Case 0 (tutorial) integrity, reachability with the tutorial's own command list, the rail,
// scoring with two slots and unlimited submissions, and the campaign ladder rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cited } from './case-integrity.ts';
import { Game } from '../src/engine/game.ts';
import { HOLD_MS } from '../src/engine/hints.ts';
import { Campaign, parseProgress } from '../src/engine/campaign.ts';
import { caseZeroWiki as cs, WIKI_LOG_BYTES } from '../src/cases/case-0-wiki.ts';
import { caseFriday1802 } from '../src/cases/friday-1802.ts';
import { CAMPAIGN } from '../src/cases/index.ts';

const out = (g: Game, cmd: string) => g.runCommand(0, cmd).lines.map((l) => l.text);

test('case 0 integrity: references resolve', () => {
  const people = new Set(Object.keys(cs.people));
  const channels = new Set(cs.channels.map((c) => c.id));
  const mails = new Set(cs.mails.map((m) => m.id));
  const notes = new Set(cs.notes.map((n) => n.id));
  const clues = new Set(cs.clues.map((c) => c.id));
  const objectives = new Set(cs.opening!.objectives.items.map((i) => i.id));
  for (const ev of cs.timeline)
    for (const e of ev.emits ?? []) {
      if ('host' in e) assert.equal(e.host, 'wiki-01');
      if (e.kind === 'message') assert.ok(channels.has(e.channel) && people.has(e.from), `${e.channel} ${e.from}`);
    }
  for (const n of [...cs.hints.idle, ...Object.values(cs.hints.wrong)]) {
    assert.equal(cs.channels.find((c) => c.id === n.channel)?.account, 'me', n.id);
    assert.ok(people.has(n.from));
    for (const c of n.unlessClues ?? []) assert.ok(clues.has(c), c);
  }
  for (const tr of cs.triggers) {
    if ('clue' in tr.when) assert.ok(clues.has(tr.when.clue));
    if ('allClues' in tr.when) tr.when.allClues.forEach((c) => assert.ok(clues.has(c), c));
    for (const a of tr.actions) {
      if ('mail' in a) assert.ok(mails.has(a.mail));
      if ('note' in a) assert.ok(notes.has(a.note));
      if ('message' in a) assert.ok(channels.has(a.message.channel));
    }
  }
  assert.ok(mails.has(cs.debrief.closingMail) && mails.has(cs.opening!.briefing.mail));
  assert.ok(people.has(cs.opening!.briefing.caller));
  for (const i of cs.desktop!.icons) if (i.after) assert.ok(objectives.has(i.after), i.after);
  assert.equal(cs.desktop!.icons.filter((i) => !i.after).length, 3, 'three icons at first');
  assert.ok(channels.has(cs.rail!.channel) && people.has(cs.rail!.from));
  for (const c of cs.debrief.cast ?? []) assert.ok(people.has(c.who));
  // two report slots, each with exactly one right answer; unlimited submissions
  assert.deepEqual(cs.accusation.slots.map((s) => s.id), ['cause', 'sequence']);
  for (const s of cs.accusation.slots) assert.equal(s.options.filter((o) => o.correct).length, 1, s.id);
  assert.equal(cs.accusation.maxSubmissions, 0);
  // Eunjae never speaks live (characters.md §8-3): no nudge, trigger or rail line in their voice
  assert.ok(![...cs.hints.idle, ...Object.values(cs.hints.wrong)].some((n) => n.from === 'eunjae'));
  assert.ok(!cs.triggers.some((t) => t.actions.some((a) => 'message' in a && a.message.from === 'eunjae')));
  assert.notEqual(cs.rail!.from, 'eunjae');
});

test('case 0 tutorial: the briefing is 20 s or less; five checklist items; nudges after 2 minutes', () => {
  const op = cs.opening!;
  const chars = op.briefing.lines.reduce((a, l) => a + [...l.text].length, 0);
  const pauses = op.briefing.lines.reduce((a, l) => a + (l.pauseMs ?? 700), 0);
  const secs = (3000 + 2200 + chars * 72 + pauses + 4200 + 1300) / 1000; // same arithmetic as src/ui/briefing.ts
  assert.ok(secs <= 20, `briefing ${secs}s`);
  assert.equal(op.objectives.items.length, 5);
  assert.equal(cs.hints.idleMinutes, 2);
  assert.equal(caseFriday1802.hints.idleMinutes, 6, 'main cases nudge after 6 minutes');
  assert.ok(cs.hints.explicit.every((h) => h.cost <= 5), 'rung 3 is cheap in the tutorial');
});

test('case 0: the pre-typed first command succeeds and shows the clue lines', () => {
  const g = new Game(cs);
  assert.equal(g.tab(0).input, 'history');
  const lines = out(g, g.tab(0).input);
  assert.ok(lines.some((l) => /# \/var 97%\. 디스크 먼저/.test(l)));
  assert.ok(g.st.log.some((e) => e.type === 'rung1'), 'history reaches rung 1');
  assert.ok(g.objectives.isDone('history'));
  assert.equal(g.st.log.filter((e) => e.type === 'friction').length, 0, 'no error on the first Enter');
});

test('case 0: every key clue is reachable with only the tutorial commands, in README order', () => {
  const g = new Game(cs);
  const allow = new Set(cs.shell!.allow);
  const cmds = ['history', 'df -h', 'du -sh /var/log/*', 'tail -n 20 /var/log/wiki/wiki.log', 'systemctl status wiki', 'journalctl -u wiki'];
  for (const c of cmds) {
    assert.ok(allow.has(c.split(' ')[0]), c);
    out(g, c);
  }
  for (const c of cs.clues.filter((x) => x.key)) assert.ok(c.id in g.st.clues, c.id);
  assert.ok(g.causeSolved());
  // all five objectives complete with two pins
  g.pin({ kind: 'line', text: '/dev/sdb1        20G   19G     0 100% /var', source: 'wiki-01 · df -h' });
  g.pin({ kind: 'line', text: "Nov 10 08:47:41 wiki-01 wiki-server[51875]: OSError: [Errno 28] No space left on device: '/var/log/wiki/wiki.log'", source: 'wiki-01' });
  assert.ok(g.objectives.allDone(), JSON.stringify(g.st.objectives.done));
});

test('case 0 shell: du sizes, ls -lh, big-file cat, and in-world refusals', () => {
  const g = new Game(cs);
  const du = out(g, 'du -sh /var/log/*');
  assert.ok(du.includes('11G\t/var/log/wiki'), du.join('\n'));
  assert.ok(out(g, 'du -sh /var').some((l) => /^19G\t\/var$/.test(l)), 'du of /var agrees with df Used 19G');
  assert.ok(out(g, 'ls -l /var/log/wiki').some((l) => l.includes(` ${WIKI_LOG_BYTES} `)));
  assert.ok(out(g, 'ls -lh /var/log/wiki').some((l) => /\s11G\s.*wiki\.log$/.test(l)));
  const cat = out(g, 'cat /var/log/wiki/wiki.log');
  assert.match(cat[0], /파일이 너무 커요 \(11G\)/);
  assert.ok(cat.some((l) => l.includes('tail -n 20')));
  // a real tool outside the lesson answers in-world; a typo still gets a suggestion from the lesson's list
  for (const c of ['ps aux', 'sudo cat /etc/shadow', 'crontab -l', 'vim README.txt', 'rm -rf /var/log/wiki']) {
    const r = out(g, c);
    assert.match(r[0], /오늘 연습 범위 밖/, c);
  }
  assert.match(out(g, 'dff -h').join('\n'), /혹시 'df' 인가요\?/);
  assert.match(out(g, 'help').join('\n'), /Case 0 튜토리얼/);
  assert.ok(out(g, 'man du').some((l) => l.includes('du -sh /var/log/*')));
  assert.equal(out(g, 'systemctl status').find((l) => l.includes('State:'))?.trim(), 'State: degraded');
});

test('case 0 rail: Jihoon names the next step (never the command) and redirects once per step', () => {
  const g = new Game(cs);
  const say = () => g.st.live.filter((m) => m.from === 'jihoon').map((m) => m.text);
  const step = (c: string) => {
    g.runCommand(0, c);
    for (let i = 0; i < 3; i++) g.tick(1000);
  };
  step('history');
  assert.match(say().at(-1)!, /순서/);
  step('ls');
  assert.equal(say().at(-1), '그건 나중에요 ㅋㅋ 디스크부터 봐요!!');
  const n = say().length;
  step('pwd'); // quiet
  step('cat README.txt'); // second off-rail command on the same step: no second redirect
  assert.equal(say().length, n);
  step('df -h');
  assert.match(say().at(-1)!, /누가 채운/);
  assert.ok(g.st.log.some((e) => e.type === 'rail-redirect' && e.item === 'df'));
});

test('case 0 nudges: checklist, messenger and notes never spell out the command path; 💡 carries it', () => {
  const items = cs.opening!.objectives.items;
  // the commands of the lesson (with their arguments) that only Eunjae's records and 💡 may name
  const cmd = /\b(df -h|du -sh|tail -n|systemctl status|journalctl -u)\b/;
  const said: string[] = [];
  // (the pins item names lines already on screen, not a step to type; its wording belongs to the evidence rules)
  for (const i of items.filter((x) => x.id !== 'pins')) said.push(i.text, i.hint ?? '', i.say ?? '', i.next ?? '');
  said.push(...cs.opening!.objectives.after, cs.rail!.offRail, cs.rail!.done ?? '', cs.hints.ask!.rail!);
  for (const n of cs.hints.idle) said.push(n.text);
  for (const t of cs.triggers) for (const a of t.actions) if ('message' in a) said.push(a.message.text);
  for (const n of cs.notes) said.push(...n.lines, n.reveal ?? '');
  for (const t of said) assert.doesNotMatch(t, cmd, t);
  // one nudge per step, and the ladder behind it: 방향 names the tool, 정답 the command
  for (const i of items.filter((x) => ['df', 'tail', 'service'].includes(x.id))) {
    assert.match(i.direction!, cmd, i.id);
    assert.match(i.answer!, cmd, i.id);
  }
  // the exact path stays in Eunjae's records
  const readme = cs.hosts[0].files.find((f) => f.path === '/home/eunjae/README.txt')!.content;
  for (const c of ['df -h', 'du -sh', 'tail -n', 'systemctl status', 'journalctl -u']) assert.ok(readme.includes(c), c);
});

test('case 0 hints: idle nudge after 2 minutes, held while a clue was just found; `hint` opens the panel', () => {
  const g = new Game(cs);
  g.briefingEnd(true, 1000, 'ring');
  for (let i = 0; i < 110; i++) g.tick(1000);
  out(g, 'history'); // finds trace clues at ~110 s
  for (let i = 0; i < 20; i++) g.tick(1000); // 130 s: past 2 minutes, but a clue came 20 s ago
  assert.ok(!g.st.log.some((e) => e.type === 'rung2'), 'held');
  for (let i = 0; i < HOLD_MS / 1000; i++) g.tick(1000);
  const nudge = g.st.log.find((e) => e.type === 'rung2');
  assert.ok(nudge, 'fires once the hold window passes');
  assert.equal(nudge!.nudge, 'idle-1');
  let opened = 0;
  g.on('hint-panel', () => opened++);
  out(g, 'hint');
  assert.equal(opened, 1);
});

test('case 0 scoring: two slots, max 230, unlimited submissions, wrong answers nudge in the blamed voice', () => {
  const g = new Game(cs);
  const wrong = g.submit(cited(g, { cause: 'pdf', sequence: 'slow', responsibility: [] }))!;
  assert.equal(wrong.max, 230);
  assert.equal(wrong.allCorrect, false);
  g.tick(2000);
  assert.equal(g.st.live.at(-1)?.from, 'jihoon');
  for (let i = 0; i < 4; i++) g.submit(cited(g, { cause: 'memory', sequence: 'hardware', responsibility: [] }));
  assert.equal(g.st.finished, false, 'five wrong reports and still going');
  assert.equal(g.submissionsLeft(), Infinity);
  const right = g.submit(cited(g, { cause: 'disk', sequence: 'true', responsibility: [] }))!;
  assert.equal(right.allCorrect, true);
  assert.equal(right.base, 200);
  assert.equal(right.multiplier, 0.7);
  assert.ok(g.st.finished && g.st.mailsDelivered.includes('closing'));
  const rep = g.playtestReport() as { summary: { solved: boolean; submissions: unknown[] } };
  assert.equal(rep.summary.solved, true);
  assert.equal(rep.summary.submissions.length, 6);
});

test('campaign: Case 0 → 1 → 2 → 3, each opens when the one before is solved or skipped, placeholders never block', () => {
  const c = new Campaign(CAMPAIGN);
  assert.deepEqual(c.entries.map((e) => e.slot), [0, 1, 2, 3, 4]);
  assert.deepEqual(c.playable().map((e) => e.id), [cs.id, 'case1-cron-env', 'case2-deleted-open', caseFriday1802.id]);
  assert.equal(c.first().id, cs.id);
  assert.equal(c.tutorialId(), cs.id);
  assert.equal(c.entry(caseFriday1802.id)!.slot, 3);
  assert.equal(c.next(cs.id)!.id, 'case1-cron-env');
  assert.equal(c.next('case1-cron-env')!.id, 'case2-deleted-open');
  assert.equal(c.next('case2-deleted-open')!.id, caseFriday1802.id);
  assert.equal(c.next(caseFriday1802.id), null, 'placeholder 4 is passed over');
  let p = parseProgress(null);
  assert.equal(c.status('case1-cron-env', p), 'locked');
  assert.equal(c.status(caseFriday1802.id, p), 'locked');
  assert.equal(c.status('case4-keys', p), 'soon');
  assert.equal(c.pick(null, null, p).id, cs.id);
  assert.equal(c.pick(null, caseFriday1802.id, p).id, cs.id, 'a locked last case falls back to the first');
  assert.equal(c.pick(caseFriday1802.id, null, p).id, caseFriday1802.id, '?case= ignores locks (facilitator)');
  p = c.solve(cs.id, p);
  assert.equal(c.status(cs.id, p), 'solved');
  assert.equal(c.status('case1-cron-env', p), 'open');
  assert.equal(c.status('case2-deleted-open', p), 'locked');
  p = c.solve('case1-cron-env', p);
  assert.equal(c.status('case2-deleted-open', p), 'open');
  assert.equal(c.status(caseFriday1802.id, p), 'locked');
  p = c.solve('case2-deleted-open', p);
  assert.equal(c.status(caseFriday1802.id, p), 'open');
  assert.equal(c.pick(null, caseFriday1802.id, p).id, caseFriday1802.id);
  // the tutorial's skip goes to the next case and marks only the tutorial skipped
  const skipped = c.skipTo(c.next(cs.id)!.id, parseProgress('{"solved":[],"skipped":[]}'));
  assert.deepEqual(skipped.skipped, [cs.id]);
  assert.equal(c.status('case1-cron-env', skipped), 'open');
  assert.equal(c.status(cs.id, skipped), 'skipped');
  // skipping straight to Case 3 marks 0, 1 and 2 skipped
  assert.deepEqual(c.skipTo(caseFriday1802.id, parseProgress(null)).skipped, [cs.id, 'case1-cron-env', 'case2-deleted-open']);
  assert.deepEqual(parseProgress('not json'), { solved: [], skipped: [] });
});

test('campaign: the playtest log says whether Case 0 was played first', () => {
  const g = new Game(caseFriday1802);
  g.st.campaignAtStart = { solved: [cs.id], skipped: [], tutorial: cs.id };
  assert.equal((g.playtestReport() as { summary: { campaign: { playedTutorialFirst: boolean } } }).summary.campaign.playedTutorialFirst, true);
  g.st.campaignAtStart = { solved: [], skipped: [cs.id], tutorial: cs.id };
  assert.equal((g.campaignSummary() as { playedTutorialFirst: boolean }).playedTutorialFirst, false);
  const t = new Game(cs);
  t.st.campaignAtStart = { solved: [], skipped: [], tutorial: cs.id };
  assert.equal((t.campaignSummary() as { playedTutorialFirst: null }).playedTutorialFirst, null);
});

test('case 0 save/load keeps the rail state and the unlimited-submission counter', () => {
  const g = new Game(cs);
  g.runCommand(0, 'history');
  g.runCommand(0, 'ls');
  g.submit(cited(g, { cause: 'memory', sequence: 'slow', responsibility: [] }));
  const g2 = new Game(cs, JSON.parse(g.serialize()));
  assert.deepEqual(g2.st.rail, g.st.rail);
  assert.equal(g2.st.submissions.length, 1);
  assert.equal(g2.submissionsLeft(), Infinity);
  assert.equal(g2.st.settings.clockRate, 6);
});
