import { clear, h } from '../dom.ts';
import { t } from '../../i18n.ts';
import type { AppDef } from '../wm.ts';
import type { MailDef } from '../../engine/types.ts';
import { fmtKoShort, parseLocal } from '../../engine/time.ts';

export const mailApp: AppDef = {
  id: 'mail',
  title: () => t('app.mail'),
  icon: '✉️',
  w: 900,
  h: 540,
  x: 180,
  y: 40,
  mount(body, ctx) {
    const g = ctx.game;
    let account: 'me' | 'pc' = 'me';
    let folder: 'inbox' | 'drafts' = 'inbox';
    let sel: string | null = 'brief';
    const bar = h('div.segmented');
    const listEl = h('div.mail-list');
    const read = h('div.mail-read');
    const main = h('div.main', null, bar, h('div', { style: 'display:flex;flex:1;min-height:0' }, listEl, read));
    body.appendChild(main);

    const from = (m: MailDef) => g.cs.people[m.from]?.name ?? m.from;

    const renderBar = () => {
      clear(bar);
      const btn = (label: string, on: boolean, fn: () => void) => h(`button${on ? '.sel' : ''}`, { onclick: fn }, label);
      bar.append(
        btn(t('mail.me'), account === 'me', () => ((account = 'me'), (folder = 'inbox'), (sel = null), render())),
        btn(t('mail.pc'), account === 'pc', () => ((account = 'pc'), (sel = null), render())),
        h('span', { style: 'width:12px' }),
        btn(t('mail.inbox'), folder === 'inbox', () => ((folder = 'inbox'), (sel = null), render())),
        ...(account === 'pc' ? [btn(`${t('mail.drafts')} (${g.mails('pc', 'drafts').length})`, folder === 'drafts', () => ((folder = 'drafts'), (sel = null), render()))] : []),
      );
    };

    const renderList = () => {
      clear(listEl);
      for (const m of g.mails(account, folder)) {
        const opened = g.st.opened.includes(`mail:${m.id}`);
        listEl.appendChild(
          h(
            `button.mail-row${m.id === sel ? '.sel' : ''}`,
            { onclick: () => ((sel = m.id), render()) },
            h('div.s', { style: opened || m.locked ? 'font-weight:400' : '' }, m.locked ? `🔒 ${t('mail.locked')}` : m.subject),
            h('div.m', null, h('span', null, folder === 'drafts' ? `→ ${m.to}` : from(m)), h('span', null, fmtKoShort(parseLocal(m.at)))),
          ),
        );
      }
    };

    const renderRead = () => {
      clear(read);
      const m = g.cs.mails.find((x) => x.id === sel);
      if (!m) {
        read.appendChild(h('p.muted', null, t('mail.empty')));
        return;
      }
      if (m.locked) {
        const inp = h('input', { type: 'password', placeholder: t('mail.password') }) as HTMLInputElement;
        const msg = h('div.muted', { style: 'margin-top:6px' }, m.locked);
        read.append(
          h('h2', null, `🔒 ${t('mail.locked')}`),
          h('div.hdr', null, `→ ${m.to} · ${fmtKoShort(parseLocal(m.at))}`),
          h('form', { onsubmit: (e: Event) => (e.preventDefault(), g.log('locked-draft', { mail: m.id }), (msg.textContent = `${t('mail.wrong')} (${m.locked})`)) }, inp, ' ', h('button.ghost-btn', null, '열기')),
          msg,
        );
        return;
      }
      g.open(`mail:${m.id}`);
      const whole = `${m.subject} — ${from(m)} → ${m.to} (${m.at.replace('T', ' ')})\n${m.body}`;
      read.append(
        h('h2', null, m.subject, ' ', ctx.pinBtn({ kind: 'mail', text: whole, source: t('app.mail'), sourceKey: `mail:${m.id}`, ts: parseLocal(m.at) })),
        h('div.hdr', null, `${folder === 'drafts' ? '임시 저장' : '보낸 사람'}: ${from(m)} · 받는 사람: ${m.to}${m.cc ? ` · 참조: ${m.cc}` : ''} · ${fmtKoShort(parseLocal(m.at))}`),
        h('pre', null, m.body),
      );
      if (folder === 'drafts') read.appendChild(h('p.muted', { style: 'margin-top:14px;font-size:12.5px' }, '(보내지 않은 초안)'));
    };

    const render = () => {
      renderBar();
      renderList();
      renderRead();
    };
    render();
    return {
      refresh: (type?: string) => (type === 'mail' || type === 'save' ? renderList() : undefined),
      open: (arg) => {
        if (typeof arg === 'string') {
          const m = g.cs.mails.find((x) => x.id === arg);
          if (m) {
            account = m.account;
            folder = m.folder;
            sel = m.id;
            render();
          }
        }
      },
    };
  },
};
