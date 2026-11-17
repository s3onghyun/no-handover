// AudioManager: plays cue ids from the manifest through WebAudio.
//
//   source -> cue gain -> class gain (music/ambience/voice/sfx/ui) -> master (volume, mute) -> out
//
// - Browser autoplay rules: nothing plays until unlock() is called from a user gesture (the
//   briefing's first click). One-shots asked for before that are dropped; loops are remembered
//   and start on unlock.
// - Missing assets are normal: a cue with no src, a 404, or an undecodable file falls back to
//   the cue's placeholder (a tiny oscillator sound) or silence. Nothing throws.
// - Mute and volume persist in localStorage ('no-handover:audio').
// - No AudioContext (node tests, very old browsers): every call is a silent no-op.

import { CLASS_GAIN, MANIFEST, type CueDef, type Placeholder, type VolumeClass } from './manifest.ts';

// Minimal structural types so tests can pass a fake context. A real AudioContext is cast to this.
export interface ParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  setTargetAtTime(v: number, t: number, c: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
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
export interface SourceLike extends NodeLike {
  buffer: BufferLike | null;
  loop: boolean;
  start(when?: number): void;
  stop(when?: number): void;
}
export interface OscLike extends NodeLike {
  type: string;
  frequency: ParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}
export interface CtxLike {
  currentTime: number;
  state: string;
  destination: unknown;
  resume(): Promise<unknown>;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
  createOscillator(): OscLike;
  decodeAudioData(bytes: ArrayBuffer): Promise<BufferLike>;
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
}

export type PlayStatus = 'file' | 'placeholder' | 'silent' | 'muted' | 'locked' | 'unavailable' | 'unknown';

export interface PlayHandle {
  status: PlayStatus;
  /** Seconds of the decoded file (0 for placeholders/silence). */
  duration: number;
  stop(fadeMs?: number): void;
}

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

export async function defaultFetch(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    // dev servers answer unknown paths with index.html; that is not audio
    if ((r.headers.get('content-type') ?? '').includes('text/html')) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
}

export class AudioManager {
  readonly manifest: Record<string, CueDef>;
  private deps: Required<Omit<AudioDeps, 'storage'>> & { storage?: StorageLike };
  private ctx: CtxLike | null = null;
  private master: GainLike | null = null;
  private classes = new Map<VolumeClass, GainLike>();
  private buffers = new Map<string, Promise<BufferLike | null>>();
  private loops = new Map<string, PlayHandle>();
  private wantedLoops = new Set<string>();
  muted = false;
  volume = 0.7;
  unlocked = false;
  /** Every play request and what happened (debug + tests). */
  readonly history: { id: string; status: PlayStatus }[] = [];

  constructor(manifest: Record<string, CueDef> = MANIFEST, deps: AudioDeps = {}) {
    this.manifest = manifest;
    this.deps = {
      createContext: deps.createContext ?? defaultContext,
      fetchBytes: deps.fetchBytes ?? defaultFetch,
      storage: deps.storage,
      base: deps.base ?? './',
    };
    try {
      const p = JSON.parse(deps.storage?.get(PREFS_KEY) ?? 'null') as { muted?: boolean; volume?: number } | null;
      if (p && typeof p.muted === 'boolean') this.muted = p.muted;
      if (p && typeof p.volume === 'number' && isFinite(p.volume)) this.volume = clamp01(p.volume);
    } catch {
      /* bad prefs: defaults */
    }
  }

  /** Call from a user gesture. Creates/resumes the context and starts loops asked for earlier. */
  unlock(): boolean {
    if (!this.ctx) {
      this.ctx = this.deps.createContext();
      if (this.ctx) {
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        for (const [cls, g] of Object.entries(CLASS_GAIN) as [VolumeClass, number][]) {
          const node = this.ctx.createGain();
          node.gain.value = g;
          node.connect(this.master);
          this.classes.set(cls, node);
        }
        this.applyMaster();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    const first = !this.unlocked;
    this.unlocked = true;
    if (first) for (const id of this.wantedLoops) void this.startLoop(id);
    return !!this.ctx;
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

  /** Load the first playable file of a cue (cached). null = use the placeholder. */
  load(id: string): Promise<BufferLike | null> {
    const cached = this.buffers.get(id);
    if (cached) return cached;
    const cue = this.manifest[id];
    const ctx = this.ctx;
    const p = (async () => {
      if (!cue || !cue.src.length || !ctx) return null;
      for (const src of cue.src) {
        const bytes = await this.deps.fetchBytes(this.deps.base + src);
        if (!bytes || !bytes.byteLength) continue;
        try {
          return await ctx.decodeAudioData(bytes);
        } catch {
          /* undecodable here (e.g. opus on an old Safari): try the next format */
        }
      }
      return null;
    })();
    // only cache once a context exists, so a pre-unlock call does not pin "missing" forever
    if (ctx) this.buffers.set(id, p);
    return p;
  }

  /** True if the cue has a real decoded file (not a placeholder). */
  async hasFile(id: string): Promise<boolean> {
    return !!(await this.load(id));
  }

  /** Play a one-shot cue. Resolves with what actually happened; never rejects. */
  async play(id: string, opts: { gain?: number } = {}): Promise<PlayHandle> {
    const cue = this.manifest[id];
    const done = (h: PlayHandle) => (this.history.push({ id, status: h.status }), h);
    if (!cue) return done({ ...NOOP, status: 'unknown' });
    if (!this.unlocked) return done({ ...NOOP, status: 'locked' });
    if (!this.ctx) return done(NOOP);
    if (this.muted && !cue.loop) return done({ ...NOOP, status: 'muted' });
    return done(await this.start(id, cue, false, opts.gain));
  }

  /** Start a looping cue (idempotent). Before unlock it is remembered and starts on unlock. */
  loop(id: string): void {
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

  private async start(id: string, cue: CueDef, loop: boolean, extraGain = 1): Promise<PlayHandle> {
    const ctx = this.ctx!;
    const buf = await this.load(id);
    const out = ctx.createGain();
    out.gain.value = (cue.gain ?? 1) * extraGain;
    out.connect(this.classes.get(cue.class) ?? this.master);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = loop || !!cue.loop;
      src.connect(out);
      src.start();
      let stopped = false;
      return {
        status: 'file',
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
    if (cue.placeholder === 'silence' || loop) {
      out.disconnect();
      return { status: 'silent', duration: 0, stop: () => {} };
    }
    const nodes = synth(ctx, out, cue.placeholder);
    return {
      status: 'placeholder',
      duration: 0,
      stop: () => {
        for (const n of nodes)
          try {
            n.stop();
          } catch {
            /* ended */
          }
      },
    };
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Generated stand-ins so the UI is audible before real assets exist. Each is a few
 * oscillator blips with a short envelope; all well under half a second except 'ring'.
 */
export function synth(ctx: CtxLike, out: GainLike, kind: Placeholder): OscLike[] {
  const t0 = ctx.currentTime + 0.01;
  const nodes: OscLike[] = [];
  const blip = (freq: number, at: number, dur: number, type = 'sine', peak = 0.35, freqEnd?: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0 + at);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + at + dur);
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    o.connect(g);
    g.connect(out);
    o.start(t0 + at);
    o.stop(t0 + at + dur + 0.02);
    nodes.push(o);
  };
  switch (kind) {
    case 'ding':
      blip(880, 0, 0.18);
      blip(1320, 0.09, 0.28, 'sine', 0.25);
      break;
    case 'mail':
      blip(660, 0, 0.16, 'sine', 0.25);
      blip(990, 0.1, 0.26, 'sine', 0.2);
      break;
    case 'ring':
      for (const at of [0, 0.32]) {
        blip(440, at, 0.2, 'triangle', 0.18);
        blip(480, at, 0.2, 'triangle', 0.12);
      }
      break;
    case 'tick':
      blip(1400, 0, 0.07, 'sine', 0.3, 2100);
      break;
    case 'done':
      [523, 659, 784, 1046].forEach((f, i) => blip(f, i * 0.08, 0.22, 'sine', 0.22));
      break;
    case 'error':
      blip(196, 0, 0.16, 'square', 0.08);
      break;
    case 'click':
      blip(2000, 0, 0.02, 'sine', 0.2);
      break;
    case 'pin':
      blip(1200, 0, 0.05, 'sine', 0.25, 760);
      break;
    case 'silence':
      break;
  }
  return nodes;
}
