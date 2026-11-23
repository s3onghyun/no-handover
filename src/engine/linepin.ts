// Pinning one terminal line: which host and command printed it (the pin keeps that context), and
// whether the line may carry the "이 줄은 단서가 될 수 있어요" mark. Pure functions over a tab's
// lines (no DOM), shared by the terminal, the "보고서에는 이 줄을 핀하세요" prompt and the tests.
//
//   lineContext(lines, i, fallback) -> { host, cmd, source }   source = 'wiki-01 · df -h'
//   clueMark(game, line, afterCommand) -> 'strong' | 'subtle' | null
//   nextRun(keys, i, dir)               -> index of the next marked run's first line, or -1

import type { CaseFile } from './types.ts';
import type { OutLine } from './shell.ts';

export interface LineContext {
  /** Host the command ran on (from its prompt, so lines printed before an `ssh` keep their host). */
  host: string;
  /** The command as typed; '' for lines above every command (the frozen screen). */
  cmd: string;
  /** What the board shows and pins are told apart by: 'wiki-01 · df -h', or the tab label. */
  source: string;
}

const PROMPT = /^[^@\s]+@([^:\s]+):\S*[$#] ?(.*)$/;

/** Host and command of a command echo ('eunjae@wiki-01:~$ df -h'), or null for another line. */
export function parsePrompt(text: string): { host: string; cmd: string } | null {
  const m = PROMPT.exec(text);
  return m ? { host: m[1], cmd: m[2].replace(/\^C$/, '') } : null;
}

/** The command that printed `lines[i]`: the nearest command echo above it. */
export function lineContext(lines: OutLine[], i: number, fallback: { host: string; label: string }): LineContext {
  for (let j = i - 1; j >= 0; j--) {
    if (lines[j].cls !== 'sys') continue;
    const p = parsePrompt(lines[j].text);
    if (p) return { host: p.host, cmd: p.cmd, source: `${p.host} · ${p.cmd}` };
  }
  return { host: fallback.host, cmd: '', source: fallback.label };
}

/** True when some command echo comes before `lines[i]` (it is a command's output, not the frozen screen). */
export function afterCommand(lines: OutLine[], i: number): boolean {
  for (let j = i - 1; j >= 0; j--) if (lines[j].cls === 'sys') return true;
  return false;
}

export interface MarkGame {
  cs: CaseFile;
  st: { clues: Record<string, { via: string }>; settings: { senior?: boolean } };
  cluesFor(text: string): string[];
}

/**
 * How a terminal line is marked:
 *  - 'strong': the tutorial's yellow clue marker (Case 0, `rail.highlightClues`);
 *  - 'subtle': "이 줄은 단서가 될 수 있어요" — a faint edge, never the answer: any clue counts,
 *    red herrings included;
 *  - null: a plain line.
 * Only plain output printed by a command the player ran (never the frozen screen, a game note, an
 * error or the command echo), only for a clue that a command has already found (so never before the
 * player ran a command that shows it), and never in 숙련자 모드 (no unasked help there).
 */
export function clueMark(g: MarkGame, line: OutLine, isAfterCommand: boolean): 'strong' | 'subtle' | null {
  if (g.st.settings.senior || !isAfterCommand || line.cls || !line.text.trim()) return null;
  const ids = g.cluesFor(line.text);
  if (!ids.some((id) => String(g.st.clues[id]?.via ?? '').startsWith('cmd:'))) return null;
  return g.cs.rail?.highlightClues ? 'strong' : 'subtle';
}

/**
 * Picking lines with Shift+↑/↓ or 「⇡ 단서」: from line `i` (keys.length = none picked yet), the first
 * line of the next run of marked lines in direction `dir`. `keys[j]` is line j's clue ids ('' = not
 * marked). A run is marked lines that prove the same clues with only plain lines between them, so a
 * stats line repeated fifty times, or the same error after every restart, is one stop. Returns -1
 * when there is none.
 */
export function nextRun(keys: string[], i: number, dir: -1 | 1): number {
  /** The first line of the run that marked line j belongs to. */
  const top = (j: number) => {
    let t = j;
    for (let k = j - 1; k >= 0; k--) {
      if (!keys[k]) continue;
      if (keys[k] !== keys[j]) break;
      t = k;
    }
    return t;
  };
  const here = i >= 0 && i < keys.length && keys[i] ? top(i) : -1;
  for (let j = i + dir; j >= 0 && j < keys.length; j += dir) if (keys[j] && top(j) !== here) return top(j);
  return -1;
}
