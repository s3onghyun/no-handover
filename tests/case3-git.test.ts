// Case 3: `git` on pay-cfg, where the config repository is bare (/srv/git/pay-config.git).
// Round-2 playtest: `git log` one level up, in /srv/git, only said "not a git repository" and the
// player could not tell where the history was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld } from '../src/engine/build.ts';
import { Shell } from '../src/engine/shell.ts';
import { caseFriday1802 } from '../src/cases/friday-1802.ts';
import { parseLocal } from '../src/engine/time.ts';

function setup(host = 'pay-cfg', cwd = '/home/eunjae') {
  const world = buildWorld(caseFriday1802);
  const sh = new Shell(world, () => parseLocal('2026-11-16T09:30:00'));
  const s = sh.newSession('t', host, cwd);
  const run = (line: string) => sh.run(s, line);
  const out = (line: string) => run(line).lines.filter((l) => l.cls !== 'dim' && l.cls !== 'err').map((l) => l.text);
  return { run, out };
}

test('git log in /srv/git keeps the real error and points at the bare repository', () => {
  const { run } = setup();
  run('cd /srv/git');
  const r = run('git log');
  const err = r.lines.filter((l) => l.cls === 'err').map((l) => l.text);
  assert.equal(err[0], 'fatal: not a git repository (or any of the parent directories): .git', 'the real error comes first');
  assert.equal(err.length, 2);
  assert.ok(err[1].includes('/srv/git/pay-config.git'), `a pointer to the repository: ${err[1]}`);
  assert.ok(err[1].includes('cd pay-config.git'), 'relative to where the player stands');
});

test('the pointer also shows from the home directory, but not on a host without a repository', () => {
  const a = setup();
  const errA = a.run('git log').lines.filter((l) => l.cls === 'err').map((l) => l.text);
  assert.ok(errA[1]?.includes('cd /srv/git/pay-config.git'));
  const b = setup('pay-api-01');
  const r = b.run('git log');
  assert.deepEqual(r.lines.filter((l) => l.cls === 'err').map((l) => l.text), ['fatal: not a git repository (or any of the parent directories): .git']);
});

test('git --git-dir and git -C read the bare repository from anywhere', () => {
  const { run, out } = setup();
  run('cd /srv/git');
  const want = out('git -C pay-config.git log --oneline -1');
  assert.match(want[0], /^9f3c2e1 .*커넥션 풀 상향/);
  assert.deepEqual(out('git --git-dir=/srv/git/pay-config.git log --oneline -1'), want);
  assert.deepEqual(out('git --git-dir pay-config.git log --oneline -1'), want);
  assert.match(out('git --git-dir=pay-config.git log --format=fuller -1').join('\n'), /AuthorDate: Fri Nov 13 18:02:11 2026/);
  assert.ok(out('git --git-dir=pay-config.git branch -a').some((l) => /revert-pool-bump/.test(l)));
});

test('the intended path still works: cd into the bare repository, then git log / branch / hook', () => {
  const { run, out } = setup();
  run('cd /srv/git/pay-config.git');
  assert.match(out('git log --format=fuller -1').join('\n'), /AuthorDate: Fri Nov 13 18:02:11 2026/);
  assert.ok(out('git branch -a').some((l) => /revert-pool-bump/.test(l)));
  assert.ok(out('cat hooks/pre-receive').some((l) => /grep -qw git-admins && exit 0/.test(l)));
});
