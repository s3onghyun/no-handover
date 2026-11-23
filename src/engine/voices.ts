// Every line a colleague says to the player, with the audio cue that voices it.
//
// One list per case (voiceLines) feeds the audio manifest (voiceManifest: only the current case's
// cues, so a session fetches one case's voices), the message/report players (cueFor, replyCues) and
// tests/voices.test.ts, which fails when a line has no file. The player's own lines (도윤, quick
// replies), narration (debrief, tour, report intro) and evidence history are not speech to the player.
//
// Cue ids: briefings keep `briefing.voiceCue`, idle nudges keep voice.nudge-<case>-<nudge>[-ask];
// every other line is voice.<speaker>-<fnv1a(text)>, so the same words by the same person share
// one file across cases (report replies, "다시요." …).

import type { CueDef } from '../audio/manifest.ts';
import { FIELD_LINES, MARK_LINES, feedbackMode, slotName } from './scoring.ts';
import type { CaseFile } from './types.ts';

export interface VoiceLine {
  cue: string;
  /** Person id of the speaker. */
  from: string;
  /** Exactly the subtitle text. */
  text: string;
  /** Where it is said (manifest `where`, credits). */
  where: string;
}

const fnv1a = (s: string): string => {
  let h = 0x811c9dc5;
  for (const c of new TextEncoder().encode(s)) h = Math.imul(h ^ c, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
};
const lineCue = (from: string, text: string): string => `voice.${from}-${fnv1a(text)}`;

/** Person id for a display name ('강서진' -> 'seojin'); the report's unsigned reply is the CTO's (report.ts). */
const personId = (cs: CaseFile, name: string | undefined): string =>
  Object.entries(cs.people).find(([, p]) => p.name === name)?.[0] ?? 'mirae';

export function voiceLines(cs: CaseFile): VoiceLine[] {
  const out: VoiceLine[] = [];
  const add = (from: string, text: string, where: string, cue = lineCue(from, text)) => {
    if (from !== cs.player && !out.some((l) => l.cue === cue)) out.push({ cue, from, text, where });
  };
  const b = cs.opening?.briefing;
  if (b) add(b.caller, b.lines.map((l) => l.text).join(' '), '오프닝 브리핑 (음성 메시지)', b.voiceCue);
  for (const n of cs.hints.idle) {
    add(n.from, n.text, `넛지 ${n.id}`, `voice.nudge-${cs.id}-${n.id}`);
    if (n.askText !== undefined) add(n.from, n.askText, `넛지 ${n.id} (직접 물었을 때)`, `voice.nudge-${cs.id}-${n.id}-ask`);
  }
  for (const [who, n] of Object.entries(cs.hints.wrong)) add(n.from, n.text, `오답 넛지 (${who})`);
  const ask = cs.hints.ask;
  if (ask) add(ask.none.from, ask.none.text, '"뭐부터 봐요?" — 남은 넛지 없음');
  for (const tr of cs.triggers) for (const a of tr.actions) if ('message' in a) add(a.message.from, a.message.text, `트리거 ${tr.id}`);
  const rail = cs.rail;
  if (rail) {
    for (const o of cs.opening?.objectives.items ?? []) {
      if (o.say) add(rail.from, o.say, `레일: ${o.id} 차례`);
      if (o.next) {
        add(rail.from, rail.offRail.replace(/\{next\}/g, o.next), `레일: ${o.id} 차례에 딴 명령`);
        if (ask?.rail) add(rail.from, ask.rail.replace(/\{next\}/g, o.next), `레일: ${o.id} 차례에 "뭐부터 봐요?"`);
      }
    }
    if (rail.done) add(rail.from, rail.done, '레일: 오늘 할 일 끝');
  }
  // report reply after a wrong submission: 'marks' lines (숙련자 모드 always), 'hints' fragments per field
  const rp = personId(cs, cs.accusation.reply?.from);
  for (const l of cs.accusation.reply?.lines ?? MARK_LINES) add(rp, l, '보고서 오답 회신');
  if (feedbackMode(cs) === 'hints') {
    for (const def of cs.accusation.slots) {
      const f = (xs: string[]) => xs.map((x) => x.replace('{f}', slotName(def)));
      const kinds = [...f(FIELD_LINES.ok), ...f(FIELD_LINES.cite), ...(def.type === 'multi' ? [...f(FIELD_LINES.extra), ...f(FIELD_LINES.short)] : f(def.id === 'sequence' ? FIELD_LINES.sequence : FIELD_LINES.cause))];
      for (const l of kinds) add(rp, l, `보고서 오답 회신: ${slotName(def)} 칸`);
      for (const k of def.evidence ?? []) for (const l of FIELD_LINES.kind) add(rp, l.replace('{k}', k.label), `보고서 오답 회신: ${slotName(def)} 칸의 증거 종류`);
    }
    for (const l of FIELD_LINES.close) add(rp, l, '보고서 오답 회신: 맺음');
  }
  return out;
}

/** Manifest entries for one case's voices (files in public/audio/voice/<cue>.ogg|.mp3). */
export function voiceManifest(cs: CaseFile): Record<string, CueDef> {
  return Object.fromEntries(voiceLines(cs).map((l) => [l.cue, { class: 'voice', file: true, where: `${cs.id} ${l.where} (${cs.people[l.from]?.name ?? l.from})` } satisfies CueDef]));
}

/** The cue voicing a live message, if it is one of the case's lines. */
export function cueFor(cs: CaseFile, from: string, text: string): string | undefined {
  return voiceLines(cs).find((l) => l.from === from && l.text === text)?.cue;
}

/**
 * Cues for a report reply body (scoring.wrongReply), in order: one per line, or a field line and
 * its "'{k}' 쪽…" pointer as two. Lines without a cue are skipped (subtitles only).
 */
export function replyCues(cs: CaseFile, body: string): string[] {
  const byText = new Map(voiceLines(cs).map((l) => [l.text, l.cue]));
  return body.split('\n').flatMap((line) => {
    const whole = byText.get(line);
    if (whole) return [whole];
    for (const [text, cue] of byText) {
      const head = line.endsWith(` ${text}`) ? byText.get(line.slice(0, -text.length - 1)) : undefined;
      if (head) return [head, cue];
    }
    return [];
  });
}
