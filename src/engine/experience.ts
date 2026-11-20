// First-run choice "터미널이 익숙해요 / 처음이에요": asked once per profile on the lock screen
// (src/main.ts), changeable later in ❓, asked again after `?fresh=1`.
//
// - 'new' (처음이에요) = the Case 0 tool tour as designed: one coach mark per tool, windows such
//   as the memo page open by themselves when a scene calls for it.
// - 'familiar' (터미널이 익숙해요) = the tour is collapsed into a small "도구 안내 보기" entry and no
//   window opens by itself (the toast that goes with it still offers to open it); in every case
//   that includes the terminal at the start. In the guided cases (0–2, the ones with a 숙련자 모드
//   overlay) the "오늘 할 일" sticky keeps the goal line and the count but folds its numbered steps
//   away behind "단계 보기"; 숙련자 모드 (src/engine/expert.ts) builds on this and drops the sticky there.
//
// Kept per profile, not per case: one localStorage record shared by every case.

export type Experience = 'familiar' | 'new';

export const EXPERIENCE_KEY = 'no-handover:experience';

/** The stored choice, or null when the player has not been asked yet (or the record is unreadable). */
export function parseExperience(raw: string | null | undefined): Experience | null {
  return raw === 'familiar' || raw === 'new' ? raw : null;
}

/** Ask on the lock screen only for a profile that has not chosen and is not resuming a started case. */
export function shouldAskExperience(stored: Experience | null, resumable: boolean): boolean {
  return stored === null && !resumable;
}

/** What a choice turns on or off (src/ui/tour.ts, src/main.ts). Unknown = the original behaviour. */
export function experienceRules(e: Experience | null): { coachMarks: boolean; autoWindows: boolean; steps: boolean } {
  const familiar = e === 'familiar';
  return { coachMarks: !familiar, autoWindows: !familiar, steps: !familiar };
}
