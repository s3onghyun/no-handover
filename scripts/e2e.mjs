// Browser end-to-end run: builds nothing, serves dist/ with `vite preview`, drives the real UI
// with playwright-core: first launch opens Case 0 (tutorial) — its short briefing, the pre-typed
// `history`, Jihoon's rail, the five checklist items and icon unlocks, a wrong then a right
// report — and the debrief's "다음 사건" button opens Case 3 「금요일 18:02」. There it watches
// the whole opening briefing, ticks the three "오늘 할 일" boxes, solves the case from the
// departed senior's history line, then checks the skip path, the help-menu replay and the
// persisted mute toggle in a second page.
//
//   npm run build && npm run e2e
//   E2E_SHOTS=/some/dir npm run e2e        # also save screenshots
//   PW_CHROMIUM=/path/to/chrome npm run e2e  # use a specific browser binary
//
// Uses the Playwright-managed headless shell from ~/.cache/ms-playwright when no path is given.

import { preview } from 'vite';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const shots = process.env.E2E_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const server = await preview({ preview: { port: 0, strictPort: false, open: false }, logLevel: 'silent' });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '11-14 03:15' : undefined));

const step = (name) => console.log(`  ✓ ${name}`);
const shot = async (name) => shots && (await page.screenshot({ path: join(shots, name) }));

async function run(cmd) {
  const input = page.locator('.tin input');
  await input.fill(cmd);
  await input.press('Enter');
  await page.waitForTimeout(80);
}
async function tab(label) {
  await page.locator('.ttab', { hasText: new RegExp(`^${label}$`) }).first().click();
}
async function pinLine(re) {
  const line = page.locator('.tline', { hasText: re }).last();
  await line.hover();
  await line.locator('.pinbtn').click();
}

const todoItem = (id) => page.locator(`.todo li[data-id="${id}"]`);

try {
  console.log(`e2e against ${url}`);
  await page.goto(`${url}?fresh=1`);

  // ================================================================ Case 0 (tutorial)
  await page.locator('#boot .caselabel', { hasText: 'Case 0 · 튜토리얼' }).waitFor();
  assert.match(await page.locator('#boot .skip').innerText(), /튜토리얼 건너뛰기 → Case 3 「금요일 18:02의 작은 변경」/);
  await shot('case0-01-boot.png');
  await page.locator('#boot .linkbtn.cases').click();
  assert.equal(await page.locator('#cases li').count(), 5);
  assert.equal(await page.locator('#cases li[data-id="friday-1802"].case-locked').count(), 1, 'Case 3 locked until Case 0 is solved');
  assert.equal(await page.locator('#cases li.case-soon').count(), 3, 'Cases 1, 2, 4 are titled placeholders');
  await page.locator('#cases button.primary').click();
  step('first launch: Case 0 · 튜토리얼 lock screen with a skip link; case list shows 5 rungs, Case 3 locked');

  await page.locator('#boot button.primary').click();
  let t0 = Date.now();
  await page.locator('#briefing').waitFor();
  await page.locator('#briefing').waitFor({ state: 'detached', timeout: 30000 });
  let secs = (Date.now() - t0) / 1000;
  assert.ok(secs <= 22, `tutorial briefing took ${secs}s`);
  step(`tutorial briefing (서진, voice message) ends on its own after ${secs.toFixed(1)} s`);

  assert.equal(await page.locator('.icons .icon').count(), 3, 'three icons at first');
  assert.equal(await page.locator('.tin input').inputValue(), 'history');
  assert.equal(await page.locator('.todo li').count(), 5);
  await page.locator('.window[data-app="terminal"] .tout').click();
  await page.locator('.tin input').press('Enter');
  await todoItem('history').and(page.locator('.done')).waitFor();
  await page.locator('.tline.clue', { hasText: '디스크 먼저' }).waitFor();
  await page.waitForFunction(() => window.__game.st.live.some((m) => m.from === 'jihoon' && /df -h !!/.test(m.text)), null, { timeout: 5000 });
  step('the pre-typed `history` succeeds on Enter, clue lines are yellow, 지훈 names the next command (df -h)');

  await run('ls');
  await page.waitForFunction(() => window.__game.st.live.some((m) => m.text === '그건 나중에요 ㅋㅋ df -h 부터!!'), null, { timeout: 5000 });
  step('an off-rail command gets one redirect in 지훈\'s voice');

  await run('df -h');
  await todoItem('df').and(page.locator('.done')).waitFor();
  await page.locator('.icon[data-app="notes"]').waitFor();
  await pinLine(/100%\s+\/var/);
  await page.waitForTimeout(300);
  await shot('case0-02-terminal-df.png');
  step('df -h: /var 100% (highlighted, pinned); the notebook icon appears');

  await run('du -sh /var/log/*');
  await page.locator('.tline.clue', { hasText: /^11G\s+\/var\/log\/wiki(?!\/)/ }).waitFor();
  await run('tail -n 20 /var/log/wiki/wiki.log');
  await todoItem('tail').and(page.locator('.done')).waitFor();
  await page.locator('.icon[data-app="board"]').waitFor();
  await run('systemctl status wiki');
  await todoItem('service').and(page.locator('.done')).waitFor();
  const notesWin = page.locator('.window[data-app="notes"] .titlebar button.close');
  await page.waitForTimeout(400);
  if (await notesWin.count()) await notesWin.click(); // the memo scene opened the notebook
  await pinLine(/wiki-server\[51875\]: OSError: \[Errno 28\] No space left on device/);
  await todoItem('pins').and(page.locator('.done')).waitFor();
  await page.locator('.todo').waitFor({ state: 'detached', timeout: 6000 });
  await page.locator('.icon[data-app="report"]').waitFor();
  step('du → tail → systemctl status → 2 pins: all five boxes tick, the sticky folds, every icon is unlocked');

  await run('journalctl -u wiki --since "2026-11-09 21:00" --until "2026-11-09 21:20"');
  await pinLine(/21:14:03 .*thumbnail/);
  await page.evaluate(() => {
    for (const w of document.querySelectorAll('.window')) w.classList.add('min');
  });
  await page.locator('.icon[data-app="report"]').dblclick();
  const rep0 = page.locator('.window[data-app="report"]');
  assert.equal(await rep0.locator('section.slot').count(), 2, 'two report slots');
  assert.match(await rep0.locator('.submitbar .primary-btn').innerText(), /제출 무제한/);
  await rep0.locator('input[name="slot-cause"]').nth(1).check(); // blames 지훈's PDF
  await rep0.locator('input[name="slot-sequence"]').nth(0).check();
  await rep0.locator('.submitbar .primary-btn').click();
  await rep0.locator('.reply', { hasText: '강서진의 회신' }).waitFor();
  await page.waitForFunction(() => window.__game.st.live.some((m) => m.from === 'jihoon' && /PDF 하나로/.test(m.text)), null, { timeout: 5000 });
  await rep0.locator('input[name="slot-cause"]').nth(0).check();
  await rep0.locator('.submitbar .primary-btn').click();
  await rep0.locator('.debrief h2').waitFor();
  const total0 = await rep0.locator('.scorebox .s').nth(1).innerText();
  assert.match(total0, /\/ 230/);
  await page.evaluate(() => document.querySelector('.window[data-app="report"]').classList.add('max'));
  await page.waitForTimeout(400);
  await shot('case0-03-debrief.png');
  assert.match(await rep0.locator('.nextcase').innerText(), /다음 사건 → Case 3 「금요일 18:02의 작은 변경」/);
  step(`a wrong report gets 서진's short reply and 지훈's nudge; the second solves Case 0 (${total0.replace(/\s+/g, ' ')})`);

  await rep0.locator('.nextcase button').click();
  await page.locator('#boot .caselabel', { hasText: 'Case 3' }).waitFor();
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('no-handover:campaign'))).solved, ['case0-wiki']);
  assert.equal(await page.locator('#boot .skip').count(), 0);
  step('debrief → 다음 사건: Case 3 lock screen; Case 0 recorded as solved');

  // ================================================================ Case 3 「금요일 18:02」
  await page.locator('#boot button.primary').click();

  // ---- opening briefing, full path (real time, ~30 s)
  t0 = Date.now();
  await page.locator('#briefing').waitFor();
  assert.equal(await page.locator('.window[data-app="terminal"]').count(), 0, 'desktop stays hidden during the briefing');
  await page.locator('#briefing[data-step="voice"] .brief-line').nth(1).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  await shot('onboarding-01-briefing.png');
  step('briefing: lock screen → voice message from 박지훈, subtitles typing');
  await page.locator('#briefing[data-step="mail"] .brief-mail', { hasText: '[긴급] 토요일 결제 장애 원인 보고' }).waitFor({ timeout: 40000 });
  step('briefing: CTO mail notification slides in');
  await page.locator('#briefing').waitFor({ state: 'detached', timeout: 30000 });
  secs = (Date.now() - t0) / 1000;
  assert.ok(secs >= 28 && secs <= 62, `briefing took ${secs}s`);
  step(`briefing ends on its own after ${secs.toFixed(1)} s`);

  await page.locator('.window[data-app="terminal"].pulse').waitFor();
  assert.equal(await page.locator('.tin input').inputValue(), 'crontab -');
  assert.equal(await page.locator('.todo li').count(), 3);
  assert.equal(await page.locator('.todo li.done').count(), 0);
  assert.ok(await todoItem('terminal').locator('.hint').isVisible());
  await page.waitForTimeout(700);
  // screenshot at the pulse's brightest frame (the animation keeps running afterwards)
  await page.evaluate(() => document.getAnimations().filter((a) => a.animationName === 'pulse').forEach((a) => (a.currentTime = 900)));
  await shot('onboarding-02-desktop-sticky.png');
  let fm = (await page.evaluate(() => window.__game.playtestReport())).summary.firstMinutes;
  assert.equal(fm.briefing.skipped, false);
  assert.ok(fm.briefing.watchedMs > 25000, `watchedMs ${fm.briefing.watchedMs}`);
  step('desktop: terminal open and pulsing with "crontab -", "오늘 할 일" sticky with 3 empty boxes');

  await page.locator('.window[data-app="terminal"] .tout').click();
  await todoItem('terminal').and(page.locator('.done')).waitFor();
  assert.equal(await page.locator('.window[data-app="terminal"].pulse').count(), 0, 'pulse stops after the first box');
  assert.ok(await page.evaluate(() => window.__audio.history.some((x) => x.id === 'sfx.tick')), 'tick cue requested');
  step('box 1 ticks on the first click into the terminal; the pulse stops; tick cue plays');

  await run('history | tail -20');
  await page.locator('.tline', { hasText: '4990' }).waitFor();
  await todoItem('last-command').and(page.locator('.done')).waitFor();
  step('history shows 4984–4990 and box 2 ("선배가 마지막에 친 명령") ticks');

  for (const c of ['crontab -l', 'head -5 ~/bin/ledger-backup.sh', 'fds', 'systemctl show payment-api -p LimitNOFILE', 'tail -3 ~/log/backup.log']) await run(c);
  await page.locator('.window[data-app="notes"] .ln.reveal', { hasText: '알았음. 늦었음.' }).waitFor();
  step('replaying the history line flips Doyun\'s memo ("→ 알았음. 늦었음.")');
  await pinLine(/^15 3 \* \* 6/);
  await pinLine(/^1947/);
  await pinLine(/^LimitNOFILE=4096/);
  await todoItem('pins').and(page.locator('.done')).waitFor();
  await page.locator('.todo').waitFor({ state: 'detached', timeout: 6000 });
  await page.locator('.toast', { hasText: '오늘 할 일 끝' }).click();
  await page.locator('.window[data-app="notes"] .item.sel', { hasText: '오늘 할 일 ✓' }).waitFor();
  await page.waitForTimeout(400);
  await shot('onboarding-03-sticky-folded.png');
  fm = (await page.evaluate(() => window.__game.playtestReport())).summary.firstMinutes;
  assert.ok(fm.objectives.every((o) => o.t !== null) && fm.objectivesFoldedAt !== null);
  assert.ok(fm.firstMeaningfulCommandAt !== null);
  step('box 3 ticks at the third pin; the sticky folds into the notebook ("오늘 할 일 ✓")');
  await page.locator('.window[data-app="notes"] .titlebar button.close').click();
  await pinLine(/opened 2,314 segment files/);

  await page.locator('.window[data-app="terminal"]').click({ position: { x: 300, y: 12 } });
  await run('journalctl -u payment-api --since "2026-11-14 03:14" --until "2026-11-14 03:18"');
  await pinLine(/03:15:40 .*too many open files/);
  await shot('02-terminal-journalctl.png');
  step('journalctl shows 03:15:40 "too many open files"');

  await tab('pay-cfg');
  await run('cd /srv/git/pay-config.git');
  await run('git log --format=fuller -1');
  await pinLine(/^AuthorDate: Fri Nov 13 18:02:11/);
  await run('git branch -a');
  await pinLine(/revert-pool-bump/);
  await run('getent group git-admins');
  await pinLine(/^git-admins:x:1050/);
  await run('cat hooks/pre-receive');
  await pinLine(/grep -qw git-admins && exit 0/);
  await tab('bastion');
  await run('last');
  await pinLine(/^sjkang .*vpn-10\.8\.3\.41/);
  await tab('review-web');
  await run('grep sjkang /var/log/nginx/access.log | tail -3');
  await pinLine(/02:10:07 .*approve/);
  step('sequence and responsibility evidence pinned from four hosts');

  await page.locator('.tray-btn[aria-label="알림 센터"]').click();
  await page.locator('.notif', { hasText: '급한 거 아니면' }).click();
  await page.mouse.click(700, 450);
  await page.evaluate(() => window.__game.open('mail:summary'));

  await page.locator('#taskbar').click({ position: { x: 5, y: 5 } });
  await page.evaluate(() => {
    for (const w of document.querySelectorAll('.window')) w.classList.add('min');
  });
  await page.locator('.icon[data-app="board"]').dblclick();
  await page.locator('.window[data-app="board"] .card').first().waitFor();
  const cards = await page.locator('.window[data-app="board"] .card').count();
  assert.ok(cards >= 10, `cards on board: ${cards}`);
  await shot('03-evidence-board.png');
  step(`evidence board holds ${cards} cards on the timeline`);

  await page.locator('.window[data-app="board"] .primary-btn').click();
  const report = page.locator('.window[data-app="report"]');
  await report.locator('input[name="slot-cause"]').nth(2).check();
  await report.locator('input[name="slot-sequence"]').nth(0).check();
  for (const i of [0, 1, 2, 3, 4, 5, 6]) await report.locator('input[name="slot-responsibility"]').nth(i).check();
  await report.locator('.submitbar .primary-btn').click();
  await report.locator('.debrief h2').waitFor();
  const total = await report.locator('.scorebox .s').nth(1).innerText();
  assert.match(total, /330 \/ 330/);
  step(`first submission solves the case (${total.replace(/\s+/g, ' ')})`);
  await page.evaluate(() => document.querySelector('.window[data-app="report"]').classList.add('max'));
  await page.waitForTimeout(400);
  await shot('04-debrief.png');

  const log = await page.evaluate(() => window.__game.playtestReport());
  assert.equal(log.summary.solved, true);
  assert.equal(log.summary.rung3.length, 0);
  assert.ok(log.summary.rung1At !== null);
  assert.equal(log.summary.campaign.playedTutorialFirst, true);
  step('playtest log: solved, rung 1 reached, no explicit hints, Case 0 played first');

  // ---- second page: skip path, help-menu replay, persisted mute
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  p2.on('pageerror', (e) => errors.push(String(e)));
  p2.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p2.goto(`${url}?fresh=1&case=friday-1802`);
  await p2.locator('#boot button.primary').click();
  await p2.locator('#briefing[data-step="ring"]').waitFor({ timeout: 10000 });
  await p2.keyboard.press('Escape');
  await p2.locator('#briefing').waitFor({ state: 'detached', timeout: 2000 });
  await p2.locator('.window[data-app="terminal"].pulse').waitFor({ timeout: 2000 });
  const g2 = await p2.evaluate(() => ({ b: window.__game.st.briefing, ladder: window.__game.ladder.state.lastProgressAt }));
  assert.equal(g2.b.skipped, true);
  assert.equal(g2.ladder, g2.b.endedAt, 'rung-2 idle timer starts when the briefing ends');
  step('skip path: Esc during the call card drops straight to the desktop; rung-2 timer starts there');

  await p2.locator('.tray-btn[aria-label="도움말"]').click();
  await p2.locator('.popover button', { hasText: '오프닝 다시 보기' }).click();
  await p2.locator('#briefing').waitFor();
  await p2.locator('.brief-skip').click();
  await p2.locator('#briefing').waitFor({ state: 'detached', timeout: 2000 });
  assert.equal(await p2.evaluate(() => window.__game.st.briefing.replays), 1);
  step('help menu replays the opening; the 건너뛰기 button skips it');

  await p2.locator('.tray-btn.sound').click();
  assert.equal(JSON.parse(await p2.evaluate(() => localStorage.getItem('no-handover:audio'))).muted, true);
  await p2.reload();
  assert.equal(await p2.locator('.tray-btn.sound').innerText(), '🔇');
  step('mute toggle persists across reloads');
  await p2.close();

  assert.deepEqual(errors, []);
  console.log('e2e passed');
} catch (e) {
  console.error('e2e failed:', e);
  if (shots) await page.screenshot({ path: join(shots, 'e2e-failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
