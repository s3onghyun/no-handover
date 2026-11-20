// Round-3 숙련자 tightening (docs/campaign-ladder.md §3-1): in 숙련자 모드 the departed senior's
// records in Cases 0–2 are cut by half or more and no file holds the commands that solve the case;
// Case 2 adds one human account to reconcile with the system's record. Multi-select slots take
// exactly N options in every mode, so ticking every plausible line never scores 100.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.ts';
import { complete, EXTRA_PICK_COST, scoreSlot } from '../src/engine/scoring.ts';
import type { VNode } from '../src/engine/vfs.ts';
import { caseZeroWiki as c0 } from '../src/cases/case-0-wiki.ts';
import { caseOneCron as c1 } from '../src/cases/case-1-cron.ts';
import { caseTwoDeleted as c2 } from '../src/cases/case-2-deleted.ts';
import { caseFriday1802 as c3 } from '../src/cases/friday-1802.ts';
import type { CaseFile } from '../src/engine/types.ts';
import { cited } from './case-integrity.ts';

const out = (g: Game, cmd: string, tab = 0) =>
  g
    .runCommand(tab, cmd)
    .lines.map((l) => l.text)
    .join('\n');

/** Every file in a world, as [host, path, text]. */
function files(g: Game): [string, string, string][] {
  const res: [string, string, string][] = [];
  for (const [host, hw] of g.world.hosts) {
    const walk = (n: VNode, path: string) => {
      if (n.type === 'dir') for (const [name, c] of n.children ?? new Map()) walk(c, `${path === '/' ? '' : path}/${name}`);
      else res.push([host, path, typeof n.content === 'function' ? n.content() : String(n.content ?? '')]);
    };
    walk(hw.vfs.root, '/');
  }
  return res;
}

// the commands that solve each case (its e2e path and its 💡 정답), as they would be typed
const ANSWERS: [CaseFile, string[]][] = [
  [c0, ['df -h', 'du -sh /var/log', 'tail -n 20 /var/log/wiki', 'systemctl status wiki', 'journalctl -u wiki']],
  [c1, ['crontab -l', 'cat ~/log/cron-env.txt', 'cat ~/wiki-clean.log', 'which wikictl', 'type wikictl', 'env -i', 'journalctl -u cron']],
  [c2, ['df -h', 'du -sh /data', 'pgrep -f logshipd', 'grep deleted', '/fd |', 'journalctl --since', 'journalctl -u logshipd', 'journalctl -u payment-api', 'systemctl status logshipd']],
];

test('숙련자 records: no file in Cases 0–2 holds a command that solves the case (the default path still does)', () => {
  for (const [cs, cmds] of ANSWERS) {
    const hits = (g: Game) => files(g).flatMap(([host, path, text]) => cmds.filter((c) => text.includes(c)).map((c) => `${host}:${path} has "${c}"`));
    assert.ok(hits(new Game(cs)).length > 0, `${cs.id}: the default path keeps its records`);
    assert.deepEqual(hits(new Game(cs, null, { senior: true })), [], `${cs.id}: 숙련자 records`);
  }
});

test('숙련자 records: the senior\'s history, README and comments are cut by half or more', () => {
  const owner: [CaseFile, string][] = [[c0, 'wiki-01'], [c1, 'wiki-01'], [c2, 'logs-01']];
  const comments = (t: string) => t.split('\n').filter((l) => /^\s*#|\s#\s/.test(l) && !/^#!/.test(l)).length;
  for (const [cs, host] of owner) {
    const d = new Game(cs);
    const x = new Game(cs, null, { senior: true });
    const hist = (g: Game) => g.world.hosts.get(host)!.history.get('eunjae')!.length;
    assert.ok(hist(x) * 2 <= hist(d), `${cs.id}: history ${hist(x)} of ${hist(d)}`);
    const readme = (g: Game) => out(g, 'cat ~/README.txt').split('\n').filter((l) => l.trim()).length;
    assert.ok(readme(x) * 2 <= readme(d), `${cs.id}: README ${readme(x)} of ${readme(d)} lines`);
    // comment lines across the files the overlay rewrites (and the crontab)
    const paths = (cs.expert!.files ?? []).filter((f) => f.host === host && d.world.hosts.get(host)!.vfs.lookup(f.file.path)).map((f) => f.file.path);
    if (cs.expert!.crontabs?.length) paths.push('/var/spool/cron/crontabs/eunjae');
    const sum = (g: Game) => paths.reduce((a, p) => a + comments(String(g.world.hosts.get(host)!.vfs.lookup(p)?.content ?? '')), 0);
    assert.ok(paths.length >= 2, `${cs.id}: rewritten files ${paths.join(', ')}`);
    assert.ok(sum(x) * 2 <= sum(d), `${cs.id}: comments ${sum(x)} of ${sum(d)} in ${paths.join(', ')}`);
  }
});

test('숙련자 records: each case is still solvable from what the world shows', () => {
  // Case 0: the pre-typed history now shows the 2025 trace without the order; df/du still answer
  const g0 = new Game(c0, null, { senior: true });
  assert.match(out(g0, 'history'), /TODO: wiki 로그 logrotate/);
  out(g0, 'df -h');
  out(g0, 'du -sh /var/log/*');
  assert.ok('c0_df' in g0.st.clues && 'c0_du' in g0.st.clues);
  // Case 1: the crontab shows Doyun's relative line next to Eunjae's absolute one, without the why
  const g1 = new Game(c1, null, { senior: true });
  const tab = out(g1, 'crontab -l');
  assert.match(tab, /^0 9 \* \* 1 \/home\/eunjae\/bin\/disk-report\.sh/m);
  assert.doesNotMatch(tab, /절대 경로|cron-env/);
  assert.ok('c1_crontab' in g1.st.clues);
  assert.match(out(g1, 'cat ~/wiki-clean.log'), /line 15: wikictl: command not found/, 'the script still fails on line 15');
  // nothing on the desk or in the mail points at the comments that are gone
  assert.doesNotMatch(g1.cs.stickies.map((x) => x.text).join('\n'), /주석/);
  assert.doesNotMatch(g1.cs.mails.find((m) => m.id === 'eunjae-cron')!.body, /주석/);
  assert.doesNotMatch(g0.cs.mails.find((m) => m.id === 'brief')!.body, /순서가 거기/);
  assert.doesNotMatch(g0.cs.terminalTabs[0].scrollback!.join('\n'), /순서/);
  assert.match(out(g1, 'head -15 ~/bin/wiki-log-clean.sh').split('\n')[14], /^wikictl log truncate/);
  // Case 2: Eunjae's 2024 history keeps only the HUP that freed the space
  const g2 = new Game(c2, null, { senior: true });
  const h2 = out(g2, 'cat ~/.bash_history');
  assert.match(h2, /systemctl kill -s HUP logshipd/);
  assert.doesNotMatch(h2, /proc|deleted|du -sh/);
  out(g2, 'ls -l /proc/1187/fd');
  assert.ok('c2_deleted' in g2.st.clues);
});

test('Case 2 숙련자: Jihoon\'s own account of Wednesday disagrees with the journals (default path: no such mail)', () => {
  const g = new Game(c2, null, { senior: true });
  const m = g.cs.mails.find((x) => x.id === 'jihoon-account')!;
  assert.ok(m && m.from === 'jihoon' && m.account === 'me' && !m.later);
  // he says: debug briefly, switched back off, and he removed last week's file
  assert.match(m.body, /껐/);
  assert.match(m.body, /지난주/);
  // the system says: debug at 14:22:47 and never switched back, the file was this week's open raw file
  g.runCommand(0, 'ssh pay-api-01');
  const pay = out(g, 'journalctl -u payment-api');
  assert.match(pay, /14:22:47 .*log level changed: info -> debug .*stays until changed back/);
  assert.doesNotMatch(pay, /log level changed: debug -> info/);
  assert.equal(new Game(c2).cs.mails.some((x) => x.id === 'jihoon-account'), false);
});

test('multi-select: every multi slot takes exactly N; over-selection never scores 100', () => {
  const multis = [c0, c1, c2, c3].flatMap((cs) => cs.accusation.slots.filter((s) => s.type === 'multi').map((s) => [cs, s] as const));
  assert.ok(multis.length >= 2);
  for (const [cs, s] of multis) {
    const n = s.picks!;
    assert.ok(n >= 2, `${cs.id}/${s.id}: picks`);
    const pos = s.options.filter((o) => (o.weight ?? 0) > 0).sort((a, b) => b.weight! - a.weight!);
    assert.ok(pos.length > n, `${cs.id}/${s.id}: more true lines (${pos.length}) than picks (${n})`);
    assert.match(s.prompt, new RegExp(`${n}개`), `${cs.id}/${s.id}: the prompt says how many`);
    // the best N: full marks
    const best = scoreSlot(s, pos.slice(0, n).map((o) => o.id));
    assert.deepEqual([best.correct, best.points], [true, 100]);
    // every true line (the round-3 complaint: 5 of 8 still scored 100)
    const all = scoreSlot(s, pos.map((o) => o.id));
    assert.equal(all.correct, false, `${cs.id}/${s.id}: ticking every true line fails`);
    assert.ok(all.points < 100, `${cs.id}/${s.id}: ${all.points}`);
    assert.equal(all.points, 100 - (pos.length - n) * EXTRA_PICK_COST);
    // every non-negative option, and one more than N
    assert.ok(scoreSlot(s, s.options.filter((o) => (o.weight ?? 0) >= 0).map((o) => o.id)).points < 100);
    const plusOne = scoreSlot(s, pos.slice(0, n + 1).map((o) => o.id));
    assert.deepEqual([plusOne.correct, plusOne.points], [false, 100 - EXTRA_PICK_COST]);
    // any N true lines pass; fewer than N do not
    assert.equal(scoreSlot(s, pos.slice(-n).map((o) => o.id)).correct, true, `${cs.id}/${s.id}: the weakest N true lines still pass`);
    assert.equal(scoreSlot(s, pos.slice(0, n - 1).map((o) => o.id)).correct, false, `${cs.id}/${s.id}: fewer than N`);
  }
});

test('multi-select: the report counts a picks field as filled in only at exactly N', () => {
  const sub = (responsibility: string[]) => ({ cause: 'open', sequence: 'true', responsibility });
  assert.equal(complete(c2, sub(['no-verify', 'open-rule'])), false);
  assert.equal(complete(c2, sub(['no-verify', 'open-rule', 'quota'])), true);
  assert.equal(complete(c2, sub(['no-verify', 'open-rule', 'quota', 'silent-drop'])), false);
});

test('multi-select: a full report that ticks every true line cannot reach the top score (Case 2 and Case 3)', () => {
  const g = new Game(c2);
  const r = g.submit(cited(g, { cause: 'open', sequence: 'true', responsibility: ['no-verify', 'open-rule', 'debug-expiry', 'quota', 'silent-drop'] }))!;
  assert.equal(r.allCorrect, false);
  assert.ok(r.base < 300);
  const h = new Game(c3);
  const r3 = h.submit(cited(h, { cause: 'fd', sequence: 'true', responsibility: ['git-admins', 'cron', 'oncall', 'account', 'bottleneck', 'cover-seojin', 'cover-jihoon'] }))!;
  assert.equal(r3.allCorrect, false);
  assert.ok(r3.base < 300);
});
