import { clear, h } from '../dom.ts';
import { t } from '../../i18n.ts';
import type { AppDef } from '../wm.ts';
import type { MailDef } from '../../engine/types.ts';
import { fmtKoShort, parseLocal } from '../../engine/time.ts';
import { modal } from '../modal.ts';

/** A picture opened large over everything (the finale's 공방.jpg); Esc or a click closes it. */
function viewPhoto(src: string, alt: string, name: string): void {
  const back = h('div.photo-view', { role: 'dialog', 'aria-modal': 'true', 'aria-label': name, tabindex: -1 }, h('figure', null, h('img', { src, alt }), h('figcaption', null, name)), h('button.ghost-btn.photo-close', { type: 'button', 'aria-label': '닫기' }, '✕'));
  const close = () => back.remove();
  back.addEventListener('click', close);
  back.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Escape' && (e.stopPropagation(), close()));
  document.body.appendChild(back);
  back.focus();
}

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
            h('div.s', { style: opened || m.locked ? 'font-weight:400' : '' }, m.locked && !g.draftOpen(m.id) ? `🔒 ${t('mail.locked')}` : m.subject),
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
      if (m.locked && !g.draftOpen(m.id)) {
        const inp = h('input', { type: 'password', placeholder: t('mail.password'), 'aria-label': t('mail.password') }) as HTMLInputElement;
        const msg = h('div.muted', { style: 'margin-top:6px' }, m.locked);
        const tryOpen = async (e: Event) => {
          e.preventDefault();
          // a draft with a password (Case 4) asks once before it opens: these are 은재's own words
          const ok = m.password?.some((p) => p.toLowerCase() === inp.value.trim().toLowerCase());
          if (!ok) {
            if (!m.password) g.log('locked-draft', { mail: m.id });
            else g.unlockDrafts(inp.value);
            msg.textContent = `${t('mail.wrong')} (${m.locked})`;
            return;
          }
          const go = await modal({ kind: 'modal-private', title: '남은재의 개인 초안입니다. 열까요?', body: '열지 않아도 사건은 풀려요.', ok: '열기', cancel: '그만두기', focusCancel: true });
          if (!go) return;
          g.unlockDrafts(inp.value);
          render();
        };
        read.append(
          h('h2', null, `🔒 ${t('mail.locked')}`),
          h('div.hdr', null, `→ ${m.to} · ${fmtKoShort(parseLocal(m.at))}`),
          h('form', { onsubmit: tryOpen }, inp, ' ', h('button.ghost-btn', null, '열기')),
          msg,
        );
        return;
      }
      g.open(`mail:${m.id}`);
      const body = g.mailBody(m);
      const whole = `${m.subject} — ${from(m)} → ${m.to} (${m.at.replace('T', ' ')})\n${body}`;
      read.append(
        h('h2', null, m.subject, ' ', ctx.pinBtn({ kind: 'mail', text: whole, source: t('app.mail'), sourceKey: `mail:${m.id}`, ts: parseLocal(m.at) })),
        h('div.hdr', null, `${folder === 'drafts' ? '임시 저장' : '보낸 사람'}: ${from(m)} · 받는 사람: ${m.to}${m.cc ? ` · 참조: ${m.cc}` : ''} · ${fmtKoShort(parseLocal(m.at))}`),
        h('pre', null, body),
      );
      const att = m.attachment;
      if (att) read.appendChild(h('button.attach', { type: 'button', title: att.name, onclick: () => (g.open(`attach:${m.id}`), viewPhoto(att.src, att.alt, att.name)) }, h('img', { src: att.src, alt: att.alt, loading: 'lazy' }), h('span', null, `📎 ${att.name}`)));
      if (folder === 'drafts') read.appendChild(h('p.muted', { style: 'margin-top:14px;font-size:12.5px' }, '(보내지 않은 초안)'));
      // 은재's opened drafts to 서진 can be sent on (the finale's reply remembers it)
      if (m.password && m.to === g.cs.people.seojin?.name) {
        const sent = g.st.forwarded?.includes(m.id);
        read.appendChild(h(`button.ghost-btn.forward${sent ? '.done' : ''}`, { type: 'button', disabled: !!sent, onclick: () => (g.forwardDraft(m.id), render()) }, sent ? '서진님께 전달함 ✓' : '서진님께 전달'));
      }
    };

    const render = () => {
      renderBar();
      renderList();
      renderRead();
    };
    render();
    return {
      refresh: (type?: string) => (type === 'mail' || type === 'save' || type === 'drafts' ? renderList() : undefined),
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
