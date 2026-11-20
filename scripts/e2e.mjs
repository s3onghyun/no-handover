// Browser end-to-end run: builds nothing, serves dist/ with `vite preview`, drives the real UI
// with playwright-core: first launch opens Case 0 (tutorial) — its short briefing, the pre-typed
// `history`, Jihoon's rail, the five checklist items and icon unlocks with one coach mark each, a wrong then a right
// report — and the debrief's "다음 사건" button opens Case 1 「밤에만 실패하는 스크립트」 (full
// briefing, only the 🎯 goal coach mark, the goal card, the aha moment, wrong replies with per-field ✓/✗,
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
// coach marks, a 도구 안내 entry, no window opening by itself — not even the terminal, in Case 0 or later cases — and
// a goals-only checklist), switches back in ❓, and restarts Case 0 from the case list and the lock
// screen (both ask first). Between Case 0 and Case 1 the case list shows done + grade, next, locked.
// A seventh page (1280x800): the briefing's 건너뛰기 stays in Case 0, every way to another case asks
// in an in-game dialog, a blank Enter is not a command, a maximized terminal closes and reopens, and
// the last submission's dialog says so; no browser confirm()/alert() anywhere.
// A ninth page picks "익숙해요 · 숙련자 모드로" and solves Cases 0–3 in that mode: no checklist,
// every icon at once, two submissions, one more red herring per case that a command rules out, a
// time row in the debrief.
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
/** Native confirm()/alert() would mean an in-game modal was skipped (a tool that auto-accepts them used to jump cases). */
const nativeDialogs = [];
page.on('dialog', (d) => {
  if (d.type() !== 'prompt') nativeDialogs.push(`${d.type()}: ${d.message()}`);
  d.accept(d.type() === 'prompt' ? '11-14 03:15' : undefined);
});

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
/** Report submit: the in-game confirm (copy per the case's submission rule), then 제출하기. */
async function submit(rep, copy, pg = page) {
  await rep.locator('.submitbar .primary-btn').click();
  const m = pg.locator('.modal-back .modal-submit[role="alertdialog"]');
  await m.waitFor({ timeout: 2000 });
  assert.match(await m.locator('.modal-body').innerText(), copy);
  assert.doesNotMatch(await m.innerText(), /되돌릴 수 없/, 'no "cannot be undone" while it can be resubmitted');
  await m.locator('.modal-ok').click();
  await m.waitFor({ state: 'detached' });
}
/** Report: pick an option by id; cite the pin whose line matches `re` for a slot. */
const pick = (rep, slot, id) => rep.locator(`input[name="slot-${slot}"][value="${id}"]`).check();
const cite = (rep, slot, re) => rep.locator(`label.citeopt:has(input[name="cite-${slot}"])`, { hasText: re }).first().locator('input').check();
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
  // round 3: a locked case says how it opens and links back to the case that opens it (here, the one on screen)
  for (const id of ['case1-cron-env', 'case2-deleted-open', 'friday-1802']) {
    assert.equal(await page.locator(`#cases li[data-id="${id}"] .cl-st`).innerText(), '🔒 잠김 — Case 0 · 튜토리얼: 증거 핀 → 보고서 제출 후 열려요');
    assert.equal(await page.locator(`#cases li[data-id="${id}"] .cl-back`).innerText(), '← 지금 사건으로 돌아가기');
  }
  await page.locator('#cases li[data-id="case2-deleted-open"] .cl-back').click();
  await page.locator('#cases').waitFor({ state: 'detached' });
  await page.locator('#boot .caselabel', { hasText: 'Case 0 · 튜토리얼' }).waitFor();
  step('case list: each locked case says "Case 0 · 튜토리얼: 증거 핀 → 보고서 제출 후 열려요" and "← 지금 사건으로 돌아가기" closes the list on the current case');
  await page.locator('#boot .linkbtn.cases').click();
  await page.locator('#cases button.primary').click();
  step('first launch: Case 0 · 튜토리얼 lock screen with a skip link to Case 1; case list shows 5 rungs, Cases 1–3 locked');

  // first run: the unlock button is the one-time "터미널이 익숙해요 / 처음이에요" choice
  const expq = page.locator('#boot .expq');
  await expq.waitFor();
  assert.equal(await expq.locator('.expq-opts button').count(), 2);
  assert.match(await expq.locator('.exp-expert').innerText(), /숙련자 모드/, 'the harder way sits under 익숙해요');
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
  // round 3: a line a report field accepts as evidence brings "보고서에는 이 줄을 핀하세요 (0/2)" with the line
  const prompt0 = page.locator('.toast.pinprompt');
  await prompt0.waitFor({ timeout: 2000 });
  assert.match(await prompt0.locator('.pintoast-head').innerText(), /보고서에는 이 줄을 핀하세요 \(0\/2\)/);
  assert.match(await prompt0.locator('.pintoast-line').innerText(), /100%\s+\/var/);
  assert.equal(await prompt0.locator('.pinprompt-btn').count(), 1);
  await shot('case0-r3-pin-prompt.png');
  await todoItem('df').and(page.locator('.done')).waitFor();
  await page.locator('.icon[data-app="notes"]').waitFor();
  await mark('notes', 'case0-tour-notes.png');
  await pinLine(/100%\s+\/var/);
  await page.waitForTimeout(300);
  await shot('case0-02-terminal-df.png');
  step('df -h: /var 100% (highlighted, pinned); "보고서에는 이 줄을 핀하세요 (0/2)" toast with the line; the notebook icon appears with its 메모장 mark');

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
  // the "증거 2개" item counts only pins that meet a report slot's evidence kind, and shows the kinds
  await todoItem('pins').locator('.todo-ev').waitFor();
  assert.match(await todoItem('pins').innerText(), /증거 2개 핀 → 보고서 쓰기/);
  assert.match(await todoItem('pins').locator('.todo-count').innerText(), /\(1\/2\)/);
  assert.match(await todoItem('pins').locator('.todo-ev').innerText(), /세지는 증거: 원인 1\/2 · 경위 0\/3/);
  assert.match(await todoItem('pins').locator('.todo-ev').getAttribute('title'), /원인: ✓ 디스크 사용량.*○ 위키가 남긴 오류/);
  await pinLine(/wiki-server\[51875\]: OSError: \[Errno 28\] No space left on device/);
  await todoItem('pins').and(page.locator('.done')).waitFor();
  // every box ticked: the sticky waits on the last item with "📝 보고서 쓰기" instead of folding away
  await page.locator('.icon[data-app="report"]').waitFor();
  await mark('report');
  const cta0 = todoItem('pins').locator('.todo-report');
  await cta0.waitFor();
  assert.equal(await cta0.innerText(), '📝 보고서 쓰기');
  await page.waitForTimeout(2000);
  assert.equal(await page.locator('.todo').count(), 1, 'the sticky waits for the report');
  await shot('case0-r3-report-cta.png');
  await cta0.click();
  await page.locator('.window[data-app="report"]:not(.min)').waitFor();
  await page.locator('.todo').waitFor({ state: 'detached', timeout: 6000 });
  await page.locator('.window[data-app="report"] .titlebar button.close').click();
  const tourLog0 = await page.evaluate(() => window.__game.st.log.filter((e) => e.type === 'tour-step').map((e) => e.step));
  assert.deepEqual(tourLog0, ['terminal', 'messenger', 'mail', 'hint', 'notes', 'board', 'dashboard', 'report'], 'each Case 0 mark once, at its unlock');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('no-handover:tour'))).seen, tourLog0);
  step('the pins item counts evidence pins (1/2) and lists the kinds that count, met or missing');
  step('du → tail → systemctl status → 2 pins: all five boxes tick, "📝 보고서 쓰기" on the last item opens the report and the sticky folds; every icon is unlocked, each with its mark (8 marks, each once)');

  await run('journalctl -u wiki --since "2026-11-09 21:00" --until "2026-11-09 21:20"');
  await pinLine(/21:14:03 .*thumbnail/);
  await page.evaluate(() => {
    for (const w of document.querySelectorAll('.window')) w.classList.add('min');
  });

  // ---- evidence board as an observability dashboard: pins sit on the shared timeline
  await page.locator('.icon[data-app="board"]').dblclick();
  const board0 = page.locator('.window[data-app="board"]');
  // "보고서 근거": per slot, which kinds of evidence count, met or missing; each pin row names its kinds
  await board0.locator('.obs-criteria .crit-row[data-slot="cause"]').waitFor();
  assert.equal(await board0.locator('.obs-criteria .crit-row[data-slot="cause"] .crit.met').count(), 2, 'df line + No space line');
  await board0.locator('.obs-criteria .crit-row[data-slot="sequence"] .crit.met[data-kind="start"]').waitFor();
  await board0.locator('.obs-criteria .crit-row[data-slot="sequence"] .crit.miss[data-kind="night"]').waitFor();
  assert.ok((await board0.locator('.obs-ev:not(.none)').count()) >= 3, 'pin rows tagged with their kinds');
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
  // round 3: each field says up front what it needs (an answer, one cited pin of an accepted kind);
  // the submit button stays blocked, with the unmet fields listed beside it, until all are met
  const btn0 = rep0.locator('.submitbar .primary-btn');
  const need0 = rep0.locator('.submit-need');
  assert.match(await rep0.locator('.slot-need[data-slot="cause"]').innerText(), /필요: ○? ?보기 하나 · ○? ?근거 핀 하나 — 디스크 사용량 \(df · du 의 수치\) \/ 위키가 남긴 오류 · 서비스 상태 중/);
  assert.match(await rep0.locator('.slot-need[data-slot="sequence"] .need-cite').innerText(), /처음 시작된 시각의 기록 \/ 밤사이 쌓인 기록 \/ 위키가 멈춘 시각의 기록/);
  assert.equal(await btn0.getAttribute('aria-disabled'), 'true');
  assert.deepEqual(await need0.locator('li').allInnerTexts(), ['원인: 보기 고르기', '원인: 근거 핀 고르기', '경위: 보기 고르기', '경위: 근거 핀 고르기']);
  // options are hypotheses of similar length; every slot needs a cited pin
  await pick(rep0, 'cause', 'pdf'); // blames 지훈's PDF
  await pick(rep0, 'sequence', 'true');
  assert.deepEqual(await need0.locator('li').allInnerTexts(), ['원인: 근거 핀 고르기', '경위: 근거 핀 고르기']);
  assert.equal(await rep0.locator('.slot-need[data-slot="cause"] .need-pick.met').count(), 1);
  await btn0.click({ force: true }); // aria-disabled, yet a click still says why — blocked: an in-game notice that lists what is missing, nothing sent
  const notice0 = page.locator('.modal-back .modal-notice[role="alertdialog"]');
  assert.match(await notice0.locator('.modal-body').innerText(), /제출 횟수는 쓰지 않았어요[\s\S]*원인: 근거 핀 고르기[\s\S]*경위: 근거 핀 고르기/);
  await page.keyboard.press('Escape');
  await notice0.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.__game.st.submissions.length), 0, 'no submission without a cited pin');
  await cite(rep0, 'cause', /100%\s+\/var/);
  await cite(rep0, 'sequence', /100%\s+\/var/); // disk usage does not back the timeline: △
  assert.deepEqual(await need0.locator('li').allInnerTexts(), ['경위: 고른 핀이 이 칸의 증거 종류가 아님 △']);
  await need0.scrollIntoViewIfNeeded();
  await shot('case0-r3-submit-blocked.png');
  assert.equal(await rep0.locator('.slot-need[data-slot="sequence"] .need-cite.wrongkind').count(), 1);
  await btn0.click({ force: true }); // a △ field blocks too, and does not use a submission
  await notice0.waitFor();
  assert.match(await notice0.locator('.modal-body').innerText(), /경위: 고른 핀이 이 칸의 증거 종류가 아님 △/);
  await notice0.locator('.modal-ok').click();
  await notice0.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.__game.st.submissions.length), 0, 'a △ field uses no submission');
  await rep0.locator('input[name="cite-sequence"]:checked').uncheck();
  await cite(rep0, 'sequence', /21:14:03 .*thumbnail/);
  assert.equal(await btn0.getAttribute('aria-disabled'), 'false');
  assert.match(await need0.innerText(), /✓ 칸마다 보기와 근거가 있어요/);
  await submit(rep0, /몇 번이든/); // Case 0: unlimited
  // a wrong report: ✓/✗ per field, and 서진 says per field what does not fit (never the answer)
  await rep0.locator('.reply', { hasText: '강서진의 회신' }).waitFor();
  assert.deepEqual(await rep0.locator('.reply .reply-marks li').allInnerTexts(), ['✗ 원인', '✓ 경위']);
  const reply0 = await rep0.locator('.reply .reply-body').innerText();
  assert.match(reply0, /원인 칸이 기록이랑 안 맞아요/);
  assert.match(reply0, /경위 칸은 됐어요/);
  assert.doesNotMatch(reply0, /어딘가|디스크 한 곳/);
  assert.equal(await rep0.locator('section.slot[data-slot="cause"] .slot-mark.bad').count(), 1);
  assert.equal(await rep0.locator('section.slot[data-slot="sequence"] .slot-mark.ok').count(), 1);
  await rep0.locator('.reply').scrollIntoViewIfNeeded();
  await shot('case0-r3-reply.png');
  await page.waitForFunction(() => window.__game.st.live.some((m) => m.from === 'jihoon' && /PDF 하나로/.test(m.text)), null, { timeout: 5000 });
  await pick(rep0, 'cause', 'disk');
  await submit(rep0, /몇 번이든/);
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
  assert.match(await rep0.locator('.cites').innerText(), /✓ 원인[\s\S]*디스크 사용량[\s\S]*✓ 경위[\s\S]*처음 시작된 시각/);
  step('debrief: record "힌트 단계 3개 · 소요 · 명령 수" with panel opens noted as not counted, no penalty; 결과 카드 downloads as a 1200×630 PNG');
  assert.match(await rep0.locator('.nextcase').innerText(), /다음 사건 → Case 1 「밤에만 실패하는 스크립트」/);
  // round 2: the way on stays in the taskbar after the debrief is closed
  assert.match(await page.locator('#taskbar .nextcase-btn').innerText(), /다음 사건 → Case 1/);
  assert.equal(await page.locator('#taskbar .nextcase-btn').isVisible(), true);
  step(`report: each field's needs up front, submit blocked with the unmet fields beside it (no answer, no pin, a △ pin) and no submission used; a wrong report shows ✓/✗ per field, 서진's per-field lines and 지훈's nudge; the second solves Case 0, the debrief lists the evidence`);
  step(`Case 0 solved (${total0.replace(/\s+/g, ' ')})`);

  await rep0.locator('.nextcase button').click();
  await page.locator('#boot .caselabel', { hasText: 'Case 1' }).waitFor();
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('no-handover:campaign'))).solved, ['case0-wiki']);
  assert.equal(await page.locator('#boot .skip').count(), 0);
  assert.equal(await page.locator('#boot .expq').count(), 0, 'the experience question is asked once');
  await shot('case1-01-boot.png');
  step('debrief → 다음 사건: Case 1 lock screen; Case 0 recorded as solved');
  // round 2: the case list says done (with grade) / next / locked, and Case 0's lock screen leads on to Case 1
  await page.locator('#boot .linkbtn.cases').click();
  const cl = page.locator('#cases');
  assert.match(await cl.locator('li[data-id="case0-wiki"] .cl-st').innerText(), /^✓ 해결 · 등급 [SABCD]$/);
  assert.equal(await cl.locator('li[data-id="case0-wiki"] .cl-restart').count(), 1, 'a solved case can be restarted');
  assert.equal(await cl.locator('li[data-id="case1-cron-env"].next .cl-next').innerText(), '다음 사건');
  assert.equal(await cl.locator('li[data-id="case1-cron-env"] .cl-here').count(), 1, 'the case on screen is marked, not offered');
  assert.equal(await cl.locator('li[data-id="case2-deleted-open"][data-state="locked"]').count(), 1);
  assert.match(await cl.locator('li[data-id="case2-deleted-open"] .cl-st').innerText(), /^🔒 잠김 — Case 1: 증거 핀 → 보고서 제출 후 열려요$/, 'now Case 1 is what opens it');
  assert.equal(await cl.locator('li[data-id="case2-deleted-open"] .cl-back').innerText(), '← 지금 사건으로 돌아가기');
  await shot('case-list-01.png');
  await cl.locator('li[data-id="case0-wiki"] .cl-open').click();
  await page.locator('.modal-case .modal-ok').click(); // leaving a case asks first (in-game dialog)
  await page.locator('#boot .caselabel', { hasText: 'Case 0' }).waitFor();
  assert.match(await page.locator('#boot button.boot-next').innerText(), /^다음 사건 → Case 1 「밤에만 실패하는 스크립트」$/);
  await page.locator('#boot button.boot-next').click();
  await page.locator('#boot .caselabel', { hasText: 'Case 1' }).waitFor();
  step('case list: Case 0 ✓ 해결 · 등급, Case 1 다음 사건, Case 2 locked; a finished case\'s lock screen offers 다음 사건 → Case 1');

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
  await todoItem('pins').locator('.todo-report').click();
  await page.locator('.window[data-app="report"]:not(.min)').waitFor();
  await page.locator('.todo').waitFor({ state: 'detached', timeout: 6000 });
  await page.locator('.window[data-app="report"] .titlebar button.close').click();
  for (const c of ['which wikictl', 'cat ~/log/cron-env.txt', 'journalctl -u wiki --since "2026-11-11 00:00" --until "2026-11-11 00:10"', 'df -h']) await run(c);
  assert.ok(await page.evaluate(() => window.__game.causeSolved()));
  step('pins tick the fourth box and its "📝 보고서 쓰기" opens the report; which / cron-env.txt / journalctl -u wiki / df complete the evidence');

  await page.evaluate(() => {
    for (const w of document.querySelectorAll('.window')) w.classList.add('min');
  });
  await page.locator('.icon[data-app="report"]').dblclick();
  const rep1 = page.locator('.window[data-app="report"]');
  assert.equal(await rep1.locator('section.slot').count(), 2);
  // 지훈's nginx red herring waits for his message (3 minutes in); until then the slot says more may come
  assert.equal(await rep1.locator('input[name="slot-cause"][value="nginx"]').count(), await page.evaluate(() => (window.__game.st.triggersFired.includes('jihoon-nginx') ? 1 : 0)));
  if (!(await page.evaluate(() => window.__game.st.triggersFired.includes('jihoon-nginx')))) await rep1.locator('.more-opts').first().waitFor();
  await pick(rep1, 'cause', 'not-run');
  await pick(rep1, 'sequence', 'true');
  await cite(rep1, 'cause', /line 15: wikictl: command not found/);
  await cite(rep1, 'sequence', /\(eunjae\) CMD \(~\/bin\/wiki-log-clean/);
  await submit(rep1, /1번째 제출이에요 \(남은 제출 5\/5\)/);
  await rep1.locator('.reply', { hasText: '강서진의 회신 (1/5)' }).waitFor();
  assert.deepEqual(await rep1.locator('.reply .reply-marks li').allInnerTexts(), ['✗ 원인', '✓ 경위']);
  const reply1a = await rep1.locator('.reply .reply-body').innerText();
  assert.match(reply1a, /^원인 칸이 기록이랑 안 맞아요\./);
  assert.doesNotMatch(reply1a, /어딘가|cron 의 환경/, 'no bundled line, no answer');
  await page.waitForFunction(() => window.__game.st.live.some((m) => m.from === 'seojin' && /스크립트가 남긴 출력/.test(m.text)), null, { timeout: 5000 });
  await pick(rep1, 'cause', 'perm');
  await submit(rep1, /2번째 제출이에요 \(남은 제출 4\/5\)/);
  await rep1.locator('.reply', { hasText: '강서진의 회신 (2/5)' }).waitFor();
  const reply1b = await rep1.locator('.reply .reply-body').innerText();
  assert.match(reply1b, /^원인 칸은 아직이에요\./);
  assert.notEqual(reply1b, reply1a, 'the second wrong report hears other words');
  await pick(rep1, 'cause', 'cron-path');
  await submit(rep1, /3번째 제출이에요 \(남은 제출 3\/5\)/);
  await page.locator('.moment.moment-result.good').waitFor({ timeout: 3000 });
  await rep1.locator('.debrief h2').waitFor();
  assert.match(await rep1.locator('.scorebox .s').nth(1).innerText(), /\/ 230/);
  await page.locator('.moment').waitFor({ state: 'detached', timeout: 4000 });
  assert.match(await rep1.locator('.nextcase').innerText(), /다음 사건 → Case 2 「지웠는데 안 비워지는 디스크」/);
  step('Case 1 report: two wrong answers show ✓/✗ per field and 서진\'s per-field lines, different each time, and her nudge; the right one shows the result moment and the debrief');

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
  // round 3: the nameless file's size is observable — following the fd link (ls -lL) and its fdinfo offset
  await run('ls -lhL /proc/1187/fd/7');
  await page.locator('.tline', { hasText: /-rw-r----- 0 logship adm\s+85G Nov 12 09:30 \/proc\/1187\/fd\/7/ }).waitFor();
  await run('cat /proc/1187/fdinfo/7');
  await page.locator('.tline', { hasText: /pos:\s+91321742131/ }).waitFor();
  assert.ok(await page.evaluate(() => 'c2_size' in window.__game.st.clues));
  // ... and the departed senior's history shows how she found the time: journalctl -t sudo
  await run('history | grep "journalctl -t sudo"');
  await page.locator('.tline', { hasText: /journalctl -t sudo --since "2024-08-21 07:00"/ }).waitFor();
  step('round 3: ls -lhL /proc/1187/fd/7 shows the nameless 85G (link count 0), fdinfo pos agrees; 은재\'s history has journalctl -t sudo');
  await run('journalctl -t sudo --since "2026-11-11 14:00" --until "2026-11-11 15:00"');
  await pinLine(/COMMAND=\/usr\/bin\/rm pay-api-01\.log/);
  await run('journalctl --since "2026-11-11 14:00" --until "2026-11-11 15:00"');
  // the logout a minute after the rm (r2_noverify) opens Seojin's changes as report choices: a toast says so
  await page.locator('.toast-options', { hasText: '새 보기가 열렸어요' }).waitFor({ timeout: 3000 });
  assert.equal(await todoItem('pins').and(page.locator('.done')).count(), 0, '재발 방지 has no pin yet');
  step('df 180G vs du 95G → pgrep → /proc/1187/fd "(deleted)" (aha) → the sudo rm in the journal; two boxes tick, "증거 3개" waits for 재발 방지');
  await run('ssh pay-api-01');
  await run('journalctl -u payment-api --since "2026-11-11 14:00" --until "2026-11-11 15:00"');
  await page.locator('.tline', { hasText: 'log level changed: info -> debug' }).waitFor();
  await run('exit');
  await run('journalctl -u logshipd --since "2026-11-11 15:00" --until "2026-11-11 16:00"');
  await run('cat /etc/logshipd/logshipd.conf');
  await pinLine(/^max_source_bytes = 0/);
  await todoItem('pins').and(page.locator('.done')).waitFor();
  step('second host: ssh pay-api-01, the runtime debug switch at 14:22, back with exit; logshipd stats and config; the config pin ticks the third box');
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
  await pick(rep2, 'cause', 'open');
  await pick(rep2, 'sequence', 'true');
  assert.match(await rep2.locator('section.slot').nth(2).locator('.prompt').innerText(), /3개를 고르세요/);
  assert.match(await rep2.locator('section.slot').nth(2).locator('.picks').innerText(), /0 \/ 3개/);
  for (const id of ['no-verify', 'open-rule', 'debug-expiry']) await pick(rep2, 'responsibility', id);
  assert.equal(await rep2.locator('input[name="slot-responsibility"][value="quota"]').isDisabled(), true, 'exactly three: the fourth box stops');
  assert.match(await rep2.locator('section.slot').nth(2).locator('.picks.full').innerText(), /3개를 다 골랐어요/);
  await rep2.locator('section.slot').nth(2).scrollIntoViewIfNeeded();
  await shot('case2-05-report-picks.png');
  await rep2.locator('input[name="slot-responsibility"][value="debug-expiry"]').uncheck();
  assert.equal(await rep2.locator('input[name="slot-responsibility"][value="quota"]').isDisabled(), false, 'untick one and the rest open again');
  assert.match(await rep2.locator('.submit-need li[data-slot="responsibility"][data-need="pick"]').innerText(), /보기 3개 고르기/, 'two of three: the field is not filled in yet');
  await pick(rep2, 'responsibility', 'debug-expiry');
  step('Case 2 재발 방지 takes exactly three: a counter, the other boxes stop at three and open again when one is unticked');
  await cite(rep2, 'cause', /\(deleted\)/);
  await cite(rep2, 'sequence', /COMMAND=\/usr\/bin\/rm pay-api-01\.log/);
  await cite(rep2, 'responsibility', /max_source_bytes = 0/);
  await submit(rep2, /1번째 제출이에요 \(남은 제출 4\/4\)/);
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
  await todoItem('pins').locator('.todo-report').waitFor();
  await page.locator('.todo').waitFor({ state: 'detached', timeout: 16000 }); // left alone, it folds by itself
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
  // round 2: `git log` one level above the bare repository keeps git's own error and says where the repository is
  await run('cd /srv/git');
  await run('git log');
  const gitErr = page.locator('.window[data-app="terminal"] .tline', { hasText: 'fatal: not a git repository' }).last();
  await gitErr.waitFor();
  await page.locator('.window[data-app="terminal"] .tline', { hasText: /저장소는 \/srv\/git\/pay-config\.git .*cd pay-config\.git 후 git log/ }).last().waitFor();
  await run('cd pay-config.git');
  step('pay-cfg: git log in /srv/git keeps "not a git repository" and points at /srv/git/pay-config.git; cd pay-config.git follows it');
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
  await pick(report, 'cause', 'fd');
  await pick(report, 'sequence', 'true');
  for (const id of ['git-admins', 'cron', 'oncall', 'account']) await pick(report, 'responsibility', id);
  assert.equal(await report.locator('input[name="slot-responsibility"][value="bottleneck"]').isDisabled(), true, 'exactly four');
  await cite(report, 'cause', /too many open files/);
  await cite(report, 'sequence', /AuthorDate: Fri Nov 13 18:02:11/);
  await cite(report, 'responsibility', /git-admins:x:1050/);
  await submit(report, /1번째 제출이에요 \(남은 제출 3\/3\)/);
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
  // round 2: as the choice promised, the terminal does not open by itself; the sticky shows the goal, not the steps
  assert.equal(await p6.locator('.window[data-app="terminal"]').count(), 0, 'familiar: no terminal opens by itself in Case 0');
  assert.equal(await p6.locator('.icon[data-app="terminal"].pulse').count(), 1, 'its icon pulses instead');
  const todo6 = p6.locator('.todo.goals-only');
  await todo6.waitFor();
  assert.match(await todo6.locator('.todo-goal').innerText(), /🎯 .*원인 · 경위/);
  assert.equal(await todo6.locator('li, small.hint').count(), 0, 'no numbered steps or step hints');
  assert.match(await todo6.locator('header .todo-n').innerText(), /^0\/5$/);
  if (shots) await p6.screenshot({ path: join(shots, 'familiar-00-desktop.png') });
  await p6.locator('.icon[data-app="terminal"]').click();
  await p6.locator('.window[data-app="terminal"] .tin input').waitFor();
  step('익숙해요: Case 0 opens on the desktop with no window; the sticky shows 🎯 and the count, no steps; one click opens the terminal');
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
  assert.equal(await p6.locator('.todo li').count(), 0, 'still goals only');
  await p6.locator('.todo .todo-steps').click();
  assert.equal(await p6.locator('.todo li').count(), 5, '단계 보기 unfolds the steps');
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
  // round 2: "이 사건 처음부터" from the case list (in ❓): in progress → confirm (Esc keeps it) → the save is gone
  await p6.locator('#taskbar button[data-tour="help"]').click();
  await p6.locator('.popover .cases-open').click();
  const row6 = p6.locator('#cases li[data-id="case0-wiki"]');
  assert.equal(await row6.getAttribute('data-state'), 'playing');
  assert.match(await row6.locator('.cl-st').innerText(), /^▶ 진행 중$/);
  await row6.locator('.cl-restart').click();
  await p6.locator('.modal-restart .modal-ok').waitFor();
  assert.match(await p6.locator('.modal-restart').innerText(), /Case 0 · 튜토리얼 「위키가 안 열려요」, 처음부터 다시 할까요\?[\s\S]*지워지고/);
  if (shots) await p6.waitForTimeout(400).then(() => p6.screenshot({ path: join(shots, 'case-list-02-restart.png') }));
  await p6.keyboard.press('Escape');
  await p6.locator('.modal-restart').waitFor({ state: 'detached' });
  assert.equal(await p6.locator('#cases').count(), 1, 'Esc only closes the question');
  await row6.locator('.cl-restart').click();
  await p6.locator('.modal-restart .modal-ok').click();
  await p6.locator('#boot .caselabel', { hasText: 'Case 0' }).waitFor();
  assert.equal(await p6.locator('#boot button', { hasText: '이어서 하기' }).count(), 0, 'nothing left to resume');
  assert.equal(await p6.evaluate(() => window.__game.st.playMs), 0);
  // the lock screen's 처음부터 asks too, and really clears the save (before, the unload handler wrote it back)
  await p6.goto(`${url}?briefing=0`);
  await p6.locator('#boot button.primary').click();
  await p6.locator('#boot').waitFor({ state: 'detached' });
  await p6.waitForFunction(() => window.__game.st.playMs > 1500, null, { timeout: 8000 });
  await p6.goto(`${url}?briefing=0`);
  await p6.locator('#boot button', { hasText: /^처음부터$/ }).click();
  await p6.locator('.modal-restart .modal-ok').click();
  await p6.locator('#boot .caselabel', { hasText: 'Case 0' }).waitFor();
  await p6.waitForTimeout(300);
  assert.equal(await p6.locator('#boot button', { hasText: '이어서 하기' }).count(), 0, 'the lock screen 처음부터 clears the save');
  step('case list (❓ → 사건 목록): Case 0 ▶ 진행 중 → 이 사건 처음부터 asks (Esc keeps it), then the save is gone; the lock screen 처음부터 asks and clears it too');
  // asked once: another case opens with its normal unlock button; ?fresh=1 asks again
  await p6.goto(`${url}?case=case1-cron-env&briefing=0`);
  await p6.locator('#boot .caselabel', { hasText: 'Case 1' }).waitFor();
  assert.equal(await p6.locator('#boot .expq').count(), 0);
  // round 3: Case 1 on 익숙해요 — "창도 저절로 열지 않아요" holds past the tutorial: no terminal by itself, its icon is one click away
  assert.equal(await p6.evaluate(() => localStorage.getItem('no-handover:experience')), 'new', '(switched to 처음이에요 above)');
  await p6.evaluate(() => localStorage.setItem('no-handover:experience', 'familiar'));
  await p6.reload();
  await p6.locator('#boot button.primary').click();
  await p6.locator('#boot').waitFor({ state: 'detached' });
  await p6.waitForTimeout(1500);
  assert.equal(await p6.locator('.window[data-app="terminal"]').count(), 0, '익숙해요: no terminal opens by itself in Case 1');
  assert.ok(await p6.evaluate(() => window.__game.st.log.some((e) => e.type === 'auto-window-held' && e.app === 'terminal')));
  assert.equal(await p6.locator('.icon[data-app="terminal"].pulse').count(), 1, 'its icon pulses instead');
  if (shots) await p6.screenshot({ path: join(shots, 'familiar-02-case1-desktop.png') });
  await p6.locator('.icon[data-app="terminal"]').click();
  await p6.locator('.window[data-app="terminal"] .tin input').waitFor();
  step('익숙해요 in Case 1: the desktop opens with no window (as the choice promised), the terminal icon pulses, one click opens it');
  await p6.goto(`${url}?fresh=1&briefing=0`);
  await p6.locator('#boot .expq').waitFor();
  assert.equal(await p6.evaluate(() => localStorage.getItem('no-handover:experience')), null);
  step('the choice persists across cases; ?fresh=1 asks again');
  await p6.close();

  // ---- seventh page (1280x800): flow — the briefing's 건너뛰기 stays in the case, moving to
  // another case asks in game, a blank Enter is not a command, a maximized window still closes,
  // and the last submission says so
  const p7 = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  p7.on('pageerror', (e) => errors.push(String(e)));
  p7.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p7.on('dialog', (d) => (nativeDialogs.push(`p7 ${d.type()}: ${d.message()}`), d.accept()));
  const centre7 = async (loc, what) => {
    const b = await loc.boundingBox();
    const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
    const hit = await p7.evaluate(([x, y, sel]) => { const e = document.elementFromPoint(x, y); return e?.closest(sel) ? 'self' : `${e?.className} in ${e?.closest('.window,.todo,.tour,.toasts')?.className ?? '-'}`; }, [x, y, what]);
    assert.equal(hit, 'self', `${what} is the topmost element at its centre`);
    await p7.mouse.click(x, y);
  };
  const okMarks7 = () => p7.evaluate(() => document.querySelectorAll('.tour .tour-ok').forEach((b) => b.click()));
  await p7.goto(`${url}?fresh=1`);
  await p7.locator('#boot .exp-new').click();
  await p7.locator('#briefing').waitFor();
  const skips7 = p7.getByRole('button', { name: /건너뛰기/ });
  assert.equal(await skips7.count(), 1, 'during the briefing only its own 건너뛰기 is reachable (the taskbar behind it is inert)');
  assert.equal(await skips7.getAttribute('aria-label'), '브리핑 건너뛰기');
  await centre7(p7.locator('.brief-skip'), '.brief-skip');
  await p7.locator('#briefing').waitFor({ state: 'detached', timeout: 2000 });
  await p7.locator('.window[data-app="terminal"]').waitFor();
  assert.match(await p7.title(), /Case 0 · 튜토리얼/);
  assert.equal(new URL(p7.url()).searchParams.get('case'), null, 'still on the Case 0 page');
  assert.equal(await p7.evaluate(() => window.__game.st.briefing.skipped), true);
  assert.equal(await p7.evaluate(() => document.activeElement === document.querySelector('.tin input')), true, 'the prompt has focus after the skip');
  step('Case 0 briefing: one reachable 건너뛰기 ("브리핑 건너뛰기"), it skips only the briefing — same case, prompt focused');
  // the taskbar's ⏭ 튜토리얼 건너뛰기 asks in game; Esc / 이 사건 계속하기 stays
  await okMarks7();
  await centre7(p7.locator('#taskbar .skiptut'), '.skiptut');
  const caseModal = p7.locator('.modal-back .modal-case[role="alertdialog"]');
  await caseModal.waitFor({ timeout: 2000 });
  assert.equal(await caseModal.getAttribute('aria-modal'), 'true');
  assert.match(await caseModal.innerText(), /Case 1 「밤에만 실패하는 스크립트」\(으\)로 옮길까요\?[\s\S]*건너뜀/);
  assert.equal(await p7.evaluate(() => document.activeElement?.classList.contains('modal-cancel')), true, 'focus starts on 이 사건 계속하기');
  await p7.keyboard.press('Tab');
  assert.equal(await p7.evaluate(() => document.activeElement?.classList.contains('modal-ok')), true);
  await p7.keyboard.press('Tab');
  assert.equal(await p7.evaluate(() => document.activeElement?.classList.contains('modal-cancel')), true, 'focus stays inside the dialog');
  await p7.keyboard.press('Escape');
  await caseModal.waitFor({ state: 'detached' });
  await p7.waitForTimeout(300);
  assert.equal(new URL(p7.url()).searchParams.get('case'), null);
  assert.deepEqual(JSON.parse(await p7.evaluate(() => localStorage.getItem('no-handover:campaign') ?? '{"skipped":[]}')).skipped ?? [], []);
  step('⏭ 튜토리얼 건너뛰기 opens an in-game dialog (focus on 계속하기, Tab stays inside); Esc keeps Case 0');
  // a blank Enter prints a prompt and nothing else: no command, no 명령 수
  const tin7 = p7.locator('.tin input');
  await tin7.fill('');
  const before7 = await p7.evaluate(() => ({ cmds: window.__game.st.log.filter((e) => e.type === 'cmd').length, rec: window.__game.playtestReport().summary }));
  const sysBefore = await p7.locator('.tline.sys').count();
  for (const v of ['', '   ', '']) {
    await tin7.fill(v);
    await tin7.press('Enter');
  }
  await p7.waitForTimeout(150);
  assert.equal(await p7.locator('.tline.sys').count(), sysBefore + 3, 'each blank Enter echoes a fresh prompt');
  const after7 = await p7.evaluate(() => ({ cmds: window.__game.st.log.filter((e) => e.type === 'cmd').length, rec: window.__game.playtestReport().summary }));
  assert.equal(after7.cmds, before7.cmds, 'a blank Enter is not a command');
  assert.equal(await p7.evaluate(() => window.__game.st.live.some((m) => m.text === '그건 나중에요 ㅋㅋ 디스크부터 봐요!!')), false, 'and gets no off-rail redirect');
  await tin7.fill('history');
  await tin7.press('Enter');
  await p7.locator('.todo li[data-id="history"].done').waitFor();
  step('blank / whitespace Enter: a fresh prompt only — not logged as a command, no rail redirect');
  // a maximized terminal still closes from its ✕ (the checklist sticky used to sit on it), and reopens
  await okMarks7();
  const term7 = p7.locator('.window[data-app="terminal"]');
  await centre7(term7.locator('.titlebar button[aria-label="maximize"]'), 'button[aria-label="maximize"]');
  await p7.locator('.window[data-app="terminal"].max').waitFor();
  const tb7 = await term7.boundingBox();
  const todo7 = await p7.locator('.todo').boundingBox();
  assert.ok(tb7.x + tb7.width <= todo7.x, `maximized terminal (right ${tb7.x + tb7.width}) stops short of the checklist (left ${todo7.x})`);
  await centre7(term7.locator('.titlebar button.close'), 'button.close');
  await term7.waitFor({ state: 'detached' });
  assert.equal(await p7.locator('#taskbar .task', { hasText: '터미널' }).count(), 0);
  await centre7(p7.locator('.icon[data-app="terminal"]'), '.icon[data-app="terminal"]');
  await term7.waitFor();
  assert.equal(await p7.locator('.window[data-app="terminal"].max').count(), 0, 'reopens at its normal size');
  await p7.locator('.window[data-app="terminal"] .tline', { hasText: '디스크 먼저' }).first().waitFor({ timeout: 2000 });
  await centre7(term7.locator('.titlebar button.close'), 'button.close');
  await term7.waitFor({ state: 'detached' });
  await p7.locator('.icon[data-app="terminal"]').click();
  await term7.waitFor();
  step('terminal: maximized it clears the checklist, ✕ closes it, the icon reopens it with its output');
  // ☰ case list: opening another case asks too; then 열기 really moves
  await p7.reload();
  await p7.locator('#boot .linkbtn.cases').click();
  await p7.locator('#cases li[data-id="case0-wiki"]').waitFor();
  await p7.locator('#cases .primary').click();
  await p7.locator('#boot .skip').click();
  await caseModal.waitFor();
  await caseModal.locator('.modal-ok').click();
  await p7.locator('#boot .caselabel', { hasText: 'Case 1' }).waitFor();
  assert.deepEqual(JSON.parse(await p7.evaluate(() => localStorage.getItem('no-handover:campaign'))).skipped, ['case0-wiki']);
  await p7.locator('#boot .linkbtn.cases').click();
  await p7.locator('#cases li[data-id="case0-wiki"] .cl-open').click();
  await caseModal.waitFor();
  assert.match(await caseModal.innerText(), /Case 0 · 튜토리얼 「위키가 안 열려요」\(으\)로 옮길까요\?[\s\S]*진행은 저장/);
  await caseModal.locator('.modal-cancel').click();
  await caseModal.waitFor({ state: 'detached' });
  await p7.waitForTimeout(300);
  assert.equal(new URL(p7.url()).searchParams.get('case'), 'case1-cron-env');
  await p7.locator('#cases .primary').click();
  step('lock screen skip link and ☰ 사건 목록 ask in game too; 열기 moves (Case 0 marked 건너뜀), 계속하기 stays');
  // the last of Case 1's five submissions: the dialog says it ends the case, focus on 더 살펴볼게요
  await p7.locator('#boot button.primary').click();
  await p7.locator('#briefing .brief-skip').click().catch(() => {});
  await p7.locator('.tin input').waitFor();
  await okMarks7();
  for (const c of ['crontab -l', 'journalctl -u cron --since "2026-11-11 00:50" --until "2026-11-11 01:10"', 'cat ~/wiki-clean.log']) {
    await p7.locator('.tin input').fill(c);
    await p7.locator('.tin input').press('Enter');
  }
  await p7.evaluate(() => {
    for (const w of document.querySelectorAll('.window:not([data-app="terminal"])')) w.classList.add('min');
  });
  for (const re of [/^0 \* \* \* \* ~\/bin\/wiki-log-clean\.sh/, /line 15: wikictl: command not found/, /\(eunjae\) CMD \(~\/bin\/wiki-log-clean/]) {
    const line = p7.locator('.tline', { hasText: re }).last();
    await line.hover();
    await line.locator('.pinbtn').click();
  }
  await p7.evaluate(() => {
    for (let i = 0; i < 4; i++) window.__game.submit({ cause: 'not-run', sequence: 'false', responsibility: [], cites: {} });
    for (const w of document.querySelectorAll('.window')) w.classList.add('min');
    document.querySelector('.moment')?.remove();
  });
  await p7.locator('.icon[data-app="report"]').waitFor({ timeout: 8000 }); // unlocks once the checklist folds
  await p7.locator('.icon[data-app="report"]').click();
  const rep7 = p7.locator('.window[data-app="report"]:not(.min)');
  await rep7.waitFor();
  assert.match(await rep7.locator('.submitbar .primary-btn').innerText(), /남은 제출 1\/5/);
  await pick(rep7, 'cause', 'cron-path');
  await pick(rep7, 'sequence', 'true');
  await cite(rep7, 'cause', /line 15: wikictl: command not found/);
  await cite(rep7, 'sequence', /\(eunjae\) CMD \(~\/bin\/wiki-log-clean/);
  await rep7.locator('.submitbar .primary-btn').click();
  const sub7 = p7.locator('.modal-back .modal-submit');
  await sub7.waitFor();
  assert.match(await sub7.locator('.modal-body').innerText(), /^마지막 제출이에요\. 틀려도 이걸로 사건이 끝나고/);
  assert.doesNotMatch(await sub7.locator('.modal-body').innerText(), /남은 제출/, 'one remaining-count message, not two');
  assert.equal(await sub7.locator('.modal-ok').innerText(), '마지막으로 제출하기');
  assert.equal(await p7.evaluate(() => document.activeElement?.classList.contains('modal-cancel')), true, 'the last one starts on 더 살펴볼게요');
  await p7.keyboard.press('Escape');
  await sub7.waitFor({ state: 'detached' });
  assert.equal(await p7.evaluate(() => window.__game.st.submissions.length), 4, 'Esc sends nothing');
  step('last submission: the in-game dialog says it is the last and ends the case, focus on 더 살펴볼게요, Esc sends nothing');
  await p7.close();

  // ---- eighth page: Case 2 evidence at 1280x800 — the terminal maximized over the desktop icons,
  // the board reached from the taskbar, a pin toast with the count and the line, per-field progress
  // in the goal card, the checklist waiting for every field, the report naming each field's kinds
  const p8 = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  p8.on('pageerror', (e) => errors.push(String(e)));
  p8.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p8.on('dialog', (d) => (nativeDialogs.push(`p8 ${d.type()}: ${d.message()}`), d.accept()));
  const top8 = (sel) => p8.evaluate((sel) => { const w = document.querySelector(sel); if (!w) return 'missing'; const r = w.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e?.closest('.window')?.dataset.app ?? e?.className ?? '-'; }, sel);
  const run8 = async (cmd) => {
    const input = p8.locator('.tin input');
    await input.fill(cmd);
    await input.press('Enter');
    await p8.waitForTimeout(80);
  };
  /** Back to the terminal the way a player would with the board in front: its taskbar entry. */
  const term8 = async () => {
    if ((await p8.evaluate(() => document.querySelector('.window.focused')?.dataset.app)) !== 'terminal') await p8.locator('#taskbar .task[data-app="terminal"]').click();
    await p8.locator('.window[data-app="terminal"] .tout').click();
  };
  const pin8 = async (re) => {
    const line = p8.locator('.tline', { hasText: re }).last();
    await line.scrollIntoViewIfNeeded();
    const lb = await line.boundingBox();
    await line.hover({ position: { x: lb.width - 20, y: lb.height / 2 } }); // its right end: the 📌 column
    await line.locator('.pinbtn').click();
  };
  await p8.goto(`${url}?fresh=1&case=case2-deleted-open&briefing=0`);
  await p8.locator('#boot .caselabel', { hasText: 'Case 2' }).waitFor();
  await p8.locator(await p8.locator('#boot .exp-new').count() ? '#boot .exp-new' : '#boot button.primary').click();
  await p8.locator('#boot').waitFor({ state: 'detached' });
  await p8.locator('.window[data-app="terminal"]').waitFor();
  await p8.locator('.window[data-app="terminal"] .titlebar').dblclick();
  await p8.locator('.window[data-app="terminal"].max').waitFor();
  const boardTask = p8.locator('#taskbar .task[data-app="board"]');
  await boardTask.waitFor();
  assert.equal(await boardTask.locator('.badge').count(), 0, 'no badge before the first pin');
  await term8();
  await run8('df -h');
  await pin8(/196G\s+180G\s+5\.9G\s+97%\s+\/data/);
  const pinToast = p8.locator('.toast.pintoast');
  await pinToast.waitFor();
  assert.match(await pinToast.innerText(), /증거 1\/3 추가됨 — 보드에서 보고하기/);
  assert.match(await pinToast.locator('.pintoast-line').innerText(), /\/dev\/sdb1\s+196G/);
  assert.equal(await boardTask.locator('.badge').innerText(), '1');
  assert.equal(await p8.locator('.icon[data-app="board"] .badge').innerText(), '1');
  assert.equal(await top8('.icon[data-app="board"]'), 'terminal', 'the maximized terminal covers the 📌 icon');
  await boardTask.click();
  await p8.locator('.window[data-app="board"]:not(.min)').waitFor();
  assert.equal(await top8('.window[data-app="board"]'), 'board', 'the taskbar 📌 brings the board in front of the terminal');
  assert.equal(await p8.evaluate(() => document.querySelector('.window.focused')?.dataset.app), 'board');
  await term8();
  assert.equal(await top8('.window[data-app="terminal"]'), 'terminal');
  await boardTask.click();
  assert.equal(await top8('.window[data-app="board"]'), 'board', 'open but behind: one click raises it');
  step('1280x800, terminal maximized over the icons: a pin shows "증거 1/3 추가됨 — 보드에서 보고하기" with the line, the 📌 taskbar entry carries the count and raises the board');

  await term8();
  await run8('du -sh /data/collector/*');
  await pin8(/^67G\s+\/data\/collector\/archive/);
  await run8('pgrep -f logshipd');
  await run8('ls -l /proc/1187/fd | grep deleted');
  await p8.waitForTimeout(2200);
  await p8.keyboard.press('Escape');
  await pin8(/\(deleted\)/);
  await p8.waitForTimeout(200);
  assert.equal(await p8.evaluate(() => window.__game.evidencePins().length), 3, 'three pins that count');
  assert.equal(await p8.locator('.todo li[data-id="pins"].done').count(), 0, 'three 원인 pins alone do not tick "증거 3개": 경위 and 재발 방지 have none');
  assert.match(await p8.locator('.todo li[data-id="pins"] .todo-ev').innerText(), /원인 2\/2 · 경위 0\/2 · 재발 방지 0\/3/);
  await p8.locator('#taskbar .goalbtn').click();
  const goal8 = p8.locator('.popover.goalpop');
  await goal8.waitFor();
  assert.match(await goal8.locator('.goal-ev[data-slot="cause"]').innerText(), /원인 증거 2\/2/);
  assert.match(await goal8.locator('.goal-ev[data-slot="sequence"]').innerText(), /경위 증거 0\/2/);
  assert.equal(await goal8.locator('.goal-ev.ready').count(), 1, 'only 원인 can be cited yet');
  assert.doesNotMatch(await goal8.innerText(), /logshipd|deleted|pay-api-01|jhpark/, 'the goal card names kinds, never findings');
  await p8.locator('#taskbar .goalbtn').click();
  await goal8.waitFor({ state: 'detached' });
  step('three 원인 pins: the checklist keeps "증거 3개" open until every field has one; 🎯 shows 원인 증거 2/2 · 경위 증거 0/2 without findings');

  await term8();
  await run8('journalctl --since "2026-11-11 14:00" --until "2026-11-11 15:00"');
  await pin8(/COMMAND=\/usr\/bin\/rm pay-api-01\.log/);
  await p8.waitForTimeout(200);
  assert.equal(await p8.locator('.todo li[data-id="pins"].done').count(), 0, '재발 방지 still has none');
  await p8.locator('.window[data-app="terminal"] .titlebar').dblclick(); // restore: the icons show again
  await p8.locator('.window[data-app="terminal"]:not(.max)').waitFor();
  await p8.locator('.icon[data-app="report"]').click();
  const rep8 = p8.locator('.window[data-app="report"]');
  await rep8.locator('section.slot').first().waitFor();
  const need = (slot) => rep8.locator(`.cite[data-slot="${slot}"] .cite-need`);
  assert.match(await need('cause').innerText(), /✓/);
  assert.match(await need('sequence').innerText(), /✓/);
  assert.match(await need('responsibility').innerText(), /아직 없음/);
  assert.equal(await rep8.locator('.cite[data-slot="responsibility"] .crit.met').count(), 0);
  assert.equal(await rep8.locator('.cite[data-slot="responsibility"] .crit.miss').count(), 3, 'each kind 재발 방지 accepts, none met');
  // a cited pin that is not of the field's kinds is named before submitting
  await rep8.locator('label.citeopt:has(input[name="cite-sequence"])', { hasText: /\/dev\/sdb1/ }).locator('input').check();
  assert.match(await rep8.locator('.cite[data-slot="sequence"] .cite-state').innerText(), /이 칸의 종류가 아니에요/);
  await rep8.locator('label.citeopt:has(input[name="cite-sequence"])', { hasText: /COMMAND=/ }).locator('input').check();
  assert.match(await rep8.locator('.cite[data-slot="sequence"] .cite-state').innerText(), /인정돼요/);
  await term8();
  await run8('cat /etc/logshipd/logshipd.conf');
  await pin8(/^max_source_bytes = 0/);
  await p8.locator('.todo li[data-id="pins"].done').waitFor({ timeout: 2000 });
  await rep8.locator('.cite[data-slot="responsibility"] .crit.met').first().waitFor();
  step('report: each field lists the kinds it accepts with ✓/○ and whether the cited pin counts; once 재발 방지 has a pin, "증거 3개" ticks');
  await p8.close();
  // ---- ninth page: 숙련자 모드 — Cases 0–3 solved the harder way
  const p9 = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  p9.on('pageerror', (e) => errors.push(String(e)));
  p9.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p9.on('dialog', (d) => (nativeDialogs.push(`p9 ${d.type()}: ${d.message()}`), d.accept()));
  const run9 = async (cmd) => {
    const input = p9.locator('.tin input');
    await input.fill(cmd);
    await input.press('Enter');
    await p9.waitForTimeout(80);
  };
  const pin9 = async (re) => {
    const line = p9.locator('.tline', { hasText: re }).last();
    await line.hover();
    await line.locator('.pinbtn').click();
  };
  const skipAha9 = async () => {
    await p9.locator('.moment.moment-aha').waitFor({ timeout: 3000 });
    await p9.keyboard.press('Escape');
    await p9.locator('.moment').waitFor({ state: 'detached', timeout: 3000 });
  };
  const report9 = async () => {
    await p9.evaluate(() => {
      for (const w of document.querySelectorAll('.window')) w.classList.add('min');
    });
    await p9.locator('.icon[data-app="report"]').click();
    return p9.locator('.window[data-app="report"]');
  };
  const shot9 = async (name) => shots && (await p9.screenshot({ path: join(shots, name) }));
  const solvedFirst9 = async () => assert.equal(await p9.evaluate(() => window.__game.st.submissions.length === 1 && window.__game.st.submissions[0].score.allCorrect), true, 'solved on the first submission');
  const solved9 = async (rep, next, copy = /남은 제출 2\/2/) => {
    await submit(rep, copy, p9);
    await rep.locator('.debrief h2').waitFor({ timeout: 5000 });
    await solvedFirst9();
    await rep.locator('.record .rec-senior', { hasText: '숙련자 모드' }).waitFor();
    await p9.locator('.moment').waitFor({ state: 'detached', timeout: 5000 });
    if (next) {
      await rep.locator('.nextcase button').click();
      await p9.locator('#boot .caselabel', { hasText: next }).waitFor();
      await p9.locator('#boot button.primary').click();
      await p9.locator('#briefing[data-step="ring"]').waitFor({ timeout: 10000 });
      await p9.keyboard.press('Escape');
      await p9.locator('#briefing').waitFor({ state: 'detached', timeout: 3000 });
      // round 3: 숙련자 (익숙해요) keeps its promise in every case — the terminal is one click away, not opened for you
      await p9.waitForTimeout(600);
      assert.equal(await p9.locator('.window[data-app="terminal"]').count(), 0, `숙련자: no terminal opens by itself in ${next}`);
      assert.ok(await p9.evaluate(() => window.__game.st.log.some((e) => e.type === 'auto-window-held' && e.app === 'terminal')));
      await p9.locator('.icon[data-app="terminal"]').click();
      await p9.locator('.window[data-app="terminal"] .tin input').waitFor();
    }
  };
  await p9.goto(`${url}?fresh=1&briefing=0`);
  await p9.locator('#boot .exp-expert').waitFor();
  await shot9('expert-01-first-run.png');
  await p9.locator('#boot .exp-expert').click();
  await p9.locator('#boot').waitFor({ state: 'detached' });
  assert.equal(await p9.evaluate(() => localStorage.getItem('no-handover:experience')), 'familiar');
  assert.equal(await p9.evaluate(() => localStorage.getItem('no-handover:expert')), '1');
  assert.equal(await p9.evaluate(() => window.__game.expert()), true);
  await p9.waitForTimeout(1200);
  assert.equal(await p9.locator('.todo').count(), 0, '숙련자: no checklist');
  assert.equal(await p9.locator('.icons .icon').count(), 7, '숙련자: every icon from the start');
  assert.equal(await p9.locator('.tour').count(), 0);
  await shot9('expert-02-case0-desktop.png');
  step('숙련자 모드 from the first-run choice: 익숙해요 + the mode saved; Case 0 opens with no checklist, all seven icons, no coach mark');
  // ❓ shows the setting; 💡 shows that the recap costs too
  await p9.locator('#taskbar button[data-tour="help"]').click();
  await p9.locator('.expert-set button[data-expert="1"][aria-pressed="true"]').waitFor();
  assert.match(await p9.locator('.expert-set').innerText(), /지금 사건: 숙련자 모드/);
  await p9.locator('#taskbar button[data-tour="help"]').click();
  await p9.locator('#taskbar button[data-tour="hint"]').click();
  assert.match(await p9.locator('.popover.hints .hp-record').innerText(), /숙련자 모드: 요약 −5/);
  assert.match(await p9.locator('.popover.hints section[data-key="cause"] .hp-step[data-rung="summary"] button').innerText(), /−5점/);
  await p9.locator('#taskbar button[data-tour="hint"]').click();
  step('❓ shows 숙련자 모드 켜짐 for this case; the 💡 recap is −5 in this mode');

  // Case 0: the journal herring — du and journald.conf rule it out
  // 숙련자 = 익숙해요 + the mode: Case 0 opens no window by itself, the terminal is one click away
  assert.equal(await p9.locator('.window[data-app="terminal"]').count(), 0, '숙련자 (익숙해요): no terminal opens by itself in Case 0');
  await p9.locator('.icon[data-app="terminal"]').click();
  await p9.locator('.window[data-app="terminal"] .tin input').waitFor();
  await p9.locator('.window[data-app="terminal"] .tout').click();
  await run9('history');
  await p9.locator('.tline', { hasText: '# TODO: wiki 로그 logrotate' }).waitFor();
  assert.equal(await p9.locator('.tline', { hasText: /du -sh|df -h|tail -n 20/ }).count(), 0, '숙련자: the history holds no command order to copy');
  await run9('cat ~/README.txt');
  assert.equal(await p9.locator('.tline', { hasText: '장애 나면 제 순서' }).count(), 0, '숙련자: the README has no numbered order');
  step('Case 0 (숙련자): history and README are short and hold no command order (no df/du/tail lines)');
  await run9('df -h');
  await pin9(/100%\s+\/var/);
  await run9('du -sh /var/log/*');
  await p9.locator('.tline', { hasText: /^5\d\dM\s+\/var\/log\/journal/ }).waitFor();
  await run9('cat /etc/systemd/journald.conf');
  await p9.locator('.tline', { hasText: /^SystemMaxUse=1G/ }).waitFor();
  assert.equal(await p9.locator('.tline.clue').count(), 0, '숙련자: no yellow clue lines');
  await run9('journalctl -u wiki --since "2026-11-09 21:00" --until "2026-11-09 21:20"');
  await pin9(/21:14:03 .*thumbnail/);
  await p9.locator('.icon[data-app="board"]').click();
  const board9 = p9.locator('.window[data-app="board"]');
  await board9.locator('.obs-logp').waitFor();
  assert.equal(await board9.locator('.obs-tl').count(), 0, '숙련자: the board has no evidence timeline');
  assert.equal(await board9.locator('.card[data-pin]').count(), 2, 'both pins stay on the board');
  assert.ok(await board9.locator('.obs-criteria').count(), 'so does the report evidence panel');
  await shot9('expert-05-case0-board.png');
  step('Case 0 (숙련자): the evidence board shows pins and report evidence, no evidence timeline (it orders itself and scores nothing)');
  const rep90 = await report9();
  await rep90.locator('input[name="slot-sequence"][value="journal"]').waitFor();
  await shot9('expert-04-case0-report.png');
  assert.match(await rep90.locator('.submitbar .primary-btn').innerText(), /2\/2/);
  await rep90.locator('input[name="slot-cause"][value="disk"]').check();
  await rep90.locator('input[name="slot-sequence"][value="journal"]').check();
  await rep90.locator('label.citeopt:has(input[name="cite-cause"])', { hasText: /100%\s+\/var/ }).first().locator('input').check();
  await rep90.locator('label.citeopt:has(input[name="cite-sequence"])', { hasText: /21:14:03 .*thumbnail/ }).first().locator('input').check();
  await submit(rep90, /남은 제출 2\/2/, p9);
  // round 3 (숙련자 too): a wrong report shows ✓/✗ per field for free, with one short line and no per-field hint
  await rep90.locator('.reply .reply-marks').waitFor();
  assert.deepEqual(await rep90.locator('.reply .reply-marks li').allInnerTexts(), ['✓ 원인', '✗ 경위']);
  assert.equal(await rep90.locator('.reply .reply-body').innerText(), '✗ 칸이 로그랑 안 맞아요. 다시요.');
  await rep90.locator('input[name="slot-sequence"][value="true"]').check();
  await rep90.locator('.submitbar .primary-btn').click();
  const last90 = p9.locator('.modal-back .modal-submit');
  await last90.waitFor();
  assert.match(await last90.locator('.modal-body').innerText(), /^마지막 제출이에요\. /);
  assert.doesNotMatch(await last90.locator('.modal-body').innerText(), /남은 제출/, 'one remaining-count message');
  await last90.locator('.modal-ok').click();
  await rep90.locator('.debrief h2').waitFor({ timeout: 5000 });
  await rep90.locator('.scorebox .s.time').waitFor();
  assert.equal(await p9.evaluate(() => window.__game.st.submissions.length === 2 && window.__game.st.submissions[1].score.allCorrect), true, 'solved on the second (last) submission');
  await p9.locator('.moment').waitFor({ state: 'detached', timeout: 5000 });
  await shot9('expert-03-case0-debrief.png');
  assert.ok(await p9.evaluate(() => 'c0x_journal' in window.__game.st.clues));
  await p9.locator('.moment').waitFor({ state: 'detached', timeout: 5000 });
  await rep90.locator('.nextcase button').click();
  await p9.locator('#boot .caselabel', { hasText: 'Case 1' }).waitFor();
  await p9.locator('#boot button.primary').click();
  await p9.locator('#briefing[data-step="ring"]').waitFor({ timeout: 10000 });
  await p9.keyboard.press('Escape');
  await p9.locator('#briefing').waitFor({ state: 'detached', timeout: 3000 });
  step('Case 0 (숙련자): the journald herring is in the report, du and journald.conf rule it out; a wrong report shows ✓/✗ per field only; the last dialog has one count message; a 시간 row in the debrief');
  // round 3: past the tutorial too, 숙련자 (익숙해요) opens no terminal by itself
  await p9.waitForTimeout(600);
  assert.equal(await p9.locator('.window[data-app="terminal"]').count(), 0, '숙련자: no terminal opens by itself in Case 1');
  await p9.locator('.icon[data-app="terminal"]').click();
  await p9.locator('.window[data-app="terminal"] .tin input').waitFor();
  step('숙련자 Case 1: no terminal opens by itself; one click on its icon');

  // Case 1: the /bin/sh herring — the shebang and the hourly output rule it out
  assert.equal(await p9.evaluate(() => window.__game.expert()), true, 'the mode carries to the next case');
  assert.equal(await p9.locator('.todo').count(), 0);
  await p9.locator('.window[data-app="terminal"] .tout').click();
  await run9('crontab -l');
  await pin9(/^0 \* \* \* \* ~\/bin\/wiki-log-clean\.sh/);
  assert.equal(await p9.locator('.tline', { hasText: /절대 경로|cron-env/ }).count(), 0, '숙련자: no comment says why');
  await run9('journalctl -u cron --since "2026-11-11 00:50" --until "2026-11-11 01:10"');
  await pin9(/\(eunjae\) CMD \(~\/bin\/wiki-log-clean/);
  await run9('cat ~/log/cron-env.txt');
  await run9('head -12 ~/bin/wiki-log-clean.sh');
  await p9.locator('.tline', { hasText: '[[ "$SIZE_MB" -lt "$LIMIT_MB"' }).waitFor();
  await run9('cat ~/wiki-clean.log');
  await skipAha9();
  await pin9(/line 15: wikictl: command not found/);
  const rep91 = await report9();
  await rep91.locator('input[name="slot-cause"][value="sh-syntax"]').waitFor();
  await rep91.locator('input[name="slot-cause"][value="cron-path"]').check();
  await rep91.locator('input[name="slot-sequence"][value="true"]').check();
  await rep91.locator('label.citeopt:has(input[name="cite-cause"])', { hasText: /line 15: wikictl: command not found/ }).first().locator('input').check();
  await rep91.locator('label.citeopt:has(input[name="cite-sequence"])', { hasText: /\(eunjae\) CMD \(~\/bin\/wiki-log-clean/ }).first().locator('input').check();
  await solved9(rep91, 'Case 2');
  assert.ok(await p9.evaluate(() => window.__game.expert()));
  step('Case 1 (숙련자): the [[ ]] script and cron\'s SHELL=/bin/sh make the sh herring plausible; #!/bin/bash and line 15 rule it out; solved');

  // Case 2: the mount herring — logshipd's flush line rules it out
  assert.equal(await p9.locator('.todo').count(), 0);
  await p9.locator('.window[data-app="terminal"] .tout').click();
  await run9('df -h');
  await p9.locator('.tline', { hasText: /tmpfs .*\/data\/collector\/spool/ }).waitFor();
  await run9('cat /etc/fstab');
  await run9('journalctl -u logshipd --since "2026-11-11 11:00" --until "2026-11-11 11:10"');
  await p9.locator('.tline', { hasText: 'spool: flushed 2 buffer file(s) (38M)' }).waitFor();
  await run9('cat ~/.bashrc');
  assert.equal(await p9.locator('.tline', { hasText: '숨은거' }).count(), 0, '숙련자: no alias holds the answer');
  await run9('pgrep -f logshipd');
  await run9('ls -l /proc/1187/fd | grep deleted');
  await skipAha9();
  await pin9(/\(deleted\)/);
  await run9('journalctl --since "2026-11-11 14:00" --until "2026-11-11 15:00"');
  await pin9(/COMMAND=\/usr\/bin\/rm pay-api-01\.log/);
  await run9('cat /etc/logshipd/logshipd.conf');
  await pin9(/^max_source_bytes = 0/);
  await p9.evaluate(() => {
    for (const w of document.querySelectorAll('.window')) w.classList.add('min');
  });
  await p9.locator('.icon[data-app="mail"]').click();
  const mail9 = p9.locator('.window[data-app="mail"]');
  await mail9.locator('.mail-row', { hasText: '박지훈' }).click();
  await mail9.locator('.mail-read pre', { hasText: '끝나고 바로 껐습니다' }).waitFor();
  assert.match(await mail9.locator('.mail-read pre').innerText(), /지난주 결제 로그/);
  await shot9('expert-06-case2-jihoon-mail.png');
  step('Case 2 (숙련자): Jihoon\'s own account (debug "then off", "last week\'s" file) sits in the inbox to set against the journals');
  const rep92 = await report9();
  await rep92.locator('input[name="slot-cause"][value="mount"]').waitFor();
  await rep92.locator('input[name="slot-cause"][value="open"]').check();
  await rep92.locator('input[name="slot-sequence"][value="true"]').check();
  for (const id of ['no-verify', 'open-rule', 'debug-expiry']) await rep92.locator(`input[name="slot-responsibility"][value="${id}"]`).check();
  await rep92.locator('label.citeopt:has(input[name="cite-cause"])', { hasText: /\(deleted\)/ }).first().locator('input').check();
  await rep92.locator('label.citeopt:has(input[name="cite-sequence"])', { hasText: /COMMAND=\/usr\/bin\/rm pay-api-01\.log/ }).first().locator('input').check();
  await rep92.locator('label.citeopt:has(input[name="cite-responsibility"])', { hasText: /max_source_bytes = 0/ }).first().locator('input').check();
  await solved9(rep92, 'Case 3');
  step('Case 2 (숙련자): a tmpfs over a non-empty spool makes "hidden under a mount" plausible; logshipd\'s flush line rules it out; solved');

  // Case 3: no overlay — the checklist stays, only hint steps cost points
  assert.equal(await p9.evaluate(() => [window.__game.st.settings.senior, window.__game.expert()]).then(String), 'true,false');
  assert.equal(await p9.locator('.todo li').count(), 3, 'Case 3 keeps its checklist');
  await p9.locator('.window[data-app="terminal"] .tout').click();
  for (const c of ['history | tail -20', 'crontab -l', 'head -5 ~/bin/ledger-backup.sh', 'fds', 'systemctl show payment-api -p LimitNOFILE', 'tail -3 ~/log/backup.log']) await run9(c);
  await pin9(/^15 3 \* \* 6/);
  await pin9(/^1947/);
  await pin9(/^LimitNOFILE=4096/);
  await pin9(/opened 2,314 segment files/);
  await run9('journalctl -u payment-api --since "2026-11-14 03:14" --until "2026-11-14 03:18"');
  await pin9(/03:15:40 .*too many open files/);
  await p9.locator('.ttab', { hasText: /^pay-cfg$/ }).first().click();
  await run9('cd /srv/git/pay-config.git');
  await run9('git log --format=fuller -1');
  await pin9(/^AuthorDate: Fri Nov 13 18:02:11/);
  await run9('git branch -a');
  await pin9(/revert-pool-bump/);
  await run9('getent group git-admins');
  await pin9(/^git-admins:x:1050/);
  await run9('cat hooks/pre-receive');
  await pin9(/grep -qw git-admins && exit 0/);
  await p9.locator('.ttab', { hasText: /^bastion$/ }).first().click();
  await run9('last');
  await pin9(/^sjkang .*vpn-10\.8\.3\.41/);
  await p9.locator('.ttab', { hasText: /^review-web$/ }).first().click();
  await run9('grep sjkang /var/log/nginx/access.log | tail -3');
  await pin9(/02:10:07 .*approve/);
  await p9.waitForFunction(() => window.__game.st.live.some((m) => /설마/.test(m.text) && m.deletedAt !== undefined), null, { timeout: 15000 });
  await p9.evaluate(() => {
    window.__game.open('notif:E06');
    window.__game.open('mail:summary');
  });
  const rep93 = await report9();
  await rep93.locator('input[name="slot-cause"][value="fd"]').check();
  await rep93.locator('input[name="slot-sequence"][value="true"]').check();
  for (const id of ['git-admins', 'cron', 'oncall', 'account']) await rep93.locator(`input[name="slot-responsibility"][value="${id}"]`).check();
  await rep93.locator('label.citeopt:has(input[name="cite-cause"])', { hasText: /too many open files/ }).first().locator('input').check();
  await rep93.locator('label.citeopt:has(input[name="cite-sequence"])', { hasText: /AuthorDate: Fri Nov 13 18:02:11/ }).first().locator('input').check();
  await rep93.locator('label.citeopt:has(input[name="cite-responsibility"])', { hasText: /git-admins:x:1050/ }).first().locator('input').check();
  await solved9(rep93, null, /남은 제출 3\/3/);
  assert.match(await rep93.locator('.scorebox .s').nth(1).innerText(), /330 \/ 330/);
  assert.equal(await rep93.locator('.scorebox .s.time').count(), 0, 'no time row without an overlay');
  assert.deepEqual(JSON.parse(await p9.evaluate(() => localStorage.getItem('no-handover:campaign'))).solved, ['case0-wiki', 'case1-cron-env', 'case2-deleted-open', 'friday-1802']);
  step('Case 3 (숙련자): checklist kept, no time cost; solved 330/330 — Cases 0–3 all solved in 숙련자 모드');
  await p9.close();
  assert.deepEqual(nativeDialogs, [], 'no browser confirm()/alert() anywhere');

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
