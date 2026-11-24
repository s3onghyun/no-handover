// Case 4 「남아 있는 열쇠」 (the season finale): every key clue is reachable with the tools the
// help lists, the hidden sign needs the crontab first, 은재's drafts open with 'namu', the
// player's own `crontab -r` is the hidden bad ending, and the finale's texts follow the choice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseFourKeys, HANDOVER_LINE, SIGN_LINES } from '../src/cases/case-4-keys.ts';
import { CAMPAIGN } from '../src/cases/index.ts';
import { Campaign } from '../src/engine/campaign.ts';
import { Game } from '../src/engine/game.ts';
import { voiceLines } from '../src/engine/voices.ts';
import { creditLines, replyBody } from '../src/ui/finale.ts';
import { checkIntegrity, briefingSecs } from './case-integrity.ts';

const cs = caseFourKeys;
const tab = (label: string) => cs.terminalTabs.findIndex((t) => t.label === label);
function game() {
  const g = new Game(cs, null);
  g.st.unlocked = true;
  return g;
}
const out = (g: Game, t: string, cmd: string) => g.runCommand(tab(t), cmd).lines.map((l) => l.text);

test('case4: integrity, on the ladder after Case 3, the sign spells 도망쳐요', () => {
  checkIntegrity(cs);
  const c = new Campaign(CAMPAIGN);
  assert.equal(c.entry('case4-keys')?.cs, cs);
  assert.equal(c.next('friday-1802')?.id, 'case4-keys');
  assert.equal(c.entries.filter((e) => !e.cs).length, 0, 'no placeholder left');
  assert.equal(SIGN_LINES.map((l) => [...l][0]).join(''), '도망쳐요');
  // the four lines are the ones Cases 0–3 show (the terminal lines and the plant sticky)
  const sources = CAMPAIGN.slice(0, 4).map((e) => JSON.stringify(e.cs));
  for (const [i, l] of SIGN_LINES.entries()) {
    const words = l.replace(/\s+\(.*\)$/, '').split(' / ')[0].slice(0, 12);
    assert.ok(sources[i].includes(words), `line ${i} "${words}" comes from Case ${i}`);
  }
  assert.ok(briefingSecs(cs) <= 60);
  // 은재 never speaks live: no hint, trigger or scene line from her
  assert.ok(!voiceLines(cs).some((l) => l.from === 'eunjae'));
});

test('case4: the key clues are reachable with the listed tools, in the tabs the security team opened', () => {
  const g = game();
  out(g, 'ledger-01', 'cat /etc/nsswitch.conf');
  out(g, 'ledger-01', 'getent passwd eunjae');
  out(g, 'ledger-01', 'last eunjae');
  out(g, 'ledger-01', 'sudo crontab -l -u eunjae');
  out(g, 'ledger-01', 'sudo ls -l /var/spool/cron/crontabs/eunjae');
  out(g, 'ledger-01', 'cat /home/eunjae/README.txt');
  out(g, 'pay-api-02', 'sudo cat /home/deploy/.ssh/authorized_keys');
  out(g, 'pay-api-02', 'sudo ssh-keygen -lf /home/deploy/.ssh/authorized_keys');
  out(g, 'pay-api-02', 'sudo grep "for deploy" /var/log/auth.log');
  out(g, 'bastion', 'sudo grep SEC-2211 /var/log/auth.log');
  out(g, 'bastion', 'ssh pay-api-01');
  out(g, 'bastion', 'sudo cat /home/eunjae/.bash_history');
  g.open('mail:checklist');
  g.open('mail:sec-done');
  const missing = cs.clues.filter((c) => c.key && !(c.id in g.st.clues)).map((c) => c.id);
  assert.deepEqual(missing, [], 'every key clue found');
  // and the red herrings resolve: the 11/20 print is 지훈's key
  const prints = out(g, 'pay-api-02', 'sudo ssh-keygen -lf /home/deploy/.ssh/authorized_keys');
  const login = out(g, 'pay-api-02', 'sudo grep "Nov 20 22:41" /var/log/auth.log')[0];
  const fp = login.match(/SHA256:(\S+)/)![1];
  assert.match(prints.find((l) => l.includes(fp))!, /jhpark@mbp-2024/);
  assert.ok(!prints.find((l) => l.includes(fp))!.includes('eunjae'));
});

test('case4: the directory account is gone on the LDAP servers, alive only on ledger-01; ssh as yourself only', () => {
  const g = game();
  assert.deepEqual(out(g, 'bastion', 'getent passwd eunjae'), []);
  assert.match(out(g, 'bastion', 'cat /etc/nsswitch.conf').join('\n'), /^passwd:\s+files ldap$/m);
  assert.match(out(g, 'ledger-01', 'getent passwd eunjae').join('\n'), /^eunjae:x:1001:1001/);
  assert.match(out(g, 'bastion', 'ssh ledger-01').join('\n'), /Permission denied \(publickey\)/);
  // 은재 cleared three servers on 11/13 (find -mtime), not the shared account
  assert.deepEqual(out(g, 'bastion', 'sudo find /home -name authorized_keys -mtime -14').filter((l) => l.startsWith('/')), ['/home/eunjae/.ssh/authorized_keys']);
  assert.deepEqual(out(g, 'pay-api-02', 'sudo find /home -name authorized_keys -mtime -14').filter((l) => l.startsWith('/')), []);
  assert.match(out(g, 'bastion', 'sudo find /home -name authorized_keys -mtime -14 -ls').join('\n'), /Nov 13 14:36 \/home\/eunjae\/\.ssh\/authorized_keys/);
  assert.match(out(g, 'bastion', 'ssh eunjae@pay-api-01').join('\n'), /Permission denied/);
  // nobody came in with 은재's key after 11/13 17:22 except the approved investigation on 11/16
  const ledger = out(g, 'ledger-01', 'sudo grep "Accepted publickey for eunjae" /var/log/auth.log').filter((l) => / sshd\[/.test(l));
  assert.equal(ledger.length, 1);
  assert.match(ledger[0], /^Nov 13 17:18:40/);
  const bastion = out(g, 'bastion', 'sudo grep "Accepted publickey for eunjae" /var/log/auth.log').filter((l) => / sshd\[/.test(l));
  assert.equal(bastion.filter((l) => l.startsWith('Nov 16')).length, 41);
  // 은재's key on the shared account: last used 10/02, before she left
  const prints = out(g, 'pay-api-02', 'sudo ssh-keygen -lf /home/deploy/.ssh/authorized_keys');
  const fpE = prints.find((l) => l.includes('eunjae@nuri-pc'))!.match(/SHA256:(\S+)/)![1];
  const uses = out(g, 'pay-api-02', 'sudo grep "Accepted publickey" /var/log/auth.log').filter((l) => l.includes(fpE));
  assert.deepEqual(uses.map((l) => l.slice(0, 6)), ['Oct 02']);
});

test('case4: the hidden sign needs the crontab first; then the notebook page shows it and 지훈 and 서진 react', () => {
  const g = game();
  g.open('note:signs');
  assert.equal('k_sign' in g.st.clues, false, 'the page alone is just four lines');
  out(g, 'ledger-01', 'sudo crontab -l -u eunjae');
  assert.ok('k_crontab_comment' in g.st.clues);
  assert.equal('k_sign' in g.st.clues, false);
  g.open('note:signs');
  assert.ok('k_sign' in g.st.clues);
  assert.ok(g.st.triggersFired.includes('sign-found'));
  for (let t = 0; t < 30_000; t += 250) g.tick(250);
  assert.ok(g.st.live.some((m) => m.from === 'jihoon' && m.text === 'ㅋㅋㅋㅋㅋ 도윤님 튀래요'));
  assert.ok(g.st.live.some((m) => m.from === 'seojin' && m.text === '음. 선배답네요.'));
});

test('case4: 은재\'s nine drafts open with namu (or 나무), all at once; drafts to 서진 can be forwarded', () => {
  const g = game();
  const drafts = cs.mails.filter((m) => m.password);
  assert.equal(drafts.length, 9);
  assert.equal(g.unlockDrafts('ledger'), false);
  assert.equal(g.draftOpen(drafts[0].id), false);
  assert.equal(g.unlockDrafts(' NAMU '), true);
  for (const d of drafts) assert.equal(g.draftOpen(d.id), true);
  assert.equal(new Game(cs, null).unlockDrafts('나무'), true);
  assert.equal(drafts.filter((d) => d.to === '강서진').length, 4);
  assert.match(drafts[7].body, /다리 넷이 다 같은 길이인 의자/, 'the chair the reply answers');
  g.forwardDraft(drafts[0].id);
  g.forwardDraft(drafts[0].id);
  assert.deepEqual(g.st.forwarded, [drafts[0].id]);
});

test('case4: crontab -r on the PC removes it (no question asked), restore brings it back, a reload keeps both', () => {
  const g = game();
  const events: unknown[] = [];
  g.on('crontab-removed', (p) => events.push(p));
  assert.match(out(g, 'nuri-pc', 'crontab -l').join('\n'), /몬스테라/);
  assert.match(out(g, 'ledger-01', 'crontab -r').join('\n'), /no crontab|조사 모드/);
  assert.deepEqual(out(g, 'nuri-pc', 'crontab -r'), []);
  assert.deepEqual(events, [{ host: 'nuri-pc', user: 'dyhan' }]);
  assert.match(g.runCommand(tab('nuri-pc'), 'crontab -l').lines.map((l) => l.text).join('\n'), /no crontab for dyhan/);
  const reloaded = new Game(cs, JSON.parse(g.serialize()));
  assert.match(reloaded.runCommand(tab('nuri-pc'), 'crontab -l').lines.map((l) => l.text).join('\n'), /no crontab for dyhan/);
  assert.equal(g.restoreCrontab('nuri-pc', 'dyhan'), true);
  assert.match(out(g, 'nuri-pc', 'crontab -l').join('\n'), /몬스테라/);
  assert.match(new Game(cs, JSON.parse(g.serialize())).runCommand(tab('nuri-pc'), 'crontab -l').lines.map((l) => l.text).join('\n'), /몬스테라/);
});

test('case4: the 24th handover line appends with Enter in the handover tab, and only there', () => {
  const g = game();
  assert.match(out(g, 'bastion', 'echo x >> /home/dyhan/handover/인수인계서_v4.md').join('\n'), /Read-only/);
  out(g, 'handover', HANDOVER_LINE);
  const v = out(g, 'handover', 'tail -1 인수인계서_v4.md');
  assert.equal(v[0], cs.finale!.handover.line);
  assert.equal(new Game(cs, JSON.parse(g.serialize())).runCommand(tab('handover'), 'tail -1 인수인계서_v4.md').lines.at(-1)!.text, cs.finale!.handover.line);
});

test('case4: solving the report plays the last scene (sign beats only if the sign was not found), then the finale', () => {
  for (const found of [false, true]) {
    const g = game();
    if (found) {
      out(g, 'ledger-01', 'sudo crontab -l -u eunjae');
      g.open('note:signs');
    }
    g.st.finished = true;
    g.startEnding();
    for (let t = 0; t < 60_000; t += 250) g.tick(250);
    const act = g.endingAwaits();
    assert.ok(act, 'waiting on the handover line');
    assert.equal(g.st.tabs[act!.tab].input, HANDOVER_LINE);
    const laughs = g.st.live.filter((m) => m.text === 'ㅋㅋㅋㅋㅋ 도윤님 튀래요').length;
    assert.equal(laughs, 1, found ? 'once, during the case' : 'once, in the scene');
    assert.ok(g.st.mailsDelivered.includes('fourth'));
    // the reason to hand it over at all: 서진 says 도윤's two weeks in the seat end today, before the 24th line
    assert.deepEqual(g.st.live.filter((m) => m.from === 'seojin' && m.channel === 'me-dm-seojin').map((m) => m.text).slice(-3), ['도윤님, 내일부터 원래 자리예요. 2주 고마웠어요.', '후임은 다음 달이래요. 선배 자리는 내일부터 비어요.', '인수인계서는 오늘 남기고 가요. 누구한테 넘길지는 도윤님이 정해요.']);
    g.runCommand(act!.tab, HANDOVER_LINE);
    for (let t = 0; t < 10_000; t += 250) g.tick(250);
    assert.equal(g.endingActive(), false);
  }
});

test('case4: the finale\'s texts follow the choice (cards end on the price; the title ending gets no reply)', () => {
  const f = cs.finale!;
  for (const o of f.choice.options) {
    assert.ok(f.cards[o.id]?.lines.length >= 3, o.id);
    assert.ok(f.endings.some((e) => e.id === o.id), o.id);
  }
  assert.deepEqual(f.choice.options.filter((o) => o.needsSign).map((o) => o.id), ['infra']);
  assert.equal(replyBody(f, 'nobody', { signFound: true, watered: true, forwarded: true, noHints: true }), null);
  const r = replyBody(f, 'infra', { signFound: true, watered: true, forwarded: false, noHints: false })!;
  assert.match(r, /^도윤님,\n다 같이 읽었다면서요/);
  assert.match(r, /첫 글자 찾았다면서요 :\)/);
  assert.match(r, /도망치라는 건 회사가 아니라, 혼자 다 기억하는 자리에서예요/);
  assert.match(r, /몬스테라 아직 살아 있다고 들었어요/);
  assert.doesNotMatch(r, /초안을 전해/);
  assert.match(r, /다리 하나가 자꾸 짧아요/);
  assert.match(r, /\n남은재$/);
  assert.match(replyBody(f, 'seojin', { signFound: false, watered: false, forwarded: true, noHints: false })!, /메모장을 세로로 읽어 봐요[\s\S]*초안을 전해 줬다면서요/);
  const v4 = String(new Game(cs, null).world.hosts.get('nuri-pc')!.vfs.lookup(f.handover.path)!.content) + '\n' + f.handover.line;
  assert.deepEqual(creditLines(f, 'infra', v4), f.credits);
  const alone = creditLines(f, 'nobody', v4);
  assert.match(alone[0], /^## 체크리스트 \(20\/24\)$/);
  assert.ok(alone.includes(f.handover.line));
  assert.match(f.crontab.byChoice.nobody.text, /^15 3 \* \* 6 /m, 'the title ending repeats Case 3\'s 03:15 cron');
  assert.match(f.crontab.byChoice.default.text, /# 왜:/);
});
