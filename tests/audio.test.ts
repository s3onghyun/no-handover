// AudioManager fallbacks with a fake WebAudio context (node has none).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager, type CtxLike, type StorageLike } from '../src/audio/audio.ts';
import { MANIFEST, type CueDef } from '../src/audio/manifest.ts';

function fakeCtx() {
  const log: string[] = [];
  const param = () => ({ value: 1, setValueAtTime: () => {}, setTargetAtTime: () => {}, exponentialRampToValueAtTime: () => {} });
  const node = () => ({ connect: () => {}, disconnect: () => {} });
  const ctx: CtxLike & { log: string[] } = {
    log,
    currentTime: 0,
    state: 'suspended',
    destination: {},
    resume: async () => {
      log.push('resume');
    },
    createGain: () => ({ ...node(), gain: param() }),
    createBufferSource: () => ({ ...node(), buffer: null, loop: false, start: () => log.push('buffer.start'), stop: () => log.push('buffer.stop') }),
    createOscillator: () => ({ ...node(), type: 'sine', frequency: param(), start: () => log.push('osc.start'), stop: () => {} }),
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

const M: Record<string, CueDef> = {
  ding: { src: [], class: 'ui', placeholder: 'ding', where: '' },
  quiet: { src: [], class: 'sfx', placeholder: 'silence', where: '' },
  voice: { src: ['v.ogg', 'v.mp3'], class: 'voice', placeholder: 'silence', where: '' },
  missing: { src: ['gone.ogg'], class: 'sfx', placeholder: 'tick', where: '' },
  amb: { src: [], class: 'ambience', loop: true, placeholder: 'silence', where: '' },
};

test('audio: locked until unlock(), then placeholders and silence instead of missing files', async () => {
  const ctx = fakeCtx();
  const a = new AudioManager(M, { createContext: () => ctx, fetchBytes: async () => null, storage: memStorage() });
  assert.equal((await a.play('ding')).status, 'locked', 'browsers block sound before a gesture');
  assert.equal(a.unlock(), true);
  assert.ok(ctx.log.includes('resume'));
  assert.equal((await a.play('ding')).status, 'placeholder');
  assert.ok(ctx.log.includes('osc.start'), 'placeholder ding is a generated oscillator');
  assert.equal((await a.play('quiet')).status, 'silent');
  assert.equal((await a.play('missing')).status, 'placeholder', '404 falls back to the placeholder');
  assert.equal((await a.play('nope')).status, 'unknown');
  assert.equal(await a.hasFile('voice'), false);
});

test('audio: tries formats in order, skips undecodable files, caches the decode', async () => {
  const ctx = fakeCtx();
  const fetched: string[] = [];
  const a = new AudioManager(M, {
    createContext: () => ctx,
    base: '/x/',
    fetchBytes: async (u) => {
      fetched.push(u);
      return u.endsWith('.ogg') ? new Uint8Array([0]).buffer : new Uint8Array([1, 2]).buffer; // ogg undecodable here
    },
  });
  a.unlock();
  const h = await a.play('voice');
  assert.equal(h.status, 'file');
  assert.equal(h.duration, 2.5);
  assert.deepEqual(fetched, ['/x/v.ogg', '/x/v.mp3']);
  await a.play('voice');
  assert.equal(fetched.length, 2, 'decoded buffer is cached');
  assert.equal(await a.hasFile('voice'), true);
  h.stop();
  assert.ok(ctx.log.includes('buffer.stop'));
});

test('audio: no WebAudio at all is a silent no-op', async () => {
  const a = new AudioManager(M, { createContext: () => null });
  assert.equal(a.unlock(), false);
  assert.equal((await a.play('ding')).status, 'unavailable');
  a.loop('amb');
  a.stopLoop('amb');
  assert.equal(await a.hasFile('voice'), false);
});

test('audio: mute and volume persist; muted one-shots are skipped', async () => {
  const store = memStorage();
  const a = new AudioManager(M, { createContext: fakeCtx, storage: store });
  a.unlock();
  a.setVolume(1.7);
  assert.equal(a.volume, 1, 'clamped');
  a.setVolume(0.35);
  a.setMuted(true);
  assert.deepEqual(JSON.parse(store.data['no-handover:audio']), { muted: true, volume: 0.35 });
  assert.equal((await a.play('ding')).status, 'muted');
  const b = new AudioManager(M, { createContext: fakeCtx, storage: store });
  assert.equal(b.muted, true);
  assert.equal(b.volume, 0.35);
  const bad = new AudioManager(M, { storage: memStorage({ 'no-handover:audio': '{oops' }) });
  assert.equal(bad.muted, false, 'corrupt prefs fall back to defaults');
});

test('audio: loops asked for before unlock start on unlock, once', async () => {
  const a = new AudioManager(M, { createContext: fakeCtx, fetchBytes: async () => null });
  a.loop('amb');
  assert.equal(a.isLooping('amb'), false);
  a.unlock();
  a.loop('amb');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(a.isLooping('amb'), true);
  assert.equal(a.history.filter((x) => x.id === 'amb').length, 1, 'one copy only');
  a.stopLoop('amb');
  assert.equal(a.isLooping('amb'), false);
});

test('audio manifest: every cue has a known class and placeholder; files are not produced yet', () => {
  for (const [id, c] of Object.entries(MANIFEST) as [string, CueDef][]) {
    assert.match(id, /^(amb|music|voice|sfx)\.[a-z0-9-]+$/, id);
    assert.ok(['music', 'ambience', 'voice', 'sfx', 'ui'].includes(c.class), id);
    for (const s of c.src) assert.match(s, new RegExp(`^audio/[a-z]+/${id.replace('.', '\\.')}\\.(ogg|mp3)$`), `${id}: ${s}`);
    if (c.class === 'music' || c.class === 'voice' || c.class === 'ambience') assert.equal(c.placeholder, 'silence', id);
  }
  assert.ok('voice.briefing-jihun' in MANIFEST);
});
