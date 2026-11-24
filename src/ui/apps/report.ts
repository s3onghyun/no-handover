import { clear, h, storage } from '../dom.ts';
import { t } from '../../i18n.ts';
import type { AppDef, UiCtx } from '../wm.ts';
import type { Submission } from '../../engine/scoring.ts';
import type { FieldMark } from '../../engine/scoring.ts';
import { fieldMarks, filled, grade, picked, slotName, wrongReply } from '../../engine/scoring.ts';
import { citeState, kindsFor, kindsOf } from '../../engine/evidence.ts';
import type { Game, Pin } from '../../engine/game.ts';
import type { SlotDef, SlotId } from '../../engine/types.ts';
import { playRecord, recordLine, resultCard } from '../../engine/record.ts';
import { openedFor } from '../hintpanel.ts';
import { drawResultCard, downloadResultCard } from '../resultcard.ts';
import { modal, notice } from '../modal.ts';
import { checkpointKey } from '../finale.ts';

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
  // feeling first (the memo scene and the people), then the numbers, folded: a case ends on how it felt
  const memo = farewell
    ? h(
        'div.memo-scene',
        null,
        h('div', null, farewell.title),
        ...farewell.lines.map((l, i) => h(i === farewell.highlight ? 'div.hl' : 'div', null, l)),
        farewell.reveal ? h('div.reveal', null, farewell.reveal) : null,
        ...(g.st.noteLines?.[farewell.id] ?? []).map((l) => h('div.added', null, l)),
      )
    : null;
  root.appendChild(
    h(
      'div.debrief',
      null,
      h('p.muted', null, `${t('debrief.title')} · ${g.cs.title}`),
      h('h2', null, d.headline),
      s.allCorrect ? null : h('p', { style: 'color:var(--warn)' }, '제출 기회를 모두 썼다. 아래가 실제로 일어난 일이다.'),
      memo ? [h('h3', null, t('debrief.memo')), memo] : null,
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
      h(
        'details.score-fold',
        null,
        h('summary', null, h('b', null, t('debrief.scoreFold')), h('span.score-sum', null, ` · ${t('debrief.score')} ${grade(s.total, s.max)} · ${s.total} / ${s.max} · ${recordLine(rec)}`)),
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
          // 숙련자 모드 in Cases 0–2: play time over par
          s.timeCost !== undefined ? h('div.s.time', null, t('debrief.time'), h('b', null, s.timeCost ? `−${s.timeCost}` : '0')) : null,
        ),
        citeList(g, last.sub),
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
      ),
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
        // the season finale: back to just before the v5 choice, from here too (a first run that skipped the record had no way back)
        g.cs.finale && storage.get(checkpointKey(g.cs.id)) ? h('button.ghost-btn.debrief-again', { onclick: () => document.dispatchEvent(new CustomEvent('nh-finale-again')) }, `↩ ${t('finale.again')}`) : null,
        h('button.ghost-btn', { onclick: () => ctx.wm.open('playtest') }, `📋 ${t('pt.save')}`),
        h('button.ghost-btn', { onclick: () => document.dispatchEvent(new CustomEvent('nh-reset')) }, `↺ ${t('debrief.again')}`),
      ),
    ),
  );
}

/** Short one-line form of a pin for the report and the debrief. */
function pinLabel(p: Pin): string {
  const text = p.text.replace(/\s+/g, ' ').trim();
  return `${p.source} · ${text.length > 160 ? `${text.slice(0, 159)}…` : text}`;
}

/** Debrief: what each slot cited and whether it backed the slot. */
function citeList(g: Game, sub: Submission): HTMLElement | null {
  const slots = g.cs.accusation.slots.filter((s) => s.evidence?.length);
  if (!slots.length) return null;
  const last = g.st.submissions[g.st.submissions.length - 1].score;
  return h(
    'div.cites',
    null,
    h('h3', null, t('debrief.cites')),
    h(
      'ul',
      null,
      ...slots.map((slot) => {
        const cited = g.st.pins.filter((p) => sub.cites?.[slot.id]?.includes(p.id));
        const ok = last.slots[slot.id]?.cite === 'ok';
        return h(
          'li',
          null,
          h('b', null, `${ok ? '✓' : '✗'} ${slotName(slot)}`),
          cited.length
            ? h('ul', null, ...cited.map((p) => {
                const kinds = kindsOf(slot, p).map((k) => k.label);
                return h('li', null, pinLabel(p), h('span.muted', null, kinds.length ? ` — ${kinds.join(' · ')}` : ' — 이 칸의 근거 종류가 아님'));
              }))
            : h('span.muted', null, ' — 고른 근거 없음'),
        );
      }),
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
    let lastReply: { head: string; marks: FieldMark[]; body: string; sign: string } | null = null;

    const save = () => storage.set(key, JSON.stringify(sub));

    // per slot: the kinds it accepts (✓ a pin on the board meets it, ○ none yet), and which pinned
    // items back it — whether the cited ones count is said here, before submitting
    const citeBox = (slot: SlotDef) => {
      const slotId = slot.id;
      const kinds = kindsFor(slot, g.st.pins);
      const ready = kinds.some((k) => k.pins.length);
      const state = h('p.cite-state', { 'aria-live': 'polite' });
      const syncState = () => {
        const s = citeState(slot, sub.cites?.[slotId], g.st.pins);
        state.className = `cite-state ${s}`;
        state.textContent = s === 'ok' ? `✓ ${t('report.citeOk')}` : s === 'unsupported' ? `△ ${t('report.citeUnsupported')}` : '';
      };
      const box = h(
        'div.cite',
        { dataset: { slot: slotId } },
        h('div.cite-h', null, h('b', null, `📌 ${t('report.cite')}`), ` (${t('report.citeNeed')}) · ${t('report.citeKinds')}:`),
        h(
          'div.cite-kinds',
          null,
          ...kinds.map(({ kind, pins }) =>
            h(
              `span.crit.${pins.length ? 'met' : 'miss'}`,
              { dataset: { kind: kind.id }, 'aria-label': `${kind.label}: ${pins.length ? t('board.met') : t('board.missing')}` },
              h('span', { 'aria-hidden': 'true' }, pins.length ? '✓ ' : '○ '),
              kind.label,
            ),
          ),
          h(`span.cite-need${ready ? '.met' : ''}`, null, ready ? `✓ ${t('report.citeReady')}` : t('report.citeMissing')),
        ),
      );
      if (!g.st.pins.length) {
        box.appendChild(h('p.muted', null, t('report.noPins')));
        return box;
      }
      const list = h('div.cite-list');
      for (const p of g.st.pins) {
        const on = sub.cites?.[slotId]?.includes(p.id) ?? false;
        const inp = h('input', {
          type: 'checkbox',
          name: `cite-${slotId}`,
          value: p.id,
          checked: on,
          onchange: (e: Event) => {
            const cur = new Set(sub.cites?.[slotId] ?? []);
            if ((e.target as HTMLInputElement).checked) cur.add(p.id);
            else cur.delete(p.id);
            sub.cites = { ...sub.cites, [slotId]: [...cur] };
            save();
            syncState();
            syncSubmit();
          },
        });
        list.appendChild(h('label.citeopt', { title: p.text }, inp, h('span', null, pinLabel(p))));
      }
      box.append(list, state);
      syncState();
      return box;
    };

    // live cited pins only: a pin taken off the board since does not count
    const liveCites = (slotId: SlotId): string[] => {
      const live = new Set(g.st.pins.map((p) => p.id));
      return (sub.cites?.[slotId] ?? []).filter((id) => live.has(id));
    };
    /** What each field still needs before the report can go: an answer, a cited pin, a cited pin of the right kind. */
    const unmet = (): { slot: SlotDef; need: 'pick' | 'cite' | 'kind' }[] => {
      const out: { slot: SlotDef; need: 'pick' | 'cite' | 'kind' }[] = [];
      for (const slot of g.cs.accusation.slots) {
        if (!filled(slot, picked(sub, slot.id))) out.push({ slot, need: 'pick' });
        if (!slot.evidence?.length) continue;
        const cs = citeState(slot, liveCites(slot.id), g.st.pins);
        if (cs !== 'ok') out.push({ slot, need: cs === 'missing' ? 'cite' : 'kind' });
      }
      return out;
    };
    const needText = (u: { slot: SlotDef; need: 'pick' | 'cite' | 'kind' }) =>
      u.need === 'pick' && u.slot.picks ? t('report.needPicks', { f: slotName(u.slot), n: u.slot.picks }) : t(u.need === 'pick' ? 'report.needPick' : u.need === 'cite' ? 'report.needCite' : 'report.needKind', { f: slotName(u.slot) });

    let submitBtn: HTMLButtonElement | null = null;
    let needBox: HTMLElement | null = null;
    /** Keep the submit button and the "제출 전에" list (and each field's 필요 line) in step with the form. */
    const syncSubmit = () => {
      if (!submitBtn || !needBox) return;
      const miss = unmet();
      const blocked = miss.length > 0 || g.submissionsLeft() <= 0;
      submitBtn.setAttribute('aria-disabled', String(blocked));
      submitBtn.classList.toggle('is-blocked', blocked);
      clear(needBox);
      needBox.classList.toggle('ok', !miss.length);
      if (miss.length) needBox.append(h('b', null, `${t('report.needTitle')}:`), h('ul', null, ...miss.map((u) => h('li', { dataset: { slot: u.slot.id, need: u.need } }, needText(u)))));
      else needBox.append(t('report.needOk'));
      for (const slot of g.cs.accusation.slots) {
        const el = root.querySelector(`.slot-need[data-slot="${slot.id}"]`);
        if (!el) continue;
        const mine = miss.filter((u) => u.slot === slot);
        el.querySelector('.need-pick')?.classList.toggle('met', !mine.some((u) => u.need === 'pick'));
        const c = el.querySelector('.need-cite');
        c?.classList.toggle('met', !mine.some((u) => u.need !== 'pick'));
        c?.classList.toggle('wrongkind', mine.some((u) => u.need === 'kind'));
      }
    };

    const render = () => {
      clear(root);
      submitBtn = null;
      needBox = null;
      if (g.st.finished && (g.endingActive() || (g.cs.finale && !g.st.finale?.done))) {
        // the last scene plays first (main.ts); the debrief opens when it ends or is skipped
        root.appendChild(h('div.ending-wait', null, h('p', null, `📝 ${t('ending.wait')}`), h('button.ghost-btn.ending-skip', { type: 'button', onclick: () => g.skipEnding() }, t('ending.skip'))));
        return;
      }
      if (g.st.finished) {
        debrief(root, ctx);
        root.scrollTop = 0;
        return;
      }
      root.appendChild(h('p.intro', null, g.cs.accusation.intro ?? t('report.intro')));
      const prev = g.st.submissions[g.st.submissions.length - 1]?.score;
      for (const slot of g.cs.accusation.slots) {
        const hints = openedFor(g, slot.id);
        const mark = prev ? (prev.slots[slot.id]?.correct ? '✓' : '✗') : null;
        const box = h(
          'section.slot',
          { dataset: { slot: slot.id } },
          h(
            'h3',
            null,
            slot.title,
            mark ? h(`span.slot-mark.${mark === '✓' ? 'ok' : 'bad'}`, null, `${t('report.lastMark')} ${mark}`) : null,
            h('button.hint-btn', { title: t('hint.title'), onclick: () => document.dispatchEvent(new CustomEvent('nh-hint', { detail: slot.id })) }, t('hint.slot')),
          ),
          h('div.prompt', null, slot.prompt),
          // what this field needs, up front: an answer and (with kinds) one cited pin of an accepted kind
          h(
            'p.slot-need',
            { dataset: { slot: slot.id } },
            `${t('report.slotNeed')}: `,
            h('span.need-pick', null, t(slot.type === 'multi' ? 'report.slotPickMulti' : 'report.slotPick')),
            slot.evidence?.length ? [' · ', h('span.need-cite', null, t('report.slotCite', { kinds: slot.evidence.map((k) => k.label).join(' / ') }))] : null,
          ),
        );
        const shown = slot.options.filter((o) => g.optionShown(o));
        // a multi slot with `picks` takes exactly N: the unticked boxes stop at N, a counter shows it
        const boxes: HTMLInputElement[] = [];
        const counter = slot.type === 'multi' && slot.picks ? h('p.picks', { 'aria-live': 'polite' }) : null;
        const cap = () => {
          if (!counter || !slot.picks) return;
          const n = boxes.filter((b) => b.checked).length;
          for (const b of boxes) b.disabled = !b.checked && n >= slot.picks;
          counter.textContent = n >= slot.picks ? t('report.picksFull', { max: slot.picks }) : t('report.picks', { n, max: slot.picks });
          counter.classList.toggle('full', n >= slot.picks);
        };
        for (const o of shown) {
          const checked = slot.type === 'single' ? sub[slot.id as 'cause' | 'sequence'] === o.id : sub.responsibility.includes(o.id);
          const inp = h('input', {
            type: slot.type === 'single' ? 'radio' : 'checkbox',
            name: `slot-${slot.id}`,
            value: o.id,
            checked,
            onchange: (e: Event) => {
              const on = (e.target as HTMLInputElement).checked;
              if (slot.type === 'single') (sub as unknown as Record<string, string | null>)[slot.id] = o.id;
              else sub.responsibility = on ? [...new Set([...sub.responsibility, o.id])] : sub.responsibility.filter((x) => x !== o.id);
              save();
              syncSubmit();
              cap();
            },
          }) as HTMLInputElement;
          boxes.push(inp);
          box.appendChild(h('label.opt', null, inp, h('span', null, o.text)));
        }
        if (counter) {
          box.appendChild(counter);
          cap();
        }
        if (shown.length < slot.options.length) box.appendChild(h('p.muted.more-opts', null, t('report.moreOptions')));
        if (slot.evidence?.length) box.appendChild(citeBox(slot));
        for (const ht of hints) box.appendChild(h('div.hintbox', null, `💡 ${ht}`));
        root.appendChild(box);
      }
      const left = g.submissionsLeft();
      const max = g.cs.accusation.maxSubmissions;
      const leftText = max > 0 ? `${t('report.left')} ${left}/${max}` : t('report.unlimited');
      needBox = h('div.submit-need', { 'aria-live': 'polite' });
      submitBtn = h(
        'button.primary-btn.submit-btn',
        {
          'aria-describedby': 'report-need',
          onclick: async () => {
            if (g.submissionsLeft() <= 0) return;
            // an unmet field (no answer, no cited pin, a pin of another kind) blocks here: nothing is sent or counted
            const miss = unmet();
            if (miss.length) {
              await notice(t('report.notReady'), [t('report.notReadyBody'), ...miss.map(needText)], t('modal.ok'));
              return;
            }
            sub.cites = Object.fromEntries(g.cs.accusation.slots.filter((x) => sub.cites?.[x.id]).map((x) => [x.id, liveCites(x.id)]));
            // the copy follows the case's real rule: unlimited, n of max left, or the last one
            const lastOne = max > 0 && left <= 1;
            const ok = await modal({
              kind: 'modal-submit',
              title: t('report.confirmTitle'),
              body: max <= 0 ? t('report.confirmUnlimited') : lastOne ? t('report.confirmLast') : t('report.confirmLeft', { n: g.st.submissions.length + 1, left, max }),
              ok: lastOne ? t('report.confirmOkLast') : t('report.confirmOk'),
              cancel: t('report.confirmCancel'),
              focusCancel: lastOne,
            });
            if (!ok || g.submissionsLeft() <= 0) return;
            const attempt = g.st.submissions.length + 1;
            const r = g.submit(sub);
            if (!r) return;
            if (!r.allCorrect && !g.st.finished) {
              const rp = g.cs.accusation.reply;
              const count = max > 0 ? ` (${g.st.submissions.length}/${max})` : ` (${g.st.submissions.length})`;
              lastReply = {
                head: `${replyLabel(ctx)}${count}`,
                marks: fieldMarks(g.cs, r),
                body: wrongReply(g.cs, r, sub, { attempt, pins: g.st.pins }),
                sign: rp ? rp.sign : '오미래 드림 / CTO',
              };
              document.dispatchEvent(new CustomEvent('nh-reply', { detail: lastReply.body })); // main.ts voices it
            }
            render();
          },
        },
        `${t('report.submit')} (${leftText})`,
      ) as HTMLButtonElement;
      needBox.id = 'report-need';
      root.appendChild(
        h(
          'div.submitbar',
          null,
          submitBtn,
          needBox,
          h('span.muted', null, `★ ${t('report.evidence')}: +${Math.min(30, g.pinnedKeyClues() * 5)} · ${g.st.settings.senior ? t('report.hintsSenior', { n: g.ladder.totalCost() }) : t('report.hints', { n: g.hintCount() })}`),
        ),
      );
      if (lastReply)
        root.appendChild(
          h(
            'div.reply',
            null,
            h('div.reply-head', null, lastReply.head),
            h('ul.reply-marks', null, ...lastReply.marks.map((m) => h(`li.${m.ok ? 'ok' : 'bad'}`, { dataset: { slot: m.slot } }, `${m.ok ? '✓' : '✗'} ${m.name}`))),
            h('div.reply-body', null, lastReply.body),
            h('div.reply-sign', null, lastReply.sign),
          ),
        );
      syncSubmit();
    };
    render();
    // red herrings unlock as clues are found or triggers fire: re-render only when the set changes
    const shownSig = () => g.cs.accusation.slots.map((s) => s.options.filter((o) => g.optionShown(o)).length).join(',');
    let sig = shownSig();
    return {
      refresh: (type?: string) => {
        if (type === 'accuse' || type === 'pins' || type === 'hint' || type === 'ending' || type === 'finale') render();
        else if ((type === 'clue' || type === 'message') && shownSig() !== sig) render();
        sig = shownSig();
      },
    };
  },
};
