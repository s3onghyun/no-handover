// The play record: hints used, time, commands. Hints are a record, not a penalty (web-escape
// analysis §9 item 6): the debrief and the shareable result card show "힌트 단계 N개 · 소요 · 명령 수"
// and a "힌트 단계 0" badge. Only 숙련자 모드 (`?senior=1`, src/engine/expert.ts) takes hint cost off the score.
//
// Two numbers that must never be mixed up (playtest: opening the panel looked like a penalty):
// `hints` = 힌트 단계 used (방향 + 정답, the only thing recorded), `panelOpens` = how often the 💡
// panel was opened (shown as "세지 않음", never part of the record line or the badge).
//
// The result card carries no spoilers (§9 item 14): case title and numbers only, never the cause,
// the answer options, clue text or the debrief.

import type { Game } from './game.ts';

export interface PlayRecord {
  solved: boolean;
  finished: boolean;
  /** Play time until the case finished (or until now). */
  playMs: number;
  /** Terminal commands run until then. */
  commands: number;
  /** 힌트 단계 used: 💡 방향 + 정답 steps (요약 and opening the panel are free and not counted). */
  hints: number;
  /** Times the 💡 panel was opened (tray, report slot, `hint`). Shown, never counted. */
  panelOpens: number;
  /** Times the player asked a colleague (rung 2 on request; free). */
  asks: number;
  submissions: number;
  senior: boolean;
}

type GameLike = Pick<Game, 'st' | 'ladder'>;

export function playRecord(g: GameLike): PlayRecord {
  const L = g.st.log;
  const fin = L.find((e) => e.type === 'finish');
  const until = fin ? fin.t : Infinity;
  return {
    solved: g.st.submissions.some((s) => s.score.allCorrect),
    finished: g.st.finished,
    playMs: fin ? fin.t : Math.round(g.st.playMs),
    commands: L.filter((e) => e.type === 'cmd' && e.t <= until).length,
    hints: g.ladder.hintCount(),
    panelOpens: L.filter((e) => e.type === 'hint-panel' && e.t <= until).length,
    asks: g.ladder.state.asked?.length ?? 0,
    submissions: g.st.submissions.length,
    senior: !!g.st.settings.senior,
  };
}

/** '12분 05초', '48초'. */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}분 ${String(s % 60).padStart(2, '0')}초` : `${s}초`;
}

/** '힌트 단계 1개 · 12분 05초 · 명령 23개' (panel opens are not part of the record). */
export function recordLine(r: PlayRecord): string {
  return `힌트 단계 ${r.hints}개 · ${fmtDuration(r.playMs)} · 명령 ${r.commands}개`;
}

export interface ResultCard {
  game: string;
  gameKo: string;
  caseLabel: string;
  caseTitle: string;
  /** '인수인계 완료' when solved, else '제출 기회를 모두 씀'. */
  headline: string;
  stats: { label: string; value: string }[];
  /** '힌트 단계 0' when solved without a single 💡 방향/정답 step, else null. */
  badge: string | null;
  mode: string | null;
  footer: string;
}

export function resultCard(g: GameLike & Pick<Game, 'cs'>, caseLabel: string): ResultCard {
  const r = playRecord(g);
  return {
    game: 'No Handover',
    gameKo: '인수인계 없음',
    caseLabel,
    caseTitle: g.cs.title,
    headline: r.solved ? '인수인계 완료' : '제출 기회를 모두 씀',
    stats: [
      { label: '소요', value: fmtDuration(r.playMs) },
      { label: '명령', value: `${r.commands}개` },
      { label: '힌트 단계', value: `${r.hints}개` },
      { label: '제출', value: `${r.submissions}회` },
    ],
    badge: r.solved && r.hints === 0 ? '힌트 단계 0' : null,
    mode: r.senior ? '숙련자 모드' : null,
    footer: '정답은 직접 찾아보세요 — 스포일러 없는 기록 카드',
  };
}
