// The 💡 popover: per section (current checklist item in the tutorial, then each report slot)
// three steps — ① 요약 (free) → ② 방향 → ③ 정답 (asked twice). Model: src/engine/hintpanel.ts.

import { h } from './dom.ts';
import { t } from '../i18n.ts';
import type { Game } from '../engine/game.ts';
import type { PanelSection } from '../engine/hintpanel.ts';
import { DEFAULT_ANSWER_COST } from '../engine/hintpanel.ts';
import { playRecord } from '../engine/record.ts';

export function renderHintPanel(game: Game, opts: { focus?: string; rerender: () => void }): HTMLElement {
  const senior = !!game.st.settings.senior;
  const rec = playRecord(game);
  const root = h(
    'div.hintpanel',
    null,
    h('h3', null, `💡 ${t('hint.title')}`),
    h('p.hp-intro', null, t('hint.intro')),
    // two separate counters: opening the panel is free and never counted; only 방향/정답 steps are
    h(
      'dl.hp-counts',
      null,
      h('div.hp-count.hp-opens', null, h('dt', null, t('hint.opens')), h('dd', null, t('hint.opensVal', { n: rec.panelOpens }))),
      h('div.hp-count.hp-steps', null, h('dt', null, t('hint.steps')), h('dd', null, t('hint.stepsVal', { n: rec.hints }))),
    ),
    h('p.hp-record', null, senior ? t('hint.senior', { cost: game.cs.hints.answerCost ?? DEFAULT_ANSWER_COST }) : t('hint.record')),
  );
  for (const sec of game.hintPanel()) root.appendChild(section(game, sec, opts));
  return root;
}

function section(game: Game, sec: PanelSection, opts: { focus?: string; rerender: () => void }): HTMLElement {
  const open = (rung: 'summary' | 'direction' | 'answer') => {
    game.openHint(sec.key, rung);
    opts.rerender();
  };
  const el = h(`section.hp-sec${opts.focus === sec.key ? '.focus' : ''}`, { dataset: { key: sec.key } });
  el.appendChild(h('div.hp-title', null, sec.kind === 'objective' ? h('span.hp-kind', null, t('hint.now')) : null, h('b', null, sec.title)));

  // ① 요약
  const s1 = h('div.hp-step', { dataset: { rung: 'summary' } }, h('span.hp-n', null, '①'));
  if (!sec.summaryOpen) s1.appendChild(h('button.hint-btn', { onclick: () => open('summary') }, t('hint.summary')));
  else
    s1.appendChild(
      h(
        'div.hp-body',
        null,
        h('small', null, t('hint.summaryLabel')),
        sec.summary.length ? h('ul', null, ...sec.summary.map((l) => h('li', null, l))) : h('div.muted', null, sec.kind === 'objective' ? t('hint.summaryNoneObj') : t('hint.summaryNone')),
      ),
    );
  el.appendChild(s1);

  // ② 방향
  const s2 = h('div.hp-step', { dataset: { rung: 'direction' } }, h('span.hp-n', null, '②'));
  const body2 = h('div.hp-body');
  if (sec.directions.length) body2.append(h('small', null, t('hint.directionLabel')), ...sec.directions.map((d) => h('div.hp-dir', null, d)));
  if (sec.moreDirections) body2.appendChild(h('button.hint-btn', { onclick: () => open('direction') }, sec.directions.length ? t('hint.directionMore') : t('hint.direction')));
  else if (!sec.directions.length) body2.appendChild(h('button.hint-btn', { disabled: true, title: t('hint.afterSummary') }, t('hint.direction')));
  s2.appendChild(body2);
  el.appendChild(s2);

  // ③ 정답 — asked twice: the first click arms it, the second (inline) opens it
  const s3 = h('div.hp-step', { dataset: { rung: 'answer' } }, h('span.hp-n', null, '③'));
  if (sec.answer !== null) s3.appendChild(h('div.hp-body', null, h('small', null, t('hint.answerLabel')), h('div.hp-answer', null, sec.answer)));
  else {
    const body3 = h('div.hp-body');
    const arm = h(
      'button.hint-btn.hp-arm',
      {
        disabled: !sec.answerReady,
        title: sec.answerReady ? '' : t('hint.afterDirection'),
        onclick: () => {
          body3.replaceChildren(
            h('div.hp-confirm', null, t('hint.answerConfirm')),
            h('button.hint-btn.hp-yes', { onclick: () => open('answer') }, t('hint.answerYes')),
            h('button.ghost-btn.hp-no', { onclick: () => opts.rerender() }, t('hint.answerNo')),
          );
        },
      },
      t('hint.answer'),
    );
    body3.appendChild(arm);
    s3.appendChild(body3);
  }
  el.appendChild(s3);
  return el;
}

/** Lines already opened for a report slot (shown under the slot in the report window). */
export function openedFor(game: Game, key: string): string[] {
  const sec = game.hintPanel().find((s) => s.key === key);
  if (!sec) return [];
  return [...sec.directions.map((d) => `② ${d}`), ...(sec.answer !== null ? [`③ ${sec.answer}`] : [])];
}
