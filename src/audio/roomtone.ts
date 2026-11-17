// Procedural office room tone: the stand-in for amb.office until a recorded file is dropped in
// (web-escape analysis §9 item 8). Brown noise through a low-pass filter (ventilation, far-off
// traffic) plus a slow, very quiet pad (fluorescent lights / building hum), stereo.
//
// Seamless by construction, so the loop never clicks:
//   * every filter is a one-pole IIR run around the buffer twice (circularly), so the state at the
//     end of the buffer is the state the first sample was computed from (the first pass's
//     influence decays by a^N ≈ 0);
//   * every pad partial and every slow swell completes a whole number of cycles in the buffer;
//   * the mean is removed per channel.
// Deterministic (seeded), so the offline preview equals what the browser plays.

export interface RoomToneOptions {
  seconds?: number;
  seed?: number;
  /** Target RMS of the mix in dBFS (before the cue/class/master gains). */
  rmsDb?: number;
  /** Peak ceiling in dBFS; the level is lowered further if a peak would cross it. */
  peakDb?: number;
}

export const ROOMTONE_DEFAULTS: Required<RoomToneOptions> = { seconds: 12, seed: 1802, rmsDb: -26, peakDb: -10 };

/** mulberry32: small, fast, seeded. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** y[i] = a*y[i-1] + b*x[i], run circularly (two passes) so y wraps without a seam. */
function onePoleCircular(x: Float32Array, a: number, b: number): Float32Array {
  const y = new Float32Array(x.length);
  let s = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < x.length; i++) {
      s = a * s + b * x[i];
      y[i] = s;
    }
  }
  return y;
}

/** One-pole low-pass coefficient for a cutoff frequency. */
function lpCoef(hz: number, sr: number): number {
  return Math.exp((-2 * Math.PI * hz) / sr);
}

function noiseChannel(n: number, sr: number, rand: () => number): Float32Array {
  const white = new Float32Array(n);
  for (let i = 0; i < n; i++) white[i] = rand() * 2 - 1;
  // brown(ish): a leaky integrator (leak keeps it stationary), then two low-pass stages
  const brown = onePoleCircular(white, 0.997, 0.06);
  const a1 = lpCoef(420, sr);
  const a2 = lpCoef(900, sr);
  const lp = onePoleCircular(onePoleCircular(brown, a1, 1 - a1), a2, 1 - a2);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += lp[i];
  mean /= n;
  for (let i = 0; i < n; i++) lp[i] -= mean;
  return lp;
}

/**
 * Render the room tone: [left, right], each exactly `seconds * sampleRate` samples, ready to loop.
 */
export function renderRoomTone(sampleRate: number, opts: RoomToneOptions = {}): [Float32Array, Float32Array] {
  const o = { ...ROOMTONE_DEFAULTS, ...opts };
  const n = Math.round(o.seconds * sampleRate);
  const len = n / sampleRate; // exact loop length in seconds
  const rand = rng(o.seed);
  const a = noiseChannel(n, sampleRate, rand);
  const b = noiseChannel(n, sampleRate, rand);
  // partly correlated stereo: a wide, soft room rather than two separate hisses
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = 0.8 * a[i] + 0.35 * b[i];
    R[i] = 0.35 * a[i] + 0.8 * b[i];
  }
  let noiseRms = 0;
  for (let i = 0; i < n; i++) noiseRms += L[i] * L[i] + R[i] * R[i];
  noiseRms = Math.sqrt(noiseRms / (2 * n)) || 1;
  // pad: low partials (an A2-E3-A3 drone like a building's hum) with slow swells, whole cycles only
  const whole = (hz: number) => Math.max(1, Math.round(hz * len)) / len;
  const partials = [
    { hz: whole(110), amp: 0.18, pan: -0.2, swell: 1, phase: 0.1 },
    { hz: whole(164.81), amp: 0.11, pan: 0.25, swell: 2, phase: 1.7 },
    { hz: whole(220), amp: 0.08, pan: 0.05, swell: 3, phase: 2.9 },
    { hz: whole(55), amp: 0.14, pan: 0, swell: 1, phase: 4.2 },
  ];
  for (const p of partials) {
    const w = (2 * Math.PI * p.hz) / sampleRate;
    const sw = (2 * Math.PI * p.swell) / n;
    const gl = p.amp * noiseRms * Math.sqrt((1 - p.pan) / 2) * Math.SQRT2;
    const gr = p.amp * noiseRms * Math.sqrt((1 + p.pan) / 2) * Math.SQRT2;
    for (let i = 0; i < n; i++) {
      const env = 0.55 + 0.45 * Math.sin(sw * i + p.phase);
      const v = Math.sin(w * i + p.phase) * env;
      L[i] += v * gl;
      R[i] += v * gr;
    }
  }
  // level: RMS target, then make sure the peak stays under the ceiling
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    sum += L[i] * L[i] + R[i] * R[i];
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const rms = Math.sqrt(sum / (2 * n)) || 1;
  let g = 10 ** (o.rmsDb / 20) / rms;
  const ceiling = 10 ** (o.peakDb / 20);
  if (peak * g > ceiling) g = ceiling / peak;
  for (let i = 0; i < n; i++) {
    L[i] *= g;
    R[i] *= g;
  }
  return [L, R];
}

/** RMS of a buffer in dBFS. */
export function rmsDb(s: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s[i] * s[i];
  return 10 * Math.log10(sum / Math.max(1, s.length));
}
