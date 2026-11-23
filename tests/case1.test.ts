// Case 1 「밤에만 실패하는 스크립트」: integrity, reachability with the case's own commands, the cron
// facts the story rests on (PATH, working directory, journal), the certificate the story ends on
// (openssl on the file, curl against the server), scoring with per-field feedback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.ts';
import { caseOneCron as cs, CERT } from '../src/cases/case-1-cron.ts';
import { checkIntegrity, briefingSecs, at, cited } from './case-integrity.ts';

const out = (g: Game, cmd: string) => g.runCommand(0, cmd).lines.filter((l) => l.cls !== 'dim').map((l) => l.text);

test('case 1 integrity: references resolve, one host, two slots, five submissions with per-field feedback', () => {
  checkIntegrity(cs);
  assert.deepEqual(cs.hosts.map((h) => h.name), ['wiki-01']);
  assert.deepEqual(cs.accusation.slots.map((s) => s.id), ['cause', 'sequence']);
  assert.equal(cs.accusation.maxSubmissions, 5);
  assert.equal(cs.accusation.feedback, 'hints');
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
  const cmds = ['crontab -l', 'journalctl -u cron --since "2026-11-11 00:00"', 'ls -l ~', 'cat ~/wiki-cert.log', 'which wikictl', 'cat ~/log/cron-env.txt', 'journalctl -u wiki --since "2026-11-11 00:00"', 'openssl x509 -enddate -noout -in /etc/wiki/tls/wiki.crt'];
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
  // the script's own line numbers: line 15 is the wikictl call; its openssl is in /usr/bin, which cron has
  const script = out(g, 'cat -n ~/bin/wiki-cert-renew.sh');
  assert.match(script[14], /^\s+15\twikictl cert renew "\$@"$/);
  assert.deepEqual(out(g, 'env -i PATH=/usr/bin:/bin which openssl'), ['/usr/bin/openssl']);
  // cron ran it every hour from 19:00; the output went to the home directory, not ~/bin
  const cron = out(g, 'journalctl -u cron --since "2026-11-10 18:00"').filter((l) => /\(eunjae\) CMD \(~\/bin\/wiki-cert-renew/.test(l));
  assert.equal(cron.length, 15, '19:00 Tue … 09:00 Wed');
  const home = out(g, 'cat ~/wiki-cert.log');
  assert.equal(home.filter((l) => l.endsWith('wikictl: command not found')).length, 15, 'every run fails');
  assert.equal(home.filter((l) => l.endsWith('갱신 끝 ✓')).length, 15, 'and it still says done');
  assert.ok(out(g, 'cat ~/bin/wiki-cert.log').every((l) => l.startsWith('2026-11-10 18:36') || l.startsWith('wikictl:')), 'the file Doyun looked at has only the terminal test');
  // the hours left only ever count down (no renewal in between), 14h at 19:00 to 0h at 09:00
  const left = home.map((l) => /인증서 (\d+)h 남음/.exec(l)?.[1]).filter(Boolean).map(Number);
  assert.deepEqual(left, [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  // du agrees with df (8.2G used on /var: no disk story in this case)
  assert.ok(out(g, 'du -sh /var').includes('8.2G\t/var'));
  assert.match(out(g, 'df -h').join('\n'), /\/dev\/sdb1\s+20G\s+8\.2G\s+11G\s+43% \/var/);
  // a tool outside the lesson answers in-world; running the wiki tool is refused but it is found
  assert.match(out(g, 'ps aux')[0], /오늘 범위 밖/);
  assert.match(out(g, 'wikictl stats').join('\n'), /\/opt\/wiki\/bin\/wikictl 은\(는\) 이 세션에서 실행하지 않아요/);
  assert.match(out(g, 'man cron').join('\n'), /PATH=\/usr\/bin:\/bin/);
});

test('case 1 certificate: the file on disk, what the server presents, and the wiki\'s own record agree on 09:00:04', () => {
  const g = new Game(cs);
  // the file: openssl prints GMT; 00:00:04 UTC is 09:00:04 KST
  assert.deepEqual(out(g, 'openssl x509 -in /etc/wiki/tls/wiki.crt -noout -dates'), ['notBefore=Oct 12 00:00:04 2026 GMT', 'notAfter=Nov 11 00:00:04 2026 GMT']);
  assert.deepEqual(out(g, 'openssl x509 -in /etc/wiki/tls/wiki.crt -noout -subject -issuer'), [`subject=${CERT.subject}`, `issuer=${CERT.issuer}`]);
  assert.deepEqual(out(g, 'openssl x509 -in /etc/wiki/tls/wiki.crt -noout -checkend 0'), ['Certificate will expire']);
  assert.equal(g.runCommand(0, 'openssl x509 -in /etc/wiki/tls/wiki.crt -noout -checkend 0').lines.length, 1);
  assert.match(out(g, 'openssl x509 -in /etc/wiki/tls/wiki.crt -noout -text').join('\n'), /Not After : Nov 11 00:00:04 2026 GMT/);
  // without -noout the PEM follows, like openssl
  assert.equal(out(g, 'openssl x509 -in /etc/wiki/tls/wiki.crt -enddate').at(-1), '-----END CERTIFICATE-----');
  assert.match(out(g, 'openssl x509 -in /etc/wiki/tls/wiki.key -noout -dates').join('\n'), /Could not open file or uri for loading certificate from \/etc\/wiki\/tls\/wiki\.key[\s\S]*Unable to load certificate/);
  assert.match(out(g, 'openssl s_client -connect wiki.nuricloud.example:443').join('\n'), /curl -v/);
  // the server: the handshake stops on the expired certificate (curl 60); -k shows the same dates
  const r = g.runCommand(0, 'curl -v https://wiki.nuricloud.example/healthz');
  const txt = r.lines.map((l) => l.text).join('\n');
  assert.match(txt, /TLS alert, certificate expired \(557\)/);
  assert.match(txt, /^curl: \(60\) SSL certificate problem: certificate has expired$/m);
  assert.deepEqual(out(g, 'curl -vk https://wiki.nuricloud.example/healthz 2>&1 | grep date'), ['*  start date: Oct 12 00:00:04 2026 GMT', '*  expire date: Nov 11 00:00:04 2026 GMT']);
  assert.deepEqual(out(g, 'curl -s https://wiki.nuricloud.example'), [], '-s is silent');
  assert.deepEqual(out(g, 'curl -s localhost:8090/healthz'), ['ok'], 'the wiki app itself is fine');
  // the wiki's record: warned inside the window, then expired at 09:00:04; no renewal since 10/12
  const wiki = out(g, 'journalctl -u wiki').join('\n');
  assert.match(wiki, /Nov 11 09:00:04 .*certificate expired at 2026-11-11 00:00:04 UTC/);
  assert.equal((wiki.match(/INFO cert: renewed/g) ?? []).length, 1, 'the last renewal is the laptop\'s on 10/12');
  assert.match(wiki, /Oct 12 09:00:05 .*renewed wiki\.nuricloud\.example/);
  // the 23:12 nginx reload is the only reload after 10/12: a renewal would have reloaded nginx
  const reloads = out(g, 'journalctl -u nginx --since "2026-10-13 00:00"').filter((l) => /Reloaded/.test(l));
  assert.deepEqual(reloads.map((l) => l.slice(0, 15)), ['Nov 10 23:12:40']);
  for (const id of ['c1_enddate', 'c1_curl', 'c1_expired']) assert.ok(id in g.st.clues, id);
});

test('case 1: scripted solve, a wrong report, Jihoon\'s red-herring nudge', () => {
  const g = new Game(cs);
  g.briefingEnd(true, 1000, 'ring');
  for (const c of ['crontab -l', 'journalctl -u cron --since "2026-11-11 00:50" --until "2026-11-11 01:10"', 'cat ~/wiki-cert.log', 'which wikictl', 'cat ~/log/cron-env.txt', 'journalctl -u wiki --since "2026-11-11 08:00"', 'openssl x509 -enddate -noout -in /etc/wiki/tls/wiki.crt']) {
    g.tick(5000);
    out(g, c);
  }
  for (let i = 0; i < 6; i++) g.tick(5000);
  assert.ok(g.st.notesRevealed.includes('today'), 'memo scene on the "command not found" line');
  assert.ok(g.st.live.some((m) => m.from === 'seojin' && m.text.startsWith('그거예요.')), 'Seojin answers once both PATHs are seen');
  for (const l of g.tab(0).lines) if (g.cluesFor(l.text).some((c) => g.clue(c)?.key)) g.pin({ kind: 'line', text: l.text, source: 'wiki-01' });
  assert.ok(g.objectives.allDone(), JSON.stringify(g.st.objectives.done));
  const wrong = g.submit(cited(g, { cause: 'nginx', sequence: 'true', responsibility: [] }))!;
  assert.equal(wrong.allCorrect, false);
  assert.equal(wrong.max, 230);
  g.tick(2500);
  assert.equal(g.st.live.at(-1)?.from, 'jihoon', 'blaming Jihoon brings his nudge');
  assert.equal(g.submissionsLeft(), 4);
  const right = g.submit(cited(g, { cause: 'cron-path', sequence: 'true', responsibility: [] }))!;
  assert.equal(right.allCorrect, true);
  assert.equal(right.base, 200);
  assert.ok(g.st.finished && g.st.mailsDelivered.includes('closing'));
});

test('case 1: five wrong reports end the case (the debrief still opens the next one)', () => {
  const g = new Game(cs);
  for (let i = 0; i < 5; i++) g.submit(cited(g, { cause: 'not-run', sequence: 'leftover', responsibility: [] }));
  assert.ok(g.st.finished);
  assert.equal(g.submit(cited(g, { cause: 'cron-path', sequence: 'true', responsibility: [] })), null);
});

test('case 1 dashboard panels agree with the certificate: TLS failures start at notAfter (09:00), not at the 23:12 nginx change', () => {
  const tls = cs.panels!.timeseries.find((p) => p.id === 'tlsfail')!;
  const left = cs.panels!.timeseries.find((p) => p.id === 'certleft')!;
  // a step series: each value holds until the next point
  const step = (t: string) => tls.series[0].points.filter(([p]) => p <= t).at(-1)![1]!;
  assert.equal(step('2026-11-11T08:59'), 0);
  assert.equal(step('2026-11-10T23:30'), 0, 'nothing after the nginx reload');
  assert.ok(step('2026-11-11T09:00') > tls.thresholds![0].value);
  // hours left falls in a straight line to 0 at 09:00 (never jumps back up: no renewal)
  const pts = left.series[0].points;
  assert.equal(at(pts, '2026-11-11T09:00'), 0);
  assert.ok(Math.abs(at(pts, '2026-11-11T00:00') - 9) <= 0.2, String(at(pts, '2026-11-11T00:00')));
  assert.ok(pts.every((p, i) => i === 0 || (p[1] as number) <= (pts[i - 1][1] as number)));
  assert.deepEqual(cs.panels!.annotations!.map((a) => a.at), ['2026-11-10T23:12', '2026-11-11T09:00']);
  assert.equal(cs.panels!.stats![0].value, '만료됨');
  assert.ok(!cs.panels!.timeseries.some((p) => /\/var|디스크/.test(p.title)), 'no disk panel in this case');
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
