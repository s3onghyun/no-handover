import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld } from '../src/engine/build.ts';
import { Shell, grepRegex, suggest } from '../src/engine/shell.ts';
import { caseFriday1802 } from '../src/cases/friday-1802.ts';
import { parseLocal } from '../src/engine/time.ts';

function setup(host = 'pay-api-01', cwd = '/home/eunjae') {
  const world = buildWorld(caseFriday1802);
  const sh = new Shell(world, () => parseLocal('2026-11-16T09:30:00'));
  const s = sh.newSession('t', host, cwd);
  const run = (line: string) => sh.run(s, line);
  const out = (line: string) => run(line).lines.filter((l) => l.cls !== 'dim' && l.cls !== 'err').map((l) => l.text);
  const err = (line: string) => run(line).lines.filter((l) => l.cls === 'err').map((l) => l.text);
  return { world, sh, s, run, out, err };
}

test('history keeps the departed senior numbering and timestamps (HISTTIMEFORMAT)', () => {
  const { out } = setup();
  const h = out('history');
  assert.ok(h.some((l) => /^ 4984  2026-11-13 15:40:33 crontab -l$/.test(l)));
  assert.ok(h.some((l) => /^ 4613  2026-05-08 02:44:50 # 또 새벽\. 이번 달 네 번째\.$/.test(l)));
  // numbers strictly increase by one and timestamps never go backwards
  const rows = h.map((l) => /^\s*(\d+)  (\S+ \S+) /.exec(l)!).map((m) => ({ n: +m[1], ts: m[2] }));
  for (let i = 1; i < rows.length; i++) {
    assert.equal(rows[i].n, rows[i - 1].n + 1);
    assert.ok(rows[i].ts >= rows[i - 1].ts, `${rows[i - 1].ts} <= ${rows[i].ts}`);
  }
  // no 2am activity after 2026-05 except the anchored 05-08 lines (character rule)
  assert.ok(!rows.some((r) => r.ts > '2026-05-09' && / 0[0-5]:/.test(r.ts)));
  // the typed command itself is appended
  assert.match(h[h.length - 1], /^ 4997  2026-11-16 09:30:00 history$/);
});

test('the intended solve lines (history 4984-4988) all work', () => {
  const { out } = setup();
  assert.ok(out('crontab -l').includes('15 3 * * 6 /home/eunjae/bin/ledger-backup.sh >> /home/eunjae/log/backup.log 2>&1'));
  assert.match(out('head -5 ~/bin/ledger-backup.sh')[1], /^# 왜: 정산팀 월말 감사용 원장 사본/);
  assert.deepEqual(out('fds'), ['1947']);
  assert.deepEqual(out('systemctl show payment-api -p LimitNOFILE'), ['LimitNOFILE=4096']);
  assert.deepEqual(out('tail -3 ~/log/backup.log'), [
    '2026-11-14 03:15:01 start ledger export (since 2022-03-01) -> /backup/ledger/2026-11-14',
    '2026-11-14 03:15:03 export: opened 2,314 segment files',
    '2026-11-14 05:39:52 done (exit 0)',
  ]);
});

test('alias expansion is shown and 밤 runs both commands', () => {
  const { run } = setup();
  const r = run('밤');
  assert.equal(r.lines[0].text, '→ crontab -l; ls /etc/cron.d/');
  assert.ok(r.lines.some((l) => l.text.includes('logrotate') && l.text.includes('pull-config')));
});

test('typo tolerance: suggestion for the senior\'s own typo, transpositions count once', () => {
  const { run } = setup();
  const r = run('crontba -l');
  assert.equal(r.lines[0].text, 'crontba: command not found');
  assert.match(r.lines[1].text, /혹시 'crontab'/);
  assert.deepEqual(r.events, [{ type: 'notfound', name: 'crontba', suggestion: 'crontab' }]);
  assert.equal(suggest('jornalctl', ['journalctl', 'ls']), 'journalctl');
  assert.equal(suggest('zzz', ['journalctl', 'ls']), undefined);
});

test('read-only session: writes, editors and service changes are refused in-world', () => {
  const { run } = setup();
  assert.match(run('echo x > /tmp/a').lines[0].text, /Read-only file system/);
  assert.match(run('vim notes').lines[0].text, /조사 모드/);
  assert.match(run('crontab -e').lines[0].text, /편집하거나 지울 수 없어요/);
  assert.match(run('crontab -').lines[1].text, /crontab -l/);
  assert.match(run('systemctl restart payment-api').lines[0].text, /Interactive authentication required/);
  assert.match(run('git -C /tmp log').lines[0].text, /not a git repository/);
});

test('journalctl filters by unit, --since/--until, priority and grep', () => {
  const { out } = setup();
  const lines = out('journalctl -u payment-api --since "2026-11-14 03:15" --until "2026-11-14 03:16" -p err');
  assert.ok(lines.length >= 6);
  assert.ok(lines.every((l) => l.includes('too many open files')));
  assert.match(lines[0], /^Nov 14 03:15:40 pay-api-01 payment-api\[2817\]: /);
  const cron = out('journalctl -u cron --since -10d -g eunjae');
  assert.equal(cron.length, 2);
  assert.deepEqual(out('journalctl -u nosuch'), ['-- No entries --']);
  assert.ok(out('journalctl -u payment-api -n 3').length === 3);
});

test('grep options: -i -c -n -v -E -A and BRE alternation', () => {
  const { out } = setup();
  assert.deepEqual(out('grep -c "segment files" ~/log/backup.log'), ['11']);
  assert.match(out('grep -n done ~/log/backup.log')[0], /^\d+:2026-09-05 /);
  assert.ok(out('grep -E "start|done" ~/log/backup.log').length === 22);
  assert.ok(out('grep "start\\|done" ~/log/backup.log').length === 22);
  assert.equal(out('grep -A1 "2,314" ~/log/backup.log').length, 2);
  assert.ok(grepRegex('a+b', { E: false, F: false, w: false, i: false }).test('a+b'));
  assert.ok(grepRegex('A', { E: false, F: false, w: false, i: true }).test('a'));
});

test('pipes, wc, sort, uniq, command substitution, && and ||', () => {
  const { out } = setup();
  assert.deepEqual(out('ls /proc/$(pgrep -f payment-api)/fd | wc -l'), ['1947']);
  assert.deepEqual(out('cat /proc/$(pgrep -f payment-api)/limits | grep "open files"').length, 1);
  assert.deepEqual(out('false && echo no || echo yes'), ['yes']);
  assert.deepEqual(out('echo b; echo a'), ['b', 'a']);
});

test('ulimit -n shows the shell limit, not the service limit', () => {
  const { out } = setup();
  assert.deepEqual(out('ulimit -n'), ['1024']);
});

test('sudo: read commands allowed and logged; others denied and logged; first use has Doyun\'s hesitation', () => {
  const { run, world } = setup('bastion');
  const denied = run('ls /home/sjkang');
  assert.match(denied.lines.map((l) => l.text).join('\n'), /Permission denied/);
  const r = run('sudo cat /home/sjkang/.bash_history');
  assert.ok(r.lines.some((l) => l.cls === 'dim' && l.text.includes('도윤')));
  assert.ok(r.lines.some((l) => l.text === "ssh pay-api-01 'systemctl show payment-api -p LimitNOFILE'"));
  const no = run('sudo systemctl edit payment-api');
  assert.match(no.lines.find((l) => l.cls === 'err')!.text, /is not allowed to execute/);
  const auth = String(world.hosts.get('bastion')!.vfs.lookup('/var/log/auth.log')!.content);
  assert.match(auth, /eunjae : TTY=pts\/3 ; PWD=\/home\/eunjae ; USER=root ; COMMAND=\/usr\/bin\/cat \/home\/sjkang\/\.bash_history/);
  assert.match(auth, /command not allowed .* COMMAND=\/usr\/bin\/systemctl edit payment-api/);
});

test('ssh/exit change host and prompt; remote one-shot command works', () => {
  const { sh, s, run, out } = setup();
  run('ssh pay-cfg');
  assert.equal(sh.prompt(s), 'eunjae@pay-cfg:~$');
  assert.deepEqual(out('getent group git-admins'), ['git-admins:x:1050:eunjae,jhpark']);
  run('exit');
  assert.equal(sh.prompt(s), 'eunjae@pay-api-01:~$');
  assert.deepEqual(out("ssh pay-api-01 'systemctl show payment-api -p LimitNOFILE'"), ['LimitNOFILE=4096']);
  assert.match(run('ssh nowhere').lines[0].text, /Could not resolve hostname/);
});

test('git: log --format=fuller, oneline decorations, branch -a, show diff', () => {
  const { out, run } = setup('pay-cfg');
  run('cd /srv/git/pay-config.git');
  const full = out('git log --format=fuller -1');
  assert.deepEqual(full.slice(0, 5), [
    'commit 9f3c2e17b84d06a5e2c91f7d03b6a48e1c5d2f90 (HEAD -> main)',
    'Author:     박지훈 <jhpark@nuricloud.example>',
    'AuthorDate: Fri Nov 13 18:02:11 2026 +0900',
    'Commit:     박지훈 <jhpark@nuricloud.example>',
    'CommitDate: Fri Nov 13 18:02:11 2026 +0900',
  ]);
  assert.ok(!full.some((l) => l.includes('Reviewed-by')));
  assert.match(out('git log --oneline --all')[0], /^71ad5e9 \(revert-pool-bump\) Revert/);
  assert.deepEqual(out('git branch -a'), ['* main', '  revert-pool-bump']);
  assert.ok(out('git show HEAD').includes('+  max_connections: 200'));
  assert.match(run('git push').lines[0].text, /막혀 있어요/);
});

test('review-web access log: the 4-second approval without comments', () => {
  const { out } = setup('review-web');
  const lines = out('grep sjkang /var/log/nginx/access.log');
  const approvals = lines.filter((l) => l.includes('/approve'));
  assert.equal(approvals.length, 21);
  assert.ok(lines.filter((l) => l.includes('/comment')).length === 40);
  const i = lines.findIndex((l) => l.includes('14/Nov/2026:02:10:07'));
  assert.match(lines[i - 1], /14\/Nov\/2026:02:10:03 \+0900\] "GET \/review\/412/);
});

test('private files ask once, then open', () => {
  const { run } = setup();
  const first = run('cat ~/notes/1년.txt');
  assert.match(first.lines[0].text, /사적인 파일/);
  const second = run('cat ~/notes/1년.txt');
  assert.equal(second.lines[0].text, '남을 이유: 서버들. 서진.');
});

test('tab completion for commands, aliases, paths and hosts', () => {
  const { sh, s } = setup();
  assert.equal(sh.complete(s, 'journ').replace, 'journalctl ');
  assert.ok(sh.complete(s, '밤').options.includes('밤'));
  assert.equal(sh.complete(s, 'cat ~/bi').replace, 'cat ~/bin/');
  assert.equal(sh.complete(s, 'ssh pay-c').replace, 'ssh pay-cfg ');
});

test('man pages exist for every listed command', () => {
  const { run } = setup();
  for (const c of ['ls', 'cd', 'cat', 'less', 'grep', 'tail', 'head', 'history', 'journalctl', 'crontab', 'git', 'df', 'ulimit', 'ss', 'last', 'sudo', 'man', 'systemctl', 'ssh']) {
    const r = run(`man ${c}`);
    assert.ok(r.lines.length > 4 && r.lines[0].cls !== 'err', c);
  }
  assert.match(run('man nosuch').lines[0].text, /No manual entry/);
});
