import './ui/style.css';
import { caseFriday1802 } from './cases/friday-1802.ts';
import { Game, type SaveState } from './engine/game.ts';
import { fmtHM, fmtKoShort, parseLocal } from './engine/time.ts';
import { getLang, setLang, t, type Lang } from './i18n.ts';
import { clear, h, storage } from './ui/dom.ts';
import { WM, type UiCtx } from './ui/wm.ts';
import { terminalApp } from './ui/apps/terminal.ts';
import { messengerApp } from './ui/apps/messenger.ts';
import { mailApp } from './ui/apps/mail.ts';
import { notesApp } from './ui/apps/notes.ts';
import { boardApp } from './ui/apps/board.ts';
import { reportApp } from './ui/apps/report.ts';
import { dashboardApp, playtestApp } from './ui/apps/misc.ts';
import type { Message } from './engine/build.ts';
import type { SlotId } from './engine/types.ts';

const CASE = caseFriday1802;
const SAVE_KEY = `no-handover:save:${CASE.id}`;
const params = new URLSearchParams(location.search);
setLang((params.get('lang') as Lang) === 'en' ? 'en' : 'ko');
document.documentElement.lang = getLang();
document.title = `${t('game.title')} — ${t('game.titleKo')}`;

if (params.has('fresh')) {
  storage.remove(SAVE_KEY);
  storage.remove(`no-handover:report:${CASE.id}`);
}

function loadGame(): Game {
  let saved: SaveState | null = null;
  try {
    saved = JSON.parse(storage.get(SAVE_KEY) ?? 'null');
  } catch {
    saved = null;
  }
  const settings: Partial<{ idleMinutes: number; clockRate: number }> = {};
  if (params.get('nudge')) settings.idleMinutes = Math.max(0.1, +params.get('nudge')!);
  if (params.get('rate')) settings.clockRate = Math.max(1, +params.get('rate')!);
  return new Game(CASE, saved, Object.keys(settings).length ? settings : undefined);
}

const game = loadGame();
(window as unknown as { __game: Game }).__game = game; // e2e and facilitator console access

let saveTimer = 0;
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => storage.set(SAVE_KEY, game.serialize()), 250);
};

// ------------------------------------------------------------------ DOM skeleton
const desktop = h('div#desktop');
const tasks = h('div.tasks');
const clock = h('div.clock');
const notifBtn = h('button.tray-btn', { title: t('tb.notifications'), 'aria-label': t('tb.notifications') }, '🔔');
const hintBtn = h('button.tray-btn', { title: t('tb.hint') }, `💡 ${t('tb.hint')}`);
const ptBtn = h('button.tray-btn', { title: t('app.playtest') }, '📋');
const taskbar = h('div#taskbar', null, h('div.brand', null, t('game.title'), h('small', null, t('game.titleKo'))), tasks, hintBtn, notifBtn, ptBtn, clock);
const toasts = h('div.toasts', { 'aria-live': 'polite' });
document.body.append(desktop, taskbar, toasts);

const wm = new WM(desktop, tasks);
const ctx: UiCtx = {
  game,
  wm,
  toast(content, onClick) {
    const el = h('div.toast', { role: 'status', onclick: () => (onClick?.(), el.remove()) });
    if (typeof content === 'string') el.innerHTML = content;
    else el.appendChild(content);
    toasts.appendChild(el);
    setTimeout(() => el.remove(), 9000);
    while (toasts.childElementCount > 4) toasts.firstElementChild?.remove();
  },
  pinBtn(p) {
    const isPinned = () => game.st.pins.some((x) => x.text === p.text && x.source === p.source);
    const b = h('button.pinbtn', { title: t('pin.add'), 'aria-label': t('pin.add') }, '📌');
    const sync = () => b.classList.toggle('pinned', isPinned());
    b.addEventListener('sync', sync);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isPinned()) return;
      game.pin(p);
      sync();
      ctx.toast(`📌 ${t('pin.added')}`, () => wm.open('board'));
    });
    sync();
    return b;
  },
  avatar(id, size = 34) {
    const p = game.cs.people[id];
    const el = h('span.av', { style: { width: `${size}px`, height: `${size}px`, background: p?.color ?? '#888', fontSize: `${Math.round(size * 0.42)}px` }, title: p?.name ?? id });
    const src = size <= 40 ? p?.avatarSmall ?? p?.avatar : p?.avatar;
    if (src) {
      const img = h('img', { src, alt: p!.name, loading: 'lazy' }) as HTMLImageElement;
      img.onerror = () => {
        img.remove();
        el.textContent = p?.initial ?? '?';
      };
      el.style.background = '#e8e4da';
      el.appendChild(img);
    } else el.textContent = p?.initial ?? '?';
    return el;
  },
  name: (id) => game.cs.people[id]?.name ?? id,
};
wm.ctx = ctx;
wm.onFocus = (id) => game.focus(id);
for (const app of [terminalApp, messengerApp, mailApp, notesApp, boardApp, reportApp, dashboardApp, playtestApp]) wm.register(app);

// ------------------------------------------------------------------ desktop icons + stickies + wallpaper
const ICONS: { app: string; badge?: () => number }[] = [
  { app: 'terminal' },
  { app: 'messenger', badge: () => game.cs.channels.reduce((a, c) => a + game.unread(c.id), 0) },
  { app: 'mail', badge: () => game.cs.mails.filter((m) => m.folder === 'inbox' && (!m.later || game.st.mailsDelivered.includes(m.id)) && !game.st.opened.includes(`mail:${m.id}`)).length },
  { app: 'notes' },
  { app: 'board', badge: () => game.st.pins.length },
  { app: 'dashboard' },
  { app: 'report' },
];
const iconsEl = h('div.icons');
const renderIcons = () => {
  clear(iconsEl);
  for (const i of ICONS) {
    const def = wm.apps.get(i.app)!;
    const n = i.badge?.() ?? 0;
    iconsEl.appendChild(h('button.icon', { ondblclick: () => wm.open(i.app), onclick: (e: MouseEvent) => e.detail === 0 && wm.open(i.app), onkeydown: (e: KeyboardEvent) => e.key === 'Enter' && wm.open(i.app), dataset: { app: i.app } }, h('span.glyph', null, def.icon, n ? h('span.badge', null, n > 99 ? '99+' : n) : null), def.title()));
  }
};
// single click also opens on touch devices
iconsEl.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('.icon') as HTMLElement | null;
  if (b && matchMedia('(pointer: coarse)').matches) wm.open(b.dataset.app!);
});

const chair = `<svg id="wallpaper-chair" viewBox="0 0 200 260" aria-hidden="true"><g fill="none" stroke="#e9dcc3" stroke-width="7" stroke-linecap="round"><path d="M50 20 L50 150"/><path d="M150 20 L150 150"/><path d="M50 40 L150 40"/><path d="M50 75 L150 75"/><path d="M38 150 L162 150"/><path d="M50 150 L44 250"/><path d="M150 150 L158 250"/><path d="M60 150 L64 238"/><path d="M140 150 L136 238"/><path d="M46 205 L156 205"/></g></svg>`;
desktop.insertAdjacentHTML('beforeend', chair);
desktop.appendChild(h('div.wall-caption', null, '바탕화면: 의자 (2026, 직접 만듦)'));
desktop.appendChild(iconsEl);
for (const s of game.cs.stickies) {
  const el = h('div.sticky', { style: { left: `${s.x}%`, top: `${s.y}%`, background: s.color ?? '#F2D94E' }, title: '포스트잇' }, s.text);
  el.appendChild(ctx.pinBtn({ kind: 'note', text: `포스트잇: ${s.text.replace(/\n/g, ' ')}`, source: '바탕화면' }));
  el.addEventListener('click', () => game.open(`sticky:${s.text.slice(0, 12)}`));
  desktop.appendChild(el);
}

// ------------------------------------------------------------------ popovers
let pop: HTMLElement | null = null;
const closePop = () => {
  pop?.remove();
  pop = null;
};
document.addEventListener('pointerdown', (e) => {
  if (pop && !pop.contains(e.target as Node) && !(e.target as HTMLElement).closest('.tray-btn')) closePop();
});

notifBtn.onclick = () => {
  if (pop) return closePop();
  pop = h('div.popover', { role: 'dialog' }, h('h3', null, `🔔 ${t('tb.notifications')}`));
  if (!game.cs.notifications.length) pop.appendChild(h('p.muted', null, t('notif.empty')));
  for (const n of [...game.cs.notifications].sort((a, b) => parseLocal(a.at) - parseLocal(b.at))) {
    const key = `notif:${n.id}`;
    const text = `${n.title} (${n.at.replace('T', ' ')}): ${n.text}`;
    pop.appendChild(
      h(
        'div.notif',
        { onclick: () => game.open(key) },
        h('div.meta', null, `${n.app} · ${fmtKoShort(parseLocal(n.at))}`),
        h('b', null, n.title),
        h('div', null, n.text),
        ctx.pinBtn({ kind: 'notification', text, source: t('tb.notifications'), sourceKey: key, ts: parseLocal(n.at) }),
      ),
    );
  }
  document.body.appendChild(pop);
  // looking at the panel counts as opening every preview in it
  for (const n of game.cs.notifications) game.open(`notif:${n.id}`);
};

hintBtn.onclick = () => {
  if (pop) return closePop();
  pop = h('div.popover', { role: 'dialog' }, h('h3', null, `💡 ${t('hint.title')}`), h('p.muted', { style: 'margin:0 4px 8px;font-size:12.5px' }, '먼저 은재님 PC 안의 흔적(history, 메모, crontab 주석)과 동료 메시지를 보세요. 그래도 막히면:'));
  for (const slot of game.cs.accusation.slots) {
    const used = game.ladder.usedExplicit(slot.id as SlotId);
    const next = game.ladder.nextExplicit(slot.id as SlotId);
    const box = h('div.notif', { style: 'cursor:default' }, h('b', null, slot.title));
    for (const u of used) box.appendChild(h('div', { style: 'font-size:13px;margin-top:4px' }, `💡 ${u}`));
    box.appendChild(
      h(
        'button.hint-btn',
        {
          style: 'margin-top:6px',
          disabled: !next,
          onclick: () => {
            if (!next || !confirm(`${t('hint.title')}: −${next.cost}`)) return;
            game.useHint(slot.id as SlotId);
            closePop();
            hintBtn.click();
          },
        },
        next ? `${t('report.hint')} −${next.cost}${t('report.points')}` : t('hint.none'),
      ),
    );
    pop.appendChild(box);
  }
  document.body.appendChild(pop);
};
ptBtn.onclick = () => wm.open('playtest');

// ------------------------------------------------------------------ events
let rafPending = false;
const pendingTypes = new Set<string>();
game.on('change', (ev) => {
  const type = (ev as { type: string }).type;
  pendingTypes.add(type);
  save();
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    const types = [...pendingTypes];
    pendingTypes.clear();
    renderIcons();
    for (const ty of types) wm.refreshAll(ty);
    renderClock();
  });
});
game.on('message', (m) => {
  const msg = m as Message;
  const c = game.cs.channels.find((x) => x.id === msg.channel);
  const el = h('div', null, h('b', null, `${ctx.name(msg.from)}`), h('span', { style: 'opacity:.7' }, ` · ${c?.title ?? ''}`), h('div', null, msg.text.length > 90 ? msg.text.slice(0, 90) + '…' : msg.text));
  ctx.toast(el, () => wm.open('messenger', msg.channel));
});
game.on('mail', (id) => {
  const m = game.cs.mails.find((x) => x.id === id);
  if (m && id !== game.cs.debrief.closingMail) ctx.toast(h('div', null, h('b', null, '✉ '), m.subject), () => wm.open('mail', id));
});
game.on('toast', (text) => ctx.toast(h('div', null, String(text)), () => wm.open('notes', 'farewell')));
game.on('note', (id) => {
  wm.open('notes', id);
});
document.addEventListener('nh-reset', () => {
  storage.remove(SAVE_KEY);
  storage.remove(`no-handover:report:${CASE.id}`);
  location.href = location.pathname + (params.get('lang') ? `?lang=${params.get('lang')}` : '');
});

// ------------------------------------------------------------------ clock + loop
function renderClock() {
  const now = game.now();
  const over = now > game.deadline();
  clear(clock);
  clock.append(h('div', null, fmtKoShort(now)), h(`div.due${over ? '.over' : ''}`, null, over ? t('tb.overdue') : `${t('tb.deadline')} ${fmtHM(game.deadline())}`));
}

let last = performance.now();
let lastSave = 0;
function loop() {
  const n = performance.now();
  if (game.st.unlocked && !document.hidden) game.tick(n - last);
  last = n;
  renderClock();
  if (n - lastSave > 5000 && game.st.unlocked) {
    lastSave = n;
    storage.set(SAVE_KEY, game.serialize());
  }
}
setInterval(loop, 1000);
document.addEventListener('visibilitychange', () => (last = performance.now()));
window.addEventListener('beforeunload', () => storage.set(SAVE_KEY, game.serialize()));

// ------------------------------------------------------------------ boot
function start(first: boolean) {
  game.st.unlocked = true;
  game.log(first ? 'unlock' : 'resume');
  boot.remove();
  renderIcons();
  renderClock();
  if (first) {
    wm.open('mail', 'brief');
    wm.open('terminal');
    setTimeout(() => ctx.toast(h('div', null, h('b', null, '✉ '), '새 메일 2통 — 오미래, 보안팀'), () => wm.open('mail', 'brief')), 600);
  } else {
    wm.open('terminal');
  }
  save();
}

const resumable = game.st.unlocked && game.st.playMs > 0;
const boot = h(
  'div#boot',
  null,
  h(
    'div.bootcard',
    null,
    h('div.logo', null, t('game.title'), h('small', null, `「${t('game.titleKo')}」`)),
    h('div.case', null, `1화 · ${game.cs.title}`, h('br'), h('span', { style: 'font-size:13px' }, game.cs.subtitle)),
    h('div.avatar', null, ctx.avatar(game.cs.owner, 84)),
    h('div.who', null, `${t('boot.owner')} — ${t('boot.locked')}`),
    h('div.status', null, t('boot.status')),
    resumable
      ? [h('button.primary', { onclick: () => start(false) }, t('boot.resume')), h('button', { onclick: () => document.dispatchEvent(new CustomEvent('nh-reset')) }, t('boot.restart'))]
      : h('button.primary', { onclick: () => start(true), autofocus: true }, t('boot.unlock')),
    h('div.fine', null, t('boot.note'), h('br'), `${game.cs.company}(가칭) · 모든 인물·회사·서버는 가상입니다.`),
  ),
);
document.body.appendChild(boot);
renderIcons();
renderClock();
