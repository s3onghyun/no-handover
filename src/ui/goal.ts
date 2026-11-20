// "이번 사건에서 밝혀낼 것" card: the report's slots as questions, no answers (src/engine/goal.ts),
// and per slot how many of its evidence kinds have a pin ("원인 증거 1/2"). Kinds are neutral
// types, so the progress never names a finding.
import { goalLines } from '../engine/goal.ts';
import { slotProgress, type PinLike } from '../engine/evidence.ts';
import { slotName } from '../engine/scoring.ts';
import type { CaseFile } from '../engine/types.ts';
import { h } from './dom.ts';
import { t } from '../i18n.ts';

export function goalCard(cs: CaseFile, pins: PinLike[] = []): HTMLElement {
  const g = goalLines(cs);
  const progress = new Map(slotProgress(cs, pins).map((p) => [p.slot.id, p]));
  const ol = h('ol.goal-list');
  cs.accusation.slots.forEach((slot, i) => {
    const it = g.items[i];
    const p = progress.get(slot.id);
    const ev = p
      ? h(
          `div.goal-ev${p.ready ? '.ready' : ''}`,
          { dataset: { slot: slot.id }, title: p.kinds.map(({ kind, pins: ps }) => `${ps.length ? '✓' : '○'} ${kind.label}`).join('\n') },
          `${p.ready ? '✓' : '○'} ${t('goal.evidence', { slot: slotName(slot), n: String(p.met), total: String(p.kinds.length) })}`,
        )
      : null;
    ol.appendChild(h('li', null, h('b', null, it.title), h('span', null, it.prompt), it.multi ? h('small.muted', null, ` (${t('goal.multi')})`) : null, ev));
  });
  return h(
    'section.goal',
    { 'aria-label': t('goal.title') },
    h('h3', null, `🎯 ${t('goal.title')}`),
    h('p.goal-intro', null, g.intro),
    ol,
    progress.size ? h('p.goal-evnote.muted', null, t('goal.evidenceNote')) : null,
  );
}
