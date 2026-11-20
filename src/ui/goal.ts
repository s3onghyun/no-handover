// "이번 사건에서 밝혀낼 것" card: the report's slots as questions, no answers (src/engine/goal.ts).
import { goalLines } from '../engine/goal.ts';
import type { CaseFile } from '../engine/types.ts';
import { h } from './dom.ts';
import { t } from '../i18n.ts';

export function goalCard(cs: CaseFile): HTMLElement {
  const g = goalLines(cs);
  const ol = h('ol.goal-list');
  for (const it of g.items) ol.appendChild(h('li', null, h('b', null, it.title), h('span', null, it.prompt), it.multi ? h('small.muted', null, ` (${t('goal.multi')})`) : null));
  return h('section.goal', { 'aria-label': t('goal.title') }, h('h3', null, `🎯 ${t('goal.title')}`), h('p.goal-intro', null, g.intro), ol);
}
