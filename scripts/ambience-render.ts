// Offline render of the procedural ambience (the amb.office fallback when there is no file) with
// terminal key clicks typed over it, to WAV, so it can be heard without opening the game.
// Same synth, same cue/class gains as in the browser, at 100 % player volume, stereo.
//
//   npm run audio:ambience -- <out.wav>        # default: ./ambience-preview.wav
//
// 24 s: the 12 s room-tone loop plays through its loop point at 12 s (listen for a click: there
// should be none); from 3 s a burst of typing ("df -h", Enter, "du -sh /var/log/*", Enter …) with
// the three key-click variants picked at random and panned up to ±0.25, like src/main.ts.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { peakDb, renderZzfx } from '../src/audio/audio.ts';
import { CLASS_GAIN, MANIFEST, type CueDef } from '../src/audio/manifest.ts';
import { renderRoomTone, rmsDb } from '../src/audio/roomtone.ts';

const SR = 44100;
const SECONDS = 24;
const out = resolve(process.argv[2] ?? 'ambience-preview.wav');

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const n = SECONDS * SR;
const L = new Float32Array(n);
const R = new Float32Array(n);

// room tone, looped
const amb = MANIFEST['amb.office'] as CueDef;
const g = (amb.gain ?? 1) * CLASS_GAIN[amb.class];
const [tl, tr] = renderRoomTone(SR);
for (let i = 0; i < n; i++) {
  L[i] += tl[i % tl.length] * g;
  R[i] += tr[i % tr.length] * g;
}
console.log(`room tone: ${(tl.length / SR).toFixed(1)} s loop, RMS ${rmsDb(tl).toFixed(1)} dBFS before gains, ${(rmsDb(tl) + 20 * Math.log10(g)).toFixed(1)} dBFS in the mix`);

// key clicks: typed lines with human-ish gaps, Enter = the sfx.key tick
const clicks = ['sfx.key-1', 'sfx.key-2', 'sfx.key-3'].map((id) => ({ id, cue: MANIFEST[id as keyof typeof MANIFEST] as CueDef }));
const enter = MANIFEST['sfx.key'] as CueDef;
const render = (cue: CueDef, rate: number) => {
  const s = renderZzfx(cue, SR)!;
  if (rate === 1) return s;
  const o = new Float32Array(Math.floor(s.length / rate));
  for (let i = 0; i < o.length; i++) o[i] = s[Math.floor(i * rate)];
  return o;
};
const mixAt = (at: number, s: Float32Array, gain: number, pan: number) => {
  const off = Math.round(at * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  for (let i = 0; i < s.length && off + i < n; i++) {
    L[off + i] += s[i] * gl;
    R[off + i] += s[i] * gr;
  }
};
let t = 3;
let keys = 0;
for (const line of ['df -h', 'du -sh /var/log/*', 'tail -n 20 /var/log/wiki/wiki.log', 'systemctl status wiki']) {
  for (const _ of line) {
    const k = clicks[Math.floor(rand() * clicks.length)];
    const wobble = 1 + (k.cue.zzfx![1] ?? 0.05) * (rand() * 2 - 1);
    mixAt(t, render(k.cue, wobble), CLASS_GAIN.ui, (rand() * 2 - 1) * 0.25);
    keys++;
    t += 0.07 + rand() * 0.11;
  }
  t += 0.25;
  mixAt(t, render(enter, 1), CLASS_GAIN.ui, 0);
  t += 1.4 + rand() * 0.8;
}
console.log(`${keys} key clicks + 4 Enter ticks between 3.0 and ${t.toFixed(1)} s`);

function wav(l: Float32Array, r: Float32Array): Buffer {
  const b = Buffer.alloc(44 + l.length * 4);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + l.length * 4, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(2, 22); // stereo
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(l.length * 4, 40);
  const q = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  for (let i = 0; i < l.length; i++) {
    b.writeInt16LE(q(l[i]), 44 + i * 4);
    b.writeInt16LE(q(r[i]), 46 + i * 4);
  }
  return b;
}

writeFileSync(out, wav(L, R));
console.log(`-> ${out} (${SECONDS} s stereo, mix peak ${Math.max(peakDb(L), peakDb(R)).toFixed(1)} dBFS, ambience-only RMS ${rmsDb(L.subarray(0, 3 * SR)).toFixed(1)} dBFS)`);
