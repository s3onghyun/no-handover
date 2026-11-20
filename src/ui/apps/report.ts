import { clear, h, storage } from '../dom.ts';
import { t } from '../../i18n.ts';
import type { AppDef, UiCtx } from '../wm.ts';
import type { Submission } from '../../engine/scoring.ts';
import { complete, grade, wrongReply } from '../../engine/scoring.ts';
import { playRecord, recordLine, resultCard } from '../../engine/record.ts';
import { openedFor } from '../hintpanel.ts';
import { drawResultCard, downloadResultCard } from '../resultcard.ts';

function debrief(root: HTMLElement, ctx: UiCtx): void {
  const g = ctx.game;
  const d = g.cs.debrief;
  const last = g.st.submissions[g.st.submissions.length - 1];
  const s = last.score;
  const farewell = g.cs.notes.find((n) => n.highlight !== undefined);
  const rec = playRecord(g);
  const senior = rec.senior;
  const card = resultCard(g, ctx.caseLabel ?? '');
  const canvas = h('canvas.resultcard', { 'aria-label': `${card.caseLabel} ${card.caseTitle} — ${recordLine(rec)}` }) as HTMLCanvasElement;
  drawResultCard(canvas, card);
  root.appendChild(
    h(
      'div.debrief',
      null,
      h('p.muted', null, `${t('debrief.title')} · ${g.cs.title}`),
      h('h2', null, d.headline),
      h(
        'div.record',
        null,
        h('span.rec-label', null, t('debrief.record')),
        h('span.rec-line', null, recordLine(rec)),
        rec.solved && rec.hints === 0 ? h('span.badge-nohint', null, `💡 ${t('debrief.badge')}`) : null,
        senior ? h('span.rec-senior', null, t('debrief.senior')) : null,
        rec.panelOpens ? h('span.rec-panel', null, t('debrief.panelNote', { n: rec.panelOpens })) : null,
      ),
      h(
        'div.scorebox',
        null,
        h('div.s.grade', null, t('debrief.score'), h('b', null, grade(s.total, s.max))),
        h('div.s', null, '합계', h('b', null, `${s.total} / ${s.max}`)),
        ...g.cs.accusation.slots.map((slot) => h('div.s', null, slot.title.split(' ')[0], h('b', null, `${s.slots[slot.id]?.correct ? '✓' : '✗'} ${s.slots[slot.id]?.points ?? 0}`))),
        h('div.s', null, `제출 ×${s.multiplier}`, h('b', null, `${g.st.submissions.length}회`)),
        h('div.s', null, t('report.evidence'), h('b', null, `+${s.evidenceBonus}`)),
        senior ? h('div.s', null, t('debrief.steps'), h('b', null, `−${s.hintCost}`)) : h('div.s', null, t('debrief.steps'), h('b', null, `${rec.hints}개`)),
      ),
      h(
        'div.cardbox',
        null,
        canvas,
        h(
          'div.cardside',
          null,
          h('p.muted', null, t('debrief.cardNote')),
          h('button.primary-btn.card-dl', { onclick: () => downloadResultCard(canvas, `no-handover-${g.cs.id}.png`) }, `🖼 ${t('debrief.card')}`),
        ),
      ),
      s.allCorrect ? null : h('p', { style: 'color:var(--warn)' }, '제출 기회를 모두 썼다. 아래가 실제로 일어난 일이다.'),
      h('h3', null, t('debrief.memo')),
      farewell
        ? h(
            'div.memo-scene',
            null,
            h('div', null, farewell.title),
            ...farewell.lines.map((l, i) => h(i === farewell.highlight ? 'div.hl' : 'div', null, l)),
            farewell.reveal ? h('div.reveal', null, farewell.reveal) : null,
          )
        : null,
      d.cast?.length
        ? [
            h('h3', null, '사람들 — 결함은 있어도 악역은 없다'),
            h(
              'div.cast',
              null,
              ...d.cast.map((c) => {
                const p = g.cs.people[c.who];
                return h('div.castcard', null, p?.portrait ? h('img', { src: p.portrait, alt: p.name, loading: 'lazy' }) : ctx.avatar(c.who, 96), h('div', null, h('b', null, p?.name ?? c.who), h('div.muted', { style: 'font-size:12px' }, p?.role ?? ''), h('p', null, c.text)));
              }),
            ),
          ]
        : null,
      h('h3', null, t('debrief.story')),
      h('ul.story', null, ...d.story.map((x) => h('li', null, h('div.at', null, x.at), x.text))),
      h('h3', null, t('debrief.factors')),
      h('ul', null, ...d.systemFactors.map((f) => h('li', null, f))),
      h('h3', null, t('debrief.principle')),
      h('div.principle', null, d.principle),
      h('h3', null, t('debrief.cards')),
      h('div.cards', null, ...d.cards.map((c) => h('div.cmdcard', null, h('b', null, c.title), h('code', null, c.cmd), h('p', null, c.explain)))),
      h('h3', null, '도윤'),
      h('p', null, `“${d.doyunLine}”`),
      nextBox(ctx),
      h(
        'div.submitbar',
        { style: 'margin-top:18px' },
        h('button.ghost-btn', { onclick: () => ctx.wm.open('mail', d.closingMail) }, `✉ ${replyLabel(ctx)}`),
        h('button.ghost-btn', { onclick: () => ctx.wm.open('playtest') }, `📋 ${t('pt.save')}`),
        h('button.ghost-btn', { onclick: () => document.dispatchEvent(new CustomEvent('nh-reset')) }, `↺ ${t('debrief.again')}`),
      ),
    ),
  );
}

/** "<who>의 회신" for the case (case 3: the CTO; the tutorial: Doyun's mentor). */
function replyLabel(ctx: UiCtx): string {
  const r = ctx.game.cs.accusation.reply;
  return r ? t('report.replyFrom', { who: r.from }) : t('report.reply');
}

/** Debrief footer: the next case of the campaign, when there is one. */
function nextBox(ctx: UiCtx): HTMLElement | null {
  const next = ctx.nextCase?.();
  if (!next) return null;
  return h('div.nextcase', null, h('button.primary-btn', { onclick: () => next.go() }, `${t('debrief.next')} → ${next.label}`));
}

export const reportApp: AppDef = {
  id: 'report',
  title: () => t('app.report'),
  icon: '📝',
  w: 860,
  h: 640,
  x: 160,
  y: 20,
  mount(body, ctx) {
    const g = ctx.game;
    const key = `no-handover:report:${g.cs.id}`;
    let sub: Submission = { cause: null, sequence: null, responsibility: [] };
    try {
      sub = { ...sub, ...JSON.parse(storage.get(key) ?? '{}') };
    } catch {
      /* ignore */
    }
    const root = h('div.report');
    body.appendChild(root);
    let lastReply: string | null = null;

    const save = () => storage.set(key, JSON.stringify(sub));

    const render = () => {
      clear(root);
      if (g.st.finished) {
        debrief(root, ctx);
        root.scrollTop = 0;
        return;
      }
      root.appendChild(h('p.intro', null, g.cs.accusation.intro ?? t('report.intro')));
      for (const slot of g.cs.accusation.slots) {
        const hints = openedFor(g, slot.id);
        const box = h(
          'section.slot',
          null,
          h(
            'h3',
            null,
            slot.title,
            h('button.hint-btn', { title: t('hint.title'), onclick: () => document.dispatchEvent(new CustomEvent('nh-hint', { detail: slot.id })) }, t('hint.slot')),
          ),
          h('div.prompt', null, slot.prompt),
        );
        for (const o of slot.options) {
          const checked = slot.type === 'single' ? sub[slot.id as 'cause' | 'sequence'] === o.id : sub.responsibility.includes(o.id);
          const inp = h('input', {
            type: slot.type === 'single' ? 'radio' : 'checkbox',
            name: `slot-${slot.id}`,
            checked,
            onchange: (e: Event) => {
              const on = (e.target as HTMLInputElement).checked;
              if (slot.type === 'single') (sub as unknown as Record<string, string | null>)[slot.id] = o.id;
              else sub.responsibility = on ? [...new Set([...sub.responsibility, o.id])] : sub.responsibility.filter((x) => x !== o.id);
              save();
            },
          });
          box.appendChild(h('label.opt', null, inp, h('span', null, o.text)));
        }
        for (const ht of hints) box.appendChild(h('div.hintbox', null, `💡 ${ht}`));
        root.appendChild(box);
      }
      const left = g.submissionsLeft();
      const max = g.cs.accusation.maxSubmissions;
      const leftText = max > 0 ? `${t('report.left')} ${left}/${max}` : t('report.unlimited');
      root.appendChild(
        h(
          'div.submitbar',
          null,
          h(
            'button.primary-btn',
            {
              disabled: left <= 0,
              onclick: () => {
                if (!complete(g.cs, sub)) {
                  alert(t('report.need'));
                  return;
                }
                if (!confirm(t('report.confirm'))) return;
                const r = g.submit(sub);
                if (!r) return;
                if (!r.allCorrect && !g.st.finished) {
                  const rp = g.cs.accusation.reply;
                  const count = max > 0 ? ` (${g.st.submissions.length}/${max})` : ` (${g.st.submissions.length})`;
                  // main cases: "어딘가 틀렸다" only (which slot stays hidden); the tutorial counts the wrong slots
                  const body = wrongReply(g.cs, r, { partial: t('report.partial'), bundled: t('report.bundled') });
                  lastReply = `${replyLabel(ctx)}${count}\n\n${body}\n\n${rp ? rp.sign : '오미래 드림 / CTO'}`;
                }
                render();
              },
            },
            `${t('report.submit')} (${leftText})`,
          ),
          h('span.muted', null, `★ ${t('report.evidence')}: +${Math.min(30, g.pinnedKeyClues() * 5)} · ${g.st.settings.senior ? t('report.hintsSenior', { n: g.ladder.totalCost() }) : t('report.hints', { n: g.hintCount() })}`),
        ),
      );
      if (lastReply) root.appendChild(h('div.reply', null, lastReply));
    };
    render();
    return {
      refresh: (type?: string) => {
        if (type === 'accuse' || type === 'pins' || type === 'hint') render();
      },
    };
  },
};
