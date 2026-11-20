// Browser end-to-end run: builds nothing, serves dist/ with `vite preview`, drives the real UI
// with playwright-core: first launch opens Case 0 (tutorial) — its short briefing, the pre-typed
// `history`, Jihoon's rail, the five checklist items and icon unlocks with one coach mark each, a wrong then a right
// report — and the debrief's "다음 사건" button opens Case 1 「밤에만 실패하는 스크립트」 (full
// briefing, only the 🎯 goal coach mark, the goal card, the aha moment, a bundled wrong reply,
// the result moment), then Case 2 「지웠는데 안 비워지는 디스크」 (two hosts, the deleted open file,
// three slots), then Case 3 「금요일 18:02」. There it watches
// the whole opening briefing, ticks the three "오늘 할 일" boxes, solves the case from the
// departed senior's history line, then checks the skip path, the help-menu replay and the
// persisted mute toggle in a second page, the board/dashboard once more with reduced motion, and a
// fourth page with reduced motion where the tour, the aha moment and typing never block each other,
// and "투어 건너뛰기" ends Case 0's tour. A fifth page plays Case 0 at 1280x800 with single mouse
// clicks at element centres (the blind playtester's tool): board icon, taskbar, Enter, and pins
// with the memo and the checklist on screen. The first launch asks "터미널이 익숙해요 / 처음이에요"
// once; the main run answers 처음이에요 (the tour), a sixth page answers 익숙해요 by keyboard (no
// coach marks, a 도구 안내 entry, no window opening by itself) and switches back in ❓.
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
/** A coach mark: waits for it, checks it is the only one on screen, then "알겠어요". */
async function mark(id, shotName) {
  const m = page.locator(`.tour[data-step="${id}"]`);
  await m.waitFor({ timeout: 6000 });
  assert.equal(await page.locator('.tour').count(), 1, 'one mark at a time');
  if (shotName) {
    await page.waitForTimeout(500);
    await shot(shotName);
  }
  await m.locator('.tour-ok').click();
  await m.waitFor({ state: 'detached' });
}

try {
  console.log(`e2e against ${url}`);
  await page.goto(`${url}?fresh=1`);

  // ================================================================ Case 0 (tutorial)
  await page.locator('#boot .caselabel', { hasText: 'Case 0 · 튜토리얼' }).waitFor();
  assert.match(await page.locator('#boot .skip').innerText(), /튜토리얼 건너뛰기 → Case 1 「밤에만 실패하는 스크립트」/);
  await shot('case0-01-boot.png');
  await page.locator('#boot .linkbtn.cases').click();
  assert.equal(await page.locator('#cases li').count(), 5);
  for (const id of ['case1-cron-env', 'case2-deleted-open', 'friday-1802']) assert.equal(await page.locator(`#cases li[data-id="${id}"].case-locked`).count(), 1, `${id} locked until the case before it is solved`);
  assert.equal(await page.locator('#cases li.case-soon').count(), 1, 'Case 4 is the only titled placeholder');
  await page.locator('#cases button.primary').click();
  step('first launch: Case 0 · 튜토리얼 lock screen with a skip link to Case 1; case list shows 5 rungs, Cases 1–3 locked');

  // first run: the unlock button is the one-time "터미널이 익숙해요 / 처음이에요" choice
  const expq = page.locator('#boot .expq');
  await expq.waitFor();
  assert.equal(await expq.locator('button').count(), 2);
  assert.match(await expq.locator('.exp-familiar').innerText(), /터미널이 익숙해요/);
  assert.match(await expq.locator('.exp-new').innerText(), /처음이에요/);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('exp-new')), true, 'keyboard focus starts on a choice');
  await shot('case0-00-experience.png');
  await page.locator('#boot .exp-new').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('no-handover:experience')), 'new');
  step('first run asks once: 터미널이 익숙해요 / 처음이에요 → 처음이에요 (tour on), saved');
  let t0 = Date.now();
  await page.locator('#briefing').waitFor();
  await page.locator('#briefing').waitFor({ state: 'detached', timeout: 30000 });
  let secs = (Date.now() - t0) / 1000;
  assert.ok(secs <= 22, `tutorial briefing took ${secs}s`);
  step(`tutorial briefing (서진, voice message) ends on its own after ${secs.toFixed(1)} s`);

  assert.equal(await page.locator('.icons .icon').count(), 3, 'three icons at first');
  assert.equal(await page.locator('.tin input').inputValue(), 'history');
  assert.equal(await page.locator('.todo li').count(), 5);

  // ---- tool tour: the three starting tools, one coach mark at a time; the terminal input stays live
  await mark('terminal', 'case0-tour-terminal.png');
  await mark('messenger');
  await mark('mail');
  await page.waitForTimeout(800);
  assert.equal(await page.locator('.tour').count(), 0, 'the next marks wait for their unlock');
  step('tool tour: 터미널 → 메신저 → 메일 marks for the three starting icons, one at a time');
  await page.locator('.window[data-app="terminal"] .tout').click();
  await page.locator('.tin input').press('Enter');
  await todoItem('history').and(page.locator('.done')).waitFor();
  await page.locator('.tline.clue', { hasText: '디스크 먼저' }).waitFor();
  await page.waitForFunction(() => window.__game.st.live.some((m) => m.from === 'jihoon' && /그 순서대로 가 봐요/.test(m.text)), null, { timeout: 5000 });
  assert.ok(!(await page.evaluate(() => window.__game.st.live.some((m) => m.from === 'jihoon' && /df -h/.test(m.text)))), '지훈 does not type the command for you');
  assert.doesNotMatch(await todoItem('df').innerText(), /df -h/, 'the checklist names the step, not the command');
  step('the pre-typed `history` succeeds on Enter, clue lines are yellow, 지훈 nudges toward the next step without the command');
  await mark('hint');
  step('tool tour: the 💡 mark once the first checklist item is ticked');

  // ---- ask a colleague: the "뭐부터 봐요?" quick reply in the messenger, answered after "입력 중…"
  await page.locator('.icon[data-app="messenger"]').dblclick();
  const msgr = page.locator('.window[data-app="messenger"]');
  await msgr.locator('.side button.item', { hasText: '박지훈' }).click();
  assert.match(await msgr.locator('.composer .ask-to').innerText(), /박지훈님이 답해요/);
  await msgr.locator('.ask-chip', { hasText: '뭐부터 봐요?' }).click();
  await msgr.locator('.msg .text', { hasText: '뭐부터 봐요?' }).waitFor();
  await msgr.locator('.typing-row.on .typing', { hasText: '박지훈님이 입력 중' }).waitFor({ timeout: 3000 });
  await shot('polish-02-messenger-typing-ask.png');
  await msgr.locator('.msg .text', { hasText: '지금은 디스크 차례예요!!' }).waitFor({ timeout: 4000 });
  assert.equal(await msgr.locator('.typing-row.on').count(), 0, 'typing indicator gone once the line lands');
  const askLog = await page.evaluate(() => window.__game.st.log.filter((e) => e.type === 'ask'));
  assert.equal(askLog.length, 1);
  assert.equal(askLog[0].from, 'jihoon');
  await msgr.locator('.titlebar button.close').click();
  step('messenger: the "뭐부터 봐요?" quick reply → "박지훈님이 입력 중…" → 지훈 names the current step and points at history / 💡 (free, logged)');

  await run('ls');
  await page.waitForFunction(() => window.__game.st.live.some((m) => m.text === '그건 나중에요 ㅋㅋ 디스크부터 봐요!!'), null, { timeout: 5000 });
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
  assert.equal(await hp.locator('.hp-opens dd').innerText(), '1번 · 세지 않음');
  assert.equal(await hp.locator('.hp-steps dd').innerText(), '3개 · 방향·정답');
  assert.match(await hp.locator('.hp-record').innerText(), /패널을 열거나 요약을 보는 건 세지 않아요/);
  await shot('polish-01-hint-panel.png');
  await page.mouse.click(700, 300);
  await hp.waitFor({ state: 'detached' });
  step('`hint` → 💡 panel: 요약 (free) → 방향 → 정답 behind a second confirm, for the checklist item and the cause slot; counters: panel opened 1번 (not counted) apart from 3 hint steps');

  await run('df -h');
  await todoItem('df').and(page.locator('.done')).waitFor();
  await page.locator('.icon[data-app="notes"]').waitFor();
  await mark('notes', 'case0-tour-notes.png');
  await pinLine(/100%\s+\/var/);
  await page.waitForTimeout(300);
  await shot('case0-02-terminal-df.png');
  step('df -h: /var 100% (highlighted, pinned); the notebook icon appears with its 메모장 mark');

  await run('du -sh /var/log/*');
  await page.locator('.tline.clue', { hasText: /^11G\s+\/var\/log\/wiki(?!\/)/ }).waitFor();
  await run('tail -n 20 /var/log/wiki/wiki.log');
  await todoItem('tail').and(page.locator('.done')).waitFor();
  await page.locator('.icon[data-app="board"]').waitFor();
  await mark('board');
  await run('systemctl status wiki');
  await todoItem('service').and(page.locator('.done')).waitFor();
  await mark('dashboard');
  const notesWin = page.locator('.window[data-app="notes"] .titlebar button.close');
  await page.waitForTimeout(400);
  if (await notesWin.count()) await notesWin.click(); // the memo scene opened the notebook
  await pinLine(/wiki-server\[51875\]: OSError: \[Errno 28\] No space left on device/);
  await todoItem('pins').and(page.locator('.done')).waitFor();
  await page.locator('.todo').waitFor({ state: 'detached', timeout: 6000 });
  await page.locator('.icon[data-app="report"]').waitFor();
  await mark('report');
  const tourLog0 = await page.evaluate(() => window.__game.st.log.filter((e) => e.type === 'tour-step').map((e) => e.step));
  assert.deepEqual(tourLog0, ['terminal', 'messenger', 'mail', 'hint', 'notes', 'board', 'dashboard', 'report'], 'each Case 0 mark once, at its unlock');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('no-handover:tour'))).seen, tourLog0);
  step('du → tail → systemctl status → 2 pins: all five boxes tick, the sticky folds, every icon is unlocked, each with its mark (8 marks, each once)');

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
  assert.match(await rep0.locator('.record .rec-line').innerText(), /^힌트 단계 3개 · (\d+분 )?\d+초 · 명령 \d+개$/);
  assert.match(await rep0.locator('.record .rec-panel').innerText(), /💡 패널은 \d+번 열었어요 — 패널을 연 횟수는 세지 않아요/);
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
  step('debrief: record "힌트 단계 3개 · 소요 · 명령 수" with panel opens noted as not counted, no penalty; 결과 카드 downloads as a 1200×630 PNG');
  assert.match(await rep0.locator('.nextcase').innerText(), /다음 사건 → Case 1 「밤에만 실패하는 스크립트」/);
  step(`a wrong report gets 서진's short reply and 지훈's nudge; the second solves Case 0 (${total0.replace(/\s+/g, ' ')})`);

  await rep0.locator('.nextcase button').click();
  await page.locator('#boot .caselabel', { hasText: 'Case 1' }).waitFor();
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('no-handover:campaign'))).solved, ['case0-wiki']);
  assert.equal(await page.locator('#boot .skip').count(), 0);
  assert.equal(await page.locator('#boot .expq').count(), 0, 'the experience question is asked once');
  await shot('case1-01-boot.png');
  step('debrief → 다음 사건: Case 1 lock screen; Case 0 recorded as solved');

  // ================================================================ Case 1 「밤에만 실패하는 스크립트」
  await page.locator('#boot button.primary').click();
  t0 = Date.now();
  await page.locator('#briefing').waitFor();
  await page.locator('#briefing[data-step="voice"] .brief-line').nth(1).waitFor({ timeout: 20000 });
  assert.match(await page.locator('.brief-card').innerText(), /강서진/);
  await page.waitForTimeout(800);
  await shot('case1-02-briefing.png');
  await page.locator('#briefing[data-step="mail"] .brief-mail', { hasText: '[연습 2] wiki-01 /var 92%' }).waitFor({ timeout: 45000 });
  await page.locator('#briefing').waitFor({ state: 'detached', timeout: 30000 });
  secs = (Date.now() - t0) / 1000;
  assert.ok(secs >= 28 && secs <= 62, `Case 1 briefing took ${secs}s`);
  step(`Case 1 briefing: 서진's voice message (subtitles), the mail slides in, ends on its own after ${secs.toFixed(1)} s`);

  // ---- tool tour: the tools were introduced in Case 0, so only the 🎯 goal mark is new here
  await page.locator('.tour[data-step="goal"]').waitFor({ timeout: 5000 });
  assert.equal(await page.locator('.tour').count(), 1, 'one mark at a time');
  await page.waitForTimeout(500);
  await shot('case1-03-tour.png');
  await page.locator('.tour .tour-ok').click();
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('.tour').count(), 0, 'no tool mark repeats in Case 1');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('no-handover:tour'))).seen, ['terminal', 'messenger', 'mail', 'hint', 'notes', 'board', 'dashboard', 'report', 'goal']);
  step('tool tour: Case 1 shows only the 🎯 목표 mark; no tool mark from Case 0 repeats');

  // ---- goal card: in the checklist and behind 🎯
  assert.match(await page.locator('.todo-goal').innerText(), /원인 · 경위/);
  assert.equal(await page.locator('.todo li').count(), 4);
  assert.equal(await page.locator('.icons .icon').count(), 5, 'five icons at first');
  await page.locator('.goalbtn').click();
  assert.equal(await page.locator('.goalpop .goal-list li').count(), 2);
  await shot('case1-04-goal.png');
  await page.locator('.goalbtn').click();
  await page.locator('.goalpop').waitFor({ state: 'detached' });
  step('goal card "이번 사건에서 밝혀낼 것": two report slots, in the checklist and behind 🎯');

  await page.locator('.window[data-app="terminal"] .tout').click();
  await run('crontab -l');
  await todoItem('crontab').and(page.locator('.done')).waitFor();
  await page.waitForTimeout(300);
  await shot('case1-05-crontab.png');
  await run('journalctl -u cron --since "2026-11-11 00:50" --until "2026-11-11 01:10"');
  await todoItem('ran').and(page.locator('.done')).waitFor();
  await page.locator('.icon[data-app="dashboard"]').waitFor();
  await run('ls -l ~');
  await run('cat ~/wiki-clean.log');
  await page.locator('.moment.moment-aha').waitFor({ timeout: 3000 });
  await page.keyboard.press('Escape');
  await page.locator('.moment').waitFor({ state: 'detached', timeout: 2000 });
  await todoItem('output').and(page.locator('.done')).waitFor();
  step('crontab -l → journalctl -u cron → ~/wiki-clean.log: three boxes tick; the aha moment shows once and Esc skips it');
  await pinLine(/^0 \* \* \* \* ~\/bin\/wiki-log-clean\.sh/);
  await pinLine(/line 15: wikictl: command not found/);
  await pinLine(/\(eunjae\) CMD \(~\/bin\/wiki-log-clean/);
  await todoItem('pins').and(page.locator('.done')).waitFor();
  await page.locator('.todo').waitFor({ state: 'detached', timeout: 6000 });
  for (const c of ['which wikictl', 'cat ~/log/cron-env.txt', 'journalctl -u wiki --since "2026-11-11 00:00" --until "2026-11-11 00:10"', 'df -h']) await run(c);
  assert.ok(await page.evaluate(() => window.__game.causeSolved()));
  step('pins tick the fourth box; which / cron-env.txt / journalctl -u wiki / df complete the evidence');

  await page.evaluate(() => {
    for (const w of document.querySelectorAll('.window')) w.classList.add('min');
  });
  await page.locator('.icon[data-app="report"]').dblclick();
  const rep1 = page.locator('.window[data-app="report"]');
  assert.equal(await rep1.locator('section.slot').count(), 2);
  await rep1.locator('input[name="slot-cause"]').nth(3).check(); // blames 지훈's nginx change
  await rep1.locator('input[name="slot-sequence"]').nth(1).check();
  await rep1.locator('.submitbar .primary-btn').click();
  await rep1.locator('.reply', { hasText: '어딘가 로그랑 안 맞아요' }).waitFor();
  assert.doesNotMatch(await rep1.locator('.reply').innerText(), /칸 중/, 'bundled: no slot count');
  await page.waitForFunction(() => window.__game.st.live.some((m) => m.from === 'jihoon' && /제 nginx요/.test(m.text)), null, { timeout: 5000 });
  await rep1.locator('input[name="slot-cause"]').nth(2).check();
  await rep1.locator('.submitbar .primary-btn').click();
  await page.locator('.moment.moment-result.good').waitFor({ timeout: 3000 });
  await rep1.locator('.debrief h2').waitFor();
  assert.match(await rep1.locator('.scorebox .s').nth(1).innerText(), /\/ 230/);
  await page.locator('.moment').waitFor({ state: 'detached', timeout: 4000 });
  assert.match(await rep1.locator('.nextcase').innerText(), /다음 사건 → Case 2 「지웠는데 안 비워지는 디스크」/);
  step('Case 1 report: a wrong answer hears one bundled line and 지훈\'s nudge; the right one shows the result moment and the debrief');

  await rep1.locator('.nextcase button').click();
  await page.locator('#boot .caselabel', { hasText: 'Case 2' }).waitFor();
  await shot('case2-01-boot.png');

  // ================================================================ Case 2 「지웠는데 안 비워지는 디스크」
  await page.locator('#boot button.primary').click();
  await page.locator('#briefing[data-step="ring"]').waitFor({ timeout: 10000 });
  await page.keyboard.press('Escape');
  await page.locator('#briefing').waitFor({ state: 'detached', timeout: 2000 });
  await page.waitForTimeout(1800);
  assert.equal(await page.locator('.tour').count(), 0, 'Case 2 has no tour');
  assert.equal(await page.locator('.icons .icon').count(), 7);
  assert.match(await page.locator('.todo-goal').innerText(), /원인 · 경위 · 재발 방지/);
  assert.equal(await page.locator('.todo li').count(), 3);
  await shot('case2-02-desktop.png');
  step('Case 2: briefing skipped with Esc; seven icons, three goals, the goal card lists three slots, no tour');

  await page.locator('.window[data-app="terminal"] .tout').click();
  await run('df -h');
  await pinLine(/196G\s+180G\s+5\.9G\s+97%\s+\/data/);
  await run('du -sh /data/collector/*');
  await todoItem('gap').and(page.locator('.done')).waitFor();
  await shot('case2-03-df-du.png');
  await run('pgrep -f logshipd');
  await run('ls -l /proc/1187/fd | grep deleted');
  await page.locator('.moment.moment-aha').waitFor({ timeout: 3000 });
  await page.keyboard.press('Escape');
  await todoItem('holder').and(page.locator('.done')).waitFor();
  await page.waitForTimeout(400);
  const notes2 = page.locator('.window[data-app="notes"] .titlebar button.close');
  if (await notes2.count()) await notes2.click(); // the memo scene opened the notebook
  await pinLine(/\(deleted\)/);
  await run('journalctl --since "2026-11-11 14:00" --until "2026-11-11 15:00"');
  await pinLine(/COMMAND=\/usr\/bin\/rm pay-api-01\.log/);
  await todoItem('pins').and(page.locator('.done')).waitFor();
  step('df 180G vs du 95G → pgrep → /proc/1187/fd "(deleted)" (aha) → the sudo rm in the journal; three boxes tick');
  await run('ssh pay-api-01');
  await run('journalctl -u payment-api --since "2026-11-11 14:00" --until "2026-11-11 15:00"');
  await page.locator('.tline', { hasText: 'log level changed: info -> debug' }).waitFor();
  await run('exit');
  await run('journalctl -u logshipd --since "2026-11-11 15:00" --until "2026-11-11 16:00"');
  await run('cat /etc/logshipd/logshipd.conf');
  step('second host: ssh pay-api-01, the runtime debug switch at 14:22, back with exit; logshipd stats and config');
  await page.evaluate(() => {
    for (const w of document.querySelectorAll('.window')) w.classList.add('min');
  });
  await page.locator('.icon[data-app="dashboard"]').dblclick();
  await page.waitForTimeout(400);
  await shot('case2-04-dashboard.png');
  await page.locator('.window[data-app="dashboard"] .titlebar button.close').click();
  await page.locator('.icon[data-app="report"]').dblclick();
  const rep2 = page.locator('.window[data-app="report"]');
  assert.equal(await rep2.locator('section.slot').count(), 3);
  await rep2.locator('input[name="slot-cause"]').nth(3).check();
  await rep2.locator('input[name="slot-sequence"]').nth(2).check();
  for (const i of [0, 1, 2, 3, 4]) await rep2.locator('input[name="slot-responsibility"]').nth(i).check();
  await rep2.locator('.submitbar .primary-btn').click();
  await page.locator('.moment.moment-result.good').waitFor({ timeout: 3000 });
  await rep2.locator('.debrief h2').waitFor();
  assert.match(await rep2.locator('.scorebox .s').nth(1).innerText(), /\/ 330/);
  await page.locator('.moment').waitFor({ state: 'detached', timeout: 4000 });
  assert.match(await rep2.locator('.nextcase').innerText(), /다음 사건 → Case 3 「금요일 18:02의 작은 변경」/);
  step('Case 2 report: three slots on the first submission, result moment, debrief → Case 3');

  await rep2.locator('.nextcase button').click();
  await page.locator('#boot .caselabel', { hasText: 'Case 3' }).waitFor();
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('no-handover:campaign'))).solved, ['case0-wiki', 'case1-cron-env', 'case2-deleted-open']);
  assert.equal(await page.locator('#boot .skip').count(), 0);
  step('debrief → 다음 사건: Case 3 lock screen; Cases 0–2 recorded as solved');

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
  assert.match(await page.locator('.todo-goal').innerText(), /원인 · 경위 · 책임·은폐/);
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

  // motion: a pin that arrives while the board is open snaps onto the timeline (< 1 s)
  await page.evaluate(() => window.__game.pin({ kind: 'line', text: 'Nov 14 03:17:00 pay-api-01 payment-api[2817]: http: 5xx ratio 41.7% over last 60s (503 Service Unavailable)', source: 'pay-api-01 · journalctl' }));
  await board.locator('.obs-logp .obs-row.snap').waitFor({ timeout: 1000 });
  await board.locator('.obs-lanes .obs-mk.snap').waitFor({ timeout: 1000 });
  await board.locator('.obs-row.snap').waitFor({ state: 'detached', timeout: 1500 });
  step('motion: a new pin snaps onto the log panel and its marker onto the timeline, gone within a second');

  // live dashboard: the in-game clock drives new points; thresholds and critical stats blink once
  await page.locator('.icon[data-app="dashboard"]').dblclick();
  const dash = page.locator('.window[data-app="dashboard"]');
  await dash.locator('.obs-tsp .obs-chart svg').first().waitFor();
  assert.ok((await dash.locator('.obs-thrg.blink').count()) >= 2, 'crossed thresholds blink on open');
  assert.equal(await dash.locator('.obs-stat.blink').count(), 2, 'the two critical stats blink');
  assert.equal(await dash.locator('.obs-live').getAttribute('aria-pressed'), 'true');
  await dash.locator('.obs-range').selectOption('1h');
  const last1 = await dash.locator('.obs-tsp .obs-chart').first().getAttribute('data-last');
  await page.waitForFunction((v) => document.querySelector('.window[data-app="dashboard"] .obs-tsp .obs-chart').dataset.last !== v, last1, { timeout: 10000 });
  await dash.locator('.obs-tail').first().waitFor();
  await dash.locator('.obs-live').click();
  assert.equal(await dash.locator('.obs-live').getAttribute('aria-pressed'), 'false');
  const paused = await dash.locator('.obs-tsp .obs-chart').first().getAttribute('data-last');
  await page.waitForTimeout(2500);
  assert.equal(await dash.locator('.obs-tsp .obs-chart').first().getAttribute('data-last'), paused, 'paused graphs stay put');
  await dash.locator('.titlebar button.close').click();
  step('live dashboard: last hour grows with the in-game clock (new point pulses), 실시간 toggle pauses it; crossed thresholds and critical stats blink once');

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
  assert.match(await report.locator('.record .rec-line').innerText(), /^힌트 단계 0개 · /);
  await report.locator('.badge-nohint', { hasText: '힌트 단계 0' }).waitFor();
  await report.locator('.cardbox').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot('polish-03-result-card.png');
  if (shots) {
    const [dl3] = await Promise.all([page.waitForEvent('download'), report.locator('.card-dl').click()]);
    await dl3.saveAs(join(shots, 'result-card-case3.png'));
  }
  step('Case 3 debrief: 힌트 단계 0 badge and the result card');

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

  // ---- reduced motion: same board and dashboard, static end states (no snap, blink or pulse)
  const rmCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p3 = await rmCtx.newPage();
  p3.on('pageerror', (e) => errors.push(String(e)));
  p3.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p3.goto(`${url}?fresh=1&case=friday-1802&briefing=0`);
  await p3.locator('#boot button.primary').click();
  await p3.locator('.tin input').waitFor();
  await p3.locator('.tin input').fill('crontab -l');
  await p3.locator('.tin input').press('Enter');
  await p3.evaluate(() => {
    for (const w of document.querySelectorAll('.window')) w.classList.add('min');
  });
  await p3.locator('.icon[data-app="board"]').dblclick();
  const b3 = p3.locator('.window[data-app="board"]');
  await b3.locator('.obs-lanes').waitFor();
  await p3.evaluate(() => {
    window.__game.pin({ kind: 'line', text: '15 3 * * 6 /home/eunjae/bin/ledger-backup.sh >> /home/eunjae/log/backup.log 2>&1', source: 'pay-api-01 · crontab -l' });
    window.__game.pin({ kind: 'line', text: 'Nov 14 03:15:40 pay-api-01 payment-api[2817]: http: Accept error: accept tcp [::]:8080: accept4: too many open files; retrying in 1s', source: 'pay-api-01 · journalctl' });
  });
  await b3.locator('.obs-lanes .obs-mk.k-cron').waitFor();
  await b3.locator('.obs-lanes .obs-mk.k-error').waitFor();
  assert.equal(await b3.locator('.snap').count(), 0, 'no snap under reduced motion');
  await b3.locator('.obs-lanes .obs-mk.k-error').click();
  assert.equal(await b3.locator('.flash').count(), 0, 'jump-to-row without the flash animation');
  await p3.waitForTimeout(100); // the click's hover/focus transitions are 1 ms under reduced motion; let them end
  const boardAnims = await p3.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.('.window[data-app="board"]')).length);
  assert.equal(boardAnims, 0);
  await b3.locator('.titlebar button.close').click();
  await p3.locator('.icon[data-app="dashboard"]').dblclick();
  const d3 = p3.locator('.window[data-app="dashboard"]');
  await d3.locator('.obs-tsp .obs-chart svg').first().waitFor();
  assert.equal(await d3.locator('.blink').count(), 0, 'no blink under reduced motion');
  await d3.locator('.obs-range').selectOption('1h');
  const l3 = await d3.locator('.obs-tsp .obs-chart').first().getAttribute('data-last');
  await p3.waitForFunction((v) => document.querySelector('.window[data-app="dashboard"] .obs-tsp .obs-chart').dataset.last !== v, l3, { timeout: 10000 });
  assert.equal(await d3.locator('.obs-tail.arrive').count(), 0, 'new points appear without the pulse');
  assert.ok((await d3.locator('.obs-tail').count()) >= 1);
  assert.equal(await p3.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.('.obs')).length), 0);
  await rmCtx.close();
  step('reduced motion: pins land and graphs still update, with no snap, blink, pulse or flash');
  // ---- fourth page: reduced motion; the tour, the aha moment and the terminal never block each other
  const p4 = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  p4.on('pageerror', (e) => errors.push(String(e)));
  p4.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p4.goto(`${url}?fresh=1&case=case1-cron-env&briefing=0`);
  await p4.locator('#boot button.primary').click();
  assert.equal(await p4.evaluate(() => document.documentElement.classList.contains('reduce-motion')), true);
  await p4.locator('.tour[data-step="goal"]').waitFor({ timeout: 5000 });
  const tin = p4.locator('.tin input');
  await tin.click();
  await tin.fill('cat ~/wiki-clean.log');
  await tin.press('Enter');
  await p4.locator('.moment.moment-aha.still').waitFor({ timeout: 3000 });
  await tin.fill('crontab -l');
  await tin.press('Enter');
  await p4.locator('.tline', { hasText: '0 * * * * ~/bin/wiki-log-clean.sh' }).waitFor({ timeout: 2000 });
  assert.equal(await p4.locator('.tour').count(), 1, 'the coach mark stays while the player types');
  const animMs = await p4.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.moment-card') ?? document.body).animationDuration) * 1000);
  assert.ok(!(animMs > 1), `no scaling animation (${animMs} ms)`);
  await p4.locator('.moment').waitFor({ state: 'detached', timeout: 2500 });
  await p4.locator('.tour .tour-ok').click();
  step('reduced motion: html.reduce-motion, the aha card appears still and leaves on its own; typing works with the coach mark and the moment on screen');
  // "투어 건너뛰기" in a fresh Case 0: the remaining marks stay off for that case, typing still works
  await p4.goto(`${url}?fresh=1&case=case0-wiki&briefing=0`);
  await p4.locator('#boot button.primary').click();
  const m4 = p4.locator('.tour[data-step="terminal"]');
  await m4.waitFor({ timeout: 5000 });
  assert.equal(await p4.locator('.tour-skip').innerText(), '투어 건너뛰기');
  assert.equal(await m4.getAttribute('role'), 'dialog');
  await m4.locator('.tour-skip').focus();
  await p4.keyboard.press('Enter');
  await m4.waitFor({ state: 'detached' });
  await p4.locator('.window[data-app="terminal"] .tout').click();
  await p4.locator('.tin input').press('Enter');
  await p4.locator('.todo li[data-id="history"].done').waitFor();
  await p4.waitForTimeout(1500);
  assert.equal(await p4.locator('.tour').count(), 0, 'skipped: no more marks in this case');
  assert.deepEqual(JSON.parse(await p4.evaluate(() => localStorage.getItem('no-handover:tour:case0-wiki'))), { skipped: true });
  step('Case 0 tour: "투어 건너뛰기" (keyboard) ends it for the case; the 💡 mark does not follow; skip is saved');
  await p4.close();

  // ---- fifth page: a 1280x800 laptop, clicked the way the blind playtester's tool clicks — one
  // mouse click at an element's centre, no hover first, no window closed out of the way
  const p5 = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  p5.on('pageerror', (e) => errors.push(String(e)));
  p5.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p5.on('dialog', (d) => d.accept());
  const clickCentre = async (loc, what) => {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
    const hit = await p5.evaluate(([x, y, sel]) => { const e = document.elementFromPoint(x, y); return e?.closest(sel) ? 'self' : `${e?.className} in ${e?.closest('.window,.todo,.tour,.toasts')?.className ?? '-'}`; }, [x, y, what]);
    assert.equal(hit, 'self', `${what} is the topmost element at its centre`);
    await p5.mouse.click(x, y);
  };
  const run5 = async (cmd) => {
    await p5.keyboard.type(cmd);
    await p5.keyboard.press('Enter');
    await p5.waitForTimeout(120);
  };
  await p5.goto(`${url}?fresh=1&briefing=0`);
  await p5.locator('#boot button.primary').click();
  const tin5 = p5.locator('.tin input');
  await p5.locator('.tour[data-step="terminal"]').waitFor({ timeout: 5000 });
  await tin5.click();
  await clickCentre(p5.locator('.tour .tour-ok'), '.tour-ok');
  await p5.locator('.tour[data-step="terminal"]').waitFor({ state: 'detached' });
  assert.equal(await p5.evaluate(() => document.activeElement === document.querySelector('.tin input')), true, '"알겠어요" hands focus back to the prompt');
  await p5.keyboard.press('Enter'); // the pre-typed history
  await p5.locator('.todo li[data-id="history"].done').waitFor();
  const termBox = await p5.locator('.window[data-app="terminal"]').boundingBox();
  const todoBox = await p5.locator('.todo').boundingBox();
  assert.ok(termBox.x + termBox.width <= todoBox.x, `the terminal (right ${termBox.x + termBox.width}) stops short of the checklist (left ${todoBox.x})`);
  for (const c of ['df -h', 'du -sh /var/log/*', 'tail -n 20 /var/log/wiki/wiki.log']) {
    await tin5.focus();
    await run5(c);
  }
  await p5.locator('.icon[data-app="board"]').waitFor();
  await p5.locator('.tour').waitFor({ timeout: 5000 });
  // B1: one mouse click on the 📌 icon opens the board, with a coach mark on screen
  await clickCentre(p5.locator('.icon[data-app="board"]'), '.icon[data-app="board"]');
  const board5 = p5.locator('.window[data-app="board"]:not(.min)');
  await board5.waitFor({ timeout: 2000 });
  // the taskbar button minimizes and restores it
  const task5 = p5.locator('#taskbar .task', { hasText: '증거 보드' });
  await clickCentre(task5, '.task');
  await p5.locator('.window[data-app="board"].min').waitFor({ state: 'attached' });
  await clickCentre(task5, '.task');
  await board5.waitFor();
  assert.equal(await p5.evaluate(() => document.querySelector('.window.focused')?.dataset.app), 'board');
  await clickCentre(board5.locator('.titlebar button.close'), 'button.close');
  await board5.waitFor({ state: 'detached' });
  // ... and Enter on the focused icon opens it too
  await p5.locator('.icon[data-app="board"]').focus();
  await p5.keyboard.press('Enter');
  await board5.waitFor({ timeout: 2000 });
  assert.equal(await p5.locator('.window[data-app="board"]').count(), 1);
  await clickCentre(board5.locator('.titlebar button.close'), 'button.close');
  await tin5.focus();
  await run5('systemctl status wiki');
  await p5.locator('.todo li[data-id="service"].done').waitFor();
  await p5.locator('.window[data-app="notes"]').waitFor({ timeout: 3000 }); // the memo scene pops the notebook up, and it stays open
  // B2: pin the two lines the tester picked by clicking straight on their 📌
  for (const re of [/100%\s+\/var/, /ERROR session save failed/]) await clickCentre(p5.locator('.tline', { hasText: re }).last().locator('.pinbtn'), '.pinbtn');
  assert.equal(await p5.evaluate(() => window.__game.st.pins.length), 2);
  await p5.locator('.todo li[data-id="pins"].done').waitFor({ timeout: 2000 });
  step('1280x800, clicked like the playtester: "알겠어요" returns focus to the prompt; one click on the 📌 icon opens the board with a coach mark up, the taskbar minimizes/restores it, Enter opens it; the terminal clears the checklist and the memo clears its 📌 column, so both pins land and box 5 ticks');
  await p5.close();

  // ---- sixth page: "터미널이 익숙해요" by keyboard — no coach marks, a 도구 안내 entry, no window opens by itself
  const p6 = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  p6.on('pageerror', (e) => errors.push(String(e)));
  p6.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p6.goto(`${url}?fresh=1&briefing=0`);
  await p6.locator('#boot .caselabel', { hasText: 'Case 0' }).waitFor();
  await p6.locator('#boot .expq').waitFor();
  for (let i = 0; i < 12 && !(await p6.evaluate(() => document.activeElement?.classList.contains('exp-familiar'))); i++) await p6.keyboard.press('Shift+Tab');
  assert.equal(await p6.evaluate(() => document.activeElement?.classList.contains('exp-familiar')), true, 'reachable by keyboard');
  await p6.keyboard.press('Enter');
  await p6.locator('#boot').waitFor({ state: 'detached' });
  assert.equal(await p6.evaluate(() => localStorage.getItem('no-handover:experience')), 'familiar');
  const guideBtn = p6.locator('#taskbar .guidebtn');
  await guideBtn.waitFor();
  await p6.waitForTimeout(2500);
  assert.equal(await p6.locator('.tour').count(), 0, 'familiar: no coach mark');
  await guideBtn.click();
  const guide = p6.locator('.popover.guidepop');
  await guide.waitFor();
  assert.equal(await guide.locator('li').count(), 8, 'every Case 0 tool line, on demand');
  assert.equal(await guide.locator('li.later[data-step="board"]').count(), 1, 'tools not unlocked yet are marked as such');
  await guide.locator('li[data-step="terminal"] button').click();
  await p6.locator('.window[data-app="terminal"].tour-target').waitFor({ timeout: 2000 });
  if (shots) await p6.screenshot({ path: join(shots, 'familiar-01-guide.png') });
  await p6.keyboard.press('Escape');
  await guide.waitFor({ state: 'detached' });
  assert.equal(await p6.evaluate(() => document.activeElement === document.querySelector('.tin input')), true, 'Esc on the guide hands focus back to the prompt');
  step('익숙해요 (keyboard): no coach marks, the 🧭 도구 안내 entry lists the tool lines and points at a tool on screen; Esc returns focus to the prompt');
  const run6 = async (cmd) => {
    const input = p6.locator('.tin input');
    await input.fill(cmd);
    await input.press('Enter');
    await p6.waitForTimeout(80);
  };
  await p6.locator('.window[data-app="terminal"] .tout').click();
  for (const cmd of ['history', 'df -h', 'du -sh /var/log/*', 'tail -n 20 /var/log/wiki/wiki.log', 'systemctl status wiki']) await run6(cmd);
  await p6.waitForFunction(() => window.__game.st.notesRevealed.length > 0, null, { timeout: 5000 });
  await p6.waitForTimeout(800);
  assert.equal(await p6.locator('.window[data-app="notes"]').count(), 0, 'familiar: the memo page does not open by itself');
  assert.ok(await p6.evaluate(() => window.__game.st.log.some((e) => e.type === 'auto-window-held' && e.app === 'notes')));
  assert.equal(await p6.locator('.tour').count(), 0, 'still no coach mark after the icons unlock');
  step('익숙해요: the memo scene leaves the notebook closed (its toast still offers it); no mark as icons unlock');
  // ❓: switch to 처음이에요 — the tour comes back, the entry goes away
  await p6.locator('#taskbar button[data-tour="help"]').click();
  await p6.locator('.exp-set button[data-exp="familiar"][aria-pressed="true"]').waitFor();
  await p6.locator('.exp-set button[data-exp="new"]').click();
  await p6.locator('.tour').first().waitFor({ timeout: 5000 });
  assert.equal(await p6.evaluate(() => localStorage.getItem('no-handover:experience')), 'new');
  assert.equal(await guideBtn.isHidden(), true);
  await p6.locator('.tour .tour-ok').click();
  const exp6 = await p6.evaluate(() => window.__game.playtestReport().summary.experience);
  assert.equal(exp6, 'new');
  step('❓ 터미널 경험 → 처음이에요: coach marks resume, 🧭 entry hidden, the play log records the choice');
  // asked once: another case opens with its normal unlock button; ?fresh=1 asks again
  await p6.goto(`${url}?case=case1-cron-env&briefing=0`);
  await p6.locator('#boot .caselabel', { hasText: 'Case 1' }).waitFor();
  assert.equal(await p6.locator('#boot .expq').count(), 0);
  await p6.goto(`${url}?fresh=1&briefing=0`);
  await p6.locator('#boot .expq').waitFor();
  assert.equal(await p6.evaluate(() => localStorage.getItem('no-handover:experience')), null);
  step('the choice persists across cases; ?fresh=1 asks again');
  await p6.close();

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
