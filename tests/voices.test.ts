import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { CAMPAIGN } from '../src/cases/index.ts';
import { applyExpert } from '../src/engine/expert.ts';
import { caseManifest, cueFor, replyCues, voiceLines } from '../src/engine/voices.ts';
import { cueFiles } from '../src/audio/manifest.ts';
import { wrongReply, type ScoreResult } from '../src/engine/scoring.ts';
import type { CaseFile } from '../src/engine/types.ts';

const ROOT = new URL('../public/audio/', import.meta.url).pathname;
const shipped = (cue: string) => ['ogg', 'mp3'].every((x) => existsSync(`${ROOT}voice/${cue}.${x}`));
const CASES = CAMPAIGN.flatMap((e) => (e.cs ? [e.cs] : []));

/** Every { from, text } a colleague sends live, found by walking the case (not by voices.ts's list). */
function liveMessages(cs: CaseFile): { from: string; text: string; at: string }[] {
  const out: { from: string; text: string; at: string }[] = [];
  const walk = (v: unknown, at: string) => {
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o.from === 'string' && typeof o.text === 'string' && o.from in cs.people) out.push({ from: o.from, text: o.text, at });
    for (const [k, x] of Object.entries(o)) walk(x, `${at}.${k}`);
  };
  // evidence history (timeline, channels), mails and the debrief are read, not said to the player
  walk(cs.hints, 'hints');
  walk(cs.triggers, 'triggers');
  walk(cs.ending, 'ending');
  return out.filter((m) => m.from !== cs.player);
}

test('voices: every line a colleague says to the player has a recorded file (.ogg and .mp3)', () => {
  const missing: string[] = [];
  for (const cs of CASES) {
    const lines = voiceLines(cs);
    for (const l of lines) if (!shipped(l.cue)) missing.push(`${cs.id} ${l.cue} (${l.from}) ${l.text}`);
    // anything a colleague sends from the hints or triggers has a line: a new message source can't slip by silent
    for (const m of liveMessages(cs)) assert.ok(cueFor(cs, m.from, m.text), `${cs.id} ${m.at}: no voice line for "${m.text}"`);
    // the briefing, the tutorial guide's lines and the report replies are on the list too
    const has = (from: string, text: string) => lines.some((l) => l.from === from && l.text === text);
    const b = cs.opening?.briefing;
    if (b) assert.ok(b.voiceCue && lines.some((l) => l.cue === b.voiceCue), `${cs.id}: briefing voiceCue`);
    for (const o of cs.opening?.objectives.items ?? []) if (o.say && cs.rail) assert.ok(has(cs.rail.from, o.say), `${cs.id} say ${o.id}`);
    for (const l of cs.accusation.reply?.lines ?? []) assert.ok(lines.some((x) => x.text === l), `${cs.id} reply: ${l}`);
  }
  assert.deepEqual(missing, [], 'run the TTS + scripts/audio-prepare.sh for these (public/audio/audio-credits.md)');
});

test('voices: the same words by the same person share one cue across cases; ids are unique per text', () => {
  const byCue = new Map<string, string>();
  for (const cs of CASES) for (const l of voiceLines(cs)) {
    assert.equal(byCue.get(l.cue) ?? l.text, l.text, `${l.cue} names two different lines`);
    byCue.set(l.cue, l.text);
  }
  assert.ok(byCue.size > 100);
});

test('voices: every wrong-report reply is voiced end to end (hints: per field + pointer + close; marks: one line)', () => {
  for (const base of CASES) for (const cs of [base, applyExpert(base)]) {
    const slots = cs.accusation.slots;
    // every mix of right / wrong option / wrong citation per field, over three attempts, no pins (so the kind pointer shows)
    const states = [{ correct: true }, { correct: false, optionCorrect: false }, { correct: false, optionCorrect: true }];
    for (let mix = 0; mix < states.length ** slots.length; mix++) {
      const score = { slots: Object.fromEntries(slots.map((s, i) => [s.id, states[Math.floor(mix / states.length ** i) % states.length]])) } as unknown as ScoreResult;
      for (const responsibility of [[], slots.find((s) => s.type === 'multi')?.options.map((o) => o.id) ?? []]) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          const body = wrongReply(cs, score, { cause: '', sequence: '', responsibility } as never, { attempt, pins: [] });
          const cues = replyCues(cs, body);
          const parts = body.split('\n').reduce((n, line) => n + (/ '.+' 쪽/.test(line) ? 2 : 1), 0);
          assert.equal(cues.length, parts, `${cs.id}: ${JSON.stringify(body)} -> ${cues.join(' ')}`);
          for (const c of cues) assert.ok(shipped(c), `${cs.id}: ${c} has no file`);
        }
      }
    }
  }
});

test('voices: one case at a time stays inside the 4 MB audio budget (what a session downloads: its music + its voices, in the larger format)', () => {
  // a session fetches one format (src/audio/audio.ts: .ogg when the browser plays Opus, else .mp3)
  // and only its own case's music and voices (caseManifest): count that, for the bigger of the two
  const PUB = new URL('../public/', import.meta.url).pathname;
  const size = (f: string) => statSync(`${PUB}${f}`).size;
  for (const base of CASES) for (const cs of [base, applyExpert(base)]) {
    const files = Object.entries(caseManifest(cs)).flatMap(([id, c]) => cueFiles(id, c));
    const ogg = files.filter((f) => f.endsWith('.ogg')).reduce((a, f) => a + size(f), 0);
    const mp3 = files.filter((f) => f.endsWith('.mp3')).reduce((a, f) => a + size(f), 0);
    assert.ok(Math.max(ogg, mp3) <= 4_000_000, `${cs.id}: ogg ${ogg} B, mp3 ${mp3} B`);
  }
});
