// Browser e2e for sound: the autoplay unlock and the file -> zzfx -> silence resolution, in a
// real (headless) Chromium. Serves a TEMPORARY copy of dist/ with two throwaway test tones
// dropped in where main's files will go, so nothing test-only is ever committed:
//   audio/music/amb.office.ogg          (proves "drop a file in, it plays", ogg first)
//   audio/voice/voice.briefing-case0-seojin.mp3 (proves the mp3 fallback when there is no ogg)
// The tones are WAV bytes under those names; Chromium sniffs the content when decoding.
//
//   npm run build && node scripts/e2e-audio.mjs     (also part of `npm run e2e`)

import { preview } from 'vite';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = mkdtempSync(join(tmpdir(), 'nh-audio-e2e-'));
cpSync(join(root, 'dist'), site, { recursive: true });
// this test is about the drop-in resolution itself, so it starts from no files at all; the shipped
// music/voice files are checked by scripts/e2e-audio-files.mjs
rmSync(join(site, 'audio'), { recursive: true, force: true });

/** 16-bit mono WAV: a sine at `hz` for `secs`, peak `amp`. */
function tone(hz, secs, amp = 0.3, sr = 44100) {
  const n = Math.round(secs * sr);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / sr) * amp * 32767), 44 + i * 2);
  return b;
}
for (const [path, hz] of [
  ['audio/music/amb.office.ogg', 440],
  ['audio/voice/voice.briefing-case0-seojin.mp3', 330],
]) {
  mkdirSync(dirname(join(site, path)), { recursive: true });
  writeFileSync(join(site, path), tone(hz, 1));
}

const server = await preview({ root, build: { outDir: site }, preview: { port: 0, strictPort: false, open: false }, logLevel: 'silent' });
const url = server.resolvedUrls.local[0];
// Headless Chromium lets audio start without a gesture. Desktop Chrome (the captain's playtest)
// does not: the flag below asks for the real policy, and since the headless shell ignores it,
// AUTOPLAY_POLICY also emulates the rule in the page: a context created before the page's first
// user activation starts 'suspended', and resume() is refused until there has been one.
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
  // probe at load, before anything else touches the page (page.evaluate itself counts as a
  // user gesture in Playwright, so the probe cannot be taken from the test side)
  const probe = new window.AudioContext();
  window.__probeState = probe.state;
  void probe.close();
};
const browser = await chromium.launch({
  args: ['--autoplay-policy=user-gesture-required'],
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
});
const errors = [];
const step = (name) => console.log(`  ✓ ${name}`);

async function newPage() {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await p.addInitScript(AUTOPLAY_POLICY);
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return p;
}

/** Peak absolute sample at the game's master output while `play` runs, sampled for `ms`. */
function meter(page, play, ms = 500) {
  return page.evaluate(
    async ({ play, ms }) => {
      const a = window.__audio;
      const an = a.context.createAnalyser();
      an.fftSize = 2048;
      a.output.connect(an);
      const buf = new Float32Array(an.fftSize);
      let peak = 0;
      const status = play ? (await a.play(play)).status : null;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        an.getFloatTimeDomainData(buf);
        for (const v of buf) peak = Math.max(peak, Math.abs(v));
        await new Promise((r) => setTimeout(r, 15));
      }
      a.output.disconnect(an);
      return { status, peak };
    },
    { play, ms },
  );
}

try {
  console.log(`audio e2e against ${url} (temp copy of dist/ at ${site})`);
  const page = await newPage();
  await page.goto(`${url}?fresh=1&briefing=0`);

  // ---- before any gesture: no context, hint visible, and the browser really does enforce the policy
  assert.equal(await page.evaluate(() => window.__audio.state()), 'none');
  await page.locator('.sound-hint').waitFor();
  assert.match(await page.locator('.sound-hint').innerText(), /클릭하면 소리가 켜집니다/);
  const policy = await page.evaluate(() => window.__probeState);
  assert.equal(policy, 'suspended', 'autoplay policy enforced: a context made without a gesture stays suspended');
  step(`before the first click: no AudioContext yet, hint on the lock screen (autoplay policy on: a context made now would be '${policy}')`);

  // ---- the first click anywhere (lock-screen background, not the unlock button) starts sound
  await page.mouse.click(30, 30);
  await page.waitForFunction(() => window.__audio.state() === 'running', null, { timeout: 5000 });
  await page.locator('.sound-hint').waitFor({ state: 'detached', timeout: 2000 });
  assert.equal(await page.locator('#boot').count(), 1, 'the background click did not start the game');
  const unlockLog = await page.evaluate(() => window.__game.st.log.find((e) => e.type === 'audio-unlock'));
  assert.ok(unlockLog, 'audio-unlock in the playtest log');
  assert.equal(unlockLog.via, 'pointerdown');
  assert.equal(unlockLog.state, 'running');
  assert.ok(unlockLog.ms > 0);
  step(`first click on the lock screen background → AudioContext 'running', hint gone, logged at ${unlockLog.ms} ms via ${unlockLog.via}`);

  // ---- sfx.ding is synthesised by ZzFX and actually reaches the output
  const ding = await meter(page, 'sfx.ding');
  assert.equal(ding.status, 'zzfx');
  assert.ok(ding.peak > 0.01, `ding peak ${ding.peak}`);
  step(`sfx.ding plays from ZzFX: peak ${(20 * Math.log10(ding.peak)).toFixed(1)} dBFS at the master output (volume 70 %)`);
  const quiet = await meter(page, null, 300);
  assert.ok(quiet.peak < 1e-4, `silence afterwards (${quiet.peak})`);

  // ---- every sfx cue resolves to zzfx; music without files to silence; dropped files to 'file'
  const sources = await page.evaluate(async () => {
    const a = window.__audio;
    const o = {};
    for (const id of Object.keys(a.manifest)) o[id] = await a.source(id);
    return o;
  });
  for (const [id, s] of Object.entries(sources)) {
    if (id === 'amb.office' || id === 'voice.briefing-case0-seojin') assert.equal(s, 'file', id);
    else if (id.startsWith('sfx.')) assert.equal(s, 'zzfx', id);
    else assert.equal(s, 'silent', id);
  }
  const nSfx = Object.keys(sources).filter((id) => id.startsWith('sfx.')).length;
  step(`resolution: dropped amb.office.ogg and voice.briefing-case0-seojin.mp3 (mp3 fallback) → file; ${nSfx} sfx → zzfx; the other ${Object.keys(sources).length - nSfx - 2} → silence`);

  // ---- start the game: the ambience loop plays the dropped file with no code change
  await page.locator('#boot button.primary').click();
  await page.locator('.window[data-app="terminal"]').waitFor();
  await page.waitForFunction(() => window.__audio.history.some((h) => h.id === 'amb.office'), null, { timeout: 5000 });
  assert.deepEqual(await page.evaluate(() => window.__audio.history.find((h) => h.id === 'amb.office')), { id: 'amb.office', status: 'file' });
  await page.waitForTimeout(1200); // let the reveal's pulse and window sounds die away
  const amb = await meter(page, null, 400);
  assert.ok(amb.peak > 0.01, `ambience loop audible (${amb.peak})`);
  step(`desktop: amb.office loops the dropped test tone (peak ${(20 * Math.log10(amb.peak)).toFixed(1)} dBFS)`);
  await page.locator('.tin input').fill('pwd');
  await page.locator('.tin input').press('Enter');
  await page.waitForFunction(() => window.__audio.history.some((h) => h.id === 'sfx.key'), null, { timeout: 2000 });
  assert.deepEqual(await page.evaluate(() => window.__audio.history.filter((h) => h.id === 'sfx.key')), [{ id: 'sfx.key', status: 'zzfx' }]);
  step('Enter in the terminal plays the quiet sfx.key tick');
  await page.locator('.tin input').press('l');
  await page.waitForTimeout(80); // clicks closer than 25 ms are merged
  await page.locator('.tin input').press('s');
  await page.waitForFunction(() => window.__audio.history.filter((h) => /^sfx\.key-\d$/.test(h.id)).length >= 2, null, { timeout: 2000 });
  assert.ok((await page.evaluate(() => window.__audio.history.filter((h) => /^sfx\.key-\d$/.test(h.id)).map((h) => h.status))).every((s) => s === 'zzfx'));
  step('typing in the terminal plays the key-click variants (sfx.key-1..3, panned)');
  assert.equal(await page.evaluate(() => window.__audio.isLooping('music.tension')), false, 'no music loop by default');
  await page.close();

  // ---- amb.office without its file (hidden in this temp copy only): the synthesised room tone loops
  rmSync(join(site, 'audio/music/amb.office.ogg'), { force: true });
  const p3 = await newPage();
  await p3.goto(`${url}?fresh=1&briefing=0`);
  await p3.mouse.click(30, 30);
  await p3.waitForFunction(() => window.__audio.state() === 'running', null, { timeout: 5000 });
  assert.equal(await p3.evaluate(() => window.__audio.source('amb.office')), 'synth');
  await p3.locator('#boot button.primary').click();
  await p3.waitForFunction(() => window.__audio.isLooping('amb.office') && window.__audio.history.some((h) => h.id === 'amb.office'), null, { timeout: 5000 });
  assert.deepEqual(await p3.evaluate(() => window.__audio.history.find((h) => h.id === 'amb.office')), { id: 'amb.office', status: 'synth' });
  await p3.waitForTimeout(1500); // the reveal's pulse and window sounds die away
  const tone3 = await meter(p3, null, 600);
  assert.ok(tone3.peak > 0.0005 && tone3.peak < 0.2, `room tone audible but quiet (${tone3.peak})`);
  step(`no amb.office file: the procedural room tone loops instead (peak ${(20 * Math.log10(tone3.peak)).toFixed(1)} dBFS at the master)`);
  await p3.close();

  // ---- a muted player: the first key press still unlocks; one-shots stay silent until unmuted
  const p2 = await newPage();
  await p2.addInitScript(() => localStorage.setItem('no-handover:audio', JSON.stringify({ muted: true, volume: 0.7 })));
  await p2.goto(`${url}?fresh=1&briefing=0`);
  assert.equal(await p2.evaluate(() => window.__audio.muted), true);
  await p2.locator('.sound-hint').waitFor();
  await p2.keyboard.press('a');
  await p2.waitForFunction(() => window.__audio.state() === 'running', null, { timeout: 5000 });
  await p2.locator('.sound-hint').waitFor({ state: 'detached', timeout: 2000 });
  assert.equal((await p2.evaluate(() => window.__game.st.log.find((e) => e.type === 'audio-unlock'))).muted, true);
  assert.equal((await meter(p2, 'sfx.ding', 200)).status, 'muted');
  await p2.locator('#boot button.primary').click();
  await p2.locator('.tray-btn.sound').click();
  assert.equal(await p2.evaluate(() => window.__audio.muted), false);
  const after = await meter(p2, 'sfx.mail');
  assert.equal(after.status, 'zzfx');
  assert.ok(after.peak > 0.01, `mail after unmute (${after.peak})`);
  step('muted player: the first key press still unlocks (logged muted), unmuting plays at once with no extra click');
  await p2.close();

  assert.deepEqual(errors, []);
  console.log('audio e2e passed');
} catch (e) {
  console.error('audio e2e failed:', e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
  rmSync(site, { recursive: true, force: true });
}
