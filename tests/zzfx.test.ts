// The vendored ZzFX synth and the UI cue parameter table in the manifest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zzfxBuildSamples, zzfxGetNote } from '../src/audio/vendor/zzfx.ts';
import { peakDb, renderZzfx } from '../src/audio/audio.ts';
import { CLASS_GAIN, MANIFEST, type CueDef } from '../src/audio/manifest.ts';

const SR = 44100;

test('zzfx: matches upstream ZzFX.js 1.4.0 output (golden samples)', () => {
  // values produced by upstream ZZFX.buildSamples with Math.random fixed to 0.25 / 0.5
  const s = zzfxBuildSamples([0.5, 0.1, 880, 0.01, 0.05, 0.2, 1, 2, 3, 0, 100, 0.05, 0.1, 0.2, 5, 0.1, 0.05, 0.8, 0.02, 0.3, -2000], SR, () => 0.25);
  assert.equal(s.length, 14553);
  const want = [-0.008021671324968338, -0.04880494996905327, 0.02067308872938156, -0.0335850827395916];
  [100, 1000, 5000, 12000].forEach((i, k) => assert.ok(Math.abs(s[i] - want[k]) < 1e-6, `sample ${i}: ${s[i]}`));
  const d = zzfxBuildSamples([], SR, () => 0.5);
  assert.equal(d.length, 9 + 0.1 * SR, 'defaults: 9-sample anti-pop attack + 0.1 s release');
  assert.ok(Math.abs(d[1000] - -0.05518288537859917) < 1e-6);
});

test('zzfx: sparse designer arrays take the defaults; getNote is equal temperament', () => {
  const a = zzfxBuildSamples([, 0, , , , 0.05], SR, () => 0.5);
  const b = zzfxBuildSamples([1, 0, 220, 0, 0, 0.05], SR, () => 0.5);
  assert.deepEqual(a, b);
  assert.equal(zzfxGetNote(12, 440), 880);
  assert.ok(Math.abs(zzfxGetNote(7, 880) - 1318.51) < 0.01);
});

test('renderZzfx: hits mix at their offsets, with gain and pitch; loops wrap to exactly loopLen', () => {
  const one: CueDef = { class: 'ui', zzfx: [0.2, 0.3, 440, 0, 0, 0.05], where: '' };
  const r1 = renderZzfx(one, SR)!;
  assert.deepEqual(r1, renderZzfx(one, SR), 'deterministic: randomness is applied at playback, not baked in');
  const two = renderZzfx({ ...one, hits: [[0], [0.1, 0.5, 12]] }, SR)!;
  assert.equal(two.length, Math.round(0.1 * SR) + r1.length, 'second hit starts at 0.1 s');
  assert.equal(two[50], r1[50], 'first hit untouched before the second starts');
  const lp = renderZzfx({ ...one, loop: true, loopLen: 0.3, hits: [[0], [0.28]] }, SR)!;
  assert.equal(lp.length, Math.round(0.3 * SR));
  const lp1 = renderZzfx({ ...one, loop: true, loopLen: 0.3 }, SR)!;
  assert.notEqual(lp[200], lp1[200], 'tail of the late hit wraps to the start');
  assert.equal(lp[Math.round(0.2 * SR)], lp1[Math.round(0.2 * SR)], 'quiet between the hits');
  assert.equal(renderZzfx({ class: 'music', where: '' }, SR), null);
});

/** Peak in dBFS at full player volume: synth peak x cue gain x class gain. */
function outDb(c: CueDef): number {
  return peakDb(renderZzfx(c, SR)!) + 20 * Math.log10((c.gain ?? 1) * CLASS_GAIN[c.class]);
}

// target peak windows at 100 % volume; the UI family sits at -18..-12 dBFS
const RANGE: Record<string, [number, number]> = {
  'sfx.key': [-30, -20], // a whisper: it fires on every Enter
  'sfx.typing': [-26, -18], // background loop under the briefing subtitles
};

test('UI cue table: one family of short, soft, low-passed sounds at -18..-12 dBFS', () => {
  const zz = (Object.entries(MANIFEST) as [string, CueDef][]).filter(([, c]) => c.zzfx);
  assert.deepEqual(
    zz.map(([id]) => id).sort(),
    ['sfx.ding', 'sfx.done', 'sfx.error', 'sfx.key', 'sfx.mail', 'sfx.pin', 'sfx.pulse', 'sfx.ring', 'sfx.tick', 'sfx.typing', 'sfx.window-close', 'sfx.window-open'],
  );
  for (const [id, c] of zz) {
    const p = c.zzfx!;
    assert.ok(p.length <= 21, `${id}: at most 21 ZzFX parameters`);
    for (const v of p) assert.ok(v === undefined || Number.isFinite(v), `${id}: numbers only`);
    assert.ok(p[0]! > 0 && p[0]! <= 1, `${id}: volume in (0, 1]`);
    assert.ok((p[1] ?? 0.05) <= 0.05, `${id}: at most 5 % pitch wobble`);
    assert.ok([0, 1, 2].includes(p[6] ?? 0), `${id}: sine / triangle / saw base, no noise or square`);
    assert.ok((p[3] ?? 0) <= 0.2, `${id}: short attack`);
    assert.ok((p[20] ?? 0) < 0, `${id}: low-passed (filter < 0) so nothing is sharp`);
    const s = renderZzfx(c, SR)!;
    if (!c.loop) assert.ok(s.length / SR <= 1, `${id}: one-shot under a second (${(s.length / SR).toFixed(2)} s)`);
    assert.ok(Math.abs(s[s.length - 1]) < 0.01, `${id}: ends at silence (no click)`);
    const [lo, hi] = RANGE[id] ?? [-18, -12];
    const db = outDb(c);
    assert.ok(db >= lo && db <= hi, `${id}: peak ${db.toFixed(1)} dBFS, want ${lo}..${hi}`);
  }
});

test('UI cue table: pitch order reads right (mail lower than ding, error the lowest, close below open)', () => {
  const f = (id: keyof typeof MANIFEST) => (MANIFEST[id] as CueDef).zzfx![2]!;
  assert.ok(f('sfx.mail') < f('sfx.ding'));
  assert.ok(f('sfx.error') < f('sfx.mail'));
  const slide = (id: keyof typeof MANIFEST) => (MANIFEST[id] as CueDef).zzfx![8] ?? 0;
  assert.ok(slide('sfx.window-open') > 0 && slide('sfx.window-close') < 0);
});
