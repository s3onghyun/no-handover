// Case 1 「밤에만 실패하는 스크립트」: integrity, reachability with the case's own commands, the cron
// facts the story rests on (PATH, working directory, journal), scoring with bundled feedback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.ts';
import { caseOneCron as cs, WIKI_LOG_BYTES } from '../src/cases/case-1-cron.ts';
import { checkIntegrity, briefingSecs, at } from './case-integrity.ts';

const out = (g: Game, cmd: string) => g.runCommand(0, cmd).lines.filter((l) => l.cls !== 'dim').map((l) => l.text);

test('case 1 integrity: references resolve, one host, two slots, five bundled submissions', () => {
  checkIntegrity(cs);
  assert.deepEqual(cs.hosts.map((h) => h.name), ['wiki-01']);
  assert.deepEqual(cs.accusation.slots.map((s) => s.id), ['cause', 'sequence']);
  assert.equal(cs.accusation.maxSubmissions, 5);
  assert.equal(cs.accusation.feedback ?? 'bundled', 'bundled');
  assert.equal(cs.clues.filter((c) => c.key).length, 7, 'seven key clues (ladder table)');
  assert.equal(cs.hints.idleMinutes, 6);
  assert.ok(cs.hints.explicit.every((d) => d.cost === 5), 'rung 3 costs 5 in senior mode');
  assert.equal(cs.opening!.objectives.items.length, 4, 'four checklist items, command names only');
  assert.equal(cs.desktop!.icons.filter((i) => !i.after).length, 5, 'five icons at first');
  assert.equal(cs.rail, undefined, 'no rail and no yellow clue lines from Case 1 on');
  const s = briefingSecs(cs);
  assert.ok(s >= 30 && s <= 60, `briefing ${s}s`);
});

test('case 1: every key clue is reachable with the allowed commands', () => {
  const g = new Game(cs);
  const allow = new Set(cs.shell!.allow);
  const cmds = ['crontab -l', 'journalctl -u cron --since "2026-11-11 00:00"', 'ls -l ~', 'cat ~/wiki-clean.log', 'which wikictl', 'cat ~/log/cron-env.txt', 'journalctl -u wiki --since "2026-11-11 00:00"', 'df -h'];
  for (const c of cmds) {
    assert.ok(allow.has(c.split(' ')[0]), c);
    out(g, c);
  }
  for (const c of cs.clues.filter((x) => x.key)) assert.ok(c.id in g.st.clues, c.id);
  assert.ok(g.causeSolved());
});

test('case 1 shell: the login PATH has /opt/wiki/bin, cron\'s does not; the script fails only under cron', () => {
  const g = new Game(cs);
  assert.match(out(g, 'echo $PATH')[0], /:\/opt\/wiki\/bin$/);
  assert.deepEqual(out(g, 'which wikictl'), ['/opt/wiki/bin/wikictl']);
  assert.deepEqual(out(g, 'type wikictl'), ['wikictl is /opt/wiki/bin/wikictl']);
  // the same lookup with cron's environment finds nothing
  const r = g.runCommand(0, 'env -i PATH=/usr/bin:/bin which wikictl');
  assert.deepEqual(r.lines, []);
  assert.ok('c1_cronpath' in g.st.clues, 'testing like cron counts as finding cron\'s PATH');
  assert.deepEqual(out(g, 'env -i PATH=/usr/bin:/bin printenv PATH'), ['/usr/bin:/bin']);
  assert.match(out(g, 'env -i PATH=/usr/bin:/bin wikictl log truncate').join('\n'), /env: 'wikictl': No such file or directory/);
  // the script's own line numbers: line 15 is the wikictl call
  const script = out(g, 'cat -n ~/bin/wiki-log-clean.sh');
  assert.match(script[14], /^\s+15\twikictl log truncate --keep-tail 50M$/);
  // cron ran it every hour from 19:00; the output went to the home directory, not ~/bin
  const cron = out(g, 'journalctl -u cron --since "2026-11-10 18:00"').filter((l) => /\(eunjae\) CMD \(~\/bin\/wiki-log-clean/.test(l));
  assert.equal(cron.length, 15, '19:00 Tue … 09:00 Wed');
  const home = out(g, 'cat ~/wiki-clean.log');
  assert.equal(home.filter((l) => l.endsWith('wikictl: command not found')).length, 9, '01:00 … 09:00');
  assert.equal(home.filter((l) => l.endsWith('정리 끝 ✓')).length, 9, 'and it still says done');
  assert.ok(out(g, 'cat ~/bin/wiki-clean.log').every((l) => l.startsWith('2026-11-10 18:36') || l.startsWith('wikictl:')), 'the file Doyun looked at has only the terminal test');
  // the wiki.log sizes the script printed follow the log's growth and end near the file's size at 09:30
  const last = home.filter((l) => /09:00:01 wiki\.log \d+M/.test(l))[0];
  const mb = +/wiki\.log (\d+)M/.exec(last)![1];
  assert.ok(mb < WIKI_LOG_BYTES / 1048576 && mb > WIKI_LOG_BYTES / 1048576 - 600, `${mb}M at 09:00`);
  // du agrees with df (17G used on /var)
  assert.ok(out(g, 'du -sh /var').includes('17G\t/var'));
  // a tool outside the lesson answers in-world; running the wiki tool is refused but it is found
  assert.match(out(g, 'ps aux')[0], /오늘 범위 밖/);
  assert.match(out(g, 'wikictl stats').join('\n'), /\/opt\/wiki\/bin\/wikictl 은\(는\) 이 세션에서 실행하지 않아요/);
  assert.match(out(g, 'man cron').join('\n'), /PATH=\/usr\/bin:\/bin/);
});

test('case 1: scripted solve, bundled feedback on a wrong report, Jihoon\'s red-herring nudge', () => {
  const g = new Game(cs);
  g.briefingEnd(true, 1000, 'ring');
  for (const c of ['crontab -l', 'journalctl -u cron --since "2026-11-11 00:50" --until "2026-11-11 01:10"', 'cat ~/wiki-clean.log', 'which wikictl', 'cat ~/log/cron-env.txt', 'journalctl -u wiki --since "2026-11-11 00:00" --until "2026-11-11 00:10"', 'df -h']) {
    g.tick(5000);
    out(g, c);
  }
  for (let i = 0; i < 6; i++) g.tick(5000);
  assert.ok(g.st.notesRevealed.includes('today'), 'memo scene on the "command not found" line');
  assert.ok(g.st.live.some((m) => m.from === 'seojin' && m.text.startsWith('그거예요.')), 'Seojin answers once both PATHs are seen');
  for (const l of g.tab(0).lines) if (g.cluesFor(l.text).some((c) => g.clue(c)?.key)) g.pin({ kind: 'line', text: l.text, source: 'wiki-01' });
  assert.ok(g.objectives.allDone(), JSON.stringify(g.st.objectives.done));
  const wrong = g.submit({ cause: 'nginx', sequence: 'true', responsibility: [] })!;
  assert.equal(wrong.allCorrect, false);
  assert.equal(wrong.max, 230);
  g.tick(2500);
  assert.equal(g.st.live.at(-1)?.from, 'jihoon', 'blaming Jihoon brings his nudge');
  assert.equal(g.submissionsLeft(), 4);
  const right = g.submit({ cause: 'cron-path', sequence: 'true', responsibility: [] })!;
  assert.equal(right.allCorrect, true);
  assert.equal(right.base, 200);
  assert.ok(g.st.finished && g.st.mailsDelivered.includes('closing'));
});

test('case 1: five wrong reports end the case (the debrief still opens the next one)', () => {
  const g = new Game(cs);
  for (let i = 0; i < 5; i++) g.submit({ cause: 'not-run', sequence: 'leftover', responsibility: [] });
  assert.ok(g.st.finished);
  assert.equal(g.submit({ cause: 'cron-path', sequence: 'true', responsibility: [] }), null);
});

test('case 1 dashboard panels agree with df and the alert: /var crosses 80% at the 07:15 alert, 92% at 09:30', () => {
  const v = cs.panels!.timeseries.find((p) => p.id === 'var')!;
  assert.equal(v.thresholds![0].value, 80);
  const pts = v.series[0].points;
  assert.ok(Math.abs(at(pts, '2026-11-11T07:15') - 80) <= 1.5, String(at(pts, '2026-11-11T07:15')));
  assert.equal(at(pts, '2026-11-11T09:30'), 92);
  assert.equal(cs.panels!.stats![0].value, '92%');
});

test('case 1 nudges: the crontab comments and the memo keep the clue but not the conclusion', () => {
  const g = new Game(cs);
  const crontab = out(g, 'crontab -l');
  const comments = crontab.filter((l) => l.startsWith('# ') && !l.startsWith('# m h'));
  assert.ok(comments.length >= 2);
  for (const l of comments) assert.doesNotMatch(l, /로그인 셸|PATH|\/usr\/bin:\/bin/, l);
  assert.ok(comments.some((l) => /절대 경로/.test(l)), 'the clue: absolute paths');
  assert.ok(comments.some((l) => l.includes('~/log/cron-env.txt')), 'the clue: where the evidence is');
  assert.ok('c1_comment' in g.st.clues, 'the comment is still a trace clue');
  const memo = cs.notes.find((n) => n.id === 'today')!;
  assert.doesNotMatch(memo.reveal!, /cron ≠|PATH|로그인 셸/);
  assert.doesNotMatch(cs.clues.find((c) => c.id === 'c1_notfound')!.aha!, /cron 은 wikictl 을 몰랐다|PATH/);
  for (const l of cs.opening!.objectives.after) assert.doesNotMatch(l, /which|echo \$PATH|cron-env/, l);
  // the history keeps the 2024-03 trail without spelling out the answer
  const hist = out(g, 'history');
  assert.ok(hist.some((l) => l.includes('cat ~/log/cron-env.txt')));
  assert.ok(!hist.some((l) => /# .*PATH가 \/usr\/bin:\/bin/.test(l)));
});
