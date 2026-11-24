// Browser end-to-end run: builds nothing, serves dist/ with `vite preview`, drives the real UI
// with playwright-core: first launch opens Case 0 (tutorial) — its short briefing, the pre-typed
// `history`, Jihoon's rail, the five checklist items and icon unlocks with one coach mark each, a wrong then a right
// report — and the debrief's "다음 사건" button opens Case 1 「밤에만 실패하는 스크립트」 (full
// briefing, only the 🎯 goal coach mark, the goal card, the aha moment, wrong replies with per-field ✓/✗,
// the result moment), then Case 2 「지웠는데 안 비워지는 디스크」 (two hosts, the deleted open file,
// three slots), then Case 3 「금요일 18:02」. Each case ends on its last scene before the debrief (Cases 0–2:
// the bar's 해설 바로 보기 after the first DM; Case 3: the whole scene, 물주기 in the prompt and all). There it watches
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
// A tenth page (1280x800, touch) checks pins and windows as a snapshot-driven tool meets them: a
// faint 📌 on every line named after it, tap to pin, a hint on a plain click, "already pinned"; a
// covered window leaves the accessibility tree, focus raises a window, minimized stays minimized,
// toasts keep off the 📌 columns, and the command textbox precedes a long output in the document.
// An eleventh round opens the terminal in Case 0 (처음이에요) and Case 1 (익숙해요) at 1280x800 and 1024x768,
// with and without reduced motion: the prompt sits at the bottom of the terminal, the output right
// above it from the first line on, the newest line just over the prompt, focus kept in the prompt.
// A twelfth round opens Case 0 and Case 1 at 390x844 and 768x1024 with touch: every taskbar control on screen
// and one tap away (💡 힌트, 🔊), the terminal's ✕ and 📌 column inside the screen, "오늘 할 일" folded clear of it.
// A thirteenth round pins one line straight from a long output in every case: Shift+↑ / P at 1280x800,
// tap a line + 「⇡ 단서」 + 「📌 핀하기」 at 390x844, reduced motion on and off, 숙련자 모드 without marks.
// A fourteenth round plays Case 4 「남아 있는 열쇠」 and the season finale: the crontab aha, the hidden sign, 은재's drafts
// (namu), the keys and prints, the hidden bad ending (crontab -r), the report, the last scene, the choice, two endings
// (#인프라, then 다른 곳에 넘겨 보기 → 「인수인계 없음」), the reply with the workshop photo, the credits, the 15 s line,
// the stats; then the sign-not-found path at 390x844 with reduced motion.
// The last rounds (eleven to fourteen) also run in WebKit (the Safari engine) when PW_WEBKIT names a WebKit launcher or is 1.
//
//   npm run build && npm run e2e
//   E2E_SHOTS=/some/dir npm run e2e        # also save screenshots
//   PW_CHROMIUM=/path/to/chrome npm run e2e  # use a specific browser binary
//   PW_WEBKIT=1 npm run e2e                   # also check the terminal prompt in WebKit (or PW_WEBKIT=/path/to/launcher)
//
// Uses the Playwright-managed headless shell from ~/.cache/ms-playwright when no path is given.

import { preview } from 'vite';
import { chromium, webkit } from 'playwright-core';
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
  // the memo may have turned over the terminal's older lines: bring the terminal forward first, as a player would
  if ((await page.evaluate(() => document.querySelector('.window.focused')?.dataset.app)) !== 'terminal') await page.locator('#taskbar .task[data-app="terminal"]').click();
  const line = page.locator('.tline', { hasText: re }).last();
  await line.hover();
  await line.locator('.pinbtn').click();
}

/**
 * Close an open window from its ✕. Typing into the terminal (fill) brings it forward, so a window
 * that opened by itself meanwhile may be behind: its taskbar entry raises it first.
 */
async function closeWin(app, pg = page) {
  if ((await pg.evaluate((a) => document.querySelector('.window.focused')?.dataset.app, app)) !== app) await pg.locator(`#taskbar .task[data-app="${app}"]`).click();
  await pg.locator(`.window[data-app="${app}"] .titlebar button.close`).click();
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
/**
 * The last scene after the final report (src/engine/game.ts ending): the report says it was sent,
 * the bar offers 해설 바로 보기; optionally the scene's first DM lands as a toast; then the bar skips
 * to the debrief, whose folded 점수와 기록 is opened for the checks that follow.
 */
async function lastScene(rep, pg = page, { first, open = true } = {}) {
  await pg.locator('.ending-bar').waitFor({ timeout: 5000 });
  assert.match(await rep.locator('.ending-wait').innerText(), /보고서를 보냈어요/);
  if (first) await pg.locator('.toast', { hasText: first }).waitFor({ timeout: 15000 });
  await pg.locator('.moment').waitFor({ state: 'detached', timeout: 5000 });
  await pg.locator('.ending-bar .ending-skip').click();
  await pg.locator('.ending-bar').waitFor({ state: 'detached' });
  await rep.locator('.debrief h2').waitFor();
  if (open) await rep.locator('details.score-fold > summary').click();
}
/** Report: pick an option by id; cite the pin whose line matches `re` for a slot. */
const pick = (rep, slot, id) => rep.locator(`input[name="slot-${slot}"][value="${id}"]`).check();
const cite = (rep, slot, re) => rep.locator(`label.citeopt:has(input[name="cite-${slot}"])`, { hasText: re }).first().locator('input').check();
/** Each mark's "n/N", in the order the marks showed (season report B7: they count up as they appear). */
const tourNs = [];
/** A coach mark: waits for it, checks it is the only one on screen, then "알겠어요". */
async function mark(id, shotName) {
  const m = page.locator(`.tour[data-step="${id}"]`);
  await m.waitFor({ timeout: 6000 });
  assert.equal(await page.locator('.tour').count(), 1, 'one mark at a time');
  tourNs.push(await m.locator('.tour-n').innerText());
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
  // the seat is 도윤's for two weeks only (Case 4's last scene ends them): said on the lock screen before anything else
  assert.match(await page.locator('#boot .fine').innerText(), /오늘부터 2주\(11\/23까지\)는 도윤님이 이 자리를 맡아요/);
  await shot('case0-01-boot.png');
  await page.locator('#boot .linkbtn.cases').click();
  assert.equal(await page.locator('#cases li').count(), 5);
  for (const id of ['case1-cron-env', 'case2-deleted-open', 'friday-1802', 'case4-keys']) assert.equal(await page.locator(`#cases li[data-id="${id}"].case-locked`).count(), 1, `${id} locked until the case before it is solved`);
  assert.equal(await page.locator('#cases li.case-soon').count(), 0, 'no placeholder left: Case 4 is playable');
  // round 3: a locked case says how it opens and links back to the case that opens it (here, the one on screen)
  for (const id of ['case1-cron-env', 'case2-deleted-open', 'friday-1802', 'case4-keys']) {
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
  await causeSec.locator('.hp-dir[data-part="look"]', { hasText: 'Mounted on' }).waitFor();
  assert.match(await causeSec.locator('.hp-dir[data-part="look"] .hp-part').innerText(), /볼 곳/);
  // ② comes in two parts: where to look, then (same direction) what to compare there
  const cmpBtn = causeSec.locator('[data-rung="direction"] button');
  assert.match(await cmpBtn.innerText(), /비교할 것 보기/);
  await cmpBtn.click();
  await causeSec.locator('.hp-dir[data-part="compare"]', { hasText: '/ 줄과 /var 줄' }).waitFor();
  assert.equal(await hp.locator('.hp-opens dd').innerText(), '1번 · 세지 않음');
  assert.equal(await hp.locator('.hp-steps dd').innerText(), '4개 · 방향·정답');
  assert.match(await hp.locator('.hp-record').innerText(), /패널을 열거나 요약을 보는 건 세지 않아요/);
  await shot('polish-01-hint-panel.png');
  await page.mouse.click(700, 300);
  await hp.waitFor({ state: 'detached' });
  step('`hint` → 💡 panel: 요약 (free) → 방향 (볼 곳, then 비교할 것) → 정답 behind a second confirm, for the checklist item and the cause slot; counters: panel opened 1번 (not counted) apart from 4 hint steps');

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

  // season report B6: a line picked from one output (its toolbar names "wiki-01 $ df -h") lets go when the next command runs
  await page.locator('.tline', { hasText: /100%\s+\/var/ }).last().click();
  assert.equal(await page.locator('.tpinbar:not([hidden]) .tpb-src').innerText(), 'wiki-01 $ df -h');
  await run('du -sh /var/log/*');
  assert.equal(await page.locator('.tpinbar:not([hidden])').count(), 0, 'the toolbar closes with the next command');
  await page.locator('.tline.clue', { hasText: /^11G\s+\/var\/log\/wiki(?!\/)/ }).waitFor();
  await run('tail -n 20 /var/log/wiki/wiki.log');
  await todoItem('tail').and(page.locator('.done')).waitFor();
  await page.locator('.icon[data-app="board"]').waitFor();
  await mark('board');
  await run('systemctl status wiki');
  await todoItem('service').and(page.locator('.done')).waitFor();
  await mark('dashboard');
  await page.waitForTimeout(400);
  if (await page.locator('.window[data-app="notes"]').count()) await closeWin('notes'); // the memo scene opened the notebook
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
  assert.deepEqual(tourNs, ['1/8', '2/8', '3/8', '4/8', '5/8', '6/8', '7/8', '8/8'], 'the marks count up in the order they show');
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
  // 지훈's wrong-answer nudge lands a beat later and re-renders the report: wait for it before the screenshot
  await page.waitForFunction(() => window.__game.st.live.some((m) => m.from === 'jihoon' && /PDF 하나로/.test(m.text)), null, { timeout: 5000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await rep0.locator('.reply').scrollIntoViewIfNeeded();
  await shot('case0-r3-reply.png');
  await pick(rep0, 'cause', 'disk');
  await submit(rep0, /몇 번이든/);
  await lastScene(rep0, page, { first: '봤어요. 맞아요. 위키 살아났어요.' });
  assert.equal(await page.evaluate(() => window.__game.st.live.some((m) => m.from === 'jihoon' && /점심 제가 쏩니다/.test(m.text))), true, 'the skipped lines are in the channel');
  const total0 = await rep0.locator('.scorebox .s').nth(1).innerText();
  assert.match(total0, /\/ 230/);
  await page.evaluate(() => document.querySelector('.window[data-app="report"]').classList.add('max'));
  await page.waitForTimeout(400);
  await shot('case0-03-debrief.png');
  assert.match(await rep0.locator('.record .rec-line').innerText(), /^힌트 단계 4개 · (\d+분 )?\d+초 · 명령 \d+개$/);
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
  step('debrief: record "힌트 단계 4개 · 소요 · 명령 수" with panel opens noted as not counted, no penalty; 결과 카드 downloads as a 1200×630 PNG');
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
  await page.locator('#briefing[data-step="mail"] .brief-mail', { hasText: '[연습 2] 위키 인증서 만료' }).waitFor({ timeout: 45000 });
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
  await run('cat ~/wiki-cert.log');
  await page.locator('.moment.moment-aha').waitFor({ timeout: 3000 });
  await page.keyboard.press('Escape');
  await page.locator('.moment').waitFor({ state: 'detached', timeout: 2000 });
  await todoItem('output').and(page.locator('.done')).waitFor();
  step('crontab -l → journalctl -u cron → ~/wiki-cert.log: three boxes tick; the aha moment shows once and Esc skips it');
  await pinLine(/^0 \* \* \* \* ~\/bin\/wiki-cert-renew\.sh/);
  await pinLine(/line 15: wikictl: command not found/);
  await pinLine(/\(eunjae\) CMD \(~\/bin\/wiki-cert-renew/);
  await todoItem('pins').and(page.locator('.done')).waitFor();
  await todoItem('pins').locator('.todo-report').click();
  await page.locator('.window[data-app="report"]:not(.min)').waitFor();
  await page.locator('.todo').waitFor({ state: 'detached', timeout: 6000 });
  await page.locator('.window[data-app="report"] .titlebar button.close').click();
  for (const c of ['which wikictl', 'cat ~/log/cron-env.txt', 'journalctl -u wiki --since "2026-11-11 08:00"', 'openssl x509 -enddate -noout -in /etc/wiki/tls/wiki.crt']) await run(c);
  assert.ok(await page.evaluate(() => window.__game.causeSolved()));
  await run('curl -v https://wiki.nuricloud.example/healthz');
  await page.locator('.tline', { hasText: 'curl: (60) SSL certificate problem: certificate has expired' }).waitFor();
  await shot('case1-06-cert.png');
  step('pins tick the fourth box and its "📝 보고서 쓰기" opens the report; which / cron-env.txt / journalctl -u wiki / openssl x509 complete the evidence; curl -v stops on the expired certificate');

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
  await cite(rep1, 'sequence', /\(eunjae\) CMD \(~\/bin\/wiki-cert-renew/);
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
  await lastScene(rep1, page, { first: 'cron의 PATH' });
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
  if (await page.locator('.window[data-app="notes"]').count()) await closeWin('notes'); // the memo scene opened the notebook
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
  // season report B13: the dashboard's 14:28 mark runs up through each chart as a guide and names its time on hover,
  // so whether the ingest rise starts before or after it reads off the chart
  await page.locator('.icon[data-app="dashboard"]').click();
  const dash2 = page.locator('.window[data-app="dashboard"]');
  await dash2.locator('.obs-tsp .obs-chart svg').first().waitFor();
  const mk2 = dash2.locator('.obs-tsp').first().locator('.obs-markg').first();
  assert.match(await mk2.locator('title').textContent(), /^표식 .*14:28$/);
  const ml2 = await mk2.locator('.obs-markline').evaluate((l) => [+l.getAttribute('y1'), +l.getAttribute('y2')]);
  assert.ok(ml2[1] - ml2[0] > 100, `the guide spans the plot (${ml2})`);
  await closeWin('dashboard');
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
  await lastScene(rep2);
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
  // season report B2: it no longer folds on a timer (a slow reader lost the button); 📝 보고서 쓰기 opens the report and folds it
  await todoItem('pins').locator('.todo-report').click();
  await page.locator('.todo').waitFor({ state: 'detached', timeout: 4000 });
  await closeWin('report');
  await page.locator('.toast', { hasText: '오늘 할 일 끝' }).click();
  await page.locator('.window[data-app="notes"] .item.sel', { hasText: '오늘 할 일 ✓' }).waitFor();
  await page.waitForTimeout(400);
  await shot('onboarding-03-sticky-folded.png');
  fm = (await page.evaluate(() => window.__game.playtestReport())).summary.firstMinutes;
  assert.ok(fm.objectives.every((o) => o.t !== null) && fm.objectivesFoldedAt !== null);
  assert.ok(fm.firstMeaningfulCommandAt !== null);
  step('box 3 ticks at the third pin; 📝 보고서 쓰기 opens the report and the sticky folds into the notebook ("오늘 할 일 ✓")');
  await closeWin('notes');
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
  // the whole last scene: the farewell memo written again, 오미래's reply, 서진's thanks, then 물주기 waits in 은재's tab
  await page.locator('.ending-bar').waitFor({ timeout: 5000 });
  await page.locator('.window[data-app="notes"] .ln.reveal', { hasText: '→ 알았음. 늦었음.' }).waitFor({ timeout: 8000 });
  await page.locator('.window[data-app="mail"] h2', { hasText: 'RE: [긴급] 토요일 결제 장애 원인 보고' }).waitFor({ timeout: 10000 });
  await page.locator('.toast', { hasText: '도윤님. 오늘 고마웠어요.' }).waitFor({ timeout: 15000 });
  await page.locator('.ending-bar .ending-act', { hasText: '물주기' }).waitFor({ timeout: 10000 });
  await page.locator('.window[data-app="terminal"].act').waitFor();
  assert.equal(await page.locator('.tin input').inputValue(), '물주기', 'the alias waits in the prompt');
  await shot('ending-03-water.png');
  await page.locator('.tin input').press('Enter');
  await page.locator('.window[data-app="notes"] .ln.added', { hasText: /^\d\d:\d\d 몬스테라 물 줌 🌱/ }).waitFor({ timeout: 8000 });
  await page.locator('.toast', { hasText: '[보안] 퇴사자 계정 회수 완료' }).waitFor({ timeout: 10000 });
  await report.locator('.debrief h2').waitFor({ timeout: 15000 });
  await page.locator('.ending-bar').waitFor({ state: 'detached' });
  // the debrief opens on the memo and the people; the numbers wait, folded, below them
  const order = await report.evaluate((r) => [...r.querySelectorAll('.memo-scene, .cast, details.score-fold, ul.story')].map((e) => e.className.split(' ')[0] || e.tagName.toLowerCase()));
  assert.deepEqual(order, ['memo-scene', 'cast', 'score-fold', 'story']);
  assert.equal(await report.locator('details.score-fold').evaluate((d) => d.open), false, 'the score is folded');
  assert.match(await report.locator('details.score-fold > summary').innerText(), /점수와 기록 · 점수 S · 330 \/ 330/);
  await report.locator('details.score-fold > summary').click();
  step('Case 3 last scene: memo → 오미래\'s reply → 서진 → 물주기 in the prompt (Enter writes the time in the notebook) → the security mail → the debrief, memo and people first, the score folded');
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
  await tin.fill('cat ~/wiki-cert.log');
  await tin.press('Enter');
  await p4.locator('.moment.moment-aha.still').waitFor({ timeout: 3000 });
  await tin.fill('crontab -l');
  await tin.press('Enter');
  await p4.locator('.tline', { hasText: '0 * * * * ~/bin/wiki-cert-renew.sh' }).waitFor({ timeout: 2000 });
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
  // season report B3: no room beside the terminal at 1280x800, so the memo page pops up over the terminal's older lines
  // only — below its title bar, left of its 📌 column, above the newest output (it covered the line just printed) —
  // and the typing stays in the prompt
  const notes5 = p5.locator('.window[data-app="notes"]');
  await notes5.waitFor({ timeout: 3000 });
  {
    const n = await notes5.boundingBox();
    const t = await p5.locator('.window[data-app="terminal"]').boundingBox();
    const o = await p5.locator('.window[data-app="terminal"] .tout').boundingBox();
    assert.ok(n.y + n.height <= o.y + o.height - 170, `the memo (bottom ${n.y + n.height}) keeps off the newest output (from ${o.y + o.height - 170})`);
    assert.ok(n.x + n.width <= t.x + t.width - 48, 'the memo keeps off the 📌 column');
    assert.ok(n.y >= t.y + 30, "the memo keeps off the terminal's title bar");
  }
  assert.equal(await p5.evaluate(() => !!document.activeElement?.closest('.tin')), true, 'the prompt keeps the keyboard');
  // B2 (round 2) / season report B4: pin the two lines by clicking straight on their 📌, the second right after the first —
  // a 📌 click no longer opens the line toolbar, which took the bottom of the output and swallowed the second click
  for (const re of [/100%\s+\/var/, /ERROR session save failed/]) await clickCentre(p5.locator('.tline', { hasText: re }).last().locator('.pinbtn'), '.pinbtn');
  assert.equal(await p5.evaluate(() => window.__game.st.pins.length), 2);
  assert.equal(await p5.locator('.tpinbar:not([hidden])').count(), 0, 'a 📌 click pins without opening the toolbar');
  await p5.locator('.todo li[data-id="pins"].done').waitFor({ timeout: 2000 });
  // season report B2: "📝 보고서 쓰기" stays until the report opens (it folded away on a 12 s timer, a slow reader clicked empty desktop)
  const cta5 = p5.locator('.todo li[data-id="pins"] .todo-report');
  await cta5.waitFor();
  const tour5 = p5.locator('.tour[data-step="report"] .tour-ok');
  if (await tour5.count()) await tour5.click();
  await p5.waitForTimeout(13000);
  assert.equal(await cta5.count(), 1, 'the sticky still offers 📝 보고서 쓰기 after 13 s');
  await clickCentre(cta5, '.todo-report');
  await p5.locator('.window[data-app="report"]:not(.min)').waitFor();
  await p5.locator('.todo').waitFor({ state: 'detached', timeout: 4000 });
  step('1280x800, clicked like the playtester: "알겠어요" returns focus to the prompt; one click on the 📌 icon opens the board with a coach mark up, the taskbar minimizes/restores it, Enter opens it; the memo turns over the older lines only (newest output, 📌 column and prompt clear), two quick 📌 clicks both land with no toolbar, box 5 ticks, and 📝 보고서 쓰기 waits past 13 s until clicked');
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
  for (const c of ['crontab -l', 'journalctl -u cron --since "2026-11-11 00:50" --until "2026-11-11 01:10"', 'cat ~/wiki-cert.log']) {
    await p7.locator('.tin input').fill(c);
    await p7.locator('.tin input').press('Enter');
  }
  await p7.evaluate(() => {
    for (const w of document.querySelectorAll('.window:not([data-app="terminal"])')) w.classList.add('min');
  });
  for (const re of [/^0 \* \* \* \* ~\/bin\/wiki-cert-renew\.sh/, /line 15: wikictl: command not found/, /\(eunjae\) CMD \(~\/bin\/wiki-cert-renew/]) {
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
  await cite(rep7, 'sequence', /\(eunjae\) CMD \(~\/bin\/wiki-cert-renew/);
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
    await lastScene(rep, p9);
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
  await lastScene(rep90, p9);
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
  await pin9(/^0 \* \* \* \* ~\/bin\/wiki-cert-renew\.sh/);
  assert.equal(await p9.locator('.tline', { hasText: /절대 경로|cron-env/ }).count(), 0, '숙련자: no comment says why');
  await run9('journalctl -u cron --since "2026-11-11 00:50" --until "2026-11-11 01:10"');
  await pin9(/\(eunjae\) CMD \(~\/bin\/wiki-cert-renew/);
  await run9('cat ~/log/cron-env.txt');
  await run9('head -12 ~/bin/wiki-cert-renew.sh');
  await p9.locator('.tline', { hasText: '[[ "$LEFT_H" -gt "$RENEW_BEFORE_H"' }).waitFor();
  await run9('cat ~/wiki-cert.log');
  await skipAha9();
  await pin9(/line 15: wikictl: command not found/);
  const rep91 = await report9();
  await rep91.locator('input[name="slot-cause"][value="sh-syntax"]').waitFor();
  await rep91.locator('input[name="slot-cause"][value="cron-path"]').check();
  await rep91.locator('input[name="slot-sequence"][value="true"]').check();
  await rep91.locator('label.citeopt:has(input[name="cite-cause"])', { hasText: /line 15: wikictl: command not found/ }).first().locator('input').check();
  await rep91.locator('label.citeopt:has(input[name="cite-sequence"])', { hasText: /\(eunjae\) CMD \(~\/bin\/wiki-cert-renew/ }).first().locator('input').check();
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

  // ---- tenth page (1280x800, touch-capable): pins and windows as the playtesters' snapshot tool
  // meets them. Every 📌 shows (faintly) and is named after its line; a tap on a line pins it, a
  // plain click says where the 📌 is, pinning twice says so. A window whose controls sit under
  // another window leaves the accessibility tree (the tool clicks a control's centre, which would
  // land on the window in front), focus brings a window forward, a minimized window stays
  // minimized, toasts keep off every 📌 column, and the command textbox stays in the tree, ahead
  // of a long output in the document.
  const ctx10 = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: true });
  const p10 = await ctx10.newPage();
  p10.on('pageerror', (e) => errors.push(String(e)));
  p10.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p10.on('dialog', (d) => (nativeDialogs.push(`p10 ${d.type()}: ${d.message()}`), d.accept()));
  const pins10 = () => p10.evaluate(() => window.__game.st.pins.length);
  const front10 = () => p10.evaluate(() => document.querySelector('.window.focused')?.dataset.app);
  /** Exposed controls (titlebar buttons, tabs, the prompt, desktop icons) whose centre a click would not reach. */
  const unreachable10 = () =>
    p10.evaluate(() => {
      const bad = [];
      const at = (c) => {
        const r = c.getBoundingClientRect();
        return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      };
      for (const w of document.querySelectorAll('.window:not(.min):not([aria-hidden="true"])')) {
        for (const c of w.querySelectorAll('.titlebar button, .ttab, .tin input')) {
          const e = at(c);
          if (e?.closest('.window') !== w) bad.push(`${w.dataset.app} ${c.getAttribute('aria-label') ?? c.textContent} → ${e?.closest('.window')?.dataset.app ?? e?.className}`);
        }
      }
      for (const i of document.querySelectorAll('.icon:not([aria-hidden="true"])')) if (!at(i)?.closest('.icon')) bad.push(`icon ${i.dataset.app}`);
      return bad;
    });
  const run10 = async (cmd) => {
    const input = p10.locator('.tin input');
    await input.fill(cmd);
    await input.press('Enter');
    await p10.waitForTimeout(80);
  };
  await p10.goto(`${url}?fresh=1&case=case1-cron-env&briefing=0`);
  await p10.locator('#boot .exp-familiar').click();
  await p10.locator('#boot').waitFor({ state: 'detached' });
  const term10 = p10.locator('.window[data-app="terminal"]');
  if (!(await term10.count())) await p10.locator('.icon[data-app="terminal"]').click();
  await term10.waitFor();
  await run10('crontab -l');
  const cron10 = p10.locator('.tline', { hasText: /^0 \* \* \* \* ~\/bin\/wiki-cert-renew\.sh/ }).last();
  const cronPin10 = cron10.locator('.pinbtn');
  await p10.mouse.move(8, 700); // the bare desktop: nothing hovered
  assert.ok(+(await cronPin10.evaluate((b) => getComputedStyle(b).opacity)) >= 0.25, 'the 📌 shows without hovering');
  assert.match(await cronPin10.getAttribute('aria-label'), /^핀: 0 \* \* \* \* ~\/bin\/wiki-cert-renew\.sh/);
  assert.ok((await cronPin10.getAttribute('aria-label')).length <= 45, 'named after the first 40 characters of its line');
  await cronPin10.focus();
  assert.ok(+(await cronPin10.evaluate((b) => getComputedStyle(b).opacity)) >= 0.8, 'keyboard focus shows the 📌 in full');
  await cron10.click({ position: { x: 40, y: 6 } });
  const bar10 = term10.locator('.tpinbar');
  await bar10.waitFor({ timeout: 2000 });
  assert.equal(await pins10(), 0, 'a mouse click on the line picks it, pins nothing yet');
  assert.match(await cron10.getAttribute('class'), /\bsel\b/);
  assert.equal(await bar10.locator('.tpb-src').innerText(), 'wiki-01 $ crontab -l', 'the toolbar names the host and the command that printed the line');
  assert.equal(await bar10.locator('.tpb-maybe').innerText(), '이 줄은 단서가 될 수 있어요', 'crontab -l found the schedule clue: its line says so');
  const pinB10 = await bar10.locator('.tpb-pin').boundingBox();
  assert.ok(pinB10.width >= 44 && pinB10.height >= 44, `touch: the toolbar's 📌 is a 44 px target (${Math.round(pinB10.width)}x${Math.round(pinB10.height)})`);
  await bar10.locator('.tpb-pin').tap();
  await p10.locator('.toast.pintoast').waitFor({ timeout: 2000 });
  assert.equal(await pins10(), 1, 'the toolbar 📌 pins the picked line');
  assert.equal(await cronPin10.getAttribute('aria-pressed'), 'true');
  assert.equal(await bar10.locator('.tpb-pin').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await p10.evaluate(() => (({ source, host, cmd }) => ({ source, host, cmd }))(window.__game.st.pins[0])), { source: 'wiki-01 · crontab -l', host: 'wiki-01', cmd: 'crontab -l' });
  await cronPin10.click();
  await p10.locator('.toast.pintoast', { hasText: '이미 핀한 줄이에요' }).waitFor({ timeout: 2000 });
  assert.equal(await pins10(), 1);
  // a tap on another line picks it, a second tap on it pins it
  const other10 = p10.locator('.tline[data-pin]', { hasText: /wiki-cert-renew|cron|#/ }).first();
  await other10.tap({ position: { x: 40, y: 6 } });
  assert.match(await other10.getAttribute('class'), /\bsel\b/);
  assert.equal(await pins10(), 1);
  await other10.tap({ position: { x: 40, y: 6 } });
  await p10.waitForFunction(() => window.__game.st.pins.length === 2, null, { timeout: 2000 });
  await bar10.locator('.tpb-close').click();
  await bar10.waitFor({ state: 'hidden' });
  assert.equal(await p10.evaluate(() => document.activeElement === document.querySelector('.tin input')), true, '✕ goes back to the prompt');
  await p10.locator('.tin input').focus();
  step('1280x800, touch: every 📌 shows faintly and is named "핀: <its line>"; a click or tap on a line picks it (toolbar with host · command and a 44 px 📌 핀하기), a second tap pins it, pinning it again says "이미 핀한 줄이에요"');

  await p10.locator('.icon[data-app="board"]').click();
  const board10 = p10.locator('.window[data-app="board"]');
  await board10.waitFor();
  assert.equal(await front10(), 'board');
  await p10.waitForTimeout(100);
  assert.deepEqual(await unreachable10(), [], 'every control the tree exposes is reachable at its centre');
  assert.equal(await term10.getAttribute('aria-hidden'), 'true', 'the terminal under the board leaves the tree');
  assert.match(await p10.locator('#taskbar .task[data-app="terminal"]').getAttribute('title'), /다른 창 뒤에 있음/);
  assert.equal(await board10.locator('.titlebar button[aria-label="minimize"]').getAttribute('title'), '증거 보드 최소화');
  await p10.locator('.tin input').focus(); // Tab or a tool's fill: focus lands in the terminal behind
  await p10.waitForFunction(() => document.querySelector('.window.focused')?.dataset.app === 'terminal', null, { timeout: 2000 });
  await p10.waitForTimeout(100);
  assert.equal(await term10.getAttribute('aria-hidden'), null);
  assert.deepEqual(await unreachable10(), []);
  await term10.locator('.titlebar button[aria-label="minimize"]').click();
  await p10.locator('.window[data-app="terminal"].min').waitFor({ state: 'attached' });
  assert.equal(await front10(), 'board');
  assert.match(await p10.locator('#taskbar .task[data-app="terminal"]').getAttribute('title'), /최소화됨/);
  await board10.getByRole('button', { name: /보고서 쓰기/ }).first().click();
  const rep10 = p10.locator('.window[data-app="report"]');
  await rep10.waitFor();
  assert.equal(await front10(), 'report');
  await p10.waitForTimeout(2500);
  assert.equal(await p10.locator('.window[data-app="terminal"].min').count(), 1, 'minimized stays minimized');
  await p10.locator('#taskbar .task[data-app="terminal"]').click();
  await p10.locator('.window[data-app="terminal"]:not(.min)').waitFor();
  assert.equal(await front10(), 'terminal');
  await p10.locator('#taskbar .task[data-app="report"]').click();
  assert.equal(await front10(), 'report', 'the report comes back in front of the terminal');
  const z10 = (app) => p10.evaluate((app) => +document.querySelector(`.window[data-app="${app}"]`).style.zIndex, app);
  assert.ok((await z10('report')) > (await z10('terminal')));
  await p10.waitForTimeout(100);
  assert.deepEqual(await unreachable10(), []);
  step('windows: the one opened or focused comes to the front, a covered one leaves the tree and its taskbar entry says so; minimized stays minimized while the report opens');

  for (const app of ['report', 'board']) await p10.locator(`#taskbar .task[data-app="${app}"]`).click();
  await p10.locator('.icon[data-app="messenger"]').click();
  const msg10 = p10.locator('.window[data-app="messenger"]');
  await msg10.locator('.side button.item', { hasText: '강서진' }).click();
  for (let i = 0; i < 3; i++) {
    await msg10.locator('.ask-chip').first().click();
    await p10.waitForTimeout(2600);
  }
  assert.ok((await p10.locator('.toast').count()) >= 2, 'toasts stacked');
  const onColumn10 = await p10.evaluate(() => {
    const w = document.querySelector('.window[data-app="messenger"]').getBoundingClientRect();
    const t = document.querySelector('.toasts').getBoundingClientRect();
    return t.left < w.right && t.right > w.right - 48 && t.top < w.bottom && t.bottom > w.top;
  });
  assert.equal(onColumn10, false, 'the toasts keep off the messenger\'s 📌 column');
  const lastPin10 = msg10.locator('.msg .pinbtn').last();
  const lb10 = await lastPin10.boundingBox();
  const before10 = await pins10();
  await p10.mouse.click(lb10.x + lb10.width / 2, lb10.y + lb10.height / 2);
  assert.equal(await pins10(), before10 + 1, 'the newest message pins with toasts on screen');
  step('messenger with toasts stacked: the toasts sit beside the 📌 column, and the newest message pins');

  await p10.locator('.tin input').focus();
  for (const c of ['history', 'journalctl', 'cat ~/wiki-cert.log', 'history']) await run10(c);
  assert.ok((await p10.locator('.tline').count()) >= 200, 'a long output');
  const tb10 = p10.getByRole('textbox', { name: 'command' });
  assert.equal(await tb10.count(), 1, 'the prompt keeps role textbox and its name after a long output');
  assert.equal(await p10.evaluate(() => !!(document.querySelector('.tin input').compareDocumentPosition(document.querySelector('.tout .tline')) & Node.DOCUMENT_POSITION_FOLLOWING)), true, 'the prompt comes before the output in the document');
  const ib10 = await tb10.boundingBox();
  const ob10 = await p10.locator('.tout').boundingBox();
  assert.ok(ib10.y >= ob10.y + ob10.height - 2, 'and still sits under it on screen');
  step('long output: the command textbox keeps its role and name, ahead of the output in the document and under it on screen');
  await ctx10.close();

  // ---- eleventh round: the prompt sits at the bottom of the terminal and the output grows right above it
  // (a playtester: "the terminal opens at the bottom but the input shows up at the top": the prompt was at
  // the bottom while a short output, and so each command's echo, stayed at the top of an empty panel)
  const engines11 = [['chromium', browser]];
  if (process.env.PW_WEBKIT) engines11.push(['webkit', await webkit.launch(process.env.PW_WEBKIT === '1' ? {} : { executablePath: process.env.PW_WEBKIT })]);
  for (const [engine, b11] of engines11) {
    for (const [w, hgt] of [[1280, 800], [1024, 768]]) {
      for (const reducedMotion of ['no-preference', 'reduce']) {
        for (const [q, choice] of [['', 'exp-new'], ['&case=case1-cron-env', 'exp-familiar']]) {
          const tag = `${engine} ${w}x${hgt} ${reducedMotion} ${choice}`;
          const ctx11 = await b11.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1, reducedMotion });
          const p11 = await ctx11.newPage();
          p11.on('pageerror', (e) => errors.push(`${tag}: ${e}`));
          p11.on('dialog', (d) => (nativeDialogs.push(`p11 ${d.type()}: ${d.message()}`), d.accept()));
          await p11.goto(`${url}?fresh=1&briefing=0${q}`);
          await p11.locator(`#boot .${choice}`).click();
          await p11.locator('#boot').waitFor({ state: 'detached' });
          const term11 = p11.locator('.window[data-app="terminal"]');
          if (!(await term11.count())) await p11.locator('.icon[data-app="terminal"]').click();
          const input11 = term11.locator('.tin input');
          await input11.waitFor();
          /** Boxes of the terminal body, the prompt row and the last output line, plus where focus is. */
          const geo11 = () =>
            p11.evaluate(() => {
              const term = document.querySelector('.window[data-app="terminal"] .term');
              const box = (el) => {
                const r = el.getBoundingClientRect();
                return { top: r.top, bottom: r.bottom };
              };
              const out = term.querySelector('.tout');
              const lines = out.querySelectorAll('.tline');
              return {
                term: box(term),
                tin: box(term.querySelector('.tin')),
                last: box(lines[lines.length - 1]),
                lastText: lines[lines.length - 1].textContent,
                atEnd: out.scrollHeight - out.scrollTop - out.clientHeight < 2,
                focused: document.activeElement === term.querySelector('.tin input'),
              };
            });
          const expect11 = (g, when) => {
            assert.ok(Math.abs(g.tin.bottom - g.term.bottom) <= 1, `${tag} ${when}: the prompt sits at the bottom of the terminal (${g.tin.bottom} vs ${g.term.bottom})`);
            assert.ok(g.last.bottom <= g.tin.top + 1, `${tag} ${when}: the last output line is above the prompt (${g.last.bottom} vs ${g.tin.top})`);
            assert.ok(g.tin.top - g.last.bottom <= 12, `${tag} ${when}: the newest line sits right above the prompt, not ${Math.round(g.tin.top - g.last.bottom)}px up`);
            assert.ok(g.atEnd, `${tag} ${when}: the output is scrolled to its newest line`);
          };
          await p11.waitForTimeout(1000); // the window-open animation (under 1 s) has settled
          expect11(await geo11(), 'on open');
          await input11.fill('pwd');
          await input11.press('Enter');
          await p11.waitForTimeout(120);
          let g11 = await geo11();
          expect11(g11, 'after one command');
          assert.match(g11.lastText, /^\/home\//, `${tag}: pwd's answer is the line just above the prompt`);
          assert.ok(g11.focused, `${tag}: focus stays in the prompt`);
          for (const c of ['help', 'ls -la', 'history', 'help']) {
            await input11.fill(c);
            await input11.press('Enter');
          }
          await p11.waitForTimeout(120);
          g11 = await geo11();
          expect11(g11, 'after a long output');
          assert.ok(g11.focused, `${tag}: focus stays in the prompt after a long output`);
          const first11 = await p11.evaluate(() => {
            const out = document.querySelector('.window[data-app="terminal"] .tout');
            out.scrollTop = 0;
            return out.firstElementChild.getBoundingClientRect().top - out.getBoundingClientRect().top;
          });
          assert.ok(first11 >= 0 && first11 <= 12, `${tag}: scrolling up still reaches the first line (${first11})`);
          if (shots && w === 1280 && choice === 'exp-new') await p11.screenshot({ path: join(shots, `terminal-prompt-bottom-${engine}-${reducedMotion}.png`) });
          await ctx11.close();
        }
      }
    }
    if (b11 !== browser) await b11.close();
  }
  step(`terminal: the prompt at the bottom, the output right above it from the first line, the newest line over the prompt, focus kept (${engines11.map(([e]) => e).join(' + ')}; 1280x800 and 1024x768; reduced motion on and off; Case 0 and Case 1)`);

  // ---- twelfth round: a phone and a tablet (a 390px screen clipped the taskbar at 💡 힌트: hint, alerts,
  // help, mute and 📋 were past the right edge; the "오늘 할 일" sticky covered half the terminal; the
  // terminal opened at x=130 with its ✕ and 📌 column off screen)
  const engines12 = [['chromium', browser]];
  if (process.env.PW_WEBKIT) engines12.push(['webkit', await webkit.launch(process.env.PW_WEBKIT === '1' ? {} : { executablePath: process.env.PW_WEBKIT })]);
  for (const [engine, b12] of engines12) {
    try {
      for (const [w, hgt] of [[390, 844], [768, 1024]]) {
        for (const [q, choice] of [['', 'exp-new'], ['&case=case1-cron-env', 'exp-familiar']]) {
          const tag = `${engine} ${w}x${hgt} ${choice}`;
          const ctx12 = await b12.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1, hasTouch: true });
          const p12 = await ctx12.newPage();
          p12.on('pageerror', (e) => errors.push(`${tag}: ${e}`));
          p12.on('dialog', (d) => (nativeDialogs.push(`p12 ${d.type()}: ${d.message()}`), d.accept()));
          await p12.goto(`${url}?fresh=1&briefing=0${q}`);
          await p12.locator(`#boot .${choice}`).click();
          await p12.locator('#boot').waitFor({ state: 'detached' });
          const term12 = p12.locator('.window[data-app="terminal"]');
          if (!(await term12.count())) await p12.locator('.icon[data-app="terminal"]').tap();
          await term12.locator('.tin input').waitFor();
          await p12.waitForTimeout(1000); // the window-open animation (under 1 s) has settled
          /** Every visible taskbar control that is off screen or not the element at its own centre. */
          const unreachable12 = () =>
            p12.evaluate(() => {
              const bad = [];
              for (const c of document.querySelectorAll('#taskbar button, #taskbar input')) {
                const r = c.getBoundingClientRect();
                if (!r.width || !r.height) continue;
                const name = c.getAttribute('aria-label') ?? c.textContent;
                if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) bad.push(`${name} at ${Math.round(r.left)}–${Math.round(r.right)}`);
                else if (document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('button, input') !== c) bad.push(`${name} covered`);
              }
              const tb = document.querySelector('#taskbar');
              if (tb.scrollWidth > tb.clientWidth + 1) bad.push(`taskbar ${tb.scrollWidth}px in ${tb.clientWidth}px`);
              return bad;
            });
          assert.deepEqual(await unreachable12(), [], `${tag}: every taskbar control is on screen and takes a tap at its centre`);
          // the widest tray this page can show: the next-case button joins the rest
          await p12.evaluate(() => (document.querySelector('#taskbar .nextcase-btn').hidden = false));
          assert.deepEqual(await unreachable12(), [], `${tag}: with "다음 사건" shown too`);
          await p12.evaluate(() => (document.querySelector('#taskbar .nextcase-btn').hidden = true));

          await p12.locator('#taskbar button[data-tour="hint"]').tap();
          const hints12 = p12.locator('.popover.hints');
          await hints12.waitFor();
          const hb12 = await hints12.boundingBox();
          assert.ok(hb12.x >= 0 && hb12.x + hb12.width <= w, `${tag}: the 💡 panel fits the screen`);
          await p12.locator('#taskbar button[data-tour="hint"]').tap();
          await hints12.waitFor({ state: 'detached' });
          const sound12 = p12.locator('#taskbar .tray-btn.sound');
          await sound12.tap();
          assert.equal(await sound12.getAttribute('aria-pressed'), 'true', `${tag}: one tap mutes`);
          await sound12.tap();
          assert.equal(await sound12.getAttribute('aria-pressed'), 'false');

          const geo12 = () =>
            p12.evaluate(() => {
              const box = (el) => el && (({ left, right, top, bottom }) => ({ left, right, top, bottom }))(el.getBoundingClientRect());
              const term = document.querySelector('.window[data-app="terminal"]');
              const close = term.querySelector('.titlebar button.close');
              const c = box(close);
              const pins = [...term.querySelectorAll('.tline .pinbtn')];
              return {
                term: box(term),
                close: c,
                closeHit: document.elementFromPoint((c.left + c.right) / 2, (c.top + c.bottom) / 2) === close,
                pin: box(pins[pins.length - 1]),
                todo: box(document.querySelector('.todo')),
                todoCollapsed: !!document.querySelector('.todo.collapsed'),
              };
            });
          const g12 = await geo12();
          assert.ok(g12.term.left >= 0 && g12.term.right <= w, `${tag}: the terminal fits the screen (${Math.round(g12.term.left)}–${Math.round(g12.term.right)})`);
          assert.ok(g12.close.right <= w && g12.closeHit, `${tag}: the terminal's ✕ is on screen and takes the tap`);
          assert.ok(g12.pin.right <= w, `${tag}: the 📌 column is on screen`);
          if (g12.todo) {
            assert.ok(g12.todoCollapsed, `${tag}: the "오늘 할 일" sticky starts folded`);
            const t = g12.todo;
            const over = t.left < g12.term.right && t.right > g12.term.left && t.top < g12.term.bottom && t.bottom > g12.term.top;
            assert.equal(over, false, `${tag}: the folded sticky does not cover the terminal`);
            await p12.locator('.todo .todo-toggle').tap();
            const open12 = await p12.locator('.todo').boundingBox();
            assert.ok(!(await p12.locator('.todo.collapsed').count()) && open12.y >= 0 && open12.x + open12.width <= w, `${tag}: a tap unfolds it on screen`);
            if (shots && w === 390) await p12.screenshot({ path: join(shots, `narrow-${engine}-${choice}-todo.png`) });
            await p12.locator('.todo .todo-toggle').tap();
            await p12.locator('.todo.collapsed').waitFor();
          }
          if (shots) await p12.screenshot({ path: join(shots, `narrow-${engine}-${w}-${choice}.png`) });
          await ctx12.close();
        }
      }
    } finally {
      if (b12 !== browser) await b12.close();
    }
  }
  step(`narrow screens (${engines12.map(([e]) => e).join(' + ')}; 390x844 and 768x1024; Case 0 and Case 1): every taskbar control on screen and one tap away (💡 힌트 opens a panel that fits, 🔊 mutes), the terminal with its ✕ and 📌 column inside the screen, "오늘 할 일" folded clear of it`);
  // ---- thirteenth round: one line straight from long output, in every case ("로그가 많아서 핀이 어려워요").
  // 1280x800 by keyboard (Shift+↑ picks the newest line, Shift+↑ again jumps run by run over the
  // lines marked "이 줄은 단서가 될 수 있어요", P pins) and 390x844 by touch (tap a line, 「⇡ 단서」,
  // 「📌 핀하기」, a 44 px target); with reduced motion on and off; the mark never before the command
  // and never in 숙련자 모드; the pin keeps host and command; typing goes on at once after a pin.
  const LINE13 = [
    ['case0-wiki', 'journalctl -u wiki', 'c0_start', 'wiki-01', 'clue'],
    ['case1-cron-env', 'journalctl -u cron', 'c1_cronran', 'wiki-01', 'maybe'],
    ['case2-deleted-open', 'journalctl', 'c2_rm', 'logs-01', 'maybe'],
    ['friday-1802', 'journalctl -u payment-api', 'c_emfile', 'pay-api-01', 'maybe'],
    ['case4-keys', 'sudo cat /home/deploy/.ssh/authorized_keys', 'k_deploy_key', 'pay-api-02', 'maybe', 'pay-api-02'],
  ];
  const engines13 = [['chromium', browser]];
  if (process.env.PW_WEBKIT) engines13.push(['webkit', await webkit.launch(process.env.PW_WEBKIT === '1' ? {} : { executablePath: process.env.PW_WEBKIT })]);
  const jumps13 = {};
  for (const [engine, b13] of engines13) {
    try {
      for (const [w, hgt, touch] of [[1280, 800, false], [390, 844, true]]) {
        for (const reduced of [false, true]) {
          for (const [id, cmd, clue, host, mark, tabName] of LINE13) {
            // WebKit runs the touch screen (the Safari case), Chromium both; reduced motion in Case 0 and Case 3 only
            if ((engine === 'webkit' && !touch) || (reduced && id !== 'case0-wiki' && id !== 'friday-1802')) continue;
            const tag = `${engine} ${w}x${hgt}${reduced ? ' reduced' : ''} ${id}`;
            const ctx13 = await b13.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1, hasTouch: touch, reducedMotion: reduced ? 'reduce' : 'no-preference' });
            const p13 = await ctx13.newPage();
            p13.on('pageerror', (e) => errors.push(`${tag}: ${e}`));
            p13.on('dialog', (d) => (nativeDialogs.push(`p13 ${d.type()}: ${d.message()}`), d.accept()));
            await p13.goto(`${url}?fresh=1&briefing=0&case=${id}`);
            await p13.locator('#boot .exp-familiar').click();
            await p13.locator('#boot').waitFor({ state: 'detached' });
            const term13 = p13.locator('.window[data-app="terminal"]');
            if (!(await term13.count())) await (touch ? p13.locator('.icon[data-app="terminal"]').tap() : p13.locator('.icon[data-app="terminal"]').click());
            const input13 = term13.locator('.tin input');
            await input13.waitFor();
            // Case 4: the line is on an audit session, not the first tab (도윤's PC)
            if (tabName) await (touch ? term13.locator('.ttab', { hasText: new RegExp(`^${tabName}$`) }).tap() : term13.locator('.ttab', { hasText: new RegExp(`^${tabName}$`) }).click());
            await p13.waitForTimeout(900);
            assert.equal(await term13.locator('.tline.maybe, .tline.clue').count(), 0, `${tag}: no line is marked before a command`);
            await input13.fill(cmd);
            await input13.press('Enter');
            await p13.waitForTimeout(150);
            const marks13 = await p13.evaluate(() => [...document.querySelectorAll('.window[data-app="terminal"] .tline.maybe, .window[data-app="terminal"] .tline.clue')].map((l) => [l.className, window.__game.cluesFor(l.firstChild.textContent).length, l.title]));
            assert.ok(marks13.length > 0, `${tag}: the command's clue lines are marked`);
            assert.ok(marks13.every(([c, n, t]) => c.includes(mark) && n > 0 && t === '이 줄은 단서가 될 수 있어요'), `${tag}: only clue lines, as .${mark}, titled "이 줄은 단서가 될 수 있어요"`);
            const proves13 = () => p13.evaluate((clue) => window.__game.cluesFor(document.querySelector('.tline.sel')?.firstChild?.textContent ?? '').includes(clue), clue);
            const bar13 = term13.locator('.tpinbar');
            let k = 0;
            if (touch) {
              await term13.locator('.tline[data-pin]').last().tap();
              await bar13.waitFor();
              const pb = await bar13.locator('.tpb-pin').boundingBox();
              assert.ok(pb.width >= 44 && pb.height >= 44, `${tag}: 📌 핀하기 is a 44 px target`);
              for (const b of await bar13.locator('.tpb-acts button').all()) {
                const bb = await b.boundingBox();
                assert.ok(bb.height >= 44 && bb.width >= 44 && bb.x >= 0 && bb.x + bb.width <= w, `${tag}: every toolbar button is a 44 px target on screen`);
              }
              while (!(await proves13()) && k < 12) await bar13.locator('.tpb-mark').tap(), k++;
            } else {
              await input13.press('Shift+ArrowUp');
              await bar13.waitFor();
              assert.equal(await p13.evaluate(() => document.activeElement?.classList.contains('sel')), true, `${tag}: Shift+↑ puts focus on the newest line`);
              assert.equal(await p13.evaluate(() => document.querySelector('.tline.sel') === [...document.querySelectorAll('.window[data-app="terminal"] .tline[data-pin]')].at(-1)), true);
              while (!(await proves13()) && k < 12) await p13.keyboard.press('Shift+ArrowUp'), k++;
            }
            assert.ok(await proves13(), `${tag}: ${k} jumps reach a line that proves ${clue}`);
            jumps13[`${id} ${touch ? 'touch' : 'keys'}`] = k;
            assert.equal(await bar13.locator('.tpb-src').innerText(), `${host} $ ${cmd}`);
            assert.equal(await bar13.locator('.tpb-maybe').innerText(), '이 줄은 단서가 될 수 있어요');
            if (touch) {
              // toasts (new mail, the pin tip, "보고서에는 이 줄을 핀하세요") stay on screen and off the toolbar and the prompt
              const cover13 = await p13.evaluate((w) => {
                const bad = [];
                for (const t of document.querySelectorAll('.toast')) {
                  const r = t.getBoundingClientRect();
                  if (r.left < 0 || r.right > w) bad.push(`toast off screen ${Math.round(r.left)}–${Math.round(r.right)}`);
                }
                for (const sel of ['.tpb-pin', '.tpb-mark', '.tin input']) {
                  const c = document.querySelector(`.window[data-app="terminal"] ${sel}`);
                  if (!c) continue;
                  const r = c.getBoundingClientRect();
                  const e = document.elementFromPoint(r.left + Math.min(20, r.width / 2), r.top + r.height / 2);
                  if (!e || (e !== c && !c.contains(e))) bad.push(`${sel} covered by ${e?.closest('.toast') ? 'a toast' : e?.className}`);
                }
                return bad;
              }, w);
              assert.ok((await p13.locator('.toast').count()) > 0, `${tag}: toasts are up`);
              assert.deepEqual(cover13, [], `${tag}: toasts keep off the 📌 toolbar and the prompt`);
            }
            const t0 = Date.now();
            if (touch) await bar13.locator('.tpb-pin').tap();
            else await p13.keyboard.press('p');
            const pin13 = await p13.evaluate(() => (({ clueIds, host, cmd, source, clock }) => ({ clueIds, host, cmd, source, clock }))(window.__game.st.pins.at(-1) ?? {}));
            assert.ok(pin13.clueIds?.includes(clue), `${tag}: pinned a line proving ${clue}`);
            assert.deepEqual([pin13.host, pin13.cmd, pin13.source], [host, cmd, `${host} · ${cmd}`], `${tag}: the pin keeps host and command`);
            assert.equal(typeof pin13.clock, 'number');
            // the flash: under 1 s, and none with reduced motion
            const fl13 = await p13.evaluate(() => {
              const el = document.querySelector('.tline.sel');
              return { on: el.classList.contains('pinflash'), dur: parseFloat(getComputedStyle(el).animationDuration) * (getComputedStyle(el).animationDuration.endsWith('ms') ? 1 : 1000) };
            });
            if (reduced) assert.ok(!fl13.on || fl13.dur <= 1, `${tag}: no flash with reduced motion`);
            else assert.ok(fl13.on && fl13.dur > 0 && fl13.dur < 1000, `${tag}: the pinned line flashes for under 1 s (${fl13.dur} ms)`);
            // non-blocking: the next command runs at once
            if (touch) await bar13.locator('.tpb-close').tap();
            else await p13.keyboard.press('Escape');
            await input13.fill('pwd');
            await input13.press('Enter');
            await term13.locator('.tline.sys', { hasText: /\$ pwd$/ }).waitFor({ timeout: 1000 });
            assert.ok(Date.now() - t0 < 2500, `${tag}: typing goes on right after the pin`);
            if (!touch && !reduced && id === 'case0-wiki') {
              // the one-time tip came with the first long output, not again
              assert.equal(await p13.evaluate(() => window.__game.st.log.filter((e) => e.type === 'pin-tip').length), 1, 'the pin tip shows once');
            }
            if (shots && !reduced) await p13.screenshot({ path: join(shots, `linepin-${engine}-${w}-${id}.png`) });
            await ctx13.close();
          }
        }
      }
    } finally {
      if (b13 !== browser) await b13.close();
    }
  }
  // 숙련자 모드: no mark and no 「⇡ 단서」, the line still pins by keyboard
  {
    const ctx13 = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const p13 = await ctx13.newPage();
    p13.on('pageerror', (e) => errors.push(`senior13: ${e}`));
    await p13.goto(`${url}?fresh=1&briefing=0&case=friday-1802`);
    await p13.locator('#boot .exp-expert').click(); // 익숙해요 · 숙련자 모드로
    await p13.locator('#boot').waitFor({ state: 'detached' });
    const term13 = p13.locator('.window[data-app="terminal"]');
    if (!(await term13.count())) await p13.locator('.icon[data-app="terminal"]').click();
    const input13 = term13.locator('.tin input');
    await input13.waitFor();
    await input13.fill('journalctl -u payment-api | grep "too many open files"');
    await input13.press('Enter');
    await p13.waitForTimeout(150);
    assert.equal(await p13.evaluate(() => window.__game.st.settings.senior), true);
    assert.equal(await term13.locator('.tline.maybe, .tline.clue').count(), 0, '숙련자 모드: no line is marked');
    await input13.press('Shift+ArrowUp');
    assert.equal(await term13.locator('.tpb-mark').count(), 0, '숙련자 모드: no 「⇡ 단서」');
    assert.equal(await term13.locator('.tpb-maybe').count(), 0);
    await p13.keyboard.press('ArrowUp');
    await p13.keyboard.press('p');
    const pin13 = await p13.evaluate(() => window.__game.st.pins.at(-1));
    assert.ok(pin13.clueIds.includes('c_emfile') && pin13.cmd === 'journalctl -u payment-api | grep "too many open files"', 'a grep result pins with its pipeline');
    await ctx13.close();
  }
  step(`line pin in every case (${engines13.map(([e]) => e).join(' + ')}; 1280x800 keys, 390x844 touch; reduced motion on and off): marks only on clue lines after the command, run-by-run jumps (${Object.entries(jumps13).map(([k, v]) => `${k} ${v}`).join(', ')}), P / 44 px 📌 핀하기, host and command kept, flash under 1 s, typing goes on; 숙련자 모드 marks nothing`);

  // ---- fourteenth round: Case 4 「남아 있는 열쇠」 and the season finale (1280x800, Chromium; the overlays again at
  // 390x844 with reduced motion, and in WebKit when PW_WEBKIT is set). One path through: the briefing, the security
  // mail, the ledger-01 crontab (aha), the hidden sign on the notebook page, 은재's drafts opened with namu and one
  // forwarded, the keys and their prints, the hidden bad ending (crontab -r → 몬스테라, back), the report, the last
  // scene (오미래's "네 번째", the 24th handover line), the choice (#인프라 shows because the sign was found), the
  // card, 은재 grey, her reply with the workshop photo, the crontab, the credits, the 15 s line, the stats; then
  // 다른 곳에 넘겨 보기 → the title ending 「인수인계 없음」 (no reply). A second page skips the sign: no #인프라,
  // and the last scene lights the letters itself.
  {
    const ctx14 = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const p14 = await ctx14.newPage();
    p14.on('pageerror', (e) => errors.push(`case4: ${e}`));
    p14.on('console', (m) => m.type() === 'error' && !/404 \(Not Found\)/.test(m.text()) && errors.push(`case4: ${m.text()}`));
    p14.on('dialog', (d) => (nativeDialogs.push(`p14 ${d.type()}: ${d.message()}`), d.accept()));
    const shot14 = async (name) => shots && (await p14.screenshot({ path: join(shots, name) }));
    const term14 = p14.locator('.window[data-app="terminal"]');
    const run14 = async (label, cmd) => {
      // another window may have opened over the terminal: its taskbar entry brings it forward
      if ((await p14.evaluate(() => document.querySelector('.window.focused')?.dataset.app)) !== 'terminal') await p14.locator('#taskbar .task[data-app="terminal"]').click();
      await term14.locator('.ttab', { hasText: new RegExp(`^${label}$`) }).click();
      await term14.locator('.tin input').fill(cmd);
      await term14.locator('.tin input').press('Enter');
      await p14.waitForTimeout(120);
    };
    const pin14 = async (re) => {
      const line = term14.locator('.tline', { hasText: re }).last();
      await line.hover();
      await line.locator('.pinbtn').click();
    };
    await p14.goto(`${url}?fresh=1&case=case4-keys`);
    await p14.locator('#boot .caselabel', { hasText: 'Case 4' }).waitFor();
    await p14.locator('#boot .exp-new').click();
    await p14.locator('#briefing[data-step="voice"]').waitFor({ timeout: 10000 });
    assert.match(await p14.locator('.brief-card').innerText(), /강서진/);
    await p14.keyboard.press('Escape');
    await p14.locator('#briefing').waitFor({ state: 'detached', timeout: 4000 });
    await term14.waitFor();
    assert.deepEqual(await term14.locator('.ttab:not(.dead)').allInnerTexts(), ['nuri-pc', 'handover', 'bastion', 'pay-api-02', 'ledger-01']);
    await shot14('case4-01-desktop.png');
    // the security mail (the first box), and 지훈's "설마"
    await p14.locator('.icon[data-app="mail"]').click();
    await p14.locator('.window[data-app="mail"] .mail-row', { hasText: '[보안] 퇴사자 계정·키 점검' }).click();
    await p14.locator('.toast', { hasText: '설마' }).waitFor({ timeout: 15000 });
    step('Case 4: briefing (서진), five tabs (도윤\'s PC, handover, three audit sessions), the security mail, 지훈\'s "설마"');
    // ledger-01: the crontab is comments only, the last line says "첫 글자만" (aha), then the namu README
    await run14('ledger-01', 'sudo crontab -l -u eunjae');
    await p14.locator('.moment.moment-aha').waitFor({ timeout: 4000 });
    assert.match(await p14.locator('.moment-title').innerText(), /바뀐 건 명령이 아니라 주석 한 줄/);
    await p14.keyboard.press('Escape');
    await pin14(/첫 글자만 :\)/);
    await run14('ledger-01', 'cat /etc/nsswitch.conf');
    await pin14(/^passwd:\s+files\s*📌?$/);
    await run14('ledger-01', 'cat /home/eunjae/README.txt');
    await p14.locator('.toast', { hasText: '안 도망침' }).waitFor({ timeout: 15000 });
    await shot14('case4-02-crontab.png');
    // the notebook page read again: 도 · 망 · 쳐 · 요, the sign found (지훈 and 서진 react)
    await p14.locator('.icon[data-app="notes"]').click();
    await p14.locator('.window[data-app="notes"] .item', { hasText: '은재님이 나한테 남긴 한 줄들' }).click();
    await p14.locator('.window[data-app="notes"] .sign-letter.lit').nth(3).waitFor();
    assert.equal((await p14.locator('.window[data-app="notes"] .sign-letter').allInnerTexts()).join(''), '도망쳐요');
    await p14.locator('.toast', { hasText: '튀래요' }).waitFor({ timeout: 15000 });
    await p14.locator('.toast', { hasText: '선배답네요' }).waitFor({ timeout: 20000 });
    await shot14('case4-03-sign.png');
    step('Case 4: ledger-01 crontab → aha, nsswitch, the namu README; the notebook page shows 도·망·쳐·요 once the crontab said "첫 글자만"; 지훈 "튀래요", 서진 "선배답네요"');
    // 은재's drafts: a wrong password, namu, the hesitation, the chair; one forwarded to 서진
    await p14.locator('#taskbar .task[data-app="mail"]').click();
    const mail14 = p14.locator('.window[data-app="mail"]');
    await mail14.locator('.segmented button', { hasText: '은재' }).click();
    await mail14.locator('.segmented button', { hasText: '임시' }).click();
    await mail14.locator('.mail-row', { hasText: '잠긴 초안' }).last().click();
    await mail14.locator('input[type="password"]').fill('ledger');
    await mail14.locator('form button').click();
    await mail14.locator('.mail-read', { hasText: '처음 맡았던 서버 이름' }).waitFor();
    await mail14.locator('input[type="password"]').fill('namu');
    await mail14.locator('form button').click();
    const priv = p14.locator('.modal-back .modal-private');
    await priv.waitFor();
    assert.match(await priv.innerText(), /남은재의 개인 초안입니다\. 열까요\?[\s\S]*열지 않아도 사건은 풀려요/);
    await priv.locator('.modal-ok').click();
    await mail14.locator('.mail-read h2', { hasText: '어젯밤' }).waitFor();
    assert.equal(await mail14.locator('.mail-row', { hasText: '잠긴 초안' }).count(), 0, 'all nine open at once');
    await mail14.locator('.mail-read .forward').click();
    await mail14.locator('.mail-read .forward.done', { hasText: '전달함' }).waitFor();
    await mail14.locator('.mail-row', { hasText: '작업실' }).click();
    assert.match(await mail14.locator('.mail-read pre').innerText(), /다리 넷이 다 같은 길이인 의자/);
    step('Case 4: 은재\'s nine drafts — a wrong word keeps them shut, namu asks once ("열지 않아도 사건은 풀려요") and opens all nine; one sent on to 서진');
    // the keys, the prints, the 11/20 login, the investigation sessions, the history line, the procedure mails
    await run14('pay-api-02', 'sudo cat /home/deploy/.ssh/authorized_keys');
    await pin14(/eunjae@nuri-pc\s*📌?$/);
    await run14('pay-api-02', 'sudo ssh-keygen -lf /home/deploy/.ssh/authorized_keys');
    await pin14(/jhpark@mbp-2024 \(ED25519\)/);
    await run14('pay-api-02', 'sudo grep "for deploy" /var/log/auth.log');
    await run14('bastion', 'sudo grep SEC-2211 /var/log/auth.log');
    await pin14(/approved by 보안팀 \(ticket SEC-2211\)/);
    await run14('bastion', 'ssh pay-api-01');
    await run14('bastion', 'sudo cat /home/eunjae/.bash_history');
    await pin14(/키 정리: 5대 중 3대 함/);
    await p14.locator('#taskbar .task[data-app="mail"]').click();
    await mail14.locator('.segmented button', { hasText: '내 메일' }).click();
    await mail14.locator('.mail-row', { hasText: '퇴사 처리 체크리스트' }).click();
    await mail14.locator('.mail-read h2 .pinbtn').click();
    // the hidden bad ending: 도윤's own crontab -r, the plant's reminder with it; back to before
    await run14('nuri-pc', 'crontab -r');
    const bad14 = p14.locator('.finale-bad');
    await bad14.waitFor({ timeout: 4000 });
    assert.equal(await bad14.locator('h2').innerText(), '몬스테라가 시들었습니다');
    await shot14('case4-04-bad.png');
    await bad14.locator('.fb-back').click();
    await bad14.waitFor({ state: 'detached' });
    // season report B14: the terminal says the crontab is back, under the `crontab -r` it ran
    assert.match((await term14.locator('.tline').allInnerTexts()).slice(-2).join('\n'), /crontab -r[\s\S]*지우기 직전으로 돌아왔어요 — crontab 이 그대로 있어요/);
    await run14('nuri-pc', 'crontab -l');
    await term14.locator('.tline', { hasText: '월요일: 몬스테라' }).last().waitFor();
    step('Case 4: keys and prints (the 11/20 deploy login is 지훈\'s key), SEC-2211, the "5대 중 3대" history line; crontab -r on 도윤\'s PC → 「몬스테라가 시들었습니다」 → back, the reminder restored');
    // the report: three fields, cited, one submission
    await p14.locator('#taskbar .task[data-app="board"], .icon[data-app="report"]').first().waitFor();
    await p14.locator('.icon[data-app="report"]').click();
    const rep14 = p14.locator('.window[data-app="report"]');
    await pick(rep14, 'cause', 'dir-only');
    await pick(rep14, 'sequence', 'nobody');
    for (const id of ['checklist', 'outside-ldap', 'shared-account']) await pick(rep14, 'responsibility', id);
    // season report B1: every pin is listed in each field (no inner scroll whose bar hid on macOS);
    // B15: ticking a pin does not move the submit button
    for (const l of await rep14.locator('.cite-list').all()) assert.ok(await l.evaluate((e) => e.scrollHeight <= e.clientHeight + 1 && getComputedStyle(e).overflowY === 'visible'), 'no inner scroll in the pin list');
    assert.equal(await rep14.locator('.cite[data-slot="sequence"] .citeopt').count(), await p14.evaluate(() => window.__game.st.pins.length));
    const submitY14 = () => rep14.locator('.submitbar .primary-btn').evaluate((e) => Math.round(e.getBoundingClientRect().top - e.closest('.report').firstElementChild.getBoundingClientRect().top));
    const y14 = await submitY14();
    await cite(rep14, 'cause', /eunjae@nuri-pc/);
    await cite(rep14, 'sequence', /jhpark@mbp-2024/);
    await cite(rep14, 'responsibility', /퇴사 처리 체크리스트/);
    assert.ok(Math.abs((await submitY14()) - y14) <= 1, 'the submit button stays where it was while pins are ticked');
    await submit(rep14, /1번째 제출이에요 \(남은 제출 2\/2\)/, p14);
    // the last scene: no score, 오미래's "네 번째", the sign beats skipped (found), the 24th line waits in the handover tab
    await p14.locator('.window[data-app="mail"] h2', { hasText: 'RE: [보안] ledger-01 퇴사자 계정 — 경위 보고' }).waitFor({ timeout: 8000 });
    assert.match(await p14.locator('.window[data-app="mail"] pre').innerText(), /같은 이야기를 네 번째로 듣습니다/);
    assert.equal(await p14.locator('.moment-result').count(), 0, 'no score moment in the finale');
    // why hand it over: 서진 says the two weeks in 은재's seat end today (Case 0's mail said 11/10–11/23)
    await p14.locator('.toast', { hasText: '누구한테 넘길지는 도윤님이 정해요' }).waitFor({ timeout: 30000 });
    await shot14('case4-05a-teamlead.png');
    await p14.locator('.ending-bar .ending-act', { hasText: '서버 키 회수' }).waitFor({ timeout: 25000 });
    assert.match(await term14.locator('.tin input').inputValue(), /^echo "- \[x\] 서버 키 회수/);
    await shot14('case4-05-handover.png');
    await term14.locator('.tin input').press('Enter');
    // the choice: five ways, #인프라 among them
    const choice14 = p14.locator('.finale-choice');
    await choice14.waitFor({ timeout: 10000 });
    assert.equal(await choice14.locator('h2').innerText(), '내일이면 이 자리는 비어요. 인수인계서 v5를 누구에게 넘길까요?');
    assert.match(await choice14.locator('.fc-note').innerText(), /도윤은 내일 원래 자리로/);
    assert.deepEqual(await choice14.locator('.fc-opt').allInnerTexts(), ['서진님 — 런북으로', '미래님 — 체크리스트로', '보안팀 — 오늘 안에', '#인프라 — 다 같이', '아무에게도 — 제가 기억할게요']);
    await shot14('case4-06-choice.png');
    await choice14.locator('.fc-opt[data-choice="infra"]').click();
    const conf14 = p14.locator('.modal-back .modal-handover');
    await conf14.waitFor();
    assert.match(await conf14.innerText(), /넘기면 되돌릴 수 없어요\. 넘기기 직전 저장은 남아요\./);
    await conf14.locator('.modal-ok').click();
    await p14.waitForFunction(() => window.__audio.history.some((x) => x.id === 'music.finale'), null, { timeout: 4000 });
    const card14 = p14.locator('.finale-card');
    await card14.waitFor();
    assert.equal(await card14.locator('h2').innerText(), '「다 같이」');
    await p14.waitForTimeout(6500);
    assert.match(await card14.innerText(), /읽는 사람은 열한 명, 고치는 사람은 아직 셋이다/);
    await shot14('case4-07-card.png');
    await card14.locator('.finale-next').click();
    // 은재 grey, then her reply with the photo (the only live words; the face shown only here)
    await p14.locator('.pc-status.left', { hasText: '남은재 (퇴사)' }).waitFor({ timeout: 4000 });
    await shot14('case4-08-grey.png');
    await p14.locator('.finale-bar .finale-next').click();
    await mail14.locator('.mail-read h2', { hasText: '도윤님께' }).waitFor({ timeout: 5000 });
    const reply14 = await mail14.locator('.mail-read pre').innerText();
    assert.match(reply14, /^도윤님,\n다 같이 읽었다면서요\. 그게 제가 8년 동안 못 한 거예요\.\n첫 글자 찾았다면서요 :\)/);
    assert.match(reply14, /혼자 다 기억하는 자리에서예요/);
    assert.match(reply14, /서진님한테 제 초안을 전해 줬다면서요/);
    assert.match(reply14, /다리 하나가 자꾸 짧아요\.\n서버들한테 안부 전해 주세요\. 🌱\n남은재$/);
    await mail14.locator('.mail-read .attach').click();
    await p14.locator('.photo-view img').waitFor();
    assert.equal(await p14.locator('.photo-view img').evaluate((i) => i.naturalWidth), 600);
    await shot14('case4-09-reply.png');
    await p14.keyboard.press('Escape');
    await p14.locator('.finale-bar .finale-next').click();
    // 내가 살려 둔 것, the credits, the line for the next person, the stats
    await term14.locator('.tline', { hasText: '다음 실행: 11/27 (금) 18:00' }).waitFor({ timeout: 4000 });
    assert.ok(await term14.locator('.tline', { hasText: '# 왜: 밤에 도는 것 목록을 매주 팀에' }).count());
    // season report B11: the crontab's last line and the prompt stay above the bar
    {
      const barTop = (await p14.locator('.finale-bar').boundingBox()).y;
      const tb = await term14.boundingBox();
      assert.ok(tb.y + tb.height <= barTop, `the terminal (bottom ${tb.y + tb.height}) ends above the bar (${barTop})`);
    }
    await shot14('case4-10-crontab.png');
    await p14.locator('.finale-bar .finale-next').click();
    const cr14 = p14.locator('.finale-credits');
    await cr14.waitFor();
    assert.match(await cr14.innerText(), /## 체크리스트 \(27\/27\)[\s\S]*적어 두기\. 그래야 도망칠 수 있어요\./);
    assert.equal(await cr14.evaluate((e) => getComputedStyle(e).backgroundColor), 'rgb(13, 13, 15)', 'season report B12: nothing shows through the credits');
    await shot14('case4-11-credits.png');
    await cr14.locator('.finale-next').click();
    const line14 = p14.locator('.finale-line');
    await line14.waitFor();
    assert.match(await line14.locator('.fl-readme').innerText(), /이 PC를 받는 분께/);
    await line14.locator('.fl-input').fill('밤에 도는 거, 적어 두세요.');
    await shot14('case4-12-line.png');
    await line14.locator('.fl-input').press('Enter');
    const stats14 = p14.locator('.finale-stats');
    await stats14.waitFor();
    // season report B9: the record has the focus, not 해설 보기 — a second Enter (the playtester's, after the 15 s ran out
    // mid-typing) used to press it and skip the record and its replay
    await p14.waitForTimeout(400);
    assert.equal(await p14.evaluate(() => document.activeElement?.classList.contains('finale-stats')), true, 'the record itself has the focus');
    await p14.keyboard.press('Enter');
    await p14.waitForTimeout(300);
    assert.equal(await stats14.count(), 1, 'a stray Enter leaves the record on screen');
    assert.equal(await stats14.locator('h2').innerText(), '엔딩 2 / 6', 'the hidden one counts too: 몬스테라 and 다 같이');
    assert.match(await stats14.innerText(), /숨은 사인 ✓ 직접 찾음[\s\S]*은재의 초안 \d \/ 9 읽음[\s\S]*다음 사람에게: “밤에 도는 거, 적어 두세요\.” — 한도윤/);
    assert.equal(await p14.evaluate(() => localStorage.getItem('no-handover:next-line')), '밤에 도는 거, 적어 두세요.');
    await shot14('case4-13-stats.png');
    step('Case 4 finale (#인프라): the 24th line, the choice with #인프라 (sign found), the confirm, music.finale, 「다 같이」, 은재 grey, her reply (sign, forwarded draft) with the 600 px workshop photo, 내가 살려 둔 것 (다음 실행 11/27 18:00), v5 credits, the 15 s line kept locally, the stats');
    // 다른 곳에 넘겨 보기: back to just before the choice, each time: 아무에게도 = the title ending (no reply), then
    // 미래님 and 보안팀; every card ends on its price, every reply opens on its own first line
    const ENDINGS14 = [
      ['nobody', '「인수인계 없음」', /"도윤님: 밤에 도는 거 꼭\. \(뭐였지\)"/, null, '다음 실행: 11/28 (토) 03:15', /## 체크리스트 \(20\/24\)[\s\S]*v5: 아무에게도 넘기지 않음/],
      ['mirae', '「네 번째」', /체크하는 사람은 여전히 바쁘다/, /^도윤님,\n대표님이 2년 전 회고를 고쳤다고 들었어요\. 네 번째에서요 :\)/, '다음 실행: 11/27 (금) 18:00', /## 체크리스트 \(27\/27\)/],
      ['security', '「하루 만에」', /다음 날 아침 배포가 멈췄다/, /^도윤님,\n보안팀이 하루 만에 다 막았다고요/, '다음 실행: 11/27 (금) 18:00', /## 체크리스트 \(27\/27\)/],
    ];
    let found14 = 2;
    for (const [id, title, price, reply, next, credits] of ENDINGS14) {
      await stats14.locator('.fs-again').click();
      await p14.locator('#boot').waitFor();
      await p14.locator('#boot button', { hasText: /이어서/ }).first().click();
      await choice14.waitFor({ timeout: 8000 });
      await choice14.locator(`.fc-opt[data-choice="${id}"]`).click();
      await p14.locator('.modal-back .modal-handover .modal-ok').click();
      await card14.waitFor();
      assert.equal(await card14.locator('h2').innerText(), title);
      await p14.waitForTimeout(6000);
      assert.match(await card14.innerText(), price, `${id}: the card ends on its price`);
      if (id === 'nobody') await shot14('case4-14-title.png');
      await card14.locator('.finale-next').click();
      await p14.locator('.finale-bar .finale-next').click();
      if (reply) {
        await mail14.locator('.mail-read h2', { hasText: '도윤님께' }).waitFor({ timeout: 5000 });
        assert.match(await mail14.locator('.mail-read pre').innerText(), reply, `${id}: 은재's reply`);
        await p14.locator('.finale-bar .finale-next').click();
      } else assert.equal(await p14.evaluate(() => window.__game.st.mailsDelivered.includes('reply')), false, 'the title ending gets no reply');
      await term14.locator('.tline', { hasText: next }).waitFor({ timeout: 4000 });
      await p14.locator('.finale-bar .finale-next').click();
      assert.match(await cr14.innerText(), credits);
      await cr14.locator('.finale-next').click();
      await line14.locator('.fl-input').press('Enter');
      await stats14.waitFor();
      assert.equal(await stats14.locator('h2').innerText(), `엔딩 ${++found14} / 6`);
    }
    assert.match(await stats14.innerText(), /다음 사람에게: “…” — 한도윤/, 'an empty line is signed …');
    await stats14.locator('.fs-debrief').click();
    await rep14.locator('.debrief h2', { hasText: '계정을 지워도 열쇠는 남는다' }).waitFor({ timeout: 5000 });
    // season report B9: the replay is on the debrief too, and 이어서 하기 after a reload opens on that debrief
    assert.match(await rep14.locator('.debrief-again').innerText(), /다른 곳에 넘겨 보기/);
    await p14.reload();
    await p14.locator('#boot button', { hasText: /이어서/ }).first().click();
    await rep14.locator('.debrief .debrief-again').waitFor({ timeout: 5000 });
    await rep14.locator('.debrief .debrief-again').click();
    await p14.locator('#boot').waitFor();
    await p14.locator('#boot button', { hasText: /이어서/ }).first().click();
    await choice14.waitFor({ timeout: 8000 });
    step('Case 4: 다른 곳에 넘겨 보기 three times → 「인수인계 없음」 (no reply, 15 3 * * 6, v4 credits 20/24), 「네 번째」, 「하루 만에」 — each card ends on its price, each reply its own first line; 엔딩 5 / 6, then the debrief');
    await ctx14.close();
  }
  // the sign not found: no #인프라; the last scene lights 도·망·쳐·요 and 지훈 laughs there. Narrow screen, reduced motion;
  // the finale's overlays fit, every button is a 44 px target. In WebKit too when PW_WEBKIT is set.
  const engines14 = [['chromium', browser]];
  if (process.env.PW_WEBKIT) engines14.push(['webkit', await webkit.launch(process.env.PW_WEBKIT === '1' ? {} : { executablePath: process.env.PW_WEBKIT })]);
  for (const [engine, b14] of engines14) {
    try {
      const ctx = await b14.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, reducedMotion: 'reduce' });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(`case4 ${engine}: ${e}`));
      p.on('dialog', (d) => (nativeDialogs.push(`p14b ${d.type()}: ${d.message()}`), d.accept()));
      await p.goto(`${url}?fresh=1&briefing=0&case=case4-keys`);
      await p.locator('#boot .exp-familiar').click();
      await p.locator('#boot').waitFor({ state: 'detached' });
      // straight to a finished report (the report itself was played above): the scene, the sign lit by it
      await p.evaluate(() => {
        const g = window.__game;
        const sub = { cause: 'dir-only', sequence: 'nobody', responsibility: ['checklist', 'outside-ldap', 'shared-account'] };
        g.st.submissions.push({ at: g.st.playMs, sub, score: { total: 330, max: 330, allCorrect: true, slots: { cause: { correct: true, points: 100, cite: 'ok' }, sequence: { correct: true, points: 100, cite: 'ok' }, responsibility: { correct: true, points: 100, cite: 'ok' } }, multiplier: 1, evidenceBonus: 30, hintCost: 0, hints: 0, blamed: [] } });
        g.st.finished = true;
        g.startEnding();
      });
      await p.locator('.window[data-app="notes"] .sign-letter').nth(3).waitFor({ timeout: 25000 });
      await p.waitForFunction(() => window.__game.st.live.some((m) => m.text === 'ㅋㅋㅋㅋㅋ 도윤님 튀래요'), null, { timeout: 25000 });
      await p.locator('.ending-bar .ending-act').waitFor({ timeout: 40000 });
      const term = p.locator('.window[data-app="terminal"]');
      await term.locator('.tin input').press('Enter');
      const choice = p.locator('.finale-choice');
      await choice.waitFor({ timeout: 10000 });
      assert.equal(await choice.locator('.fc-opt[data-choice="infra"]').count(), 0, `${engine}: no #인프라 without the sign`);
      for (const b of await choice.locator('.fc-opt').all()) {
        const bb = await b.boundingBox();
        assert.ok(bb.height >= 44 && bb.x >= 0 && bb.x + bb.width <= 390, `${engine}: a choice is a 44 px target on screen`);
      }
      if (engine === 'chromium' && shots) await p.screenshot({ path: join(shots, 'case4-15-narrow-choice.png') });
      await choice.locator('.fc-opt[data-choice="seojin"]').tap();
      await p.locator('.modal-back .modal-handover .modal-ok').tap();
      const card = p.locator('.finale-card');
      await card.waitFor();
      assert.equal(await card.locator('.fcard-line').count(), 3);
      assert.match(await card.innerText(), /그날 밤에도 '결제' 알림을 끄지 못했다/, `${engine}: reduced motion shows every line at once`);
      const next = await card.locator('.finale-next').boundingBox();
      assert.ok(next.height >= 44 && next.y + next.height <= 844, `${engine}: 계속 on screen`);
      await card.locator('.finale-next').tap();
      await p.locator('.finale-bar .finale-next').tap();
      await p.locator('.window[data-app="mail"] .mail-read h2', { hasText: '도윤님께' }).waitFor();
      assert.match(await p.locator('.window[data-app="mail"] .mail-read pre').innerText(), /서진님한테 넘겼다고요[\s\S]*메모장을 세로로 읽어 봐요/);
      if (engine === 'chromium' && shots) await p.screenshot({ path: join(shots, 'case4-16-narrow-reply.png') });
      // season report B11: on a phone too, "내가 살려 둔 것" keeps the terminal (its last crontab line, its prompt) above the bar
      await p.locator('.finale-bar .finale-next').tap();
      await term.locator('.tline', { hasText: '다음 실행' }).last().waitFor({ timeout: 4000 });
      {
        const barTop = (await p.locator('.finale-bar').boundingBox()).y;
        const tb = await term.boundingBox();
        assert.ok(tb.y + tb.height <= barTop + 0.5, `${engine}: the terminal (bottom ${tb.y + tb.height}) ends above the bar (${barTop})`);
      }
      if (engine === 'chromium' && shots) await p.screenshot({ path: join(shots, 'case4-17-narrow-crontab.png') });
      await p.locator('.finale-bar .finale-next').tap();
      await p.locator('.finale-credits .finale-next').tap();
      await p.locator('.finale-line .fl-input').press('Enter');
      // season report B10: the record says how the sign turns ✓ (the playtester read the four lines but never opened the page)
      const facts = await p.locator('.finale-stats .fs-facts').innerText();
      assert.match(facts, /숨은 사인 ✗ 피날레에서 봄\s*직접 찾았다면: 넘기기 전에 도윤 메모장의 「은재님이 나한테 남긴 한 줄들」을 열면 ✓ 로 남아요\./, `${engine}: ${facts}`);
      await ctx.close();
    } finally {
      if (engine === 'webkit') await b14.close();
    }
  }
  step(`Case 4 without the sign (${engines14.map(([e]) => e).join(' + ')}; 390x844 touch, reduced motion): the last scene lights 도·망·쳐·요 and 지훈 laughs there, no #인프라, every choice a 44 px target, the card all at once, 서진's reply`);

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
