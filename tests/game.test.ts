// Case integrity + a scripted solve through the Game API (no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cited } from './case-integrity.ts';
import { Game } from '../src/engine/game.ts';
import { caseFriday1802 as cs } from '../src/cases/friday-1802.ts';

test('case integrity: references resolve', () => {
  const people = new Set(Object.keys(cs.people));
  const channels = new Set(cs.channels.map((c) => c.id));
  const mails = new Set(cs.mails.map((m) => m.id));
  const notes = new Set(cs.notes.map((n) => n.id));
  const clues = new Set(cs.clues.map((c) => c.id));
  const hosts = new Set(cs.hosts.map((h) => h.name));
  for (const ev of cs.timeline)
    for (const e of ev.emits ?? []) {
      if ('host' in e) assert.ok(hosts.has(e.host), e.host);
      if (e.kind === 'message') {
        assert.ok(channels.has(e.channel), e.channel);
        assert.ok(people.has(e.from), e.from);
      }
    }
  for (const n of [...cs.hints.idle, ...Object.values(cs.hints.wrong)]) {
    assert.ok(channels.has(n.channel) && cs.channels.find((c) => c.id === n.channel)!.account === 'me', n.id);
    assert.ok(people.has(n.from));
    for (const c of n.unlessClues ?? []) assert.ok(clues.has(c), c);
  }
  for (const tr of cs.triggers) {
    if ('clue' in tr.when) assert.ok(clues.has(tr.when.clue));
    if ('allClues' in tr.when) tr.when.allClues.forEach((c) => assert.ok(clues.has(c), c));
    for (const a of tr.actions) {
      if ('mail' in a) assert.ok(mails.has(a.mail));
      if ('note' in a) assert.ok(notes.has(a.note));
      if ('message' in a) assert.ok(channels.has(a.message.channel));
    }
  }
  assert.ok(mails.has(cs.debrief.closingMail));
  for (const s of cs.accusation.slots) {
    const correct = s.type === 'single' ? s.options.filter((o) => o.correct).length : s.options.filter((o) => (o.weight ?? 0) > 0).length;
    assert.ok(correct >= 1, s.id);
    for (const o of s.options) if (o.blames) assert.ok(people.has(o.blames));
  }
  for (const c of cs.debrief.cast ?? []) assert.ok(people.has(c.who));
});

test('case integrity: the ten messenger excerpts E01–E10 from the character sheet are present', () => {
  const g = new Game(cs);
  const ids = new Set(g.world.messages.map((m) => m.id));
  for (const id of ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09']) assert.ok(ids.has(id), id);
  assert.ok(cs.triggers.some((t) => t.id === 'E10'));
  assert.equal(g.world.messages.filter((m) => m.channel === 'alerts' && m.text.startsWith('[P1]')).length, 37);
  const e06 = g.world.messages.find((m) => m.id === 'E06')!;
  assert.ok(e06.deletedAt);
});

test('case integrity: every key clue is reachable by some command or open action', () => {
  // Each key clue must be discoverable; run a fixed exploration and check.
  const g = new Game(cs);
  const play = (tab: number, cmds: string[]) => cmds.forEach((c) => g.runCommand(tab, c));
  play(0, ['journalctl -u payment-api --since "2026-11-14 03:00" --until "2026-11-14 04:00"', 'crontab -l', 'fds', 'systemctl show payment-api -p LimitNOFILE', 'tail -3 ~/log/backup.log']);
  play(3, ['cd /srv/git/pay-config.git', 'git log --format=fuller -1', 'git branch -a', 'getent group git-admins', 'cat hooks/pre-receive']);
  play(2, ['last']);
  play(4, ['grep sjkang /var/log/nginx/access.log']);
  g.open('notif:E06');
  g.open('mail:summary');
  for (const c of cs.clues.filter((x) => x.key)) assert.ok(c.id in g.st.clues, c.id);
});

test('scripted solve from the intended history line: rung 1 only, no hints, first submission', () => {
  const g = new Game(cs);
  g.st.unlocked = true;
  // The player opens the terminal: last tab has "crontab -" prefilled; they read history.
  assert.equal(g.tab(0).input, 'crontab -');
  g.runCommand(0, 'history | tail -20');
  assert.ok(g.st.log.some((e) => e.type === 'rung1'), 'reading the history line reaches rung 1');
  // ...and replay 4984-4988 exactly.
  for (const c of ['crontab -l', 'head -5 ~/bin/ledger-backup.sh', 'fds', 'systemctl show payment-api -p LimitNOFILE', 'tail -3 ~/log/backup.log']) {
    g.tick(20000);
    g.runCommand(0, c);
  }
  assert.ok(g.st.notesRevealed.includes('farewell'), 'memo scene fires on crontab -l');
  g.runCommand(0, 'journalctl -u payment-api -p err --since "2026-11-14 03:00"');
  assert.ok(g.causeSolved());
  for (let i = 0; i < 4; i++) g.tick(5000);
  assert.ok(g.st.live.some((m) => m.from === 'seojin' && m.text === '없어요. 런북에 없으면 없는 거예요.'), 'E10 exchange delivered');
  // sequence + responsibility evidence
  g.runCommand(3, 'cd /srv/git/pay-config.git');
  g.runCommand(3, 'git log --format=fuller -1');
  const commitLine = g.tab(3).lines.find((l) => l.text.startsWith('AuthorDate: Fri Nov 13 18:02:11'))!;
  g.pin({ kind: 'line', text: commitLine.text, source: 'pay-cfg · git log' });
  g.runCommand(3, 'git branch -a');
  g.runCommand(3, 'getent group git-admins');
  g.runCommand(3, 'grep git-admins hooks/pre-receive');
  g.runCommand(2, 'last');
  g.runCommand(4, 'grep "02:10" /var/log/nginx/access.log');
  for (let i = 0; i < 8; i++) g.tick(5000);
  assert.ok(g.st.live.some((m) => m.text === '확인했습니다.'), "Jihoon's confession");
  assert.ok(g.st.live.some((m) => m.text.startsWith('맞아요. 접속했어요.')), "Seojin's bullet list");
  // pin the key evidence
  for (const t of [0, 2, 3, 4]) for (const l of g.tab(t).lines) if (g.cluesFor(l.text).some((c) => g.clue(c)?.key)) g.pin({ kind: 'line', text: l.text, source: `tab${t}` });
  assert.ok(g.pinnedKeyClues() >= 6);
  const r = g.submit(cited(g, { cause: 'fd', sequence: 'true', responsibility: ['git-admins', 'cron', 'oncall', 'account', 'bottleneck', 'cover-seojin', 'cover-jihoon'] }))!;
  assert.equal(r.allCorrect, true);
  assert.equal(r.total, 330);
  assert.ok(g.st.finished);
  assert.ok(g.st.mailsDelivered.includes('closing'));
  assert.equal(g.st.log.filter((e) => e.type === 'rung3').length, 0);
  const rep = g.playtestReport() as { summary: { solved: boolean; rung1At: number } };
  assert.equal(rep.summary.solved, true);
});

test('wrong accusation triggers rung 2 in the blamed person\'s voice and caps at 3 submissions', () => {
  const g = new Game(cs);
  const wrong = { cause: 'approve', sequence: 'sneaky', responsibility: ['blame-seojin'] };
  g.submit(cited(g, wrong));
  assert.equal(g.typing()[0]?.from, 'seojin', 'the nudge is typed first (1–2 s)');
  g.tick(2000);
  assert.equal(g.st.live.at(-1)?.text, '음. 사람 말고 시간부터요. 03:15에 뭐가 시작됐는지.');
  g.submit(cited(g, wrong));
  const last = g.submit(cited(g, wrong));
  assert.ok(last && !last.allCorrect);
  assert.ok(g.st.finished);
  assert.equal(g.submit(cited(g, wrong)), null);
});

test('idle nudge after the configured time; save/load round trip keeps state and the player\'s sudo trace', () => {
  const g = new Game(cs, null, { idleMinutes: 1 });
  g.runCommand(2, 'sudo ls /home/sjkang');
  for (let i = 0; i < 13; i++) g.tick(5000);
  assert.ok(g.st.log.some((e) => e.type === 'rung2' && e.why === 'idle'));
  const saved = JSON.parse(g.serialize());
  const g2 = new Game(cs, saved);
  assert.equal(g2.st.playMs, g.st.playMs);
  assert.equal(g2.st.live.length, g.st.live.length);
  const auth = String(g2.world.hosts.get('bastion')!.vfs.lookup('/var/log/auth.log')!.content);
  assert.match(auth, /COMMAND=\/usr\/bin\/ls \/home\/sjkang/);
  // the shell session (cwd, typed history) survives too
  assert.equal(g2.shell.prompt(g2.tab(2).session), 'eunjae@bastion:~$');
});

test('game clock runs at clockRate and ends near the 21:00 deadline after ~45 minutes', () => {
  const g = new Game(cs);
  for (let i = 0; i < 540; i++) g.tick(5000); // 45 min
  assert.equal(g.now(), g.deadline());
});
