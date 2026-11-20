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
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

  // ---- ask a colleague: the "뭐부터 봐요?" quick reply in the messenger, answered after "입력 중…"
  await page.locator('.icon[data-app="messenger"]').dblclick();
  const msgr = page.locator('.window[data-app="messenger"]');
  await msgr.locator('.side button.item', { hasText: '박지훈' }).click();
  assert.match(await msgr.locator('.composer .ask-to').innerText(), /박지훈님이 답해요/);
  await msgr.locator('.ask-chip', { hasText: '뭐부터 봐요?' }).click();
  await msgr.locator('.msg .text', { hasText: '뭐부터 봐요?' }).waitFor();
  await msgr.locator('.typing-row.on .typing', { hasText: '박지훈님이 입력 중' }).waitFor({ timeout: 3000 });
  await shot('polish-02-messenger-typing-ask.png');
  await msgr.locator('.msg .text', { hasText: '지금은 df -h 요!!' }).waitFor({ timeout: 4000 });
  assert.equal(await msgr.locator('.typing-row.on').count(), 0, 'typing indicator gone once the line lands');
  const askLog = await page.evaluate(() => window.__game.st.log.filter((e) => e.type === 'ask'));
  assert.equal(askLog.length, 1);
  assert.equal(askLog[0].from, 'jihoon');
  await msgr.locator('.titlebar button.close').click();
  step('messenger: the "뭐부터 봐요?" quick reply → "박지훈님이 입력 중…" → 지훈 names the current command (free, logged)');

  await run('ls');
  await page.waitForFunction(() => window.__game.st.live.some((m) => m.text === '그건 나중에요 ㅋㅋ df -h 부터!!'), null, { timeout: 5000 });
  step('an off-rail command gets one redirect in 지훈\'s voice');

  // ---- `hint` opens the 💡 panel: 요약 → 방향 → 정답 (asked twice) for the current checklist item
  await run('hint');
  const hp = page.locator('.popover.hints');
  await hp.waitFor();
  const objSec = hp.locator('.hp-sec[data-key="obj:df"]');
  assert.equal(await objSec.locator('[data-rung="direction"] button').isDisabled(), true, '방향 waits for 요약');
  await objSec.locator('[data-rung="summary"] button').click();
  await objSec.locator('[data-rung="summary"] li', { hasText: '은재님 history 보기' }).waitFor();
  await objSec.locator('[data-rung="direction"] button').click();
  await objSec.locator('.hp-dir', { hasText: 'Use% 열' }).waitFor();
  await objSec.locator('.hp-arm').click();
  await objSec.locator('.hp-confirm').waitFor();
  await objSec.locator('.hp-yes').click();
  await objSec.locator('.hp-answer', { hasText: 'df -h' }).waitFor();
  const causeSec = hp.locator('.hp-sec[data-key="cause"]');
  await causeSec.locator('[data-rung="summary"] button').click();
  await causeSec.locator('[data-rung="direction"] button').click();
  await causeSec.locator('.hp-dir', { hasText: 'Mounted on' }).waitFor();
  assert.match(await hp.locator('.hp-record').innerText(), /힌트 3회/);
  await shot('polish-01-hint-panel.png');
  await page.mouse.click(700, 300);
  await hp.waitFor({ state: 'detached' });
  step('`hint` → 💡 panel: 요약 (free) → 방향 → 정답 behind a second confirm, for the checklist item and the cause slot; record says 힌트 3회');

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

  // ---- evidence board as an observability dashboard: pins sit on the shared timeline
  await page.locator('.icon[data-app="board"]').dblclick();
  const board0 = page.locator('.window[data-app="board"]');
  await board0.locator('.obs-lanes .obs-mk[data-pin]').first().waitFor();
  const lanes0 = await board0.locator('.obs-lanes').getAttribute('aria-label');
  assert.match(lanes0, /^증거 타임라인, .*주석 2개: 오류·경고 2\./, lanes0);
  assert.equal(await board0.locator('.obs-lanes .obs-mk[data-pin]').count(), 2, '21:14 and 08:47 markers');
  assert.equal(await board0.locator('.obs-row.card').count(), 3, 'two timed log rows + the df line in the tray');
  assert.match(await board0.locator('.obs-logp .obs-row').first().innerText(), /11-09 21:14:03\s+WARN/);
  assert.equal(await board0.locator('.obs-trayp .obs-row').count(), 1);
  // the dashboard panels on the board carry the pins as annotations
  assert.ok((await board0.locator('.obs-tsp .obs-ann').count()) >= 4, 'pin annotations on the linked panels');
  // a marker is keyboard reachable and jumps to its log row
  const mk0 = board0.locator('.obs-lanes .obs-mk[data-pin]').last();
  const mkPin = await mk0.getAttribute('data-pin');
  await mk0.focus();
  await page.keyboard.press('Enter');
  await board0.locator(`.obs-row.flash[data-pin="${mkPin}"]`).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.pin), mkPin);
  // search box filters the log panel
  await board0.locator('.obs-search').fill('No space');
  assert.equal(await board0.locator('.obs-logp .obs-row').count(), 1);
  assert.equal(await board0.locator('.obs-logp mark').first().innerText(), 'No space');
  await board0.locator('.obs-search').fill('');
  await page.evaluate(() => document.querySelector('.window[data-app="board"]').classList.add('max'));
  await page.waitForTimeout(300);
  await shot('case0-board-observability.png');
  await board0.locator('.titlebar button.close').click();
  await page.locator('.icon[data-app="dashboard"]').dblclick();
  const dash0 = page.locator('.window[data-app="dashboard"]');
  await dash0.locator('.obs-tsp .obs-chart svg').first().waitFor();
  assert.equal(await dash0.locator('.obs-tsp').count(), 3);
  assert.match(await dash0.locator('.obs-tsp .obs-chart').first().getAttribute('aria-label'), /^응답 \(요청\/분\), 11\/9 \(월\) 18:00 → 11\/10 \(화\) 09:30\. 2xx: .*주석 2개/);
  assert.ok((await dash0.locator('.obs-tsp').first().locator('.obs-ann').count()) >= 2, 'pins drawn on the snapshot');
  assert.equal(await dash0.locator('.obs-stat').count(), 3);
  assert.match(await dash0.locator('.obs-stat').nth(2).innerText(), /데이터 없음/);
  await dash0.locator('.titlebar button.close').click();
  step('board: two pins on the evidence timeline + linked panels, Enter on a marker jumps to its row, search filters; dashboard draws the pins as annotations');
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
  assert.match(await rep0.locator('.record .rec-line').innerText(), /^힌트 3회 · (\d+분 )?\d+초 · 명령 \d+개$/);
  assert.equal(await rep0.locator('.badge-nohint').count(), 0, 'no badge after hints');
  assert.equal(await rep0.locator('.scorebox').innerText().then((x) => /−\d/.test(x)), false, 'no hint penalty outside senior mode');
  await rep0.locator('.cardbox').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const dlDir = mkdtempSync(join(tmpdir(), 'nh-card-'));
  const [dl] = await Promise.all([page.waitForEvent('download'), rep0.locator('.card-dl').click()]);
  assert.equal(dl.suggestedFilename(), 'no-handover-case0-wiki.png');
  const cardPath = join(shots ?? dlDir, shots ? 'result-card-case0.png' : 'card.png');
  await dl.saveAs(cardPath);
  const png = readFileSync(cardPath);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  rmSync(dlDir, { recursive: true, force: true });
  step('debrief: record "힌트 3회 · 소요 · 명령 수", no penalty; 결과 카드 downloads as a 1200×630 PNG');
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

  await page.waitForFunction(() => window.__game.st.live.some((m) => /설마/.test(m.text) && m.deletedAt !== undefined), null, { timeout: 15000 });
  step("지훈's '설마' line arrives in the messenger and is deleted a few seconds later");

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

  const board = page.locator('.window[data-app="board"]');
  await board.locator('.obs-lanes .obs-mk[data-pin]').first().waitFor();
  const lanes = await board.locator('.obs-lanes').getAttribute('aria-label');
  assert.match(lanes, /변경 1/, lanes);
  assert.match(lanes, /크론 1/, lanes);
  assert.match(lanes, /오류·경고 1/, lanes);
  // the crontab line (no time of its own) is drawn at its Saturday 03:15 run
  assert.match(await board.locator('.obs-lanes .obs-mk.k-cron').getAttribute('aria-label'), /^11\/14 \(토\) 03:15 크론 \(반복\): ⟳ 15 3 \* \* 6/);
  assert.match(await board.locator('.obs-lanes .obs-mk.k-deploy').getAttribute('aria-label'), /^11\/13 \(금\) 18:02 변경: AuthorDate/);
  assert.match(await board.locator('.obs-trayp .obs-cron').first().innerText(), /▲ 크론 15 3 \* \* 6 · 지금 구간 1회 실행 · 지난 실행 11\/14 \(토\) 03:15 · 다음 11\/21 \(토\) 03:15/);
  // 5xx panel: threshold label in text, pins as annotations
  const err = board.locator('.obs-tsp', { hasText: '5xx 비율' });
  assert.match(await err.locator('.obs-over-txt').innerText(), /알림 기준 20% 이상 03:16–/);
  assert.ok((await err.locator('.obs-ann.k-cron').count()) >= 1 && (await err.locator('.obs-ann.k-error').count()) >= 1);
  // the time range runs on the in-game clock: the last 6 hours hold none of the weekend's pins
  await board.locator('.obs-range').selectOption('6h');
  await board.locator('.obs-lanes .obs-nodata').waitFor();
  assert.match(await board.locator('.obs-logp .obs-empty').last().innerText(), /시간 범위 밖에 \d+개 더 있어요/);
  await board.locator('.obs-logp .obs-link').click();
  await board.locator('.obs-lanes .obs-mk[data-pin]').first().waitFor();
  assert.equal(await board.locator('.obs-range').inputValue(), 'fit');
  // panel menu: keyboard opens it, Escape closes it
  const kb = board.locator('.obs-tl .obs-kebab');
  await kb.focus();
  await page.keyboard.press('Enter');
  assert.equal(await kb.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await kb.getAttribute('aria-expanded'), 'false');
  // narrow screens: panels reflow to one column
  await page.evaluate(() => document.querySelector('.window[data-app="board"]').classList.add('max'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const boxes = await Promise.all(['.obs-tl', '.obs-logp', '.obs-trayp'].map((sel) => board.locator(sel).boundingBox()));
  assert.ok(boxes.every((b) => Math.abs(b.x - boxes[0].x) < 2 && b.width > 300), JSON.stringify(boxes));
  await shot('03b-evidence-board-narrow.png');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => document.querySelector('.window[data-app="board"]').classList.remove('max'));
  step('board: deploy, cron (from the crontab line) and error markers on the timeline; 5xx panel threshold + annotations; range picker on the in-game clock; kebab menu by keyboard; one column at 390 px');

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
  assert.match(await report.locator('.record .rec-line').innerText(), /^힌트 0회 · /);
  await report.locator('.badge-nohint', { hasText: '힌트 0회' }).waitFor();
  await report.locator('.cardbox').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot('polish-03-result-card.png');
  if (shots) {
    const [dl3] = await Promise.all([page.waitForEvent('download'), report.locator('.card-dl').click()]);
    await dl3.saveAs(join(shots, 'result-card-case3.png'));
  }
  step('Case 3 debrief: 힌트 0회 badge and the result card');

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
