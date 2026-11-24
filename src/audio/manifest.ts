// Audio cue manifest: cue id -> how to sound it. The ids match the maintainer's cue sheet
// (design notes, not in this repo), which the music and voice are produced from.
//
// Resolution order, per cue, every time it plays (src/audio/audio.ts):
//   1. a file: `src`, or for a cue marked `file: true` public/audio/<folder>/<id>.ogg and .mp3,
//      where <folder> is music (amb.*, music.*), voice (voice.*) or sfx (sfx.*). Only shipped files
//      are requested (no 404s): drop the .ogg and .mp3 in and mark the cue `file: true`;
//      tests/audio.test.ts fails when a marked file is missing or a file is dropped without the mark.
//      A session fetches one of the two: .ogg (Opus) when the browser plays it, else .mp3 (audio.ts).
//   2. `zzfx`: a sound synthesised in the browser with ZzFX (src/audio/vendor/zzfx.ts, MIT).
//   3. `synth`: a longer procedural sound (amb.office → src/audio/roomtone.ts, seamless loop).
//   4. silence.
//
// A case's page loads only the music it plays and its own voices (src/engine/voices.ts caseManifest):
// music.reveal where a case ends on its debrief.
//
// Music never loops by default (stings are one-shots, web-escape analysis §9 item 8): a `music.*`
// cue marked `loop` only loops with `?music=loop`; ambience is the only bed under the desktop.
//
// The `zzfx` arrays are the 21 ZzFX parameters (see the table in vendor/zzfx.ts) and paste
// straight into / out of the ZzFX designer at https://killedbyapixel.github.io/ZzFX/ .
// Change the numbers here to retune a sound; no other code changes. Index 0 is the volume:
// tests/zzfx.test.ts keeps every UI cue's peak between -18 and -12 dBFS at full volume.
//
// The UI set is one family: sine voices, 2-6 ms attack, a short decay to 60 % and a quick
// release, low-passed (filter < 0) so nothing is sharp. Variation comes from pitch and `hits`.

import type { ZzfxParams } from './vendor/zzfx.ts';

export type VolumeClass = 'music' | 'ambience' | 'voice' | 'sfx' | 'ui';

/** One strike of the cue's zzfx sound: start time (s), gain (default 1), pitch shift (semitones, default 0). */
export type ZzfxHit = [at: number, gain?: number, semitones?: number];

export interface CueDef {
  /** Files to try in order (paths relative to the site root, i.e. public/). Default: see cueFiles(). */
  src?: string[];
  /** Ships audio/<folder>/<id>.ogg and .mp3 (see cueFiles). Unmarked cues without `src` fetch nothing. */
  file?: boolean;
  class: VolumeClass;
  loop?: boolean;
  /** Per-cue gain on top of the class gain (0..1, default 1). Applies to files and zzfx alike. */
  gain?: number;
  /** ZzFX parameters used when no file plays. Omitted = silence. */
  zzfx?: ZzfxParams;
  /** Strike the zzfx sound several times (chords, arpeggios, double buzz). Default: once at 0. */
  hits?: ZzfxHit[];
  /** Loop length in seconds for a looping zzfx cue (hits past the end wrap around). */
  loopLen?: number;
  /** Procedural stand-in when there is no file and no zzfx (see roomtone.ts). */
  synth?: 'roomtone';
  /** Where it plays (for the cue sheet and for humans). */
  where: string;
}

// prettier-ignore
export const MANIFEST = {
  // ---------------------------------------------------------------- music / ambience (files only)
  'amb.office': { class: 'ambience', file: true, loop: true, gain: 0.7, synth: 'roomtone', where: '데스크톱 내내 (브리핑 뒤 시작). 파일이 없으면 합성 방 톤 (갈색 잡음 + 저역 필터 + 느린 패드)' },
  'music.briefing': { class: 'music', file: true, where: '오프닝 브리핑 시작 (잠금 화면 → 음성 메시지)' },
  'music.finale': { class: 'music', file: true, where: 'Case 4 피날레: 인수인계서 v5를 넘기는 순간부터 크레디트 끝까지 (Case 4만)' },
  'music.reveal': { class: 'music', file: true, where: '보고서 끝 (정답 또는 제출 소진) → 마지막 장면 → 해설 화면 (Case 0~3)' },
  'music.tension': { class: 'music', loop: true, gain: 0.5, where: '게임 시계 18:00 이후 또는 첫 오답 뒤 (선택, ?music=loop 일 때만 루프)' },
  // voice.*: one entry per colleague line, generated per case by src/engine/voices.ts (voiceManifest)
  // ---------------------------------------------------------------- physical sfx: CC0 files later, zzfx until then
  //                                      vol   rnd  freq  att   sus  rel  shp crv slide dsl pj pjt  rep noise mod crush dly susV decay trem filter
  'sfx.ring': { class: 'sfx', zzfx: [0.14, 0, 150, .01, .24, .05, 2, 1, 0, 0, 0, 0, .03, 0, 0, 0, 0, 1, 0, .6, -650], hits: [[0], [0.42]],
    where: '오프닝: 음성 메시지 카드가 뜰 때 (휴대폰 진동/메신저 콜)' },
  'sfx.typing': { class: 'sfx', loop: true, gain: 0.5, loopLen: 1.6,
    zzfx: [0.17, 0, 1700, .001, 0, .022, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, -5000],
    hits: [[0, 1, 0], [.13, .7, -2], [.27, .9, 1], [.38, .6, -1], [.55, .85, 0], [.66, .7, 2], [.8, 1, -3], [.93, .65, 0], [1.08, .9, 1], [1.21, .75, -2], [1.37, .8, 0]],
    where: '오프닝: 음성 파일이 없을 때 자막이 타이핑되는 동안 (루프)' },
  // ---------------------------------------------------------------- UI set (zzfx; a file in public/audio/sfx/ overrides)
  'sfx.ding': { class: 'ui', zzfx: [0.22, .02, 880, .004, .02, .22, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .6, .04, 0, -4000], hits: [[0, 1, 0], [.09, .85, 7]],
    where: '메신저 새 메시지 (넛지·트리거)' },
  'sfx.mail': { class: 'ui', zzfx: [0.22, .02, 587, .006, .04, .3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .6, .05, 0, -2600], hits: [[0, 1, 0], [.13, .8, 5]],
    where: '새 메일 알림 (오프닝의 CTO 메일 포함)' },
  'sfx.error': { class: 'ui', zzfx: [0.23, .02, 165, .003, .03, .09, 1, 1, -1, 0, 0, 0, 0, 0, 0, 0, 0, .6, .02, 0, -900],
    where: '터미널: 없는 명령·차단·문법 오류' },
  'sfx.key': { class: 'ui', zzfx: [0.09, .05, 1800, .001, 0, .02, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, -6000],
    where: '터미널: Enter로 명령 실행 (아주 작게)' },
  // terminal typing: three key-click variants, one picked at random per key press, slightly panned
  'sfx.key-1': { class: 'ui', zzfx: [0.07, .05, 2100, .001, 0, .012, 0, 1, 0, 0, 0, 0, 0, 1.6, 0, 0, 0, 1, 0, 0, -6500],
    where: '터미널: 글자 입력 (키 클릭 1)' },
  'sfx.key-2': { class: 'ui', zzfx: [0.07, .05, 1500, .001, 0, .016, 0, 1, 0, 0, 0, 0, 0, 2.2, 0, 0, 0, 1, 0, 0, -5200],
    where: '터미널: 글자 입력 (키 클릭 2, 조금 낮게)' },
  'sfx.key-3': { class: 'ui', zzfx: [0.06, .05, 2600, .001, 0, .010, 0, 1, 0, 0, 0, 0, 0, 1.2, 0, 0, 0, 1, 0, 0, -7000],
    where: '터미널: 글자 입력 (키 클릭 3, 가볍게)' },
  'sfx.tick': { class: 'ui', zzfx: [0.25, .03, 1568, .002, .01, .07, 0, 1, 8, 0, 0, 0, 0, 0, 0, 0, 0, .6, .02, 0, -6000], hits: [[0, 1, 0], [.05, .6, 12]],
    where: '오늘 할 일 체크 하나' },
  'sfx.done': { class: 'ui', zzfx: [0.16, .02, 784, .004, .02, .32, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .6, .05, 0, -5000], hits: [[0, 1, 0], [.075, .9, 4], [.15, .85, 7], [.225, .9, 12]],
    where: '오늘 할 일 세 개 완료 → 메모장으로 접힘' },
  'sfx.pin': { class: 'ui', zzfx: [0.22, .03, 1050, .001, 0, .05, 0, 1, -6, 0, 0, 0, 0, .1, 0, 0, 0, 1, 0, 0, -5000], hits: [[0, 1, 0], [0, .6, -19]],
    where: '증거 보드에 핀' },
  'sfx.window-open': { class: 'ui', zzfx: [0.22, .02, 520, .004, .01, .09, 0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, .6, .02, 0, -4000],
    where: '창 열기' },
  'sfx.window-close': { class: 'ui', zzfx: [0.22, .02, 560, .004, .01, .09, 0, 1, -2, 0, 0, 0, 0, 0, 0, 0, 0, .6, .02, 0, -4000],
    where: '창 닫기' },
  'sfx.wilt': { class: 'sfx', zzfx: [0.2, 0, 220, .02, .25, .6, 0, 1.6, -0.6, 0, 0, 0, 0, 0, 0, 0, 0, .5, .1, 0, -900],
    where: 'Case 4 숨은 배드 엔딩: crontab -r 뒤 "몬스테라가 시들었습니다" (낮게 가라앉는 한 음)' },
  'sfx.pulse': { class: 'ui', zzfx: [0.25, 0, 196, .18, .12, .5, 0, 1, 0, 0, 0, 0, .25, 0, 0, 0, 0, .8, 0, .15, -1200], hits: [[0, 1, 0], [0, .5, 12]],
    where: '첫 클릭 유도: 터미널 펄스와 함께 한 번' },
} satisfies Record<string, CueDef>;

export type CueId = keyof typeof MANIFEST;

/** Default mix per class (0..1), multiplied by the master volume. */
export const CLASS_GAIN: Record<VolumeClass, number> = {
  music: 0.55,
  ambience: 0.35,
  voice: 1,
  sfx: 0.8,
  ui: 0.6,
};

/** Folder under public/audio/ for a cue id. */
export function cueFolder(id: string): 'music' | 'voice' | 'sfx' {
  return id.startsWith('voice.') ? 'voice' : id.startsWith('sfx.') ? 'sfx' : 'music';
}

/** Files to try for a cue, in order: the explicit `src`, else audio/<folder>/<id>.ogg and .mp3 if it ships them, else none. */
export function cueFiles(id: string, cue: CueDef): string[] {
  if (cue.src) return cue.src;
  if (!cue.file) return [];
  const stem = `audio/${cueFolder(id)}/${id}`;
  return [`${stem}.ogg`, `${stem}.mp3`];
}
