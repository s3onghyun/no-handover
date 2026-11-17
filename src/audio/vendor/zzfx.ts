/*

  ZzFX - Zuper Zmall Zound Zynth v1.4.0 by Frank Force
  https://github.com/KilledByAPixel/ZzFX  (npm `zzfx` 1.4.0, file ZzFX.js)

  ZzFX MIT License

  Copyright (c) 2019 - Frank Force

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.

*/

// Vendored copy of ZZFX.buildSamples and ZZFX.getNote from ZzFX.js 1.4.0, typed for TS.
// Local changes, all mechanical:
//   - a plain function instead of a method on the ZZFX object, so importing this file never
//     creates an AudioContext (the upstream module does `audioContext: new AudioContext` at load,
//     which browsers refuse before a user gesture and node does not have at all);
//   - `sampleRate` and the random source are arguments (upstream: ZZFX.sampleRate, Math.random);
//   - playback (ZZFX.play / playSamples / ZZFXSound) is not copied: src/audio/audio.ts routes the
//     samples through the game's own gain chain instead of straight to the speakers.
// The synthesis loop itself is unchanged; parameter arrays from the ZzFX designer
// (https://killedbyapixel.github.io/ZzFX/) paste in as-is.

/**
 * The 21 ZzFX parameters, in order (all optional, upstream defaults in brackets):
 *  0 volume [1]        1 randomness [.05]   2 frequency [220]   3 attack [0]       4 sustain [0]
 *  5 release [.1]      6 shape [0]          7 shapeCurve [1]    8 slide [0]        9 deltaSlide [0]
 * 10 pitchJump [0]    11 pitchJumpTime [0] 12 repeatTime [0]   13 noise [0]       14 modulation [0]
 * 15 bitCrush [0]     16 delay [0]         17 sustainVolume [1] 18 decay [0]      19 tremolo [0]
 * 20 filter [0]
 * shape: 0 sin, 1 triangle, 2 saw, 3 tan, 4 noise, 5 square. filter: >0 high-pass Hz, <0 low-pass Hz.
 * Times are seconds. Sparse arrays from the designer (`[,,220]`) work: holes take the defaults.
 */
export type ZzfxParams = (number | undefined)[];

export function zzfxBuildSamples(params: ZzfxParams, sampleRate = 44100, random: () => number = Math.random): Float32Array {
  let [
    volume = 1,
    randomness = 0.05,
    frequency = 220,
    attack = 0,
    sustain = 0,
    release = 0.1,
    shape = 0,
    shapeCurve = 1,
    slide = 0,
    deltaSlide = 0,
    pitchJump = 0,
    pitchJumpTime = 0,
    repeatTime = 0,
    noise = 0,
    modulation = 0,
    bitCrush = 0,
    delay = 0,
    sustainVolume = 1,
    decay = 0,
    tremolo = 0,
    filter = 0,
  ] = params;
  // init parameters
  const PI2 = Math.PI * 2,
    abs = Math.abs,
    sign = (v: number) => (v < 0 ? -1 : 1);
  let startSlide = (slide *= (500 * PI2) / sampleRate / sampleRate),
    startFrequency = (frequency *= ((1 + randomness * 2 * random() - randomness) * PI2) / sampleRate),
    modOffset = 0, // modulation offset
    repeat = 0, // repeat offset
    crush = 0, // bit crush offset
    jump = 1, // pitch jump timer
    length: number, // sample length
    t = 0, // sample time
    i = 0, // sample index
    s = 0, // sample value
    f: number; // wave frequency

  // biquad LP/HP filter
  const quality = 2,
    w = (PI2 * abs(filter) * 2) / sampleRate,
    cos = Math.cos(w),
    alpha = Math.sin(w) / 2 / quality,
    a0 = 1 + alpha,
    a1 = (-2 * cos) / a0,
    a2 = (1 - alpha) / a0,
    b0 = (1 + sign(filter) * cos) / 2 / a0,
    b1 = -(sign(filter) + cos) / a0,
    b2 = b0;
  let x2 = 0,
    x1 = 0,
    y2 = 0,
    y1 = 0;

  // scale by sample rate
  const minAttack = 9; // prevent pop if attack is 0
  attack = attack * sampleRate || minAttack;
  decay *= sampleRate;
  sustain *= sampleRate;
  release *= sampleRate;
  delay *= sampleRate;
  deltaSlide *= (500 * PI2) / sampleRate ** 3;
  modulation *= PI2 / sampleRate;
  pitchJump *= PI2 / sampleRate;
  pitchJumpTime *= sampleRate;
  repeatTime = (repeatTime * sampleRate) | 0;

  // allocate the full sample buffer up front
  length = (attack + decay + sustain + release + delay) | 0;
  const b = new Float32Array(length > 0 ? length : 0);

  // generate waveform
  for (; i < length; b[i++] = s * volume) {
    if (!(++crush % ((bitCrush * 100) | 0))) {
      // bit crush
      s = shape
        ? shape > 1
          ? shape > 2
            ? shape > 3
              ? shape > 4
                ? (t / PI2) % 1 < shapeCurve / 2
                  ? 1
                  : -1 // 5 square duty
                : Math.sin(t ** 3) // 4 noise
              : Math.max(Math.min(Math.tan(t), 1), -1) // 3 tan
            : 1 - ((((2 * t) / PI2) % 2) + 2) % 2 // 2 saw
          : 1 - 4 * abs(Math.round(t / PI2) - t / PI2) // 1 triangle
        : Math.sin(t); // 0 sin

      s =
        (repeatTime
          ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime) // tremolo
          : 1) *
        (shape > 4 ? s : sign(s) * abs(s) ** shapeCurve) * // shape curve
        (i < attack
          ? i / attack // attack
          : i < attack + decay // decay
            ? 1 - ((i - attack) / decay) * (1 - sustainVolume) // decay falloff
            : i < attack + decay + sustain // sustain
              ? sustainVolume // sustain volume
              : i < length - delay // release
                ? ((length - i - delay) / release) * // release falloff
                  sustainVolume // release volume
                : 0); // post release

      s = delay
        ? s / 2 +
          (delay > i
            ? 0 // delay
            : ((i < length - delay ? 1 : (length - i) / delay) * // release delay
                b[(i - delay) | 0]) /
              2 /
              volume)
        : s; // sample delay

      if (filter)
        // apply filter
        s = y1 = b2 * x2 + b1 * (x2 = x1) + b0 * (x1 = s) - a2 * y2 - a1 * (y2 = y1);
    }

    f = (frequency += slide += deltaSlide) * Math.cos(modulation * modOffset++); // frequency, modulation
    t += f + f * noise * (((i * i * PI2) % 2) - 1); // noise

    if (jump && ++jump > pitchJumpTime) {
      // pitch jump
      frequency += pitchJump; // apply pitch jump
      startFrequency += pitchJump; // also apply to start
      jump = 0; // stop pitch jump time
    }

    if (repeatTime && !(++repeat % repeatTime)) {
      // repeat
      frequency = startFrequency; // reset frequency
      slide = startSlide; // reset slide
      jump ||= 1; // reset pitch jump time
    }
  }

  return b; // return sample buffer
}

/** Frequency of a note `semitoneOffset` semitones from `rootNoteFrequency` (upstream ZZFX.getNote). */
export function zzfxGetNote(semitoneOffset = 0, rootNoteFrequency = 440): number {
  return rootNoteFrequency * 2 ** (semitoneOffset / 12);
}
