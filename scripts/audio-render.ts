// Offline render of the ZzFX sounds to WAV so they can be heard without opening the game.
// Same synth, same per-cue and class gains as in the browser, at 100 % player volume.
//
//   npm run audio:render -- <out-dir>        # default: ./audio-render
//
// Writes:
//   ui-set.wav     5 s: ding, mail, tick, done, pin, error, key x3, window open/close, pulse
//   fallbacks.wav  the stand-ins for files main will send: ring (x1), typing loop (x2)
// and prints each cue's start time and peak.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { peakDb, renderZzfx } from '../src/audio/audio.ts';
import { CLASS_GAIN, MANIFEST, type CueDef } from '../src/audio/manifest.ts';

const SR = 44100;
const out = resolve(process.argv[2] ?? 'audio-render');

type Cue = keyof typeof MANIFEST;
const UI_SET: [number, Cue][] = [
  [0.0, 'sfx.ding'],
  [0.5, 'sfx.mail'],
  [1.1, 'sfx.tick'],
  [1.4, 'sfx.done'],
  [2.15, 'sfx.pin'],
  [2.45, 'sfx.error'],
  [2.75, 'sfx.key'],
  [2.87, 'sfx.key'],
  [2.99, 'sfx.key'],
  [3.25, 'sfx.window-open'],
  [3.55, 'sfx.window-close'],
  [3.95, 'sfx.pulse'],
];
const FALLBACKS: [number, Cue][] = [
  [0.0, 'sfx.ring'],
  [1.0, 'sfx.typing'],
  [2.6, 'sfx.typing'],
];

function mix(timeline: [number, Cue][], seconds: number): Float32Array {
  const buf = new Float32Array(Math.round(seconds * SR));
  for (const [at, id] of timeline) {
    const cue = MANIFEST[id] as CueDef;
    const s = renderZzfx(cue, SR)!;
    const g = (cue.gain ?? 1) * CLASS_GAIN[cue.class];
    const off = Math.round(at * SR);
    for (let i = 0; i < s.length && off + i < buf.length; i++) buf[off + i] += s[i] * g;
    console.log(`  ${at.toFixed(2).padStart(5)} s  ${id.padEnd(17)} peak ${(peakDb(s) + 20 * Math.log10(g)).toFixed(1)} dBFS`);
  }
  return buf;
}

function wav(samples: Float32Array): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); // fmt chunk size
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  return b;
}

mkdirSync(out, { recursive: true });
for (const [name, timeline, secs] of [
  ['ui-set.wav', UI_SET, 5],
  ['fallbacks.wav', FALLBACKS, 4.3],
] as const) {
  console.log(name);
  const s = mix([...timeline], secs);
  writeFileSync(join(out, name), wav(s));
  console.log(`  -> ${join(out, name)} (${secs} s, mix peak ${peakDb(s).toFixed(1)} dBFS)`);
}
