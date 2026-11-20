// Case 2 「지웠는데 안 비워지는 디스크」: integrity, reachability across two hosts, df vs du and the
// deleted-but-open file, continuity with Case 3, scoring with three slots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.ts';
import { caseTwoDeleted as cs, DELETED_BYTES } from '../src/cases/case-2-deleted.ts';
import { caseFriday1802 } from '../src/cases/friday-1802.ts';
import { checkIntegrity, briefingSecs, at, cited } from './case-integrity.ts';

const out = (g: Game, cmd: string) => g.runCommand(0, cmd).lines.filter((l) => l.cls !== 'dim').map((l) => l.text);
const ALL = ['c2_rm', 'c2_debug', 'c2_growth', 'r2_quota', 'r2_noverify'];

test('case 2 integrity: two hosts, three slots, four submissions, nine key clues', () => {
  checkIntegrity(cs);
  assert.deepEqual(cs.hosts.map((h) => h.name), ['logs-01', 'pay-api-01']);
  assert.deepEqual(cs.accusation.slots.map((s) => s.id), ['cause', 'sequence', 'responsibility']);
  assert.equal(cs.accusation.maxSubmissions, 4);
  assert.equal(cs.clues.filter((c) => c.key).length, 9);
  assert.equal(cs.opening!.objectives.items.length, 3, 'three checklist items, goals only');
  assert.equal(cs.desktop, undefined, 'all seven icons from the start');
  assert.ok(cs.hints.explicit.every((d) => d.cost === 10));
  assert.ok('mirae' in cs.people && cs.mails.some((m) => m.from === 'mirae'), 'Mirae appears, by mail only');
  assert.ok(!cs.timeline.some((e) => e.emits?.some((x) => x.kind === 'message' && x.from === 'mirae')));
  const s = briefingSecs(cs);
  assert.ok(s >= 30 && s <= 60, `briefing ${s}s`);
});

test('case 2: df and du disagree by the deleted file; /proc shows it; lsof is not installed', () => {
  const g = new Game(cs);
  assert.ok(out(g, 'df -h').some((l) => /^\/dev\/sdb1\s+196G\s+180G\s+5\.9G\s+97%\s+\/data$/.test(l)));
  const du = out(g, 'du -s /data')[0];
  const visible = +du.split('\t')[0] * 1024;
  const usedGiB = (visible + DELETED_BYTES) / 1024 ** 3;
  assert.ok(Math.abs(usedGiB - 180.3) < 0.6, `du + deleted = ${usedGiB.toFixed(1)}G, df says 180G`);
  assert.deepEqual(out(g, 'pgrep -f logshipd'), ['1187']);
  assert.deepEqual(out(g, 'ls -l /proc/$(pgrep -f logshipd)/fd | grep deleted').map((l) => l.replace(/^.* (\d+ ->)/, '$1')), ['7 -> /data/collector/raw/pay-api-01.log (deleted)']);
  assert.ok(!out(g, 'ls /data/collector/raw').join(' ').includes('pay-api-01.log'), 'the name is gone from the directory');
  assert.match(out(g, 'lsof +L1').join('\n'), /lsof가 설치되어 있지 않아요\. 대신: ls -l \/proc\/<PID>\/fd/);
  assert.match(out(g, 'sudo rm x')[0], /오늘 범위 밖/);
  assert.deepEqual(out(g, 'systemctl show logshipd -p MainPID,ExecMainStartTimestamp'), ['MainPID=1187', 'ExecMainStartTimestamp=Mon 2026-11-02 08:02:10 KST']);
  // the last reopen (HUP) came before the rm
  const reopen = out(g, 'journalctl -u logshipd -g reopened');
  assert.ok(reopen.at(-1)!.startsWith('Nov 11 11:02:05'));
});

test('case 2: every key clue is reachable with the allowed commands, across two hosts', () => {
  const g = new Game(cs);
  const allow = new Set(cs.shell!.allow);
  const cmds = ['df -h', 'du -sh /data/collector/*', 'pgrep -f logshipd', 'ls -l /proc/1187/fd | grep deleted', 'journalctl --since "2026-11-11 14:00" --until "2026-11-11 15:00"', 'journalctl -u logshipd --since "2026-11-11 15:00" --until "2026-11-11 16:00"', 'cat /etc/logshipd/logshipd.conf', 'du -sh /data', 'ssh pay-api-01', 'journalctl -u payment-api --since "2026-11-11 14:00" --until "2026-11-11 15:00"', 'exit'];
  for (const c of cmds) {
    assert.ok(allow.has(c.split(' ')[0]), c);
    out(g, c);
  }
  g.open('channel:pc-logs');
  for (const c of cs.clues.filter((x) => x.key)) assert.ok(c.id in g.st.clues, c.id);
  for (const id of ALL) assert.ok(id in g.st.clues, id);
});

test('case 2 continuity with Case 3: same pay-api-01 IP, PID, limit and Jihoon\'s Wednesday window', () => {
  const p2 = cs.hosts.find((h) => h.name === 'pay-api-01')!;
  const p3 = caseFriday1802.hosts.find((h) => h.name === 'pay-api-01')!;
  assert.equal(p2.ip, p3.ip);
  assert.equal(p2.procs![0].pid, p3.procs![0].pid);
  assert.equal(p2.procs![0].limitNofile, p3.procs![0].limitNofile);
  assert.equal(p2.units![0].props.ExecMainStartTimestamp, p3.units![0].props.ExecMainStartTimestamp, 'payment-api not restarted between the cases');
  assert.ok(p3.last!.some((l) => /^jhpark .*Wed Nov 11 14:20 - 14:26/.test(l)), 'Case 3 shows the 14:20–14:26 session');
  const g = new Game(cs);
  out(g, 'ssh pay-api-01');
  const j = out(g, 'journalctl --since "2026-11-11 14:15" --until "2026-11-11 14:30"');
  assert.ok(j.some((l) => l.startsWith('Nov 11 14:20:31') && l.includes('jhpark')));
  assert.ok(j.some((l) => l.startsWith('Nov 11 14:26:02') && l.includes('jhpark')));
  const bastion = caseFriday1802.hosts.find((h) => h.name === 'bastion')!;
  assert.ok(bastion.last!.some((l) => /^jhpark .*Wed Nov 11 14:18 - 14:31/.test(l)), 'the logs-01 hop (14:27–14:29) fits inside the bastion session');
});

test('case 2: scripted solve, three slots (max 330), wrong reports nudge in the blamed voice, four submissions', () => {
  const g = new Game(cs);
  g.briefingEnd(true, 1000, 'ring');
  for (const c of ['cat ~/README.txt', 'df -h', 'du -sh /data/collector/*', 'pgrep -f logshipd', 'ls -l /proc/1187/fd | grep deleted']) {
    g.tick(5000);
    out(g, c);
  }
  for (let i = 0; i < 6; i++) g.tick(5000);
  assert.ok(g.st.notesRevealed.includes('today'));
  assert.ok(g.st.live.some((m) => m.from === 'seojin' && m.text.startsWith('그거예요. 이름 없는 85G')));
  for (const l of g.tab(0).lines) if (g.cluesFor(l.text).some((c) => g.clue(c)?.key)) g.pin({ kind: 'line', text: l.text, source: 'logs-01' });
  // five 원인 pins: "증거 3개" waits until 경위 and 재발 방지 have one each
  assert.ok(g.evidencePins().length >= 3);
  assert.equal(g.objectives.isDone('pins'), false);
  const line = (re: RegExp) => g.tab(0).lines.find((l) => re.test(l.text))!.text;
  out(g, 'journalctl --since "2026-11-11 14:00" --until "2026-11-11 15:00"');
  g.pin({ kind: 'line', text: line(/COMMAND=\/usr\/bin\/rm pay-api-01\.log/), source: 'logs-01' });
  assert.equal(g.objectives.isDone('pins'), false);
  out(g, 'cat /etc/logshipd/logshipd.conf');
  g.pin({ kind: 'line', text: line(/^max_source_bytes = 0/), source: 'logs-01' });
  assert.ok(g.objectives.allDone(), JSON.stringify(g.st.objectives.done));
  const w = g.submit(cited(g, { cause: 'rotate', sequence: 'freed-then', responsibility: ['blame-seojin'] }))!;
  assert.equal(w.max, 330);
  assert.equal(w.allCorrect, false);
  g.tick(2500);
  assert.equal(g.st.live.at(-1)?.from, 'seojin');
  const r = g.submit(cited(g, { cause: 'open', sequence: 'true', responsibility: ['no-verify', 'open-rule', 'debug-expiry'] }))!;
  assert.equal(r.allCorrect, true);
  assert.equal(r.base, 300);
  assert.ok(g.st.finished && g.st.mailsDelivered.includes('closing'));
  const g2 = new Game(cs);
  for (let i = 0; i < 4; i++) g2.submit(cited(g2, { cause: 'hidden', sequence: 'sunday', responsibility: ['bigger-disk'] }));
  assert.ok(g2.st.finished);
});

test('case 2: the p99 mail arrives in the senior\'s inbox at the case\'s 16:40', () => {
  const g = new Game(cs);
  for (let i = 0; i < 21.5 * 12; i++) g.tick(5000);
  assert.ok(g.st.mailsDelivered.includes('p99'));
  const hm = new Date(g.now()).toISOString().slice(11, 16);
  assert.equal(hm, '16:40');
});

test('case 2 dashboard panels agree with the journal: 70% at the 19:30 warning, 90% at the 04:43 page, 97% at 09:30', () => {
  const pts = cs.panels!.timeseries.find((p) => p.id === 'data')!.series[0].points;
  assert.ok(Math.abs(at(pts, '2026-11-11T19:30') - 70) <= 1.5, String(at(pts, '2026-11-11T19:30')));
  assert.ok(Math.abs(at(pts, '2026-11-12T04:43') - 90) <= 1.5, String(at(pts, '2026-11-12T04:43')));
  assert.equal(at(pts, '2026-11-12T09:30'), 97);
});

test('case 2 nudges: the README asks "숫자 두 개가 다르면?" and no longer spells out df → du → /proc', () => {
  const readme = cs.hosts[0].files.find((f) => f.path === '/home/eunjae/README.txt')!.content;
  assert.match(readme, /숫자 두 개가 다르면\?/);
  for (const c of ['df -h', 'du -sh', '/proc', 'grep deleted', 'journalctl', '잡고 있으면']) assert.ok(!readme.includes(c), c);
  const g = new Game(cs);
  out(g, 'cat ~/README.txt');
  assert.ok('c2_readme' in g.st.clues, 'the README is still a trace clue');
  for (const l of cs.opening!.objectives.after) assert.doesNotMatch(l, /journalctl|--since/, l);
  // the 2024-08 history still shows what Eunjae typed, without the explanation
  const hist = out(g, 'history');
  assert.ok(hist.some((l) => l.includes('/fd | grep deleted')));
  assert.ok(!hist.some((l) => l.includes('아직 열려 있는 파일')));
});

test('case 2 round 3: the deleted-but-open file\'s size is observable (ls -lL, du -L, fdinfo pos) and pins as usage evidence', () => {
  const g = new Game(cs);
  // the symlink itself is 64 bytes / 0 blocks; following it reaches the nameless inode (link count 0)
  assert.match(out(g, 'ls -l /proc/1187/fd/7')[0], /^lrwx------ 1 logship logship\s+64 .* \/proc\/1187\/fd\/7 -> \/data\/collector\/raw\/pay-api-01\.log \(deleted\)$/);
  assert.match(out(g, 'ls -lhL /proc/$(pgrep -f logshipd)/fd/7')[0], /^-rw-r----- 0 logship adm\s+85G Nov 12 09:30 \/proc\/1187\/fd\/7$/);
  assert.match(out(g, 'ls -lL /proc/1187/fd/7')[0], new RegExp(`^-rw-r----- 0 logship adm\\s+${DELETED_BYTES} `));
  assert.deepEqual(out(g, 'du -sh /proc/1187/fd/7'), ['0\t/proc/1187/fd/7'], 'a symlink takes no blocks');
  assert.deepEqual(out(g, 'du -shL /proc/1187/fd/7'), ['85G\t/proc/1187/fd/7']);
  // logshipd appends (O_WRONLY|O_APPEND|O_LARGEFILE = 0102001), so its offset is the file's size
  assert.deepEqual(out(g, 'cat /proc/1187/fdinfo/7'), [`pos:\t${DELETED_BYTES}`, 'flags:\t0102001', 'mnt_id:\t27', 'ino:\t1310742']);
  assert.equal(out(g, 'cat /proc/1187/fdinfo/8')[0], `pos:\t${Math.round(24.0 * 1024 ** 3)}`, 'a live raw file: pos = its ls -l size');
  assert.match(out(g, 'ls -lL /proc/1187/fd/0')[0], /^crw-rw-rw- 1 root\s+root\s+1, 3 /);
  assert.ok('c2_size' in g.st.clues);
  const usage = cs.accusation.slots.find((s) => s.id === 'cause')!.evidence!.find((k) => k.id === 'usage')!;
  assert.ok(usage.clues.includes('c2_size'));
  assert.ok(cs.shell!.help!.some((l) => l.includes('ls -l[L] /proc/<PID>/fd') && l.includes('/proc/<PID>/fdinfo/<번호>')), 'help lists both');
});

test('case 2 round 3: Eunjae\'s README and history point at journalctl -t sudo, which shows the rm', () => {
  const readme = cs.hosts[0].files.find((f) => f.path === '/home/eunjae/README.txt')!.content;
  assert.match(readme, /sudo 로 한 일은 -t sudo 로/);
  const g = new Game(cs);
  const hist = out(g, 'history');
  assert.ok(hist.some((l) => /journalctl -t sudo --since "2024-08-21 07:00"$/.test(l)), 'the 2024-08 history shows the command');
  assert.ok(hist.some((l) => l.includes('ls -lhL /proc/$(pgrep -f logshipd)/fd/9')), 'and how she saw the size');
  const sudo = out(g, 'journalctl -t sudo --since "2026-11-11 14:00" --until "2026-11-11 15:00"');
  assert.ok(sudo.some((l) => l.includes('jhpark : TTY=pts/1 ; PWD=/data/collector/raw ; USER=root ; COMMAND=/usr/bin/rm pay-api-01.log')));
  assert.ok('c2_rm' in g.st.clues);
  assert.ok(cs.hints.explicit.some((d) => d.slot === 'sequence' && d.text.startsWith('journalctl -t sudo --since')));
});

test('case 2 round 3: every 경위 choice is a time-ordered chain; only the true one puts the volume rise before the rm', () => {
  const seq = cs.accusation.slots.find((s) => s.id === 'sequence')!;
  for (const o of seq.options) {
    const steps = o.text.split(' → ');
    assert.ok(steps.length >= 4, `${o.id}: ${steps.length} steps`);
    assert.match(steps.at(-1)!, /^07:58 /, `${o.id} ends at the 07:58 drop`);
  }
  const t = seq.options.find((o) => o.correct)!;
  const steps = t.text.split(' → ');
  assert.match(steps[0], /로그가 갑자기 늘기 시작/);
  assert.match(steps[1], /rm/);
  // the evidence agrees: the debug switch (14:22) comes before the rm (14:28)
  const time = (id: string) => /\d{2}:\d{2}(:\d{2})?/.exec(cs.clues.find((c) => c.id === id)!.label)![0];
  assert.ok(time('c2_debug') < time('c2_rm'));
  assert.ok(seq.options.some((o) => !o.correct && /rm .*→ 그 뒤에야 .*늘기 시작/.test(o.text)), 'the reversed order is a choice the evidence rules out');
});

test('round 3: when a clue opens gated report choices the game says so once (options-unlocked), not on later clues', () => {
  const g = new Game(cs);
  const said: string[][] = [];
  g.on('options-unlocked', (keys) => said.push(keys as string[]));
  out(g, 'df -h');
  assert.equal(said.length, 0, 'an ordinary clue opens nothing');
  g.open('channel:pc-logs'); // r2_noverify: Seojin's changes become choices
  assert.deepEqual(said, [['cause/rotate', 'sequence/freed-then', 'responsibility/blame-seojin']]);
  assert.ok(g.st.log.some((e) => e.type === 'options-unlocked'));
  g.open('channel:pc-logs');
  out(g, 'cat /etc/logshipd/logshipd.conf');
  assert.equal(said.length, 1, 'said once');
});
