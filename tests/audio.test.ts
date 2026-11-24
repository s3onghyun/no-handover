// AudioManager: resolution order (file -> zzfx -> silence), unlock, pending cues, prefs.
// Uses a fake WebAudio context (node has none).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager, PENDING_MS, defaultFetch, defaultFormat, type CtxLike, type StorageLike } from '../src/audio/audio.ts';
import { MANIFEST, cueFiles, cueFolder, type CueDef } from '../src/audio/manifest.ts';
import { CAMPAIGN } from '../src/cases/index.ts';
import { caseManifest, voiceManifest } from '../src/engine/voices.ts';
import { applyExpert } from '../src/engine/expert.ts';
import { existsSync, readdirSync } from 'node:fs';

function fakeCtx(initial = 'suspended') {
  const log: string[] = [];
  const sources: { loop: boolean; rate: number; buffer: unknown }[] = [];
  const param = () => ({ value: 1, setTargetAtTime: () => {} });
  const node = () => ({ connect: () => {}, disconnect: () => {} });
  const ctx: CtxLike & { log: string[]; sources: typeof sources } = {
    log,
    sources,
    currentTime: 0,
    sampleRate: 48000,
    state: initial,
    destination: {},
    onstatechange: null,
    resume: async () => {
      log.push('resume');
      ctx.state = 'running';
      ctx.onstatechange?.();
    },
    createGain: () => ({ ...node(), gain: param() }),
    createBufferSource: () => {
      const s = {
        ...node(),
        buffer: null as unknown,
        loop: false,
        playbackRate: { value: 1 },
        start: () => {
          log.push('start');
          sources.push({ loop: s.loop, rate: s.playbackRate.value, buffer: s.buffer });
        },
        stop: () => log.push('stop'),
      };
      return s as never;
    },
    createBuffer: (_c: number, len: number, sr: number) => {
      const data = new Float32Array(len);
      return { duration: len / sr, getChannelData: () => data };
    },
    decodeAudioData: async (b: ArrayBuffer) => {
      if (new Uint8Array(b)[0] === 0) throw new Error('bad data');
      return { duration: 2.5 };
    },
  };
  return ctx;
}

function memStorage(init: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...init };
  return { data, get: (k) => data[k] ?? null, set: (k, v) => void (data[k] = v) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const ZZ = [0.2, 0, 440, 0.001, 0, 0.02];
const M: Record<string, CueDef> = {
  'sfx.ding': { class: 'ui', file: true, zzfx: ZZ, where: '' },
  'sfx.quiet': { class: 'sfx', file: true, where: '' },
  'voice.v': { class: 'voice', file: true, where: '' },
  'sfx.synthonly': { class: 'ui', zzfx: ZZ, where: '' },
  'sfx.custom': { src: ['x/one.ogg', 'x/one.mp3'], class: 'sfx', zzfx: ZZ, where: '' },
  'amb.a': { class: 'ambience', file: true, loop: true, where: '' },
  'sfx.loopy': { class: 'sfx', loop: true, loopLen: 0.5, zzfx: ZZ, hits: [[0], [0.25]], where: '' },
  'music.sting': { class: 'music', file: true, where: '' },
};

test('audio: default file paths per cue folder for cues that ship files; explicit src wins; others fetch nothing', () => {
  assert.deepEqual(cueFiles('amb.office', MANIFEST['amb.office']), ['audio/music/amb.office.ogg', 'audio/music/amb.office.mp3']);
  assert.deepEqual(cueFiles('voice.briefing-jihun', { class: 'voice', file: true, where: '' }), ['audio/voice/voice.briefing-jihun.ogg', 'audio/voice/voice.briefing-jihun.mp3']);
  assert.deepEqual(cueFiles('sfx.ding', M['sfx.ding']), ['audio/sfx/sfx.ding.ogg', 'audio/sfx/sfx.ding.mp3']);
  assert.deepEqual(cueFiles('music.reveal', MANIFEST['music.reveal']), ['audio/music/music.reveal.ogg', 'audio/music/music.reveal.mp3']);
  assert.deepEqual(cueFiles('music.tension', MANIFEST['music.tension']), [], 'no file yet: silent without a request');
  assert.deepEqual(cueFiles('sfx.ring', MANIFEST['sfx.ring']), [], 'zzfx only: no request');
  assert.deepEqual(cueFiles('sfx.custom', M['sfx.custom']), ['x/one.ogg', 'x/one.mp3']);
  assert.equal(cueFolder('amb.x'), 'music');
});

test('audio: resolution order is file (ogg, then mp3) -> zzfx -> silence', async () => {
  const files = new Map<string, Uint8Array>();
  const fetched: string[] = [];
  const ctx = fakeCtx();
  const a = new AudioManager(M, {
    createContext: () => ctx,
    base: '/b/',
    fetchBytes: async (u) => (fetched.push(u), files.get(u)?.buffer ?? null),
  });
  a.unlock();
  // nothing on disk: zzfx when the cue has parameters, else silence
  assert.equal((await a.play('sfx.ding')).status, 'zzfx');
  assert.deepEqual(fetched.filter((u) => u.includes('sfx.ding')), ['/b/audio/sfx/sfx.ding.ogg', '/b/audio/sfx/sfx.ding.mp3'], 'ogg first, then mp3');
  assert.equal((await a.play('sfx.quiet')).status, 'silent');
  assert.equal((await a.play('voice.v')).status, 'silent');
  assert.equal(await a.source('sfx.ding'), 'zzfx');
  assert.equal(await a.source('voice.v'), 'silent');
  assert.equal(await a.source('nope'), 'silent');
  assert.equal((await a.play('sfx.synthonly')).status, 'zzfx');
  assert.deepEqual(fetched.filter((u) => u.includes('synthonly')), [], 'a cue that ships no file is never fetched');

  // a file appears (fresh manager = fresh cache, like a page reload after main drops files in)
  files.set('/b/audio/sfx/sfx.ding.mp3', new Uint8Array([1, 2]));
  files.set('/b/audio/voice/voice.v.ogg', new Uint8Array([0])); // undecodable here
  files.set('/b/audio/voice/voice.v.mp3', new Uint8Array([1]));
  const b = new AudioManager(M, { createContext: () => fakeCtx(), base: '/b/', fetchBytes: async (u) => files.get(u)?.buffer ?? null });
  b.unlock();
  const h = await b.play('sfx.ding');
  assert.equal(h.status, 'file', 'a file beats the zzfx fallback');
  assert.equal(h.duration, 2.5);
  assert.equal((await b.play('voice.v')).status, 'file', 'undecodable ogg falls through to mp3');
  assert.equal(await b.hasFile('voice.v'), true);
  assert.equal(await b.hasFile('sfx.quiet'), false);
});

test('audio: a session fetches one format (the browser\'s pick); the other only for a missing file or after an undecodable one', async () => {
  const files = new Map<string, Uint8Array>();
  for (const id of ['sfx/sfx.ding', 'voice/voice.v', 'sfx/sfx.quiet']) for (const x of ['ogg', 'mp3']) files.set(`/b/audio/${id}.${x}`, new Uint8Array([1]));
  const run = async (format: 'ogg' | 'mp3', ids: string[]) => {
    const fetched: string[] = [];
    const a = new AudioManager(M, { createContext: () => fakeCtx(), base: '/b/', format, fetchBytes: async (u) => (fetched.push(u), files.get(u)?.buffer ?? null) });
    a.unlock();
    for (const id of ids) await a.load(id);
    return { a, fetched: fetched.filter((u) => ids.some((id) => u.includes(id))) };
  };
  assert.deepEqual((await run('ogg', ['sfx.ding', 'voice.v'])).fetched.sort(), ['/b/audio/sfx/sfx.ding.ogg', '/b/audio/voice/voice.v.ogg'], 'Opus browsers never download the mp3 copies');
  assert.deepEqual((await run('mp3', ['sfx.ding', 'voice.v'])).fetched.sort(), ['/b/audio/sfx/sfx.ding.mp3', '/b/audio/voice/voice.v.mp3'], 'the others never download the ogg copies');
  // a missing file in the session's format: that cue falls back, the session keeps its format
  // (unlock preloads every cue at once, so compare what was fetched, not the order)
  files.delete('/b/audio/sfx/sfx.ding.ogg');
  const miss = await run('ogg', ['sfx.ding', 'voice.v']);
  assert.deepEqual(miss.fetched.sort(), ['/b/audio/sfx/sfx.ding.mp3', '/b/audio/sfx/sfx.ding.ogg', '/b/audio/voice/voice.v.ogg']);
  assert.equal(miss.a.format, 'ogg');
  // canPlayType said yes but decoding fails: that cue tries mp3, and the session asks for mp3 first from then on
  files.set('/b/audio/sfx/sfx.ding.ogg', new Uint8Array([0]));
  const bad = await run('ogg', ['sfx.ding']);
  assert.deepEqual(bad.fetched, ['/b/audio/sfx/sfx.ding.ogg', '/b/audio/sfx/sfx.ding.mp3']);
  assert.equal(bad.a.format, 'mp3');
  const later: string[] = [];
  files.set('/b/audio/voice/voice.w.mp3', new Uint8Array([1]));
  const c = new AudioManager({ 'voice.w': { class: 'voice', file: true, where: '' } }, { createContext: () => fakeCtx(), base: '/b/', format: bad.a.format, fetchBytes: async (u) => (later.push(u), files.get(u)?.buffer ?? null) });
  c.unlock();
  await c.load('voice.w');
  assert.deepEqual(later, ['/b/audio/voice/voice.w.mp3']);
  assert.equal(defaultFormat(), 'ogg', 'no DOM (node): the manifest order, ogg first');
});

test('audio: decoded files are cached; stop() fades and stops', async () => {
  const ctx = fakeCtx();
  let n = 0;
  const a = new AudioManager(M, { createContext: () => ctx, fetchBytes: async () => (n++, new Uint8Array([1]).buffer) });
  a.unlock();
  const before = n;
  await a.play('music.sting');
  await a.play('music.sting');
  assert.ok(n - before <= 1, 'one fetch per cue at most');
  const h = await a.play('music.sting');
  h.stop();
  assert.ok(ctx.log.includes('stop'));
});

test('audio: defaultFetch treats an HTML fallback page (dev/preview servers) as missing', async () => {
  const orig = globalThis.fetch;
  try {
    globalThis.fetch = (async (u: string) =>
      u.endsWith('.html')
        ? new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
        : u.endsWith('.404')
          ? new Response('no', { status: 404 })
          : new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/ogg' } })) as typeof fetch;
    assert.equal(await defaultFetch('a.html'), null);
    assert.equal(await defaultFetch('a.404'), null);
    assert.equal((await defaultFetch('a.ogg'))?.byteLength, 3);
  } finally {
    globalThis.fetch = orig;
  }
});

test('audio: zzfx one-shots render once per cue and play with a small pitch wobble', async () => {
  const ctx = fakeCtx();
  const a = new AudioManager(M, { createContext: () => ctx, fetchBytes: async () => null, random: () => 1 });
  a.unlock();
  const h1 = await a.play('sfx.ding');
  const h2 = await a.play('sfx.ding');
  assert.ok(h1.duration > 0.02 && h1.duration < 0.05, `duration ${h1.duration}`);
  const zz = ctx.sources.filter((s) => s.buffer && (s.buffer as { duration: number }).duration === h1.duration);
  assert.equal(zz.length, 2);
  assert.equal(zz[0].buffer, zz[1].buffer, 'buffer rendered once, reused');
  assert.equal(h2.status, 'zzfx');
  // randomness 0 in ZZ -> no wobble; the manifest's cues use .02-.05
  assert.equal(zz[0].rate, 1);
});

test('audio: unlock creates the context in the gesture, resumes it, starts a silent buffer (iOS), reports running', async () => {
  const ctx = fakeCtx('suspended');
  let t = 1000;
  const a = new AudioManager(M, { createContext: () => ctx, fetchBytes: async () => null, now: () => t });
  let changes = 0;
  a.onChange(() => changes++);
  assert.equal(a.state(), 'none');
  assert.equal(a.running(), false);
  assert.equal((await a.play('sfx.ding')).status, 'locked', 'browsers block sound before a gesture');
  t = 1234;
  assert.equal(a.unlock(), true);
  assert.equal(ctx.log[0], 'start', 'a 1-sample silent buffer is started inside the gesture');
  assert.ok(ctx.log.includes('resume'));
  await tick();
  assert.equal(a.state(), 'running');
  assert.equal(a.running(), true);
  assert.equal(a.runningAt, 1234);
  assert.ok(changes >= 1);
  // Safari suspends again (background tab / phone call): the next gesture or visibility resumes it
  ctx.state = 'interrupted';
  a.resumeIfNeeded();
  await tick();
  assert.equal(ctx.state, 'running');
  assert.equal(ctx.log.filter((x) => x === 'resume').length, 2);
  a.unlock();
  assert.equal(ctx.log.filter((x) => x === 'resume').length, 2, 'no resume when already running');
});

test('audio: no WebAudio at all is a silent no-op', async () => {
  const a = new AudioManager(M, { createContext: () => null });
  assert.equal(a.unlock(), false);
  assert.equal(a.state(), 'none');
  assert.equal((await a.play('sfx.ding')).status, 'unavailable');
  a.loop('amb.a');
  a.stopLoop('amb.a');
  assert.equal(await a.hasFile('voice.v'), false);
});

test('audio: mute and volume persist; muted one-shots are skipped; mute never blocks unlocking', async () => {
  const store = memStorage();
  const a = new AudioManager(M, { createContext: fakeCtx, storage: store, fetchBytes: async () => null });
  a.unlock();
  a.setVolume(1.7);
  assert.equal(a.volume, 1, 'clamped');
  a.setVolume(0.35);
  a.setMuted(true);
  assert.deepEqual(JSON.parse(store.data['no-handover:audio']), { muted: true, volume: 0.35 });
  assert.equal((await a.play('sfx.ding')).status, 'muted');

  const ctx = fakeCtx();
  const b = new AudioManager(M, { createContext: () => ctx, storage: store, fetchBytes: async () => null });
  assert.equal(b.muted, true);
  assert.equal(b.volume, 0.35);
  b.loop('sfx.loopy');
  assert.equal(b.unlock(), true, 'muted players still unlock');
  await tick();
  assert.equal(b.running(), true);
  assert.equal(b.isLooping('sfx.loopy'), true, 'loops run (silently) so unmuting is instant');
  b.setMuted(false);
  assert.equal((await b.play('sfx.ding')).status, 'zzfx', 'unmuting needs no second click');

  const bad = new AudioManager(M, { storage: memStorage({ 'no-handover:audio': '{oops' }) });
  assert.equal(bad.muted, false, 'corrupt prefs fall back to defaults');
});

test('audio: loops asked for before unlock start on unlock, once; zzfx loops are real loops', async () => {
  const ctx = fakeCtx();
  const a = new AudioManager(M, { createContext: () => ctx, fetchBytes: async () => null });
  a.loop('amb.a');
  a.loop('sfx.loopy');
  assert.equal(a.isLooping('amb.a'), false);
  a.unlock();
  a.loop('amb.a');
  await tick();
  await tick();
  assert.equal(a.isLooping('amb.a'), true);
  assert.equal(a.history.filter((x) => x.id === 'amb.a').length, 1, 'one copy only');
  assert.deepEqual(a.history.find((x) => x.id === 'amb.a'), { id: 'amb.a', status: 'silent' }, 'no file yet: silent until main drops one in');
  assert.deepEqual(a.history.find((x) => x.id === 'sfx.loopy'), { id: 'sfx.loopy', status: 'zzfx' });
  const loopSrc = ctx.sources.find((s) => s.loop);
  assert.ok(loopSrc, 'zzfx loop source has loop=true');
  assert.equal((loopSrc!.buffer as { duration: number }).duration, 0.5, 'buffer is exactly loopLen');
  a.stopLoop('amb.a');
  assert.equal(a.isLooping('amb.a'), false);
});

test('audio: music/voice asked for just before the unlock play on unlock; UI cues and stale requests do not', async () => {
  let t = 0;
  const ctx = fakeCtx();
  const a = new AudioManager(M, { createContext: () => ctx, fetchBytes: async () => new Uint8Array([1]).buffer, now: () => t });
  const stale = await a.play('voice.v');
  assert.equal(stale.status, 'pending');
  t = PENDING_MS + 500;
  const sting = await a.play('music.sting');
  assert.equal(sting.status, 'pending');
  const cancelled = await a.play('music.sting');
  cancelled.stop();
  assert.equal((await a.play('sfx.ding')).status, 'locked');
  t += 2000;
  a.unlock();
  await tick();
  await tick();
  const played = a.history.filter((x) => x.status === 'file').map((x) => x.id);
  assert.deepEqual(played, ['music.sting'], 'only the fresh, uncancelled music request plays');
  assert.equal(a.history.filter((x) => x.id === 'sfx.ding' && x.status !== 'locked').length, 0);
});

test('audio manifest: ids, classes, files and fallbacks', () => {
  assert.equal(Object.keys(MANIFEST).length, 21);
  // a case's page loads the UI set, only the music it plays and only its own voices
  for (const e of CAMPAIGN) {
    if (!e.cs) continue;
    const m = caseManifest(e.cs);
    assert.ok('sfx.ding' in m && 'amb.office' in m, e.id);
    // the reveal theme where a case ends on its debrief, the finale theme only in the season finale
    assert.equal('music.reveal' in m, !e.cs.finale, e.id);
    assert.equal('music.finale' in m, !!e.cs.finale, e.id);
    assert.deepEqual(Object.keys(m).filter((id) => id.startsWith('voice.')).sort(), Object.keys(voiceManifest(e.cs)).sort(), e.id);
  }
  assert.ok(Object.keys(MANIFEST).every((id) => !id.startsWith('voice.')), 'voices come from src/engine/voices.ts');
  const all: Record<string, CueDef> = Object.assign({ ...MANIFEST }, ...CAMPAIGN.filter((e) => e.cs).map((e) => voiceManifest(e.cs!)));
  for (const [id, c] of Object.entries(all)) {
    assert.match(id, /^(amb|music|voice|sfx)\.[a-z0-9-]+$/, id);
    assert.ok(['music', 'ambience', 'voice', 'sfx', 'ui'].includes(c.class), id);
    for (const s of cueFiles(id, c)) assert.match(s, new RegExp(`^audio/(music|voice|sfx)/${id.replace('.', '\\.')}\\.(ogg|mp3)$`), `${id}: ${s}`);
    if (c.class === 'music' || c.class === 'voice' || c.class === 'ambience') assert.equal(c.zzfx, undefined, `${id}: file only, silent until produced`);
    if (id.startsWith('sfx.')) assert.ok(c.zzfx, `${id}: every sfx has a zzfx fallback so the UI is audible today`);
  }
  // every case briefing's voice cue and every idle nudge's per-case cue (plus `-ask`) is in its case's voices
  for (const e of CAMPAIGN) {
    if (!e.cs) continue;
    const v = voiceManifest(e.cs);
    if (e.cs.opening) assert.ok(e.cs.opening.briefing.voiceCue && e.cs.opening.briefing.voiceCue in v, e.id);
    for (const n of e.cs.hints.idle) {
      assert.ok(`voice.nudge-${e.cs.id}-${n.id}` in v, `${e.id} ${n.id}`);
      if (n.askText !== undefined) assert.ok(`voice.nudge-${e.cs.id}-${n.id}-ask` in v, `${e.id} ${n.id} ask`);
    }
  }
});

test('audio manifest: every file a manifest requests is on disk, and every shipped file is requested', () => {
  const pub = new URL('../public/', import.meta.url).pathname;
  // the manifest the game builds: the shared cues plus one case's voices, in both modes
  const manifests = [MANIFEST, ...CAMPAIGN.flatMap((e) => (e.cs ? [voiceManifest(e.cs), voiceManifest(applyExpert(e.cs))] : []))];
  const requested = new Set<string>();
  for (const m of manifests) for (const [id, c] of Object.entries(m as Record<string, CueDef>)) for (const s of cueFiles(id, c)) requested.add(s);
  const missing = [...requested].filter((s) => !existsSync(pub + s));
  assert.deepEqual(missing, [], 'requested but not shipped (would 404)');
  const shipped = ['music', 'voice', 'sfx'].flatMap((d) => (existsSync(`${pub}audio/${d}`) ? readdirSync(`${pub}audio/${d}`).filter((f) => /\.(ogg|mp3)$/.test(f)).map((f) => `audio/${d}/${f}`) : []));
  assert.deepEqual(shipped.filter((s) => !requested.has(s)), [], 'shipped but never requested: mark the cue `file: true` (src/audio/manifest.ts)');
  assert.ok(requested.size > 2, `${requested.size} files`);
});
