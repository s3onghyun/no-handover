// Audio cue manifest: cue id -> files. The ids match data/infra-mystery-game/audio-cues.md
// (the cue sheet main firstmate produces the assets from). Every `src` list is empty for now:
// drop the files into public/audio/<folder>/ and list them here, ogg/opus first, mp3 fallback, e.g.
//   src: ['audio/music/amb.office.ogg', 'audio/music/amb.office.mp3']
// A cue with no playable file falls back to its `placeholder`: a tiny generated WebAudio sound
// (so the UI reacts now) or silence.

export type VolumeClass = 'music' | 'ambience' | 'voice' | 'sfx' | 'ui';

/** Generated stand-ins, see src/audio/audio.ts `synth`. */
export type Placeholder = 'silence' | 'ding' | 'mail' | 'ring' | 'tick' | 'done' | 'error' | 'click' | 'pin';

export interface CueDef {
  /** Files to try in order (paths relative to the site root, i.e. public/). Empty = not produced yet. */
  src: string[];
  class: VolumeClass;
  loop?: boolean;
  /** Per-cue gain on top of the class gain (0..1, default 1). */
  gain?: number;
  placeholder: Placeholder;
  /** Where it plays (for the cue sheet and for humans). */
  where: string;
}

export const MANIFEST = {
  // ---------------------------------------------------------------- music / ambience
  'amb.office': { src: [], class: 'ambience', loop: true, gain: 0.7, placeholder: 'silence', where: '데스크톱 내내 (브리핑 뒤 시작)' },
  'music.briefing': { src: [], class: 'music', placeholder: 'silence', where: '오프닝 브리핑 시작 (잠금 화면 → 음성 메시지)' },
  'music.reveal': { src: [], class: 'music', placeholder: 'silence', where: '보고서 정답 → 해설 화면' },
  'music.tension': { src: [], class: 'music', loop: true, gain: 0.5, placeholder: 'silence', where: '게임 시계 18:00 이후 또는 첫 오답 뒤 (선택)' },
  // ---------------------------------------------------------------- voice
  'voice.briefing-jihun': { src: [], class: 'voice', placeholder: 'silence', where: '오프닝: 지훈의 음성 메시지 (자막과 함께)' },
  'voice.nudge-idle-1': { src: [], class: 'voice', placeholder: 'silence', where: '2단 넛지 idle-1 (지훈) 도착 시 (선택)' },
  'voice.nudge-idle-2': { src: [], class: 'voice', placeholder: 'silence', where: '2단 넛지 idle-2 (서진) 도착 시 (선택)' },
  'voice.nudge-idle-3': { src: [], class: 'voice', placeholder: 'silence', where: '2단 넛지 idle-3 (지훈) 도착 시 (선택)' },
  'voice.nudge-idle-4': { src: [], class: 'voice', placeholder: 'silence', where: '2단 넛지 idle-4 (서진) 도착 시 (선택)' },
  // ---------------------------------------------------------------- sfx
  'sfx.ring': { src: [], class: 'sfx', placeholder: 'ring', where: '오프닝: 음성 메시지 카드가 뜰 때 (휴대폰 진동/메신저 콜)' },
  'sfx.typing': { src: [], class: 'sfx', loop: true, gain: 0.5, placeholder: 'silence', where: '오프닝: 음성 파일이 없을 때 자막이 타이핑되는 동안 (루프)' },
  'sfx.ding': { src: [], class: 'ui', placeholder: 'ding', where: '메신저 새 메시지 (넛지·트리거)' },
  'sfx.mail': { src: [], class: 'ui', placeholder: 'mail', where: '새 메일 알림 (오프닝의 CTO 메일 포함)' },
  'sfx.error': { src: [], class: 'ui', gain: 0.6, placeholder: 'error', where: '터미널: 없는 명령·차단·문법 오류' },
  'sfx.key': { src: [], class: 'ui', gain: 0.4, placeholder: 'silence', where: '터미널: Enter로 명령 실행 (선택, 기본 무음)' },
  'sfx.tick': { src: [], class: 'ui', placeholder: 'tick', where: '오늘 할 일 체크 하나' },
  'sfx.done': { src: [], class: 'ui', placeholder: 'done', where: '오늘 할 일 세 개 완료 → 메모장으로 접힘' },
  'sfx.pin': { src: [], class: 'ui', gain: 0.7, placeholder: 'pin', where: '증거 보드에 핀' },
  'sfx.window-open': { src: [], class: 'ui', gain: 0.5, placeholder: 'silence', where: '창 열기 (선택)' },
  'sfx.window-close': { src: [], class: 'ui', gain: 0.5, placeholder: 'silence', where: '창 닫기 (선택)' },
  'sfx.pulse': { src: [], class: 'ui', gain: 0.35, placeholder: 'silence', where: '첫 클릭 유도: 터미널 펄스와 함께 한 번 (선택)' },
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
