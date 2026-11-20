// "이번 사건에서 밝혀낼 것": the goal card. It lists the report's slots (title + question) and
// never an answer, so it can be shown from the first second (docs/case-format.md §8).

import type { CaseFile } from './types.ts';

export interface GoalCard {
  intro: string;
  items: { title: string; prompt: string; multi: boolean }[];
  submissions: number;
}

export function goalLines(cs: CaseFile): GoalCard {
  const n = cs.accusation.maxSubmissions;
  const intro = cs.goal?.intro ?? `보고서 ${cs.accusation.slots.length}칸을 채우면 사건이 끝나요.${n ? ` 제출은 ${n}번까지.` : ' 제출은 몇 번이든.'}`;
  return {
    intro,
    items: cs.accusation.slots.map((s) => ({ title: s.title, prompt: s.prompt, multi: s.type === 'multi' })),
    submissions: n,
  };
}
