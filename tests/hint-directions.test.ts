// The 💡 panel's ② 방향 for a stuck player: each direction comes in two parts, 볼 곳 (the concrete
// place: host or tab, command, file, panel, pin) and then 비교할 것 (what to put side by side, never
// the conclusion). These tests follow every 볼 곳 literally and check it turns up the clues it
// promises, check the staging (look → compare, compare straight away once the clues are found),
// and check no hint step gives away the answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/game.ts';
import { nextDirection } from '../src/engine/hintpanel.ts';
import type { CaseFile, DirectionDef } from '../src/engine/types.ts';
import { caseZeroWiki as c0 } from '../src/cases/case-0-wiki.ts';
import { caseOneCron as c1 } from '../src/cases/case-1-cron.ts';
import { caseTwoDeleted as c2 } from '../src/cases/case-2-deleted.ts';
import { caseFriday1802 as c3 } from '../src/cases/friday-1802.ts';

type Step = string | { tab: number; cmd: string } | { open: string };

/** What a player does when following a direction's 볼 곳 to the letter (keyed by its unlessClues). */
const FOLLOW: Record<string, Record<string, Step[]>> = {
  [c0.id]: {
    'c0_df,c0_du': ['df -h', 'du -sh /var/log/*'],
    'c0_loop,c0_status': ['tail -n 20 /var/log/wiki/wiki.log', 'systemctl status wiki'],
    c0_start: ['journalctl -u wiki'],
    c0_full: ['journalctl -u wiki'],
    'c0_loop,c0_suppressed': ['tail -n 20 /var/log/wiki/wiki.log', 'journalctl -u wiki'],
  },
  [c1.id]: {
    c1_cronran: ['journalctl -u cron'],
    c1_notfound: ['ls -l ~', 'cat ~/wiki-clean.log'],
    'c1_where,c1_cronpath': ['which wikictl', 'echo $PATH', 'cat ~/log/cron-env.txt'],
    c1_crontab: ['crontab -l'],
    c1_requeue: ['journalctl -u wiki --since "2026-11-11 00:00"'],
    c1_df: ['df -h'],
    'c1_cronran,c1_quiet': ['journalctl -u cron', 'cat ~/wiki-clean.log'],
  },
  [c2.id]: {
    'c2_df,c2_du': ['df -h', 'du -sh /data/collector/*'],
    'c2_pid,c2_deleted': ['pgrep -f logshipd', 'ls -l /proc/1187/fd | grep deleted'],
    c2_reopen: ['systemctl status logshipd', 'journalctl -u logshipd | grep SIGHUP'],
    c2_rm: ['journalctl -t sudo --since "2026-11-11 14:00" --until "2026-11-11 15:00"'],
    'c2_debug,c2_growth': ['journalctl -u logshipd', 'ssh pay-api-01', 'journalctl -u payment-api --since "2026-11-11 14:00"', 'exit'],
    c2_drop: ['journalctl -u logshipd | grep dropping'],
    r2_quota: ['cat /etc/logshipd/logshipd.conf'],
    r2_noverify: [{ open: 'channel:pc-logs' }, 'grep jhpark /var/log/auth.log'],
    'r2_expiry,r2_silent': ['ssh pay-api-01', 'journalctl -u payment-api', 'exit', 'journalctl -u logshipd | grep notify'],
  },
  [c3.id]: {
    c_cron: [{ tab: 0, cmd: 'journalctl -u cron' }, { tab: 0, cmd: 'crontab -l' }],
    c_history: [{ tab: 0, cmd: 'history' }],
    c_emfile: [{ tab: 0, cmd: 'journalctl -u payment-api --since "2026-11-14 03:10"' }],
    'c_fds,c_limit,c_backup_files': [{ tab: 0, cmd: 'systemctl show payment-api -p LimitNOFILE' }, { tab: 0, cmd: 'fds' }, { tab: 0, cmd: 'tail ~/log/backup.log' }],
    's_commit,s_revert': [{ tab: 3, cmd: 'cd /srv/git/pay-config.git' }, { tab: 3, cmd: 'git log --format=fuller' }, { tab: 3, cmd: 'git branch -a' }],
    's_last,s_approve': [{ tab: 2, cmd: 'last' }, { tab: 4, cmd: 'grep sjkang /var/log/nginx/access.log | tail' }],
    's_notif,s_summary': [{ open: 'notif:E06' }, { open: 'mail:summary' }],
    'r_group,r_hook': [{ tab: 3, cmd: 'getent group git-admins' }, { tab: 3, cmd: 'cat /srv/git/pay-config.git/hooks/pre-receive' }],
    s_vacation: [{ tab: 2, cmd: 'sudo ls /home/sjkang' }, { tab: 2, cmd: 'sudo cat /home/sjkang/휴가_인수인계_2026-11-13.md' }],
  },
};

const CASES: CaseFile[] = [c0, c1, c2, c3];
const keyOf = (d: DirectionDef) => (d.unlessClues ?? []).join(',');

function follow(g: Game, steps: Step[]): void {
  for (const s of steps) {
    if (typeof s === 'string') g.runCommand(0, s);
    else if ('open' in s) g.open(s.open);
    else g.runCommand(s.tab, s.cmd);
  }
}

for (const cs of CASES) {
  test(`${cs.id}: every report slot has a two-part direction (볼 곳 → 비교할 것)`, () => {
    for (const slot of cs.accusation.slots) {
      const mine = cs.hints.explicit.filter((d) => d.slot === slot.id);
      assert.ok(mine.some((d) => d.compare), `${slot.id}: at least one 비교할 것`);
      for (const d of mine) if (d.unlessClues?.length) assert.ok(d.compare, `${slot.id} [${keyOf(d)}]: a direction aimed at evidence says what to compare`);
    }
  });

  test(`${cs.id}: no hint step names the answer (correct option text or the 정답 specifics)`, () => {
    for (const slot of cs.accusation.slots) {
      const right = slot.options.filter((o) => o.correct || (o.weight ?? 0) > 0).map((o) => o.text);
      for (const d of cs.hints.explicit.filter((x) => x.slot === slot.id)) {
        for (const t of [d.text, d.compare ?? '']) {
          for (const r of right) assert.ok(!t.includes(r), `${slot.id}: "${t}" quotes an answer`);
          const ans = cs.hints.answers?.[slot.id];
          if (ans) assert.ok(!t.includes(ans), `${slot.id}: quotes the 정답 specifics`);
        }
      }
    }
  });
}

test('directions: every 볼 곳 aimed at evidence, followed literally, finds that evidence', () => {
  for (const cs of CASES) {
    for (const d of cs.hints.explicit.filter((x) => x.unlessClues?.length)) {
      const key = keyOf(d);
      const steps = FOLLOW[cs.id][key];
      assert.ok(steps, `${cs.id} [${key}]: no walk-through for this direction`);
      const g = new Game(cs);
      follow(g, steps);
      const found = g.foundSet();
      const missing = d.unlessClues!.filter((c) => !found.has(c));
      assert.deepEqual(missing, [], `${cs.id} [${key}]: following "${d.text}" left ${missing.join(', ')} unfound`);
    }
  }
});

test('staging: 볼 곳 first, then its 비교할 것, then the next direction', () => {
  const g = new Game(c2);
  g.openHint('cause', 'summary');
  const sec = () => g.hintPanel().find((s) => s.key === 'cause')!;
  assert.equal(sec().nextPart, 'look');
  const look = g.openHint('cause', 'direction')!;
  assert.equal(look.text, c2.hints.explicit[0].text);
  assert.equal(sec().nextPart, 'compare', 'the same direction\'s second part comes next');
  const cmp = g.openHint('cause', 'direction')!;
  assert.equal(cmp.text, c2.hints.explicit[0].compare);
  assert.deepEqual(sec().directionParts, ['look', 'compare']);
  assert.equal(g.openHint('cause', 'direction')!.text, c2.hints.explicit[1].text, 'then the next direction\'s 볼 곳');
  assert.equal(g.hintCount(), 3, 'each part is one hint step');
  assert.ok(g.st.log.some((e) => e.type === 'rung3' && e.part === 'compare'));
});

test('staging: once the evidence is found, the panel skips 볼 곳 and opens 비교할 것', () => {
  const g = new Game(c2);
  g.runCommand(0, 'df -h');
  g.runCommand(0, 'du -sh /data/collector/*');
  g.runCommand(0, 'pgrep -f logshipd');
  g.runCommand(0, 'ls -l /proc/1187/fd | grep deleted');
  g.openHint('cause', 'summary');
  const sec = () => g.hintPanel().find((s) => s.key === 'cause')!;
  // the one direction still pending (c2_reopen) comes first: the player has not seen it yet
  assert.equal(g.openHint('cause', 'direction')!.text, c2.hints.explicit[2].text);
  assert.equal(g.openHint('cause', 'direction')!.text, c2.hints.explicit[2].compare);
  // then the found ones: straight to what to compare (df vs du), not where df is
  assert.equal(sec().nextPart, 'compare');
  assert.equal(g.openHint('cause', 'direction')!.text, c2.hints.explicit[0].compare);
  assert.equal(g.openHint('cause', 'direction')!.text, c2.hints.explicit[1].compare);
  // their 볼 곳 parts are still there at the very end
  assert.equal(g.openHint('cause', 'direction')!.text, c2.hints.explicit[0].text);
  assert.equal(g.openHint('cause', 'direction')!.text, c2.hints.explicit[1].text);
  assert.equal(g.openHint('cause', 'direction'), null);
  assert.equal(sec().moreDirections, false);
});

test('staging: a direction without 비교할 것 is one step; old saves (no part) read as 볼 곳', () => {
  const found = new Set<string>();
  const i = c3.hints.explicit.findIndex((d) => d.slot === 'responsibility' && !d.compare);
  assert.ok(i >= 0);
  const all = c3.hints.explicit.map((d, index) => ({ d, index })).filter((x) => x.d.slot === 'responsibility');
  const opened = all.flatMap(({ d, index }) => (d.compare ? [{ index, part: 'look' as const }, { index, part: 'compare' as const }] : index === i ? [] : [{ index, part: 'look' as const }]));
  assert.deepEqual(nextDirection(c3, 'responsibility', found, opened), { index: i, part: 'look' });
  // an old save: one 방향 opened, no part recorded
  const g = new Game(c3);
  g.ladder.usePanel({ key: 'cause', rung: 'summary', index: 0, at: 0, cost: 0 });
  g.ladder.usePanel({ key: 'cause', rung: 'direction', index: 0, at: 1, cost: 10 });
  const sec = g.hintPanel().find((s) => s.key === 'cause')!;
  assert.deepEqual(sec.directionParts, ['look']);
  assert.equal(sec.nextPart, 'compare', 'the old 볼 곳 goes on to its 비교할 것');
});

test('staging: 숙련자 모드 charges each part; the default path only records it', () => {
  for (const senior of [false, true]) {
    const g = new Game(c3, null, { senior });
    g.openHint('cause', 'summary');
    g.openHint('cause', 'direction');
    g.openHint('cause', 'direction');
    assert.equal(g.hintCount(), 2);
    assert.equal(g.ladder.totalCost(), 20, 'cost is the record of what senior mode takes off');
    const r = g.submit({ cause: 'fd', sequence: 'true', responsibility: ['git-admins', 'cron', 'oncall', 'account'] })!;
    assert.equal(r.hintCost, senior ? 20 : 0);
  }
});
