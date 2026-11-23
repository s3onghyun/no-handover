// Browser e2e for the SHIPPED music/voice files (public/audio/music, public/audio/voice): in a real
// headless Chromium with the desktop autoplay rule emulated, the first click unlocks sound, the
// opening briefing plays the music.briefing sting at the lock screen and 지훈's voice message with
// its subtitles paced to the recording, and the desktop then loops amb.office from the FILE.
// Output level is metered on the game's master output with an AnalyserNode (as e2e-audio.mjs).
//
// Runs twice on temporary copies of dist/: as built (Opus .ogg first) and with every .ogg removed
// (forces the .mp3 fallback). Each pass watches the whole briefing (~35 s).
// Each pass also decodes every shipped voice file in that format (all cases' lines, src/engine/voices.ts).
// Then the Case 0, 1 and 2 openings (서진's voice messages): the sting and the voice play from the
// files with no typing fallback, the mail slides in, and the desktop loops amb.office from the file;
// in Case 1 a colleague nudge then plays its own per-case voice line, the asked wording too, a
// trigger's two messages play one after the other, and a wrong report's reply plays line by line (~110 s more).
//
//   npm run build && node scripts/e2e-audio-files.mjs     (run after `npm run e2e`; not wired into it to keep package.json out of this change)

import { preview } from 'vite';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { 'amb.office': 78.9, 'music.briefing': 12.7, 'voice.briefing-jihun': 23.6 };
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity).toFixed(1);
const step = (name) => console.log(`  ✓ ${name}`);

// Same emulation of desktop Chrome's autoplay rule as scripts/e2e-audio.mjs.
const AUTOPLAY_POLICY = () => {
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(o) {
      super(o);
      this.gated = !navigator.userActivation.hasBeenActive;
      if (this.gated) void super.suspend();
    }
    get state() {
      return this.gated ? 'suspended' : super.state;
    }
    resume() {
      if (!navigator.userActivation.hasBeenActive) return Promise.reject(new DOMException('needs a user gesture', 'NotAllowedError'));
      this.gated = false;
      return super.resume();
    }
  };
};

/** RMS and peak (linear) at the master output over `ms`. */
function meter(page, ms) {
  return page.evaluate(async (ms) => {
    const a = window.__audio;
    const an = a.context.createAnalyser();
    an.fftSize = 2048;
    a.output.connect(an);
    const buf = new Float32Array(an.fftSize);
    let peak = 0, sum = 0, n = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      an.getFloatTimeDomainData(buf);
      for (const v of buf) {
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
      }
      n += buf.length;
      await new Promise((r) => setTimeout(r, 20));
    }
    a.output.disconnect(an);
    return { peak, rms: Math.sqrt(sum / n) };
  }, ms);
}

const results = {};
const browser = await chromium.launch({
  args: ['--autoplay-policy=user-gesture-required'],
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
});

async function pass(format) {
  const site = mkdtempSync(join(tmpdir(), `nh-audio-files-${format}-`));
  cpSync(join(root, 'dist'), site, { recursive: true });
  if (format === 'mp3')
    for (const dir of ['music', 'voice'])
      for (const f of readdirSync(join(site, 'audio', dir))) if (f.endsWith('.ogg')) rmSync(join(site, 'audio', dir, f));
  const server = await preview({ root, build: { outDir: site }, preview: { port: 0, strictPort: false, open: false }, logLevel: 'silent' });
  const url = server.resolvedUrls.local[0];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const fetched = [];
  await page.addInitScript(AUTOPLAY_POLICY);
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/404 \(Not Found\)/.test(m.text()) && errors.push(m.text()));
  page.on('response', (r) => {
    const p = new URL(r.url()).pathname;
    if (/^\/audio\/(music|voice)\//.test(p)) fetched.push(`${p} ${r.status()} ${r.headers()['content-type'] ?? ''}`);
  });
  const r = (results[format] = {});
  try {
    console.log(`\n[${format}] against ${url} (temp copy of dist/ at ${site})`);
    // Case 3 (Friday 18:02) is the case whose briefing has 지훈's voice message
    await page.goto(`${url}?fresh=1&case=friday-1802`);
    await page.locator('.sound-hint').waitFor();
    assert.equal(await page.evaluate(() => window.__audio.state()), 'none');

    // ---- first click anywhere unlocks; then the unlock button starts the briefing
    await page.mouse.click(30, 30);
    await page.waitForFunction(() => window.__audio.state() === 'running', null, { timeout: 5000 });
    await page.locator('.sound-hint').waitFor({ state: 'detached', timeout: 2000 });
    step('first click on the lock screen → AudioContext running, hint gone');

    // decoded lengths (load() decodes the first playable format; mp3 must not add a gap)
    r.decoded = await page.evaluate(async (ids) => {
      const o = {};
      for (const id of ids) o[id] = (await window.__audio.load(id))?.duration ?? null;
      return o;
    }, Object.keys(FILES));
    for (const [id, want] of Object.entries(FILES)) assert.ok(Math.abs(r.decoded[id] - want) < 0.1, `${id} decoded ${r.decoded[id]} s, want ~${want}`);
    step(`decoded in the browser: ${Object.entries(r.decoded).map(([k, v]) => `${k} ${v.toFixed(3)} s`).join(', ')}`);
    // every recorded voice line decodes in this format (briefings and per-case nudges)
    r.voices = await page.evaluate(async () => {
      const o = {};
      for (const id of Object.keys(window.__audio.manifest).filter((i) => i.startsWith('voice.'))) o[id] = (await window.__audio.load(id))?.duration ?? null;
      return o;
    });
    for (const [id, d] of Object.entries(r.voices)) assert.ok(d > 0.4 && d < 40, `${id} decoded ${d} s`);
    step(`all ${Object.keys(r.voices).length} of this case's voice cues decode from the ${format} files (${Math.min(...Object.values(r.voices)).toFixed(1)}–${Math.max(...Object.values(r.voices)).toFixed(1)} s)`);
    await page.locator('#boot button.primary').click();
    await page.locator('#briefing').waitFor();
    const tStart = Date.now();
    await page.waitForFunction(() => window.__audio.history.some((h) => h.id === 'music.briefing'), null, { timeout: 3000 });
    assert.deepEqual(await page.evaluate(() => window.__audio.history.find((h) => h.id === 'music.briefing')), { id: 'music.briefing', status: 'file' });
    r.sting = await meter(page, 2500);
    assert.ok(r.sting.peak > 0.01, `sting audible (${r.sting.peak})`);
    assert.equal(await page.locator('#briefing[data-step="voice"]').count(), 0, 'still on the lock screen');
    step(`lock screen: music.briefing plays from the file, RMS ${db(r.sting.rms)} / peak ${db(r.sting.peak)} dBFS at the master (volume 70 %)`);

    // ---- voice message: file, subtitles paced to it
    await page.locator('#briefing[data-step="voice"]').waitFor({ timeout: 8000 });
    const tVoice = Date.now();
    await page.waitForFunction(() => window.__audio.history.some((h) => h.id === 'voice.briefing-jihun'), null, { timeout: 3000 });
    assert.deepEqual(await page.evaluate(() => window.__audio.history.find((h) => h.id === 'voice.briefing-jihun')), { id: 'voice.briefing-jihun', status: 'file' });
    r.voice = await meter(page, 3000);
    assert.ok(r.voice.peak > 0.05, `voice audible (${r.voice.peak})`);
    step(`voice message: voice.briefing-jihun plays from the file, RMS ${db(r.voice.rms)} / peak ${db(r.voice.peak)} dBFS (with the sting's tail under it)`);
    await page.locator('#briefing.voice-done').waitFor({ timeout: 40000 });
    r.subtitleSecs = (Date.now() - tVoice) / 1000;
    const vd = r.decoded['voice.briefing-jihun'];
    assert.ok(r.subtitleSecs > vd * 0.85 && r.subtitleSecs < vd * 1.1, `subtitles took ${r.subtitleSecs} s for a ${vd} s voice`);
    const typing = await page.evaluate(() => window.__audio.history.filter((h) => h.id === 'sfx.typing').length);
    assert.equal(typing, 0, 'no typing fallback while the voice file plays');
    step(`subtitles finish ${r.subtitleSecs.toFixed(1)} s after the voice starts (voice ${vd.toFixed(1)} s, paced to 92 %); no sfx.typing fallback`);

    // ---- desktop: ambience loop from the file
    await page.locator('#briefing').waitFor({ state: 'detached', timeout: 30000 });
    r.briefingSecs = (Date.now() - tStart) / 1000;
    await page.waitForFunction(() => window.__audio.history.some((h) => h.id === 'amb.office'), null, { timeout: 5000 });
    assert.deepEqual(await page.evaluate(() => window.__audio.history.find((h) => h.id === 'amb.office')), { id: 'amb.office', status: 'file' });
    assert.equal(await page.evaluate(() => window.__audio.isLooping('amb.office')), true);
    await page.waitForTimeout(1500); // the reveal's pulse and window sounds die away
    r.amb = await meter(page, 3000);
    assert.ok(r.amb.peak > 0.003, `ambience audible (${r.amb.peak})`);
    step(`desktop after ${r.briefingSecs.toFixed(1)} s: amb.office loops from the file, RMS ${db(r.amb.rms)} / peak ${db(r.amb.peak)} dBFS`);

    // ---- the right format was fetched, nothing failed to decode
    for (const id of Object.keys(FILES)) {
      const dir = id.startsWith('voice.') ? 'voice' : 'music';
      const hit = fetched.filter((f) => f.startsWith(`/audio/${dir}/${id}.`));
      if (format === 'ogg') assert.deepEqual(hit.map((h) => h.split(' ').slice(0, 2).join(' ')), [`/audio/${dir}/${id}.ogg 200`], `${id}: ${hit}`);
      else {
        // the missing .ogg comes back as a 404 or (vite preview) as index.html: either way not audio
        assert.equal(hit.length, 2, `${id}: ${hit}`);
        assert.match(hit[0], new RegExp(`^/audio/${dir}/${id}\\.ogg (404|200 text/html)`), hit[0]);
        assert.match(hit[1], new RegExp(`^/audio/${dir}/${id}\\.mp3 200 audio/mpeg`), hit[1]);
      }
    }
    r.fetched = fetched;
    assert.deepEqual(errors, []);
    step(`fetched ${format === 'ogg' ? 'only the .ogg files' : '.ogg → not audio (no file), then the .mp3 fallback'}; no page or console errors`);
    // every shipped voice file of every case, in this format (the page only loads its own case's; after the fetch check, which these fetches would trip)
    const shipped = readdirSync(join(site, 'audio', 'voice')).filter((f) => f.endsWith(`.${format}`));
    const all = await page.evaluate(async (files) => {
      const ctx = new OfflineAudioContext(1, 1, 48000);
      const o = {};
      for (const f of files) o[f] = await fetch(`audio/voice/${f}`).then((x) => x.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((b) => b.duration, () => null);
      return o;
    }, shipped);
    for (const [f, d] of Object.entries(all)) assert.ok(d > 0.4 && d < 40, `${f} decoded ${d} s`);
    step(`all ${shipped.length} shipped .${format} voice files decode (${Math.min(...Object.values(all)).toFixed(1)}–${Math.max(...Object.values(all)).toFixed(1)} s)`);

  } finally {
    await page.close();
    await server.close();
    rmSync(site, { recursive: true, force: true });
  }
}

/** Cases 0–2: same opening scene, 서진's recorded voice message; then Case 1's nudge, trigger and report-reply voices. */
async function newOpenings() {
  const server = await preview({ root, preview: { port: 0, strictPort: false, open: false }, logLevel: 'silent' });
  const url = server.resolvedUrls.local[0];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  await page.addInitScript(AUTOPLAY_POLICY);
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/404 \(Not Found\)/.test(m.text()) && errors.push(m.text()));
  try {
    for (const [id, cue, mail] of [
      ['case0-wiki', 'voice.briefing-case0-seojin', '[연습] 위키 502'],
      ['case1-cron-env', 'voice.briefing-case1-seojin', '[연습 2] 위키 인증서 만료'],
      ['case2-deleted-open', 'voice.briefing-case2-seojin', '[중요] 로그 서버 디스크'],
    ]) {
      console.log(`\n[${id}] opening against ${url}`);
      await page.goto(`${url}?fresh=1&case=${id}`);
      await page.mouse.click(30, 30);
      await page.waitForFunction(() => window.__audio.state() === 'running', null, { timeout: 5000 });
      // the first launch asks "터미널이 익숙해요 / 처음이에요" once
      const exp = page.locator('#boot .exp-new');
      await (await exp.count() ? exp : page.locator('#boot button.primary')).click();
      const t0 = Date.now();
      await page.locator('#briefing').waitFor();
      await page.waitForFunction(() => window.__audio.history.some((h) => h.id === 'music.briefing'), null, { timeout: 3000 });
      assert.deepEqual(await page.evaluate(() => window.__audio.history.find((h) => h.id === 'music.briefing')), { id: 'music.briefing', status: 'file' });
      await page.locator('#briefing[data-step="voice"]').waitFor({ timeout: 8000 });
      await page.waitForFunction((c) => window.__audio.history.some((h) => h.id === c), cue, { timeout: 4000 });
      assert.deepEqual(await page.evaluate((c) => window.__audio.history.find((h) => h.id === c), cue), { id: cue, status: 'file' });
      assert.match(await page.locator('.brief-card').innerText(), /강서진/);
      await page.locator('#briefing.voice-done').waitFor({ timeout: 45000 });
      assert.equal(await page.evaluate(() => window.__audio.history.filter((h) => h.id === 'sfx.typing').length), 0, 'no typing fallback while the voice file plays');
      step(`${id}: music.briefing and ${cue} from the files; 서진's subtitles paced to the voice, no sfx.typing`);
      await page.locator('#briefing[data-step="mail"] .brief-mail', { hasText: mail }).waitFor({ timeout: 45000 });
      await page.locator('#briefing').waitFor({ state: 'detached', timeout: 30000 });
      const secs = (Date.now() - t0) / 1000;
      assert.ok(secs >= (id === 'case0-wiki' ? 18 : 28) && secs <= 62, `${id} briefing ${secs}s`);
      await page.waitForFunction(() => window.__audio.isLooping('amb.office'), null, { timeout: 5000 });
      assert.deepEqual(await page.evaluate(() => window.__audio.history.find((h) => h.id === 'amb.office')), { id: 'amb.office', status: 'file' });
      assert.equal(await page.evaluate(() => window.__audio.isLooping('sfx.typing')), false, 'typing loop stopped');
      step(`${id}: mail notification, desktop after ${secs.toFixed(1)} s, amb.office loops from the file, typing loop stopped`);
      if (id === 'case1-cron-env') {
        // a nudge plays voice.nudge-<case id>-<nudge id>; the asked wording plays its own -ask line
        for (const [nid, why, want] of [['idle-1', 'idle', 'voice.nudge-case1-cron-env-idle-1'], ['idle-3', 'ask', 'voice.nudge-case1-cron-env-idle-3-ask']]) {
          await page.evaluate(([n, w]) => window.__game.deliverNudge(window.__game.cs.hints.idle.find((x) => x.id === n), w), [nid, why]);
          await page.waitForFunction((c) => window.__audio.history.some((h) => h.id === c), want, { timeout: 20000 });
          assert.deepEqual(await page.evaluate((c) => window.__audio.history.find((h) => h.id === c), want), { id: want, status: 'file' });
        }
        assert.equal(await page.evaluate(() => window.__audio.history.some((h) => h.id === 'voice.nudge-case1-cron-env-idle-3')), false, 'asked: only the -ask line');
        step(`${id}: nudge idle-1 → voice.nudge-case1-cron-env-idle-1, asked idle-3 → voice.nudge-case1-cron-env-idle-3-ask, both from the files`);
        // a trigger's two messages: each line voiced, the second only after the first has finished
        const [c1, c2] = ['voice.jihoon-ffc6faa1', 'voice.jihoon-4b5a263b'];
        await page.evaluate(() => window.__game.fire('jihoon-nginx'));
        await page.waitForFunction((c) => window.__audio.history.some((h) => h.id === c), c2, { timeout: 40000 });
        const order = await page.evaluate(() => window.__audio.history.map((h) => h.id).filter((x) => x.startsWith('voice.jihoon-')));
        assert.deepEqual(order.slice(-2), [c1, c2]);
        step(`${id}: trigger jihoon-nginx → ${c1} then ${c2}, one after the other`);
        // a wrong report's reply (report.ts → nh-reply): a field line, its evidence-kind pointer, the close
        const body = "원인 칸이 기록이랑 안 맞아요. 그 설명으로는 설명 안 되는 줄이 남아요. '스크립트가 남긴 출력' 쪽은 아직 안 봤죠?\n경위 칸은 맞아요.\n다시요.";
        const want = ['voice.seojin-e93f8bb7', 'voice.seojin-d3024536', 'voice.seojin-226910a7', 'voice.seojin-5720a328'];
        await page.evaluate((b) => document.dispatchEvent(new CustomEvent('nh-reply', { detail: b })), body);
        await page.waitForFunction((c) => window.__audio.history.some((h) => h.id === c), want[3], { timeout: 40000 });
        assert.deepEqual(await page.evaluate((w) => window.__audio.history.filter((h) => w.includes(h.id)), want), want.map((x) => ({ id: x, status: 'file' })));
        step(`${id}: wrong-report reply → ${want.join(', ')} in order, from the files`);
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await server.close();
  }
}

try {
  await pass('ogg');
  await pass('mp3');
  await newOpenings();
  console.log('\n' + JSON.stringify(results, (k, v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v)));
  console.log('audio files e2e passed');
} catch (e) {
  console.error('audio files e2e failed:', e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
