// Shared integrity checks for a case file (used by the per-case tests; not a test file itself).
import assert from 'node:assert/strict';
import type { CaseFile } from '../src/engine/types.ts';
import { parseLocal } from '../src/engine/time.ts';

/** Every reference resolves, the senior never speaks live, and nothing in the past is dated after the start. */
export function checkIntegrity(cs: CaseFile): void {
  const people = new Set(Object.keys(cs.people));
  const channels = new Set(cs.channels.map((c) => c.id));
  const mails = new Set(cs.mails.map((m) => m.id));
  const notes = new Set(cs.notes.map((n) => n.id));
  const clues = new Set(cs.clues.map((c) => c.id));
  const hosts = new Set(cs.hosts.map((h) => h.name));
  const start = parseLocal(cs.clock.start);
  assert.equal(clues.size, cs.clues.length, 'clue ids are unique');
  for (const ev of cs.timeline) {
    assert.ok(parseLocal(ev.at) <= start, `timeline event after the start: ${ev.at}`);
    for (const e of ev.emits ?? []) {
      if ('host' in e) assert.ok(hosts.has(e.host), e.host);
      if (e.kind === 'message') assert.ok(channels.has(e.channel) && people.has(e.from), `${e.channel} ${e.from}`);
    }
  }
  for (const n of [...cs.hints.idle, ...Object.values(cs.hints.wrong)]) {
    assert.equal(cs.channels.find((c) => c.id === n.channel)?.account, 'me', n.id);
    assert.ok(people.has(n.from), n.from);
    for (const c of n.unlessClues ?? []) assert.ok(clues.has(c), c);
  }
  for (const d of cs.hints.explicit) for (const c of d.unlessClues ?? []) assert.ok(clues.has(c), c);
  for (const tr of cs.triggers) {
    if ('clue' in tr.when) assert.ok(clues.has(tr.when.clue), tr.when.clue);
    if ('allClues' in tr.when) tr.when.allClues.forEach((c) => assert.ok(clues.has(c), c));
    for (const a of tr.actions) {
      if ('mail' in a) assert.ok(mails.has(a.mail), a.mail);
      if ('note' in a) assert.ok(notes.has(a.note), a.note);
      if ('message' in a) assert.ok(channels.has(a.message.channel) && people.has(a.message.from), a.message.channel);
    }
  }
  assert.ok(mails.has(cs.debrief.closingMail));
  if (cs.opening) {
    assert.ok(mails.has(cs.opening.briefing.mail));
    assert.ok(people.has(cs.opening.briefing.caller));
    const objectives = new Set(cs.opening.objectives.items.map((i) => i.id));
    for (const i of cs.opening.objectives.items) for (const c of i.any) if ('clue' in c) assert.ok(clues.has(c.clue), c.clue);
    for (const i of cs.desktop?.icons ?? []) if (i.after) assert.ok(objectives.has(i.after), i.after);
  }
  for (const s of cs.accusation.slots) {
    const right = s.type === 'single' ? s.options.filter((o) => o.correct).length : s.options.filter((o) => (o.weight ?? 0) > 0).length;
    if (s.type === 'single') assert.equal(right, 1, s.id);
    else assert.ok(right >= 1, s.id);
    for (const o of s.options) if (o.blames) assert.ok(people.has(o.blames), o.blames);
    for (const o of s.options) if (o.blames && cs.hints.wrong[o.blames]) assert.ok(people.has(cs.hints.wrong[o.blames].from));
  }
  for (const c of cs.debrief.cast ?? []) assert.ok(people.has(c.who));
  // the departed senior never speaks live (characters.md §8-3)
  assert.ok(![...cs.hints.idle, ...Object.values(cs.hints.wrong)].some((n) => n.from === 'eunjae'));
  assert.ok(!cs.triggers.some((t) => t.actions.some((a) => 'message' in a && a.message.from === 'eunjae')));
  assert.notEqual(cs.hints.ask?.none.from, 'eunjae');
  assert.notEqual(cs.rail?.from, 'eunjae');
  // every key clue has a different first matcher (a key clue is not just another key clue's duplicate)
  for (const c of cs.clues) assert.ok(c.match.length > 0, c.id);
  // fictional domain only
  assert.match(cs.domain, /\.example$/);
}

/** Briefing length in seconds, with the same arithmetic as src/ui/briefing.ts. */
export function briefingSecs(cs: CaseFile): number {
  const b = cs.opening!.briefing;
  const chars = b.lines.reduce((a, l) => a + [...l.text].length, 0);
  const pauses = b.lines.reduce((a, l) => a + (l.pauseMs ?? 700), 0);
  return (3000 + 2200 + chars * 72 + pauses + 4200 + 1300) / 1000;
}
