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
import { renderHintPanel } from './ui/hintpanel.ts';
import { mountObjectives } from './ui/objectives.ts';
import { applyMotionPref, showMoment } from './ui/motion.ts';
import { flashAnchor, mountTour, toolGuide, tourKey, TOUR_SEEN_KEY } from './ui/tour.ts';
import { EXPERIENCE_KEY, experienceRules, parseExperience, shouldAskExperience, type Experience } from './engine/experience.ts';
import { goalCard } from './ui/goal.ts';
import type { ClueDef, TourStep } from './engine/types.ts';
import type { Message } from './engine/build.ts';
import type { ScoreResult } from './engine/scoring.ts';

// ------------------------------------------------------------------ campaign: which case runs (docs/campaign-ladder.md)
const campaign = new Campaign(CAMPAIGN);
const PROGRESS_KEY = 'no-handover:campaign';
const CURRENT_KEY = 'no-handover:current';
const params = new URLSearchParams(location.search);
setLang((params.get('lang') as Lang) === 'en' ? 'en' : 'ko');
document.documentElement.lang = getLang();
applyMotionPref(params);

// ?fresh=1 = a new participant: every case's save and the campaign progress are wiped
if (params.has('fresh')) {
  for (const e of campaign.playable()) {
    storage.remove(`no-handover:save:${e.id}`);
    storage.remove(`no-handover:report:${e.id}`);
    storage.remove(tourKey(e.id));
  }
  storage.remove(TOUR_SEEN_KEY);
  storage.remove(EXPERIENCE_KEY); // asked again on the lock screen
  storage.remove(PROGRESS_KEY);
  storage.remove(CURRENT_KEY);
}
let progress: Progress = parseProgress(storage.get(PROGRESS_KEY));
/** "터미널이 익숙해요 / 처음이에요" (src/engine/experience.ts): null until the player has chosen. */
let experience: Experience | null = parseExperience(storage.get(EXPERIENCE_KEY));
const rules = () => experienceRules(experience);
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
  const settings: Partial<{ idleMinutes: number; clockRate: number; senior: boolean }> = {};
  if (params.get('nudge')) settings.idleMinutes = Math.max(0.1, +params.get('nudge')!);
  if (params.get('rate')) settings.clockRate = Math.max(1, +params.get('rate')!);
  // senior mode: hints cost points again (default: hints are only a record)
  if (params.has('senior')) settings.senior = params.get('senior') !== '0';
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
// music is one-shot stings by default; `?music=loop` lets a music.* cue loop (ambience always loops)
const audio = new AudioManager(MANIFEST, { storage, musicLoops: params.get('music') === 'loop' });
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
const hintBtn = h('button.tray-btn', { title: t('tb.hint'), dataset: { tour: 'hint' } }, `💡 ${t('tb.hint')}`);
const goalBtn = h('button.tray-btn.goalbtn', { title: t('goal.title'), 'aria-label': t('goal.title'), dataset: { tour: 'goal' } }, `🎯 ${t('goal.short')}`);
const ptBtn = h('button.tray-btn', { title: t('app.playtest') }, '📋');
// "터미널이 익숙해요": the coach marks fold into this one entry (only in cases that have a tour)
const guideBtn = h('button.tray-btn.guidebtn', { title: t('guide.open'), 'aria-label': t('guide.open'), dataset: { tour: 'guide' } }, `🧭 ${t('guide.short')}`);
const syncGuideBtn = () => (guideBtn.hidden = !(game.cs.tour?.steps.length && !rules().coachMarks));
const helpBtn = h('button.tray-btn', { title: t('tb.help'), 'aria-label': t('tb.help'), dataset: { tour: 'help' } }, '❓');
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
const taskbar = h('div#taskbar', null, h('div.brand', null, t('game.title'), h('small', null, t('game.titleKo'))), tasks, skipBtn, guideBtn, goalBtn, hintBtn, notifBtn, helpBtn, h('div.soundctl', null, soundBtn, volume), ptBtn, clock);
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
  caseLabel: caseLabel(ENTRY),
};
wm.ctx = ctx;
wm.reserveRight = () => {
  const todo = desktop.querySelector('.todo');
  if (!todo) return 0;
  const r = todo.getBoundingClientRect();
  return r.width ? Math.max(0, desktop.getBoundingClientRect().right - r.left) : 0;
};
wm.onFocus = (id) => game.focus(id);
wm.onOpen = () => {
  void audio.play('sfx.window-open');
  objectivesUi?.refresh();
  tourUi?.refresh();
};
wm.onClose = () => {
  void audio.play('sfx.window-close');
  objectivesUi?.refresh();
  tourUi?.refresh();
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
/** Icon buttons by app, kept across renders: a re-render on every game change replaced them, which dropped keyboard focus and could swallow a click. */
const iconEls = new Map<string, HTMLElement>();
const renderIcons = () => {
  const visible = ICONS.filter(iconVisible);
  for (const [app, el] of iconEls) {
    if (visible.some((i) => i.app === app)) continue;
    el.remove();
    iconEls.delete(app);
  }
  visible.forEach((i, idx) => {
    const def = wm.apps.get(i.app)!;
    let el = iconEls.get(i.app);
    if (!el) {
      const isNew = shownIcons.size > 0 && !shownIcons.has(i.app);
      shownIcons.add(i.app);
      // one click (mouse, touch, or Enter/Space on the focused button) opens the app
      el = h(`button.icon${isNew ? '.unlocked' : ''}`, { type: 'button', onclick: () => wm.open(i.app), dataset: { app: i.app } }, h('span.glyph', null, def.icon), def.title());
      iconEls.set(i.app, el);
    }
    if (iconsEl.children[idx] !== el) iconsEl.insertBefore(el, iconsEl.children[idx] ?? null);
    const n = i.badge?.() ?? 0;
    const text = n ? (n > 99 ? '99+' : String(n)) : '';
    const glyph = el.querySelector('.glyph')!;
    let badge = glyph.querySelector('.badge');
    if (!text) badge?.remove();
    else if (!badge) glyph.appendChild(h('span.badge', null, text));
    else if (badge.textContent !== text) badge.textContent = text;
  });
};

const chair = `<svg id="wallpaper-chair" viewBox="0 0 200 260" aria-hidden="true"><g fill="none" stroke="#e9dcc3" stroke-width="7" stroke-linecap="round"><path d="M50 20 L50 150"/><path d="M150 20 L150 150"/><path d="M50 40 L150 40"/><path d="M50 75 L150 75"/><path d="M38 150 L162 150"/><path d="M50 150 L44 250"/><path d="M150 150 L158 250"/><path d="M60 150 L64 238"/><path d="M140 150 L136 238"/><path d="M46 205 L156 205"/></g></svg>`;
desktop.insertAdjacentHTML('beforeend', chair);
desktop.appendChild(h('div.wall-caption', null, '바탕화면: 의자 (2026, 직접 만듦)'));
desktop.appendChild(iconsEl);
let objectivesUi: ReturnType<typeof mountObjectives> | null = null;
let tourUi: ReturnType<typeof mountTour> = null;
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

/** 💡 panel: 요약 → 방향 → 정답 per section; re-rendered in place as steps open. */
let hintFocus: string | undefined;
function openHintPanel(focus?: string): void {
  closePop();
  hintFocus = focus;
  game.log('hint-panel', { focus: focus ?? null });
  pop = h('div.popover.hints', { role: 'dialog' });
  const draw = () => {
    if (!pop) return;
    const top = pop.scrollTop;
    pop.replaceChildren(renderHintPanel(game, { focus: hintFocus, rerender: draw }));
    pop.scrollTop = top;
  };
  draw();
  document.body.appendChild(pop);
  if (focus) pop.querySelector(`[data-key="${focus}"]`)?.scrollIntoView({ block: 'nearest' });
}
hintBtn.onclick = () => (pop ? closePop() : openHintPanel());
document.addEventListener('nh-hint', (e) => openHintPanel((e as CustomEvent<string>).detail));
ptBtn.onclick = () => wm.open('playtest');

/** "이번 사건에서 밝혀낼 것": always one click away (tray 🎯, the checklist's goal line, ❓). */
function openGoal(): void {
  closePop();
  game.log('goal');
  pop = h('div.popover.goalpop', { role: 'dialog', 'aria-label': t('goal.title') }, goalCard(game.cs));
  document.body.appendChild(pop);
}
goalBtn.onclick = () => (pop?.classList.contains('goalpop') ? closePop() : openGoal());
document.addEventListener('nh-goal', openGoal);

helpBtn.onclick = () => {
  if (pop) return closePop();
  game.log('help');
  pop = h('div.popover', { role: 'dialog' }, h('h3', null, `❓ ${t('help.title')}`), goalCard(game.cs));
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
  // the first-run choice, changeable here; and the tool guide for anyone who wants it again
  const expBtn = (e: Experience, label: string) =>
    h('button.ghost-btn', { type: 'button', 'aria-pressed': String((experience ?? 'new') === e), dataset: { exp: e }, onclick: () => (setExperience(e, 'help'), closePop(), helpBtn.click()) }, label);
  pop.appendChild(h('div.exp-set', { role: 'group', 'aria-label': t('exp.setting') }, h('span', null, `${t('exp.setting')}:`), expBtn('familiar', t('exp.familiar')), expBtn('new', t('exp.new'))));
  if (guideSteps.length) pop.appendChild(h('div.help-acts', null, h('button.ghost-btn.guide-open', { type: 'button', onclick: openGuide }, `🧭 ${t('guide.open')}`)));
  document.body.appendChild(pop);
};

/** Coach-mark lines for the tool guide: the tutorial's tool marks, then this case's own. */
const guideSteps: TourStep[] = (() => {
  const all = [...(CAMPAIGN.find((e) => e.tutorial)?.cs?.tour?.steps ?? []), ...(game.cs.tour?.steps ?? [])];
  return all.filter((s, i) => all.findIndex((x) => x.id === s.id) === i);
})();
function openGuide(): void {
  closePop();
  game.log('guide');
  // Esc closes the guide and hands focus back to the terminal prompt (as "알겠어요" does for a coach mark)
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    closePop();
    document.querySelector<HTMLElement>('.window[data-app="terminal"]:not(.min) .tin input')?.focus({ preventScroll: true });
  };
  pop = h(
    'div.popover.guidepop',
    { role: 'dialog', 'aria-label': t('guide.title'), onkeydown: onKey },
    h('h3', null, `🧭 ${t('guide.title')}`),
    h('p.hp-intro', null, t('guide.intro')),
    toolGuide(guideSteps, (s) => {
      game.log('guide-pick', { step: s.id });
      flashAnchor(s.app);
    }),
  );
  document.body.appendChild(pop);
  (pop.querySelector('button') as HTMLElement | null)?.focus();
}
guideBtn.onclick = () => (pop?.classList.contains('guidepop') ? closePop() : openGuide());

function setExperience(e: Experience, via: 'boot' | 'help'): void {
  experience = e;
  storage.set(EXPERIENCE_KEY, e);
  game.log('experience', { choice: e, via });
  syncGuideBtn();
  tourUi?.refresh();
}
syncGuideBtn();

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
    tourUi?.refresh();
    renderClock();
  });
});
// the decisive clue: one big moment (skippable, never blocks input; reduced motion = no scaling)
game.on('aha', (c) => {
  const clue = c as ClueDef;
  if (briefingActive || !clue.aha) return;
  void audio.play('sfx.done');
  showMoment({ kind: 'aha', title: clue.aha, sub: `${t('moment.aha')} · ${clue.label}`, holdMs: 1800 });
});
game.on('message', (m) => {
  const msg = m as Message;
  const last = game.st.log[game.st.log.length - 1];
  const reason = last?.type === 'message' ? String(last.reason ?? '') : '';
  if (reason === 'ask') return; // the player's own quick reply: no ding, no toast
  void audio.play('sfx.ding');
  // a recorded line for a colleague nudge, if main produced one (voice.nudge-<id>)
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
  // "터미널이 익숙해요": no window opens by itself; the scene's toast still offers to open it
  if (rules().autoWindows) {
    wm.open('notes', id);
    // the memo pops up by itself while the player works in the terminal: keep its 📌 column uncovered
    wm.keepClearOf('notes', 'terminal');
  } else game.log('auto-window-held', { app: 'notes', id });
});
game.on('friction', () => void audio.play('sfx.error'));
game.on('hint-panel', () => {
  if (!pop) openHintPanel();
});
// a very quiet key tick when a command runs (Enter in the terminal prompt; not while an IME composes)
desktop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing && (e.target as HTMLElement).closest?.('.tin')) void audio.play('sfx.key');
});
// terminal typing: one of three key clicks per key press, slightly panned (Her Story's keyboard)
const KEY_CLICKS = ['sfx.key-1', 'sfx.key-2', 'sfx.key-3'];
let lastClick = 0;
desktop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.repeat || e.ctrlKey || e.metaKey || ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(e.key)) return;
  if (!(e.target as HTMLElement).closest?.('.tin')) return;
  const now = performance.now();
  if (now - lastClick < 25) return;
  lastClick = now;
  void audio.play(KEY_CLICKS[Math.floor(Math.random() * KEY_CLICKS.length)], { pan: (Math.random() * 2 - 1) * 0.25 });
});
game.on('pinned', () => void audio.play('sfx.pin'));
game.on('accuse', (sc) => {
  // the debrief opens once the case is finished (solved, or out of submissions): reveal theme
  if (game.st.finished) {
    const r = sc as ScoreResult;
    showMoment({ kind: 'result', title: r.allCorrect ? t('moment.solved') : t('moment.closed'), sub: `${r.total} / ${r.max}`, tone: r.allCorrect ? 'good' : 'plain', holdMs: 2200 });
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
let clockSig = '';
function renderClock() {
  const now = game.now();
  const over = now > game.deadline();
  // rewrite only when the shown minute changes: a DOM change every second made snapshot-based tools (and their refs) go stale
  const sig = `${fmtKoShort(now)}|${over}`;
  if (sig === clockSig) return;
  clockSig = sig;
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
  if (game.st.unlocked && !briefingActive) tourUi?.refresh(); // time-based steps (💡 after a few minutes)
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
  objectivesUi.refresh(); // the sticky is on the desktop before the first windows size themselves around it
  if (first && !game.cs.opening) wm.open('mail', 'brief');
  wm.open('terminal');
  objectivesUi.refresh();
  tourUi ??= mountTour(game, { blocked: () => briefingActive || !game.st.unlocked || game.st.finished || !!document.querySelector('.moment, #briefing'), collapsed: () => !rules().coachMarks });
  setTimeout(() => tourUi?.refresh(), 1200);
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
  game.log('experience', { choice: experience, via: 'stored' });
  audio.unlock();
  boot.remove();
  if (first && game.cs.opening && params.get('briefing') !== '0') playBriefing(false);
  else revealDesktop(first);
  save();
}

const resumable = game.st.unlocked && game.st.playMs > 0;
/** First run on this profile: the unlock button becomes the "터미널이 익숙해요 / 처음이에요" choice. */
const askExperience = shouldAskExperience(experience, resumable);
const choose = (e: Experience) => {
  setExperience(e, 'boot');
  start(true);
};
const expChoice = h(
  'div.expq',
  { role: 'group', 'aria-labelledby': 'expq-q' },
  h('p.expq-q#expq-q', null, t('exp.question')),
  h(
    'div.expq-opts',
    null,
    h('button.exp-familiar', { type: 'button', dataset: { exp: 'familiar' }, onclick: () => choose('familiar') }, h('span', null, `⌨ ${t('exp.familiar')}`), h('small', null, t('exp.familiarSub'))),
    h('button.primary.exp-new', { type: 'button', dataset: { exp: 'new' }, onclick: () => choose('new'), autofocus: true }, h('span', null, `🌱 ${t('exp.new')}`), h('small', null, t('exp.newSub'))),
  ),
  h('p.expq-note', null, t('exp.note')),
);
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
  const close = () => {
    dlg.remove();
    if (boot.isConnected) focusBoot();
  };
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
      : askExperience
        ? expChoice
        : h('button.primary', { onclick: () => start(true), autofocus: true }, game.cs.boot?.unlock ?? t('boot.unlock')),
    skipLink,
    h('div', null, h('button.linkbtn.cases', { onclick: showCaseList }, `☰ ${t('case.list')}`)),
    h('div.fine', null, game.cs.boot?.note ?? t('boot.note'), h('br'), `${game.cs.company}(가칭) · 모든 인물·회사·서버는 가상입니다.`),
  ),
);
document.body.appendChild(boot);
/** Keyboard players start on the lock screen's main button (the first-run choice or unlock). */
const focusBoot = () => (boot.querySelector('[autofocus]') as HTMLElement | null)?.focus();
focusBoot();
renderIcons();
renderClock();
