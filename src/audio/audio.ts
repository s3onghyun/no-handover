// AudioManager: plays cue ids from the manifest through WebAudio.
//
//   source -> cue gain -> class gain (music/ambience/voice/sfx/ui) -> master (volume, mute) -> out
//
// - Resolution per cue (see manifest.ts): file -> ZzFX -> procedural synth -> silence. A session
//   fetches one format: Opus .ogg when the browser says it plays it (canPlayType), else .mp3; the
//   other format is tried only for a missing file, and after an undecodable one the session switches.
// - Music never loops unless `musicLoops` is on (`?music=loop`): stings are one-shots even when a
//   file is marked loop; ambience is the only loop under the desktop.
//   Missing files are normal: a 404, an HTML fallback page or an undecodable file just moves on.
//   Nothing throws.
// - Browser autoplay rules: the AudioContext is created inside unlock(), which src/audio/unlock.ts
//   calls on the first pointerdown/keydown anywhere on the page. Before that:
//     * UI and sfx one-shots are dropped (a ding for something long gone is confusing);
//     * music/voice one-shots asked for in the last PENDING_MS are queued and play on unlock;
//     * loops are remembered and start on unlock.
//   Mute never blocks unlocking: the context still starts, the master gain is just 0.
// - Mute and volume persist in localStorage ('no-handover:audio').
// - No AudioContext (node tests, very old browsers): every call is a silent no-op.

import { CLASS_GAIN, MANIFEST, cueFiles, type CueDef, type VolumeClass } from './manifest.ts';
import { zzfxBuildSamples } from './vendor/zzfx.ts';
import { renderRoomTone } from './roomtone.ts';

// Minimal structural types so tests can pass a fake context. A real AudioContext is cast to this.
export interface ParamLike {
  value: number;
  setTargetAtTime(v: number, t: number, c: number): unknown;
}
export interface NodeLike {
  connect(n: unknown): unknown;
  disconnect(): void;
}
export interface GainLike extends NodeLike {
  gain: ParamLike;
}
export interface BufferLike {
  duration: number;
}
export interface PcmBufferLike extends BufferLike {
  getChannelData(channel: number): Float32Array;
}
export interface SourceLike extends NodeLike {
  buffer: BufferLike | null;
  loop: boolean;
  playbackRate: { value: number };
  start(when?: number): void;
  stop(when?: number): void;
}
export interface PannerLike extends NodeLike {
  pan: ParamLike;
}
export interface CtxLike {
  currentTime: number;
  sampleRate: number;
  state: string;
  destination: unknown;
  onstatechange: (() => void) | null;
  resume(): Promise<unknown>;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
  createBuffer(channels: number, length: number, sampleRate: number): PcmBufferLike;
  decodeAudioData(bytes: ArrayBuffer): Promise<BufferLike>;
  /** Optional: stereo placement for key clicks (missing = centred). */
  createStereoPanner?(): PannerLike;
}

export interface StorageLike {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface AudioDeps {
  /** Called once, inside unlock(). Return null when WebAudio is unavailable. */
  createContext?: () => CtxLike | null;
  /** Fetch a file's bytes; null when missing. */
  fetchBytes?: (url: string) => Promise<ArrayBuffer | null>;
  storage?: StorageLike;
  /** Prefix for manifest paths (default './' so dist/ works from any folder). */
  base?: string;
  /** Clock in ms for the pending queue (default performance.now / Date.now). */
  now?: () => number;
  /** Random source for the zzfx pitch variation (default Math.random). */
  random?: () => number;
  /** Let `music.*` cues loop (default false: music is one-shot stings only). */
  musicLoops?: boolean;
  /** The file format this session fetches first (default: defaultFormat(), Opus .ogg when the browser plays it). */
  format?: AudioFormat;
}

export type AudioFormat = 'ogg' | 'mp3';

export type PlayStatus = 'file' | 'zzfx' | 'synth' | 'silent' | 'muted' | 'locked' | 'pending' | 'unavailable' | 'unknown' | 'off';

export interface PlayHandle {
  status: PlayStatus;
  /** Seconds of the decoded file or rendered zzfx buffer (0 for silence). */
  duration: number;
  stop(fadeMs?: number): void;
}

/** Music/voice asked for at most this long before the unlock gesture still play on unlock. */
export const PENDING_MS = 10_000;
const PENDING_CLASSES: VolumeClass[] = ['music', 'voice', 'ambience'];

const PREFS_KEY = 'no-handover:audio';
const NOOP: PlayHandle = { status: 'unavailable', duration: 0, stop: () => {} };

export function defaultContext(): CtxLike | null {
  const w = globalThis as unknown as { AudioContext?: new () => unknown; webkitAudioContext?: new () => unknown };
  const C = w.AudioContext ?? w.webkitAudioContext;
  try {
    return C ? (new C() as CtxLike) : null;
  } catch {
    return null;
  }
}

/**
 * The one format a session downloads: Opus in .ogg when the browser says it can play it, else the
 * .mp3 copy (old Safari). Without a DOM (node) .ogg, as the manifest lists it first.
 */
export function defaultFormat(): AudioFormat {
  try {
    const doc = (globalThis as { document?: { createElement(tag: string): { canPlayType?(type: string): string } } }).document;
    if (!doc) return 'ogg';
    return doc.createElement('audio').canPlayType?.('audio/ogg; codecs="opus"') ? 'ogg' : 'mp3';
  } catch {
    return 'ogg';
  }
}

export async function defaultFetch(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    // dev/preview servers answer unknown paths with index.html; that is not audio
    if ((r.headers.get('content-type') ?? '').includes('text/html')) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Render a cue's zzfx sound to mono samples: every hit is built with ZzFX (randomness off, so the
 * result is the same each time; the manager applies the randomness as a playback-rate wobble) and
 * mixed in at its start time. Loops are exactly `loopLen` long and wrap hits that run past the end.
 * Returns null when the cue has no zzfx parameters.
 */
export function renderZzfx(cue: CueDef, sampleRate: number): Float32Array | null {
  if (!cue.zzfx) return null;
  const hits = cue.hits?.length ? cue.hits : [[0] as [number]];
  const parts = hits.map(([at, gain = 1, semis = 0]) => {
    const p = [...cue.zzfx!];
    p[0] = (p[0] ?? 1) * gain;
    p[1] = 0;
    p[2] = (p[2] ?? 220) * 2 ** (semis / 12);
    return { off: Math.round(at * sampleRate), s: zzfxBuildSamples(p, sampleRate) };
  });
  const loopLen = cue.loop && cue.loopLen ? Math.round(cue.loopLen * sampleRate) : 0;
  const len = loopLen || Math.max(1, ...parts.map((x) => x.off + x.s.length));
  const out = new Float32Array(len);
  for (const { off, s } of parts) for (let i = 0; i < s.length; i++) out[(off + i) % len] += s[i];
  return out;
}

/** Peak of a sample buffer in dBFS (-Infinity for silence). */
export function peakDb(s: Float32Array): number {
  let p = 0;
  for (let i = 0; i < s.length; i++) p = Math.max(p, Math.abs(s[i]));
  return 20 * Math.log10(p);
}

interface Pending {
  id: string;
  at: number;
  gain?: number;
  cancelled: boolean;
  real?: PlayHandle;
}

export class AudioManager {
  readonly manifest: Record<string, CueDef>;
  private deps: Required<Omit<AudioDeps, 'storage' | 'format'>> & { storage?: StorageLike };
  /** The format this session fetches (one per session; see load()). */
  format: AudioFormat;
  private ctx: CtxLike | null = null;
  private master: GainLike | null = null;
  private classes = new Map<VolumeClass, GainLike>();
  private buffers = new Map<string, Promise<BufferLike | null>>();
  private synths = new Map<string, BufferLike | null>();
  private loops = new Map<string, PlayHandle>();
  private wantedLoops = new Set<string>();
  private pending: Pending[] = [];
  private listeners = new Set<() => void>();
  muted = false;
  volume = 0.7;
  /** A user gesture has called unlock() (the context may still be suspending/resuming). */
  unlocked = false;
  /** deps.now() when the context was first seen running; null until then. */
  runningAt: number | null = null;
  /** Every play request and what happened (debug + tests). */
  readonly history: { id: string; status: PlayStatus }[] = [];

  constructor(manifest: Record<string, CueDef> = MANIFEST, deps: AudioDeps = {}) {
    this.manifest = manifest;
    this.deps = {
      createContext: deps.createContext ?? defaultContext,
      fetchBytes: deps.fetchBytes ?? defaultFetch,
      storage: deps.storage,
      base: deps.base ?? './',
      now: deps.now ?? (() => (globalThis.performance ?? Date).now()),
      random: deps.random ?? Math.random,
      musicLoops: deps.musicLoops ?? false,
    };
    this.format = deps.format ?? defaultFormat();
    try {
      const p = JSON.parse(deps.storage?.get(PREFS_KEY) ?? 'null') as { muted?: boolean; volume?: number } | null;
      if (p && typeof p.muted === 'boolean') this.muted = p.muted;
      if (p && typeof p.volume === 'number' && isFinite(p.volume)) this.volume = clamp01(p.volume);
    } catch {
      /* bad prefs: defaults */
    }
  }

  /** 'none' before the first gesture, else the AudioContext state ('suspended', 'running', 'interrupted', 'closed'). */
  state(): string {
    return this.ctx ? this.ctx.state : 'none';
  }

  /** True once sound can actually come out (context running). Mute does not matter here. */
  running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** The AudioContext (null before unlock or without WebAudio). For the e2e meter and debugging. */
  get context(): CtxLike | null {
    return this.ctx;
  }

  /** The master gain node: everything the game plays passes through it. */
  get output(): GainLike | null {
    return this.master;
  }

  /** Called whenever the context state changes (created, running, suspended again). Returns an unsubscribe. */
  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private changed(): void {
    if (this.runningAt === null && this.running()) this.runningAt = this.deps.now();
    for (const cb of this.listeners) cb();
  }

  /**
   * Call from a user gesture (any pointerdown/keydown; see unlock.ts). Creates the context the
   * first time, resumes it whenever it is not running (Safari suspends it again in the background
   * and on interruptions), and on the first call starts the loops and recent music/voice asked
   * for earlier. Safe to call on every gesture.
   */
  unlock(): boolean {
    let created = false;
    if (!this.ctx) {
      this.ctx = this.deps.createContext();
      if (this.ctx) {
        created = true;
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        for (const [cls, g] of Object.entries(CLASS_GAIN) as [VolumeClass, number][]) {
          const node = this.ctx.createGain();
          node.gain.value = g;
          node.connect(this.master);
          this.classes.set(cls, node);
        }
        this.master.gain.value = this.muted ? 0 : this.volume;
        this.ctx.onstatechange = () => this.changed();
        // iOS Safari only lets a context make sound after something is started inside the gesture
        try {
          const s = this.ctx.createBufferSource();
          s.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
          s.connect(this.ctx.destination);
          s.start();
        } catch {
          /* not needed elsewhere */
        }
      }
    }
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed')
      void this.ctx.resume().then(
        () => this.changed(),
        () => {},
      );
    const first = !this.unlocked;
    this.unlocked = true;
    if (first && this.ctx) {
      for (const id of this.wantedLoops) void this.startLoop(id);
      this.flushPending();
      this.preload();
    }
    if (created) this.changed();
    return !!this.ctx;
  }

  /** Resume after the tab comes back (no gesture needed in most browsers; harmless when refused). */
  resumeIfNeeded(): void {
    if (this.ctx && this.unlocked && this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume().then(() => this.changed(), () => {});
  }

  available(): boolean {
    return !!this.ctx;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyMaster();
    this.savePrefs();
  }

  setVolume(v: number): void {
    this.volume = clamp01(v);
    this.applyMaster();
    this.savePrefs();
  }

  private applyMaster(): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
  }

  private savePrefs(): void {
    this.deps.storage?.set(PREFS_KEY, JSON.stringify({ muted: this.muted, volume: Math.round(this.volume * 100) / 100 }));
  }

  /** Warm the file cache for every cue so the first ding is not late. */
  private preload(): void {
    for (const id of Object.keys(this.manifest)) void this.load(id);
  }

  private flushPending(): void {
    const now = this.deps.now();
    const due = this.pending.filter((p) => !p.cancelled && now - p.at <= PENDING_MS);
    this.pending = [];
    if (this.muted) return;
    for (const p of due)
      void this.play(p.id, { gain: p.gain }).then((h) => {
        if (p.cancelled) h.stop(0);
        else p.real = h;
      });
  }

  /**
   * Load the first playable file of a cue (cached). null = no file: use zzfx or silence.
   * Only the session's format is fetched; the other one only when this cue's file is missing, or
   * when the browser could not decode it after all (then the whole session switches format).
   */
  load(id: string): Promise<BufferLike | null> {
    const cached = this.buffers.get(id);
    if (cached) return cached;
    const cue = this.manifest[id];
    const ctx = this.ctx;
    const p = (async () => {
      if (!cue || !ctx) return null;
      const ext = (src: string) => (src.endsWith('.mp3') ? 'mp3' : src.endsWith('.ogg') ? 'ogg' : null);
      const files = cueFiles(id, cue);
      const order = [...files.filter((f) => ext(f) === this.format), ...files.filter((f) => ext(f) !== this.format)];
      for (const src of order) {
        const bytes = await this.deps.fetchBytes(this.deps.base + src);
        if (!bytes || !bytes.byteLength) continue;
        try {
          return await ctx.decodeAudioData(bytes);
        } catch {
          // canPlayType said yes but decodeAudioData cannot (or the file is broken): the rest of the session asks for the other format first
          const other = ext(src) === 'ogg' ? 'mp3' : ext(src) === 'mp3' ? 'ogg' : null;
          if (ext(src) === this.format && other) this.format = other;
        }
      }
      return null;
    })();
    // only cache once a context exists, so a pre-unlock call does not pin "missing" forever
    if (ctx) this.buffers.set(id, p);
    return p;
  }

  /** True if the cue has a real decoded file (not zzfx or silence). */
  async hasFile(id: string): Promise<boolean> {
    return !!(await this.load(id));
  }

  /** How a cue would sound right now: 'file', 'zzfx', 'synth' or 'silent' (needs unlock for files). */
  async source(id: string): Promise<'file' | 'zzfx' | 'synth' | 'silent'> {
    const cue = this.manifest[id];
    if (!cue) return 'silent';
    if (await this.load(id)) return 'file';
    return cue.zzfx ? 'zzfx' : cue.synth ? 'synth' : 'silent';
  }

  /** May this cue loop? Music only with `musicLoops` (stings stay one-shots). */
  private mayLoop(cue: CueDef): boolean {
    return cue.class !== 'music' || this.deps.musicLoops;
  }

  /** Play a one-shot cue. Resolves with what actually happened; never rejects. `pan` -1..1 (needs a stereo panner). */
  async play(id: string, opts: { gain?: number; pan?: number } = {}): Promise<PlayHandle> {
    const cue = this.manifest[id];
    const done = (h: PlayHandle) => (this.history.push({ id, status: h.status }), h);
    if (!cue) return done({ ...NOOP, status: 'unknown' });
    if (!this.unlocked) {
      if (!PENDING_CLASSES.includes(cue.class)) return done({ ...NOOP, status: 'locked' });
      const p: Pending = { id, at: this.deps.now(), gain: opts.gain, cancelled: false };
      this.pending.push(p);
      return done({
        status: 'pending',
        duration: 0,
        stop: (fadeMs) => {
          p.cancelled = true;
          p.real?.stop(fadeMs);
        },
      });
    }
    if (!this.ctx) return done(NOOP);
    if (this.muted && !cue.loop) return done({ ...NOOP, status: 'muted' });
    return done(await this.start(id, cue, false, opts.gain, opts.pan));
  }

  /** Start a looping cue (idempotent). Before unlock it is remembered and starts on unlock. Music: see mayLoop. */
  loop(id: string): void {
    const cue = this.manifest[id];
    if (cue && !this.mayLoop(cue)) {
      if (!this.history.some((h) => h.id === id && h.status === 'off')) this.history.push({ id, status: 'off' });
      return;
    }
    this.wantedLoops.add(id);
    if (this.unlocked) void this.startLoop(id);
  }

  stopLoop(id: string, fadeMs = 800): void {
    this.wantedLoops.delete(id);
    this.loops.get(id)?.stop(fadeMs);
    this.loops.delete(id);
  }

  isLooping(id: string): boolean {
    return this.loops.has(id);
  }

  private async startLoop(id: string): Promise<void> {
    if (this.loops.has(id) || !this.ctx) return;
    const cue = this.manifest[id];
    if (!cue) return;
    // reserve the slot before the async load so two quick calls do not start two copies
    const placeholder: PlayHandle = { status: 'silent', duration: 0, stop: () => {} };
    this.loops.set(id, placeholder);
    const h = await this.start(id, cue, true);
    if (this.loops.get(id) !== placeholder) {
      h.stop(0); // stopped while loading
      return;
    }
    this.loops.set(id, h);
    this.history.push({ id, status: h.status });
  }

  /** The cue's zzfx (or procedural) sound as a buffer for this context (rendered once, cached). */
  private synth(id: string, cue: CueDef): BufferLike | null {
    if (this.synths.has(id)) return this.synths.get(id)!;
    const ctx = this.ctx!;
    let buf: BufferLike | null = null;
    const samples = renderZzfx(cue, ctx.sampleRate);
    if (samples) {
      const b = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      b.getChannelData(0).set(samples);
      buf = b;
    } else if (cue.synth === 'roomtone') {
      const [l, r] = renderRoomTone(ctx.sampleRate);
      const b = ctx.createBuffer(2, l.length, ctx.sampleRate);
      b.getChannelData(0).set(l);
      b.getChannelData(1).set(r);
      buf = b;
    }
    this.synths.set(id, buf);
    return buf;
  }

  private async start(id: string, cue: CueDef, loop: boolean, extraGain = 1, pan = 0): Promise<PlayHandle> {
    const ctx = this.ctx!;
    const file = await this.load(id);
    const buf = file ?? this.synth(id, cue);
    if (!buf) return { status: 'silent', duration: 0, stop: () => {} };
    const out = ctx.createGain();
    out.gain.value = (cue.gain ?? 1) * extraGain;
    const dest = this.classes.get(cue.class) ?? this.master;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(p);
      p.connect(dest);
    } else out.connect(dest);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = (loop || !!cue.loop) && this.mayLoop(cue);
    if (!file && cue.zzfx) {
      // ZzFX's own per-play randomness, applied as pitch (like upstream ZZFXSound)
      const r = cue.zzfx?.[1] ?? 0.05;
      src.playbackRate.value = 1 + r * (this.deps.random() * 2 - 1);
    }
    src.connect(out);
    src.start();
    let stopped = false;
    return {
      status: file ? 'file' : cue.zzfx ? 'zzfx' : 'synth',
      duration: buf.duration,
      stop: (fadeMs = 300) => {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(0, t, Math.max(0.005, fadeMs / 3000));
        try {
          src.stop(t + fadeMs / 1000 + 0.05);
        } catch {
          /* already ended */
        }
      },
    };
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
