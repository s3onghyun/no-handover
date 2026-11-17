import { clear, h } from '../dom.ts';
import { t } from '../../i18n.ts';
import type { AppDef } from '../wm.ts';
import type { Message } from '../../engine/build.ts';
import { fmtHM, fmtIso, fmtKoShort } from '../../engine/time.ts';

const KO_DOW = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${KO_DOW[d.getUTCDay()]})`;
};

export const messengerApp: AppDef = {
  id: 'messenger',
  title: () => t('app.messenger'),
  icon: '💬',
  w: 860,
  h: 560,
  x: 220,
  y: 60,
  mount(body, ctx) {
    const g = ctx.game;
    let sel: string = 'pc-all';
    const expanded = new Set<string>();
    const side = h('nav.side', { 'aria-label': 'channels' });
    const header = h('div', { style: 'padding:10px 16px;border-bottom:1px solid var(--line);font-weight:600;display:flex;gap:8px;align-items:center' });
    const list = h('div.scroll');
    const composer = h('div.composer');
    body.appendChild(side);
    body.appendChild(h('div.main', null, header, list, composer));

    const ch = (id: string) => g.cs.channels.find((c) => c.id === id);

    const renderSide = () => {
      clear(side);
      const section = (account: 'pc' | 'me', title: string) => {
        side.appendChild(h('h4', null, title));
        if (account === 'pc') side.appendChild(h('div', { style: 'padding:0 14px 6px;font-size:11.5px;color:var(--ink-3)' }, t('boot.status')));
        for (const c of g.cs.channels.filter((x) => x.account === account)) {
          const n = c.id === sel ? 0 : g.unread(c.id);
          side.appendChild(
            h(
              `button.item${c.id === sel ? '.sel' : ''}`,
              { onclick: () => select(c.id) },
              c.kind === 'dm' && c.with ? ctx.avatar(c.with, 22) : h('span', { style: 'width:22px;text-align:center;color:var(--ink-3)' }, '#'),
              c.kind === 'dm' ? c.title : c.title.replace(/^#/, ''),
              n ? h('span.cnt', null, n > 99 ? '99+' : n) : null,
            ),
          );
        }
        if (account === 'pc') {
          const drafts = g.cs.channels.filter((c) => c.draft).length;
          side.appendChild(h(`button.item${sel === '__drafts' ? '.sel' : ''}`, { onclick: () => select('__drafts') }, h('span', { style: 'width:22px;text-align:center' }, '✎'), t('msg.drafts'), h('span.muted', { style: 'margin-left:auto;font-size:12px' }, drafts)));
        }
      };
      section('pc', t('msg.pcAccount'));
      section('me', t('msg.meAccount'));
    };

    const msgEl = (m: Message) => {
      const deleted = m.deletedAt !== undefined;
      const text = deleted ? `${t('msg.deleted')} · ${fmtKoShort(m.deletedAt!)} ${t('msg.deletedAt')}` : m.text;
      const c = ch(m.channel);
      const pinText = deleted ? `${ctx.name(m.from)} (${fmtIso(m.ts)}) [${t('msg.deleted')} — ${fmtIso(m.deletedAt!)}]` : `${ctx.name(m.from)} (${fmtIso(m.ts)}): ${m.text}`;
      return h(
        `div.msg${m.live ? '.live' : ''}`,
        null,
        ctx.avatar(m.from),
        h('div.body', null, h('div.who', null, ctx.name(m.from), h('span.time', null, fmtHM(m.ts))), h(`div.text${deleted ? '.deleted' : ''}`, null, text)),
        ctx.pinBtn({ kind: 'message', text: pinText, source: c?.title ?? m.channel, sourceKey: m.id.startsWith('E') ? `msg:${m.id}` : undefined, ts: m.ts }),
      );
    };

    const renderList = () => {
      clear(list);
      clear(header);
      clear(composer);
      if (sel === '__drafts') {
        header.append(t('msg.drafts'));
        const box = h('div.msgs');
        for (const c of g.cs.channels.filter((x) => x.draft)) {
          box.appendChild(
            h('div.msg', null, ctx.avatar(g.cs.owner), h('div.body', null, h('div.who', null, `→ ${c.title}`), h('div.text', null, c.draft!)), ctx.pinBtn({ kind: 'message', text: `남은재 → ${c.title} (보내지 않은 초안): ${c.draft}`, source: t('msg.drafts') })),
          );
        }
        list.appendChild(box);
        return;
      }
      const c = ch(sel);
      if (!c) return;
      header.append(c.kind === 'dm' && c.with ? ctx.avatar(c.with, 26) : '', c.title, c.with ? h('span.muted', { style: 'font-weight:400;font-size:12px' }, g.cs.people[c.with]?.role ?? '') : '');
      const msgs = g.messages(sel);
      const box = h('div.msgs');
      let lastDay = '';
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        const day = dayLabel(m.ts);
        if (day !== lastDay) {
          box.appendChild(h('div.day', null, day));
          lastDay = day;
        }
        // collapse long runs from the collapse sender (e.g. 37 alerts)
        if (c.collapseFrom && m.from === c.collapseFrom && !expanded.has(sel)) {
          let j = i;
          while (j + 1 < msgs.length && msgs[j + 1].from === c.collapseFrom) j++;
          if (j - i >= 3) {
            box.appendChild(msgEl(m));
            box.appendChild(h('button.collapsed', { onclick: () => (expanded.add(sel), renderList()) }, `… ${j - i - 1}${t('msg.more')}`));
            box.appendChild(msgEl(msgs[j]));
            i = j;
            continue;
          }
        }
        box.appendChild(msgEl(m));
      }
      list.appendChild(box);
      list.scrollTop = list.scrollHeight;
      if (c.draft) composer.appendChild(h('div.draft', null, h('small', null, t('msg.draftLabel')), c.draft));
      else composer.appendChild(h('input', { disabled: true, placeholder: c.account === 'pc' ? t('msg.inputPc') : t('msg.inputMe') }));
      g.markRead(sel);
      for (const m of msgs) if (m.id.startsWith('E') && !m.id.includes('-')) g.open(`msg:${m.id}`);
    };

    const select = (id: string) => {
      sel = id;
      renderSide();
      renderList();
    };

    select(sel);
    return {
      refresh: (type?: string) => {
        if (type !== 'message' && type !== 'save') return;
        const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 30;
        renderSide();
        if (sel !== '__drafts' && g.unread(sel) > 0) {
          const top = list.scrollTop;
          renderList();
          if (!atBottom) list.scrollTop = top;
        }
      },
      open: (arg) => {
        if (typeof arg === 'string') select(arg);
      },
    };
  },
};
