// Browser e2e for the SHIPPED music/voice files (public/audio/music, public/audio/voice): in a real
// headless Chromium with the desktop autoplay rule emulated, the first click unlocks sound, the
// opening briefing plays the music.briefing sting at the lock screen and 지훈's voice message with
// its subtitles paced to the recording, and the desktop then loops amb.office from the FILE.
// Output level is metered on the game's master output with an AnalyserNode (as e2e-audio.mjs).
//
// Runs twice on temporary copies of dist/: as built (Opus .ogg first) and with every .ogg removed
// (forces the .mp3 fallback). Each pass watches the whole briefing (~35 s).
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
  } finally {
    await page.close();
    await server.close();
    rmSync(site, { recursive: true, force: true });
  }
}

try {
  await pass('ogg');
  await pass('mp3');
  console.log('\n' + JSON.stringify(results, (k, v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v)));
  console.log('audio files e2e passed');
} catch (e) {
  console.error('audio files e2e failed:', e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
