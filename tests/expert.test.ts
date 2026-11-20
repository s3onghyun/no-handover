// 숙련자 모드 (docs/campaign-ladder.md §숙련자 모드, src/engine/expert.ts): the default path is
// untouched; in Cases 0–2 the mode folds the checklist, sends no unasked nudge, charges recaps and
// asks, allows two submissions, takes time over par off the score, and adds one red herring that a
// command rules out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.ts';
import { applyExpert, ASK_COST, SUMMARY_COST, timeCost } from '../src/engine/expert.ts';
import { playRecord, resultCard } from '../src/engine/record.ts';
import { caseZeroWiki as c0 } from '../src/cases/case-0-wiki.ts';
import { caseOneCron as c1 } from '../src/cases/case-1-cron.ts';
import { caseTwoDeleted as c2 } from '../src/cases/case-2-deleted.ts';
import { caseFriday1802 as c3 } from '../src/cases/friday-1802.ts';
import type { CaseFile, SlotId } from '../src/engine/types.ts';
import { checkIntegrity } from './case-integrity.ts';

const out = (g: Game, cmd: string, tab = 0) =>
  g
    .runCommand(tab, cmd)
    .lines.map((l) => l.text)
    .join('\n');
const opts = (cs: CaseFile, slot: SlotId) => cs.accusation.slots.find((s) => s.id === slot)!.options.map((o) => o.id);
const HERRINGS: [CaseFile, SlotId, string][] = [
  [c0, 'sequence', 'journal'],
  [c1, 'cause', 'sh-syntax'],
  [c2, 'cause', 'mount'],
];

test('expert overlay: only Cases 0–2 have one, each with one red herring option that is wrong and blames no one', () => {
  assert.equal(c3.expert, undefined);
  for (const [cs, slot, id] of HERRINGS) {
    const x = cs.expert!;
    assert.equal(x.maxSubmissions, 2);
    assert.equal(x.options!.length, 1, `${cs.id}: one red herring`);
    const o = x.options![0].option;
    assert.equal(o.id, id);
    assert.ok(!o.correct && !o.blames && !o.needs, `${cs.id}: a hypothesis, not a person`);
    assert.ok(!opts(cs, slot).includes(id), 'not on the default path');
    assert.ok(opts(applyExpert(cs), slot).includes(id), 'in the mode');
    // same grain as the others (#7): within the length range of the slot's options
    const lens = cs.accusation.slots.find((s) => s.id === slot)!.options.map((x) => [...x.text].length);
    assert.ok([...o.text].length <= Math.max(...lens) + 3 && [...o.text].length >= Math.min(...lens) - 3, `${cs.id}: herring length ${[...o.text].length} in ${Math.min(...lens)}–${Math.max(...lens)}`);
    // the rule-out clue never counts as evidence for a slot
    for (const c of x.clues!) for (const s of cs.accusation.slots) assert.ok(!(s.evidence ?? []).some((k) => k.clues.includes(c.id)), `${c.id} is not evidence`);
  }
});

test('expert overlay: each case as 숙련자 모드 plays it passes the case integrity checks', () => {
  for (const [cs] of HERRINGS) checkIntegrity(applyExpert(cs));
});

test('expert overlay: applyExpert copies, never changes the authored case', () => {
  const before = JSON.stringify(c2);
  const x = applyExpert(c2);
  assert.equal(JSON.stringify(c2), before);
  assert.equal(x.accusation.maxSubmissions, 2);
  assert.equal(c2.accusation.maxSubmissions, 4);
  assert.match(x.goal!.intro!, /2번까지/);
  assert.equal(applyExpert(c3), c3, 'no overlay: the same object');
});

test('default path unchanged: same df, same report, checklist open, idle nudges on', () => {
  const g = new Game(c2);
  assert.equal(g.cs, c2);
  assert.doesNotMatch(out(g, 'df -h'), /spool/);
  assert.equal(g.objectives.folded(), false);
  assert.equal(g.expert(), false);
  const g0 = new Game(c0);
  assert.equal(g0.cs.rail?.highlightClues, true);
});

test('Case 0 herring: journald rotating overnight; du and journald.conf rule it out', () => {
  const g = new Game(c0, null, { senior: true });
  assert.equal(g.expert(), true);
  assert.equal(g.cs.rail?.highlightClues, false, 'no yellow clue lines');
  // the pull: the flood is in the wiki's own journal, and journald rotates its file that night
  assert.match(out(g, 'journalctl -u wiki'), /Suppressed [\d,]+ messages from wiki\.service/);
  assert.ok(!('c0x_journal' in g.st.clues));
  const du = out(g, 'du -sh /var/log/*');
  assert.match(du, /^11G\s+\/var\/log\/wiki$/m);
  assert.match(du, /^5\d\dM\s+\/var\/log\/journal$/m);
  assert.ok('c0x_journal' in g.st.clues, 'du rules it out');
  const h = new Game(c0, null, { senior: true });
  assert.match(out(h, 'cat /etc/systemd/journald.conf'), /^SystemMaxUse=1G$/m);
  assert.ok('c0x_journal' in h.st.clues, 'so does the cap');
  const k = new Game(c0, null, { senior: true });
  const jd = out(k, 'journalctl -u systemd-journald');
  assert.match(jd, /Journal header limits reached or header out-of-date, rotating/);
  assert.match(jd, /Vacuuming done, freed 128\.0M/, 'and it vacuums at the cap');
  // the beginner world has neither the file nor the rotation lines
  const b = new Game(c0);
  assert.match(out(b, 'cat /etc/systemd/journald.conf'), /No such file/);
});

test('Case 1 herring: SHELL=/bin/sh and a [[ ]] check; the shebang and the hourly output rule it out', () => {
  const g = new Game(c1, null, { senior: true });
  assert.match(out(g, 'cat ~/log/cron-env.txt'), /^SHELL=\/bin\/sh$/m);
  const script = out(g, 'cat ~/bin/wiki-log-clean.sh');
  assert.match(script, /if \[\[ "\$SIZE_MB" -lt "\$LIMIT_MB" && "\$1" != "--force" \]\]; then/);
  assert.match(script.split('\n')[14], /^wikictl log truncate --keep-tail /, 'line 15 is still the wikictl call');
  assert.ok('c1x_shebang' in g.st.clues, 'the first line is #!/bin/bash');
  // got past the check every hour: the error is on line 15, not a syntax error
  assert.match(out(g, 'cat ~/wiki-clean.log'), /정리 시작\n.*line 15: wikictl: command not found/);
  const b = new Game(c1);
  assert.doesNotMatch(out(b, 'cat ~/bin/wiki-log-clean.sh'), /\[\[/);
});

test('Case 2 herring: a tmpfs mounted over a non-empty spool; logshipd\'s flush line rules it out', () => {
  const g = new Game(c2, null, { senior: true });
  assert.match(out(g, 'df -h'), /^tmpfs\s+2\.0G\s+8\.0K\s+2\.0G\s+1% \/data\/collector\/spool$/m);
  assert.match(out(g, 'cat /etc/fstab'), /\/data\/collector\/spool\s+tmpfs/);
  assert.match(out(g, 'journalctl -u data-collector-spool.mount'), /to mount over is not empty, mounting anyway/);
  // du still sums to 95G (the clue the default path needs)
  out(g, 'du -sh /data');
  assert.ok('c2_du' in g.st.clues);
  out(g, 'journalctl -u logshipd --since "2026-11-11 11:00" --until "2026-11-11 11:10"');
  assert.ok('c2x_spool' in g.st.clues);
});

test('expert rules: checklist folded from the start, every icon gate open, no unasked nudge', () => {
  for (const cs of [c0, c1, c2]) {
    const g = new Game(cs, null, { senior: true, idleMinutes: 0.1 });
    assert.equal(g.objectives.folded(), true, `${cs.id}: no checklist steps`);
    for (let t = 0; t < 120_000; t += 1000) g.tick(1000);
    assert.ok(!g.st.log.some((e) => e.type === 'rung2'), `${cs.id}: no idle nudge`);
  }
  // Case 3: hint costs only (as ?senior=1 always was), checklist kept
  const g3 = new Game(c3, null, { senior: true });
  assert.equal(g3.expert(), false);
  assert.equal(g3.objectives.folded(), false);
});

test('expert costs: the recap and an ask cost points and count as hint steps; Case 3 keeps them free', () => {
  const g = new Game(c1, null, { senior: true });
  assert.ok(g.openHint('cause', 'summary'));
  assert.equal(g.hintCount(), 1);
  assert.equal(g.ladder.totalCost(), SUMMARY_COST);
  g.ask('뭐부터 봐요?');
  assert.equal(g.hintCount(), 2);
  assert.equal(g.ladder.totalCost(), SUMMARY_COST + ASK_COST);
  const g3 = new Game(c3, null, { senior: true });
  g3.openHint('cause', 'summary');
  g3.ask('뭐부터 봐요?');
  assert.equal(g3.hintCount(), 0);
  assert.equal(g3.ladder.totalCost(), 0);
});

test('expert scoring: two submissions, time over par costs up to 30, total and record show it', () => {
  assert.equal(timeCost(7.9 * 60000, 8), 0);
  assert.equal(timeCost(9.9 * 60000, 8), 0);
  assert.equal(timeCost(10 * 60000, 8), 5);
  assert.equal(timeCost(15 * 60000, 8), 15);
  assert.equal(timeCost(90 * 60000, 8), 30);
  const g = new Game(c0, null, { senior: true });
  assert.equal(g.submissionsLeft(), 2);
  g.st.playMs = 12 * 60000; // 4 minutes over par
  const wrong = g.submit({ cause: 'pdf', sequence: 'journal', responsibility: [] })!;
  assert.equal(wrong.timeCost, 10);
  assert.equal(g.st.finished, false);
  const last = g.submit({ cause: 'disk', sequence: 'journal', responsibility: [] })!;
  assert.equal(last.allCorrect, false, 'the herring is wrong');
  assert.equal(g.st.finished, true, 'two submissions and the case closes');
  assert.equal(playRecord(g).senior, true);
  assert.equal(resultCard(g, 'Case 0').mode, '숙련자 모드');
  // default path: no time cost at all
  const d = new Game(c0);
  d.st.playMs = 60 * 60000;
  assert.equal(d.submit({ cause: 'pdf', sequence: 'true', responsibility: [] })!.timeCost, undefined);
});

test('setSenior: switches the world before the case starts, never after', () => {
  const g = new Game(c2);
  g.st.campaignAtStart = { solved: ['case0-wiki'], skipped: [] };
  assert.equal(g.setSenior(true), true);
  assert.equal(g.expert(), true);
  assert.match(out(g, 'df -h'), /spool/);
  assert.equal(g.objectives.folded(), true);
  assert.deepEqual(g.st.campaignAtStart, { solved: ['case0-wiki'], skipped: [] }, 'campaign snapshot kept');
  assert.equal(g.st.log.filter((e) => e.type === 'cmd').length, 1, 'fresh log after the switch');
  g.st.unlocked = true;
  assert.equal(g.setSenior(false), false);
  assert.equal(g.expert(), true);
});

test('saves: a started case keeps its mode; a lock-screen save in the other mode is dropped', () => {
  const g = new Game(c1, null, { senior: true });
  g.st.unlocked = true;
  g.runCommand(0, 'df -h');
  const saved = JSON.parse(g.serialize());
  const again = new Game(c1, saved, { senior: false });
  assert.equal(again.expert(), true, 'started in 숙련자 모드: stays');
  assert.match(out(again, 'cat ~/bin/wiki-log-clean.sh'), /\[\[/);
  const lock = JSON.parse(new Game(c1).serialize());
  const x = new Game(c1, lock, { senior: true });
  assert.equal(x.expert(), true);
  assert.equal(x.objectives.folded(), true);
});
