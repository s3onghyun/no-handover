// Shell environment: login PATH per host, env/printenv/which/type, PATH lookup of files on disk,
// /usr/bin/<tool> paths and assignments before a command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld } from '../src/engine/build.ts';
import { Shell } from '../src/engine/shell.ts';
import { caseFriday1802 } from '../src/cases/friday-1802.ts';
import { caseOneCron } from '../src/cases/case-1-cron.ts';
import { parseLocal } from '../src/engine/time.ts';

function setup(cs = caseOneCron, host = 'wiki-01') {
  const sh = new Shell(buildWorld(cs), () => parseLocal(cs.clock.start));
  const s = sh.newSession('t', host, '/home/eunjae');
  const run = (l: string) => sh.run(s, l);
  const out = (l: string) => run(l).lines.filter((x) => x.cls !== 'dim' && x.cls !== 'err').map((x) => x.text);
  const err = (l: string) => run(l).lines.filter((x) => x.cls === 'err').map((x) => x.text);
  return { sh, s, run, out, err };
}

test('the default PATH is unchanged for cases without a host env; a host env overrides it', () => {
  assert.deepEqual(setup(caseFriday1802, 'pay-api-01').out('echo $PATH'), ['/usr/local/bin:/usr/bin:/bin']);
  assert.match(setup().out('echo $PATH')[0], /^\/usr\/local\/sbin:.*:\/opt\/wiki\/bin$/);
});

test('which: simulated tools live in the first of /usr/bin, /bin on PATH; builtins are not on disk; exit 1 when missing', () => {
  const { out, run, sh, s } = setup();
  assert.deepEqual(out('which crontab ls'), ['/usr/bin/crontab', '/usr/bin/ls']);
  assert.deepEqual(out('which cd'), []);
  assert.equal(s.lastCode, 1);
  assert.deepEqual(out('env -i PATH=/bin:/usr/bin which ls'), ['/bin/ls']);
  assert.deepEqual(out('which nosuchtool'), []);
  run('which wikictl');
  assert.equal(s.lastCode, 0);
  void sh;
});

test('type reports aliases, builtins and files; not found on stderr', () => {
  const { out, err } = setup();
  assert.deepEqual(out('type 디스크'), ["디스크 is aliased to `df -h; du -sh /var/log/* 2>/dev/null'"]);
  assert.deepEqual(out('type cd echo'), ['cd is a shell builtin', 'echo is a shell builtin']);
  assert.deepEqual(err('type nosuch'), ['bash: type: nosuch: not found']);
});

test('env: prints, clears with -i, sets for one command; the outer shell expands $VAR before env runs', () => {
  const { out, err } = setup();
  assert.ok(out('env').some((l) => l.startsWith('PATH=/usr/local/sbin')));
  assert.ok(!out('env').some((l) => l.startsWith('?=')), 'special parameters are not environment variables');
  assert.deepEqual(out('env -i'), []);
  assert.deepEqual(out('env -i A=1 B=2'), ['A=1', 'B=2']);
  assert.deepEqual(out('env -i PATH=/usr/bin:/bin printenv PATH HOME'), ['/usr/bin:/bin']);
  // like bash: $PATH is the login PATH, expanded by this shell first
  assert.match(out('env -i PATH=/usr/bin echo $PATH')[0], /\/opt\/wiki\/bin$/);
  assert.deepEqual(err('env -i PATH=/nowhere ls'), ["env: 'ls': No such file or directory"]);
  assert.deepEqual(err('env cd /tmp'), ["env: 'cd': No such file or directory"]);
  // with no PATH at all, execvp falls back to /bin:/usr/bin
  assert.deepEqual(out('env -i which ls'), ['/bin/ls']);
  // VAR=value cmd behaves like env VAR=value cmd
  assert.deepEqual(out('PATH=/usr/bin:/bin which wikictl'), []);
  assert.deepEqual(out('PATH=/usr/bin:/bin:/opt/wiki/bin which wikictl'), ['/opt/wiki/bin/wikictl']);
});

test('commands on disk: found through PATH or by path, never run; absolute /usr/bin paths run the tool', () => {
  const { out, err, run } = setup(caseFriday1802, 'pay-api-01');
  assert.match(err('/home/eunjae/bin/ledger-backup.sh')[0], /실행하지 않아요/);
  assert.deepEqual(err('./nope.sh'), ['bash: ./nope.sh: No such file or directory']);
  assert.ok(out('/usr/bin/df -h').some((l) => l.includes('/var/lib/ledger')));
  assert.match(err('bash x.sh')[0], /스크립트는 cat 으로 읽어 보세요/);
  assert.match(err('/bin/sh -c id')[0], /스크립트는 cat 으로 읽어 보세요/);
  const r = run('FOO=1');
  assert.match(r.lines[0].text, /셸 변수는 저장되지 않아요/);
  // Case 3 is unchanged: lsof still points at /proc
  assert.match(err('lsof -p 2817')[0], /lsof가 설치되어 있지 않아요/);
});
