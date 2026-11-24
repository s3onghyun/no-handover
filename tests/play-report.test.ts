// Fixes from the full-season playthrough report (2026-11-24): systemctl's "… ago" follows the game
// clock, the tour counts marks in the order they show, the bastion line that closes SEC-2211 backs
// the Case 4 timeline, and the 몬스테라 restore says so in the terminal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusAgo, systemdAgo, parseLocal } from '../src/engine/time.ts';
import { Game, RESTORED_LINE } from '../src/engine/game.ts';
import { tourNumber, parseTourState } from '../src/engine/tour.ts';
import { kindsOf } from '../src/engine/evidence.ts';
import { caseZeroWiki } from '../src/cases/case-0-wiki.ts';
import { caseFourKeys } from '../src/cases/case-4-keys.ts';

test('systemd relative time: the shapes systemctl status prints', () => {
  const s = 1000, m = 60 * s, h = 60 * m, d = 24 * h;
  assert.equal(systemdAgo(30 * s), '30s ago');
  assert.equal(systemdAgo(2 * m + 5 * s), '2min 5s ago');
  assert.equal(systemdAgo(42 * m), '42min ago');
  assert.equal(systemdAgo(h + 11 * m), '1h 11min ago');
  assert.equal(systemdAgo(22 * h + 40 * m), '22h ago');
  assert.equal(systemdAgo(27 * h), '1 day 3h ago');
  assert.equal(systemdAgo(3 * d + h), '3 days ago');
  assert.equal(systemdAgo(10 * d + h), '1 week 3 days ago');
  assert.equal(systemdAgo(8 * d), '1 week 1 day ago');
  assert.equal(systemdAgo(14 * d), '2 weeks 0 days ago');
  const line = '     Active: failed (Result: exit-code) since Tue 2026-11-10 08:47:41 KST; 42min ago';
  assert.equal(statusAgo(line, parseLocal('2026-11-10T09:58:10')), '     Active: failed (Result: exit-code) since Tue 2026-11-10 08:47:41 KST; 1h 10min ago');
  assert.equal(statusAgo('   Main PID: 640 (cron)', 0), '   Main PID: 640 (cron)', 'other lines unchanged');
});

test('B5: Case 0 `systemctl status wiki` says how long ago by the game clock, not a fixed 42min', () => {
  const g = new Game(caseZeroWiki, null);
  g.st.unlocked = true;
  const status = () => g.runCommand(0, 'systemctl status wiki').lines.map((l) => l.text).find((l) => /Active: failed/.test(l))!;
  const first = status();
  const since = parseLocal('2026-11-10T08:47:41');
  assert.ok(first.endsWith(`; ${systemdAgo(g.now() - since)}`), first);
  // half an hour of game time later (the playtester's clock read 09:58)
  g.st.playMs += (28 * 60 * 1000) / g.st.settings.clockRate;
  const later = status();
  assert.notEqual(later, first);
  assert.ok(later.endsWith(`; ${systemdAgo(g.now() - since)}`), later);
  assert.match(later, /; 1h \d+min ago$/);
});

test('B7: tour marks count 1, 2, 3… in the order they show, whatever the data order', () => {
  const steps = caseZeroWiki.tour!.steps;
  const st = parseTourState(null);
  assert.equal(tourNumber(steps, st), '1/8');
  st.seen.push('terminal', 'messenger', 'mail', 'hint', 'notes');
  // the report mark (8th in the data) shows before board and dashboard: it reads 6/8, not 8/8
  assert.equal(tourNumber(steps, st), '6/8');
  // a seen id from another case does not count here
  st.seen.push('elsewhere');
  assert.equal(tourNumber(steps, st), '6/8');
});

test('B8: Case 4 bastion auth.log — the line that closes SEC-2211 backs 경위 as an access record', () => {
  const g = new Game(caseFourKeys, null);
  g.st.unlocked = true;
  const tab = caseFourKeys.terminalTabs.findIndex((t) => t.label === 'bastion');
  const lines = g.runCommand(tab, 'sudo grep eunjae /var/log/auth.log').lines.map((l) => l.text);
  const closed = lines.find((l) => l.includes('SEC-2211 closed; LDAP account eunjae disabled'))!;
  assert.ok(closed, 'grep eunjae prints the closing line');
  assert.ok('s_sec2211' in g.st.clues);
  const pin = g.pin({ kind: 'line', text: closed, source: 'bastion · sudo grep eunjae /var/log/auth.log', host: 'bastion', cmd: 'sudo grep eunjae /var/log/auth.log' });
  const slot = caseFourKeys.accusation.slots.find((s) => s.id === 'sequence')!;
  assert.deepEqual(kindsOf(slot, pin).map((k) => k.id), ['access']);
});

test('B14: 「지우기 직전으로 돌아가기」 leaves a line under crontab -r and the crontab is back', () => {
  const g = new Game(caseFourKeys, null);
  g.st.unlocked = true;
  const f = caseFourKeys.finale!;
  const tab = caseFourKeys.terminalTabs.findIndex((t) => t.host === f.bad.host);
  g.runCommand(tab, 'crontab -r');
  assert.ok(g.restoreCrontab(f.bad.host, f.bad.user));
  const lines = g.st.tabs[tab].lines.map((l) => l.text);
  assert.match(lines.at(-2)!, /crontab -r$/);
  assert.equal(lines.at(-1), RESTORED_LINE);
  assert.match(g.runCommand(tab, 'crontab -l').lines.map((l) => l.text).join('\n'), /월요일: 몬스테라|몬스테라/);
});
