import './ui/style.css';
import { CAMPAIGN } from './cases/index.ts';
import { Campaign, parseProgress, type CampaignEntry, type Progress } from './engine/campaign.ts';
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
import { AudioManager } from './audio/audio.ts';
import { MANIFEST } from './audio/manifest.ts';
import { installAudioUnlock } from './audio/unlock.ts';
import { runBriefing } from './ui/briefing.ts';
import { mountObjectives } from './ui/objectives.ts';
import type { Message } from './engine/build.ts';
import type { ScoreResult } from './engine/scoring.ts';
import type { SlotId } from './engine/types.ts';

// ------------------------------------------------------------------ campaign: which case runs (docs/campaign-ladder.md)
const campaign = new Campaign(CAMPAIGN);
const PROGRESS_KEY = 'no-handover:campaign';
const CURRENT_KEY = 'no-handover:current';
const params = new URLSearchParams(location.search);
setLang((params.get('lang') as Lang) === 'en' ? 'en' : 'ko');
document.documentElement.lang = getLang();

// ?fresh=1 = a new participant: every case's save and the campaign progress are wiped
if (params.has('fresh')) {
  for (const e of campaign.playable()) {
    storage.remove(`no-handover:save:${e.id}`);
    storage.remove(`no-handover:report:${e.id}`);
  }
  storage.remove(PROGRESS_KEY);
  storage.remove(CURRENT_KEY);
}
let progress: Progress = parseProgress(storage.get(PROGRESS_KEY));
const saveProgress = () => storage.set(PROGRESS_KEY, JSON.stringify(progress));
const ENTRY = campaign.pick(params.get('case'), storage.get(CURRENT_KEY), progress);
const CASE = ENTRY.cs!;
storage.set(CURRENT_KEY, CASE.id);
const SAVE_KEY = `no-handover:save:${CASE.id}`;
const caseLabel = (e: CampaignEntry) => `${t('case.label', { n: e.slot })}${e.tutorial ? ` · ${t('case.tutorial')}` : ''}`;
document.title = `${t('game.title')} — ${caseLabel(ENTRY)} ${CASE.title}`;
/** Open another case (full reload: one Game per page). */
function goCase(id: string): void {
  storage.set(CURRENT_KEY, id);
  const q = new URLSearchParams({ case: id });
  if (params.get('lang')) q.set('lang', params.get('lang')!);
  location.href = `${location.pathname}?${q}`;
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
// "played Case 0 first?" — remember the campaign as it was when this case was first opened
if (!game.st.unlocked && !game.st.campaignAtStart) game.st.campaignAtStart = { ...progress, tutorial: campaign.tutorialId() };
const markSolved = () => {
  if (progress.solved.includes(CASE.id)) return;
  progress = campaign.solve(CASE.id, progress);
  saveProgress();
};
if (game.st.finished) markSolved(); // saves from before the campaign existed
const audio = new AudioManager(MANIFEST, { storage });
(window as unknown as { __game: Game; __audio: AudioManager }).__game = game; // e2e and facilitator console access
(window as unknown as { __audio: AudioManager }).__audio = audio;
// the first click or key anywhere (lock screen included) starts sound; logged for the playtest
installAudioUnlock(audio, { hintText: t('tb.soundHint'), onRunning: (info) => game.log('audio-unlock', { ...info }) });
/** True while the opening briefing covers the screen: play time (and the hint timers) stand still. */
let briefingActive = false;

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
const helpBtn = h('button.tray-btn', { title: t('tb.help'), 'aria-label': t('tb.help') }, '❓');
const soundBtn = h('button.tray-btn.sound', { 'aria-pressed': 'false' });
const volume = h('input.vol', { type: 'range', min: 0, max: 100, step: 5, title: t('tb.volume'), 'aria-label': t('tb.volume') }) as HTMLInputElement;
const renderSound = () => {
  soundBtn.textContent = audio.muted || audio.volume === 0 ? '🔇' : audio.volume < 0.4 ? '🔈' : '🔊';
  soundBtn.title = audio.muted ? t('tb.unmute') : t('tb.mute');
  soundBtn.setAttribute('aria-label', soundBtn.title);
  soundBtn.setAttribute('aria-pressed', String(audio.muted));
  volume.value = String(Math.round(audio.volume * 100));
  volume.classList.toggle('muted', audio.muted);
};
const logAudio = () => game.log('audio', { muted: audio.muted, volume: Math.round(audio.volume * 100) / 100 });
soundBtn.onclick = () => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  logAudio();
  renderSound();
};
volume.oninput = () => {
  audio.unlock();
  audio.setVolume(+volume.value / 100);
  if (audio.muted && +volume.value > 0) audio.setMuted(false);
  renderSound();
};
volume.onchange = logAudio;
renderSound();
// tutorial only: a visible way out for experienced players (Case 0 is marked skipped)
const nextAfterTutorial = ENTRY.tutorial ? campaign.next(CASE.id) : null;
function skipTutorial(): void {
  if (!nextAfterTutorial) return;
  game.log('tutorial-skip', { to: nextAfterTutorial.id });
  storage.set(SAVE_KEY, game.serialize());
  progress = campaign.skipTo(nextAfterTutorial.id, progress);
  saveProgress();
  goCase(nextAfterTutorial.id);
}
const skipBtn =
  nextAfterTutorial && !progress.solved.includes(CASE.id)
    ? h('button.tray-btn.skiptut', { title: `${caseLabel(nextAfterTutorial)} 「${nextAfterTutorial.title}」`, onclick: () => confirm(`${t('case.skipShort')} → ${caseLabel(nextAfterTutorial)} 「${nextAfterTutorial.title}」?`) && skipTutorial() }, `⏭ ${t('case.skipShort')}`)
    : null;
const taskbar = h('div#taskbar', null, h('div.brand', null, t('game.title'), h('small', null, t('game.titleKo'))), tasks, skipBtn, hintBtn, notifBtn, helpBtn, h('div.soundctl', null, soundBtn, volume), ptBtn, clock);
const toasts = h('div.toasts', { 'aria-live': 'polite' });
document.body.append(desktop, taskbar, toasts);

const wm = new WM(desktop, tasks);
const ctx: UiCtx = {
  game,
  wm,
  toast(content, onClick) {
    const el = h('div.toast', { role: 'status', onclick: () => (onClick?.(), el.remove()) });
    if (typeof content === 'string') el.textContent = content;
    else el.appendChild(content);
    // collapse identical toasts (e.g. several pins in a row) into the newest one
    for (const old of [...toasts.children]) if (old.textContent === el.textContent) old.remove();
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
  nextCase: () => {
    const n = campaign.next(CASE.id);
    return n ? { label: `${caseLabel(n)} 「${n.title}」`, go: () => goCase(n.id) } : null;
  },
};
wm.ctx = ctx;
wm.onFocus = (id) => game.focus(id);
wm.onOpen = () => {
  void audio.play('sfx.window-open');
  objectivesUi?.refresh();
};
wm.onClose = () => {
  void audio.play('sfx.window-close');
  objectivesUi?.refresh();
};
// a real click or key press inside a window (the automatic focus on open does not count)
const interact = (e: Event) => {
  if (briefingActive) return;
  const w = (e.target as HTMLElement).closest?.('.window') as HTMLElement | null;
  if (w?.dataset.app) game.interact(w.dataset.app);
};
desktop.addEventListener('pointerdown', interact, true);
desktop.addEventListener('keydown', interact, true);
for (const app of [terminalApp, messengerApp, mailApp, notesApp, boardApp, reportApp, dashboardApp, playtestApp]) wm.register(app);

// ------------------------------------------------------------------ desktop icons + stickies + wallpaper
const BADGES: Record<string, () => number> = {
  messenger: () => game.cs.channels.reduce((a, c) => a + game.unread(c.id), 0),
  mail: () => game.cs.mails.filter((m) => m.folder === 'inbox' && (!m.later || game.st.mailsDelivered.includes(m.id)) && !game.st.opened.includes(`mail:${m.id}`)).length,
  board: () => game.st.pins.length,
};
/** The case's icon list (Case 0 starts with three and unlocks the rest as the checklist progresses). */
const ICONS = (game.cs.desktop?.icons ?? ['terminal', 'messenger', 'mail', 'notes', 'board', 'dashboard', 'report'].map((app) => ({ app, after: undefined as string | undefined }))).map((i) => ({ ...i, badge: BADGES[i.app] }));
const iconVisible = (i: { after?: string }) => !i.after || game.objectives.isDone(i.after) || game.objectives.folded();
const shownIcons = new Set<string>();
const iconsEl = h('div.icons');
const renderIcons = () => {
  clear(iconsEl);
  for (const i of ICONS.filter(iconVisible)) {
    const isNew = shownIcons.size > 0 && !shownIcons.has(i.app);
    shownIcons.add(i.app);
    const def = wm.apps.get(i.app)!;
    const n = i.badge?.() ?? 0;
    iconsEl.appendChild(h(`button.icon${isNew ? '.unlocked' : ''}`, { ondblclick: () => wm.open(i.app), onclick: (e: MouseEvent) => e.detail === 0 && wm.open(i.app), onkeydown: (e: KeyboardEvent) => e.key === 'Enter' && wm.open(i.app), dataset: { app: i.app } }, h('span.glyph', null, def.icon, n ? h('span.badge', null, n > 99 ? '99+' : n) : null), def.title()));
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
let objectivesUi: ReturnType<typeof mountObjectives> | null = null;
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
  pop = h('div.popover', { role: 'dialog' }, h('h3', null, `💡 ${t('hint.title')}`), h('p.muted', { style: 'margin:0 4px 8px;font-size:12.5px' }, '먼저 은재님 PC 안의 흔적(history, README, 주석, 메모)과 동료 메시지를 보세요. 그래도 막히면:'));
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

helpBtn.onclick = () => {
  if (pop) return closePop();
  game.log('help');
  pop = h('div.popover', { role: 'dialog' }, h('h3', null, `❓ ${t('help.title')}`));
  if (game.cs.opening) {
    pop.appendChild(
      h(
        'div.help-acts',
        null,
        h('button.primary-btn', { onclick: () => (closePop(), playBriefing(true)) }, t('help.replay')),
        h('button.ghost-btn', { onclick: () => (closePop(), objectivesUi?.show()) }, t('help.todo')),
      ),
    );
  }
  const ul = h('ul.help-list');
  for (const k of ['help.l1', 'help.l2', 'help.l3', 'help.l4', 'help.l5'] as const) ul.appendChild(h('li', null, t(k)));
  pop.appendChild(ul);
  document.body.appendChild(pop);
};

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
    objectivesUi?.refresh();
    renderClock();
  });
});
game.on('message', (m) => {
  const msg = m as Message;
  void audio.play('sfx.ding');
  // a recorded line for a colleague nudge, if main produced one (voice.nudge-<id>)
  const last = game.st.log[game.st.log.length - 1];
  const reason = last?.type === 'message' ? String(last.reason ?? '') : '';
  if (reason.startsWith('nudge:') && `voice.nudge-${reason.slice(6)}` in MANIFEST) void audio.play(`voice.nudge-${reason.slice(6)}`);
  const c = game.cs.channels.find((x) => x.id === msg.channel);
  const el = h('div', null, h('b', null, `${ctx.name(msg.from)}`), h('span', { style: 'opacity:.7' }, ` · ${c?.title ?? ''}`), h('div', null, msg.text.length > 90 ? msg.text.slice(0, 90) + '…' : msg.text));
  ctx.toast(el, () => wm.open('messenger', msg.channel));
});
game.on('mail', (id) => {
  const m = game.cs.mails.find((x) => x.id === id);
  if (id !== game.cs.debrief.closingMail) void audio.play('sfx.mail');
  if (m && id !== game.cs.debrief.closingMail) ctx.toast(h('div', null, h('b', null, '✉ '), m.subject), () => wm.open('mail', id));
});
const memoNote = game.cs.notes.find((n) => n.highlight !== undefined)?.id;
game.on('toast', (text) => ctx.toast(h('div', null, String(text)), () => wm.open('notes', memoNote)));
game.on('note', (id) => {
  wm.open('notes', id);
});
game.on('friction', () => void audio.play('sfx.error'));
game.on('hint-panel', () => {
  if (!pop) hintBtn.click();
});
// a very quiet key tick when a command runs (Enter in the terminal prompt; not while an IME composes)
desktop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing && (e.target as HTMLElement).closest?.('.tin')) void audio.play('sfx.key');
});
game.on('pinned', () => void audio.play('sfx.pin'));
game.on('accuse', (sc) => {
  // the debrief opens once the case is finished (solved, or out of submissions): reveal theme
  if (game.st.finished) {
    markSolved();
    skipBtn?.remove(); // solved: no tutorial left to skip
    audio.stopLoop('music.tension', 1500);
    void audio.play('music.reveal', { gain: (sc as ScoreResult).allCorrect ? 1 : 0.8 });
  } else audio.loop('music.tension'); // a wrong report raises the stakes
});
document.addEventListener('nh-reset', () => {
  storage.remove(SAVE_KEY);
  storage.remove(`no-handover:report:${CASE.id}`);
  goCase(CASE.id);
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
const TENSION_AT = game.start + 0.75 * (game.deadline() - game.start); // last quarter of the day (18:00 for case 3)
function loop() {
  const n = performance.now();
  if (game.st.unlocked && !document.hidden && !briefingActive) game.tick(n - last);
  last = n;
  renderClock();
  if (game.st.unlocked && !briefingActive && !game.st.finished && game.now() >= TENSION_AT) audio.loop('music.tension');
  if (n - lastSave > 5000 && game.st.unlocked) {
    lastSave = n;
    storage.set(SAVE_KEY, game.serialize());
  }
}
setInterval(loop, 1000);
document.addEventListener('visibilitychange', () => (last = performance.now()));
window.addEventListener('beforeunload', () => storage.set(SAVE_KEY, game.serialize()));

// ------------------------------------------------------------------ boot
/** The desktop as the player first sees it: terminal open with the half-typed prompt pulsing. */
function revealDesktop(first: boolean) {
  renderIcons();
  renderClock();
  objectivesUi = mountObjectives(desktop, ctx, audio);
  if (first && !game.cs.opening) wm.open('mail', 'brief');
  wm.open('terminal');
  objectivesUi.refresh();
  if (first) {
    void audio.play('sfx.pulse');
    const fresh = game.cs.mails.filter((m) => m.account === 'me' && m.folder === 'inbox' && !m.later);
    const who = [...new Set(fresh.map((m) => ctx.name(m.from)))].join(', ');
    if (fresh.length) setTimeout(() => ctx.toast(h('div', null, h('b', null, '✉ '), `새 메일 ${fresh.length}통 — ${who}`), () => wm.open('mail', 'brief')), 600);
  }
  audio.loop('amb.office');
}

function playBriefing(replay: boolean) {
  if (!game.cs.opening || briefingActive) return;
  audio.unlock(); // inside the click that started it: browsers allow sound from here on
  briefingActive = true;
  closePop();
  game.briefingStart(replay);
  if (replay) audio.stopLoop('amb.office', 400);
  runBriefing({
    cs: game.cs,
    audio,
    avatar: ctx.avatar,
    name: ctx.name,
    speed: +(params.get('bspeed') ?? 1) || 1,
    onReveal: () => (replay ? audio.loop('amb.office') : revealDesktop(true)),
    onDone: (skipped, watchedMs, step) => {
      briefingActive = false;
      last = performance.now();
      game.briefingEnd(skipped, watchedMs, step, replay);
      save();
    },
  });
}

function start(first: boolean) {
  game.st.unlocked = true;
  game.log(first ? 'unlock' : 'resume');
  audio.unlock();
  boot.remove();
  if (first && game.cs.opening && params.get('briefing') !== '0') playBriefing(false);
  else revealDesktop(first);
  save();
}

const resumable = game.st.unlocked && game.st.playMs > 0;
/** Tutorial only: experienced players jump to the next case (Case 0 is marked skipped). */
const skipLink = skipBtn && nextAfterTutorial ? h('button.linkbtn.skip', { onclick: skipTutorial }, `${t('case.skip')} ${caseLabel(nextAfterTutorial)} 「${nextAfterTutorial.title}」`) : null;

/** Case list: the five rungs, locked until the previous playable case is solved. */
function showCaseList(): void {
  document.querySelector('#cases')?.remove();
  const statusText: Record<string, string> = { solved: `✓ ${t('case.solved')}`, skipped: t('case.skipped'), open: '', locked: `🔒 ${t('case.locked')}`, soon: t('case.soon') };
  const list = h('ol.caselist');
  for (const e of campaign.entries) {
    const st = campaign.status(e.id, progress);
    const current = e.id === CASE.id;
    list.appendChild(
      h(
        `li.case-${st}${current ? '.current' : ''}`,
        { dataset: { id: e.id } },
        h('div.cl-head', null, h('b', null, caseLabel(e)), h('span.cl-when', null, e.when), statusText[st] ? h('span.cl-st', null, statusText[st]) : null),
        h('div.cl-title', null, e.title),
        h('div.cl-pr', null, e.principle),
        e.cs && (st === 'open' || st === 'solved' || st === 'skipped') && !current ? h('button', { onclick: () => goCase(e.id) }, t('case.play')) : null,
      ),
    );
  }
  const close = () => dlg.remove();
  const dlg = h('div#cases', { role: 'dialog', 'aria-label': t('case.listTitle') }, h('div.cl-card', null, h('h3', null, t('case.listTitle')), list, h('button.primary', { onclick: close }, t('case.close'))));
  document.body.appendChild(dlg);
}

const boot = h(
  'div#boot',
  null,
  h(
    'div.bootcard',
    null,
    h('div.logo', null, t('game.title'), h('small', null, `「${t('game.titleKo')}」`)),
    h('div.case', null, h('span.caselabel', null, caseLabel(ENTRY)), ` ${game.cs.title}`, h('br'), h('span', { style: 'font-size:13px' }, game.cs.subtitle)),
    h('div.avatar', null, ctx.avatar(game.cs.owner, 84)),
    h('div.who', null, `${t('boot.owner')} — ${t('boot.locked')}`),
    h('div.status', null, game.cs.boot?.status ?? t('boot.status')),
    resumable
      ? [h('button.primary', { onclick: () => start(false) }, t('boot.resume')), h('button', { onclick: () => document.dispatchEvent(new CustomEvent('nh-reset')) }, t('boot.restart'))]
      : h('button.primary', { onclick: () => start(true), autofocus: true }, game.cs.boot?.unlock ?? t('boot.unlock')),
    skipLink,
    h('div', null, h('button.linkbtn.cases', { onclick: showCaseList }, `☰ ${t('case.list')}`)),
    h('div.fine', null, game.cs.boot?.note ?? t('boot.note'), h('br'), `${game.cs.company}(가칭) · 모든 인물·회사·서버는 가상입니다.`),
  ),
);
document.body.appendChild(boot);
renderIcons();
renderClock();
