// Pinning one terminal line (src/engine/linepin.ts): the pin keeps the host and command that printed
// the line (also after ssh, and for grep/tail output), the "이 줄은 단서가 될 수 있어요" mark only on
// clue lines and only after the player's own command found the clue (never in 숙련자 모드), and the
// run-by-run jump over marked lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.ts';
import { afterCommand, clueMark, lineContext, nextRun, parsePrompt } from '../src/engine/linepin.ts';
import type { OutLine } from '../src/engine/shell.ts';
import { caseZeroWiki } from '../src/cases/case-0-wiki.ts';
import { caseOneCron } from '../src/cases/case-1-cron.ts';
import { caseTwoDeleted } from '../src/cases/case-2-deleted.ts';
import { caseFriday1802 } from '../src/cases/friday-1802.ts';

/** The tab's line index of the last line matching `re`, and the context the terminal gives it. */
function find(g: Game, re: RegExp, tab = 0) {
  const tb = g.st.tabs[tab];
  let i = tb.lines.length - 1;
  while (i >= 0 && !(tb.lines[i].cls !== 'sys' && re.test(tb.lines[i].text))) i--;
  assert.ok(i >= 0, `no line ${re}`);
  return { i, line: tb.lines[i], lc: lineContext(tb.lines, i, { host: g.shell.frame(tb.session).host, label: tb.label }), after: afterCommand(tb.lines, i) };
}

test('parsePrompt reads host and command from a command echo, nothing else', () => {
  assert.deepEqual(parsePrompt('eunjae@wiki-01:~$ df -h'), { host: 'wiki-01', cmd: 'df -h' });
  assert.deepEqual(parsePrompt('eunjae@pay-api-01:/srv/git/pay-config.git$ git log --format=fuller -1'), { host: 'pay-api-01', cmd: 'git log --format=fuller -1' });
  assert.deepEqual(parsePrompt('eunjae@wiki-01:~$ tail -f x^C'), { host: 'wiki-01', cmd: 'tail -f x' });
  assert.deepEqual(parsePrompt('eunjae@wiki-01:~$ '), { host: 'wiki-01', cmd: '' });
  assert.equal(parsePrompt('/dev/sdb1        20G   19G     0 100% /var'), null);
  assert.equal(parsePrompt('Nov 14 03:15:40 pay-api-01 payment-api[2817]: http: Accept error'), null);
});

test('lineContext: the nearest command echo above; the frozen screen takes the tab label', () => {
  const lines: OutLine[] = [
    { text: 'eunjae@wiki-01:~$ # 도윤님, 여기서 시작해요', cls: 'dim' },
    { text: 'eunjae@wiki-01:~$ df -h', cls: 'sys' },
    { text: '/dev/sdb1 20G 19G 0 100% /var' },
    { text: 'eunjae@db-01:~$ tail -n 3 /var/log/x.log', cls: 'sys' },
    { text: 'a' },
    { text: 'b' },
  ];
  const fb = { host: 'wiki-01', label: 'wiki-01' };
  assert.deepEqual(lineContext(lines, 0, fb), { host: 'wiki-01', cmd: '', source: 'wiki-01' });
  assert.equal(afterCommand(lines, 0), false, 'a scrollback line that looks like a prompt is not a command');
  assert.deepEqual(lineContext(lines, 2, fb), { host: 'wiki-01', cmd: 'df -h', source: 'wiki-01 · df -h' });
  assert.deepEqual(lineContext(lines, 5, fb), { host: 'db-01', cmd: 'tail -n 3 /var/log/x.log', source: 'db-01 · tail -n 3 /var/log/x.log' });
  assert.equal(afterCommand(lines, 5), true);
});

test('a line pin keeps the line, its host and command and the clock; same line + source is one pin', () => {
  const g = new Game(caseZeroWiki);
  g.runCommand(0, 'df -h');
  g.tick(60_000);
  const { line, lc } = find(g, /100%\s+\/var$/);
  const pin = g.pin({ kind: 'line', text: line.text, ...lc, via: 'line-key' });
  assert.equal(pin.source, 'wiki-01 · df -h');
  assert.equal(pin.host, 'wiki-01');
  assert.equal(pin.cmd, 'df -h');
  assert.equal(pin.clock, g.now(), 'the in-game time it was pinned');
  assert.ok(pin.clueIds.includes('c0_df'));
  assert.equal(g.pin({ kind: 'line', text: line.text, ...lc }), pin, 'pinning it again returns the same pin');
  assert.equal(g.st.pins.length, 1);
  const logged = g.st.log.filter((e) => e.type === 'pin');
  assert.equal(logged.length, 1);
  assert.equal(logged[0].via, 'line-key', 'the playtest log says how it was pinned');
  // the save keeps the context
  const back = new Game(caseZeroWiki, JSON.parse(g.serialize()));
  assert.deepEqual({ host: back.st.pins[0].host, cmd: back.st.pins[0].cmd, clock: back.st.pins[0].clock }, { host: 'wiki-01', cmd: 'df -h', clock: pin.clock });
});

test('grep / tail output pins with the whole pipeline as its command and proves the same clue', () => {
  const g = new Game(caseFriday1802);
  g.runCommand(0, 'journalctl -u payment-api | grep "too many open files" | tail -3');
  const { line, lc } = find(g, /too many open files/);
  assert.equal(lc.cmd, 'journalctl -u payment-api | grep "too many open files" | tail -3');
  assert.equal(lc.host, 'pay-api-01');
  const pin = g.pin({ kind: 'line', text: line.text, ...lc });
  assert.ok(pin.clueIds.includes('c_emfile'));
  assert.ok(g.evidencePins().includes(pin), 'it counts as report evidence like the full journal line');
});

test('after ssh and exit, a line keeps the host that printed it (not the host the tab is on now)', () => {
  const g = new Game(caseTwoDeleted);
  g.runCommand(0, 'ssh pay-api-01');
  g.runCommand(0, 'df -h');
  g.runCommand(0, 'exit');
  assert.equal(g.shell.frame(g.st.tabs[0].session).host, 'logs-01');
  const { lc } = find(g, /\/var\/lib\/ledger$/);
  assert.deepEqual(lc, { host: 'pay-api-01', cmd: 'df -h', source: 'pay-api-01 · df -h' });
});

test('clue mark: never on the frozen screen or before the command that finds it; subtle after it', () => {
  const g = new Game(caseOneCron);
  const tb = g.st.tabs[0];
  // nothing is marked before the player runs anything (the frozen screen is not command output)
  tb.lines.forEach((l, i) => assert.equal(clueMark(g, l, afterCommand(tb.lines, i)), null, l.text));
  // a clue line the player has not printed yet: not marked, even as command output
  const notFound = { text: '/home/eunjae/bin/wiki-cert-renew.sh: line 15: wikictl: command not found' };
  assert.ok(g.cluesFor(notFound.text).includes('c1_notfound'));
  assert.equal(clueMark(g, notFound, true), null, 'not before the command that shows it');
  g.runCommand(0, 'cat ~/wiki-cert.log');
  const hit = find(g, /wikictl: command not found/);
  assert.equal(hit.after, true);
  assert.equal(clueMark(g, hit.line, hit.after), 'subtle');
  // only clue lines: an ordinary line of the same output stays plain
  const plain = find(g, /갱신 끝/);
  assert.deepEqual(g.cluesFor(plain.line.text), []);
  assert.equal(clueMark(g, plain.line, plain.after), null);
  // the command echo, a game note and an error are never marked
  assert.equal(clueMark(g, { text: 'eunjae@wiki-01:~$ cat ~/wiki-cert.log', cls: 'sys' }, true), null);
  assert.equal(clueMark(g, { text: notFound.text, cls: 'dim' }, true), null);
  assert.equal(clueMark(g, { text: notFound.text, cls: 'err' }, true), null);
});

test('clue mark: a clue found only by opening a mail does not mark terminal lines', () => {
  const g = new Game(caseZeroWiki);
  g.open('mail:wiki-upload');
  assert.ok(g.st.clues.c0_upload, 'the mail found it');
  const line = { text: '10.0.3.21 - - [09/Nov/2026:21:14:01 +0900] "POST /attach HTTP/1.1" 200 1834' };
  assert.ok(g.cluesFor(line.text).includes('c0_upload'));
  assert.equal(clueMark(g, line, true), null);
});

test('clue mark: the tutorial keeps its yellow marker; 숙련자 모드 marks nothing', () => {
  const t0 = new Game(caseZeroWiki);
  t0.runCommand(0, 'df -h');
  const a = find(t0, /100%\s+\/var$/);
  assert.equal(clueMark(t0, a.line, a.after), 'strong');
  for (const cs of [caseZeroWiki, caseOneCron, caseTwoDeleted, caseFriday1802]) {
    const g = new Game(cs, null, { senior: true });
    const cmd = { [caseZeroWiki.id]: 'df -h', [caseOneCron.id]: 'cat ~/wiki-cert.log', [caseTwoDeleted.id]: 'df -h', [caseFriday1802.id]: 'journalctl -u payment-api' }[cs.id];
    g.runCommand(0, cmd);
    assert.ok(Object.keys(g.st.clues).length > 0, `${cs.id}: the command found a clue`);
    const tb = g.st.tabs[0];
    tb.lines.forEach((l, i) => assert.equal(clueMark(g, l, afterCommand(tb.lines, i)), null, `${cs.id}: ${l.text}`));
  }
});

test('clue mark: in every case the intended commands mark their clue lines, and only lines that prove a clue', () => {
  const runs: [typeof caseZeroWiki, string, RegExp][] = [
    [caseZeroWiki, 'journalctl -u wiki', /21:14:0[23].*thumbnail/],
    [caseOneCron, 'journalctl -u cron', /\(eunjae\) CMD \(~\/bin\/wiki-cert-renew/],
    [caseTwoDeleted, 'ls -l /proc/1187/fd', /\(deleted\)/],
    [caseFriday1802, 'journalctl -u payment-api', /03:15:40 .*too many open files/],
  ];
  for (const [cs, cmd, re] of runs) {
    const g = new Game(cs);
    g.runCommand(0, cmd);
    const tb = g.st.tabs[0];
    const hit = find(g, re);
    assert.ok(clueMark(g, hit.line, hit.after), `${cs.id}: ${re} is marked`);
    let plain = 0;
    tb.lines.forEach((l, i) => {
      const m = clueMark(g, l, afterCommand(tb.lines, i));
      if (m) assert.ok(g.cluesFor(l.text).length > 0, `${cs.id}: marked line proves a clue: ${l.text}`);
      else if (l.cls !== 'sys' && l.cls !== 'dim') plain++;
    });
    assert.ok(plain > 0, `${cs.id}: other lines of the output stay plain`);
  }
});

test('nextRun: one stop per run of same-clue lines (plain lines between them do not split it), landing on its first line', () => {
  //            0     1    2     3    4    5   6    7    8    9
  const keys = ['', 'a', 'a', '', 'b', '', 'b', 'a', '', 'c'];
  // nothing picked yet (i = length): up to the run of line 9, then 7, then 4 (top of 4–6 across the plain 5), then 1
  assert.equal(nextRun(keys, keys.length, -1), 9);
  assert.equal(nextRun(keys, 9, -1), 7);
  assert.equal(nextRun(keys, 7, -1), 4);
  assert.equal(nextRun(keys, 6, -1), 1, 'from inside a run, the next run up');
  assert.equal(nextRun(keys, 4, -1), 1);
  assert.equal(nextRun(keys, 1, -1), -1);
  assert.equal(nextRun(keys, 0, 1), 1);
  assert.equal(nextRun(keys, 1, 1), 4);
  assert.equal(nextRun(keys, 2, 1), 4, 'down from the middle of a run skips the rest of it');
  assert.equal(nextRun(keys, 4, 1), 7, 'the plain line inside a run is skipped too');
  assert.equal(nextRun(keys, 9, 1), -1);
  assert.equal(nextRun(keys, 3, -1), 1, 'from a plain line');
  assert.equal(nextRun([], 0, -1), -1);
});

test('nextRun on real output: a buried first error is a few stops up, not one stop per repeat', () => {
  for (const [cs, cmd, clue, most] of [
    [caseZeroWiki, 'journalctl -u wiki', 'c0_start', 5],
    [caseTwoDeleted, 'journalctl', 'c2_rm', 6],
    [caseFriday1802, 'journalctl -u payment-api', 'c_emfile', 2],
  ] as const) {
    const g = new Game(cs);
    g.runCommand(0, cmd);
    const tb = g.st.tabs[0];
    const rows = tb.lines.map((l, i) => ({ l, i })).filter(({ l }) => l.text.trim() && l.cls !== 'sys');
    const keys = rows.map(({ l, i }) => (clueMark(g, l, afterCommand(tb.lines, i)) ? g.cluesFor(l.text).sort().join(' ') : ''));
    let at = keys.length - 1; // Shift+↑ from the prompt picks the newest line
    let stops = 0;
    while (!g.cluesFor(rows[at].l.text).includes(clue)) {
      at = nextRun(keys, at, -1);
      assert.ok(at >= 0, `${cs.id}: ran out of runs before ${clue}`);
      stops++;
    }
    assert.ok(stops <= most, `${cs.id}: ${stops} stops to ${clue} (at most ${most})`);
  }
});
