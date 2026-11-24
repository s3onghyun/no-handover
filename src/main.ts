import './ui/style.css';
import { CAMPAIGN } from './cases/index.ts';
import { Campaign, parseGrades, parseProgress, saveInfo, type CampaignEntry, type CaseState, type Progress } from './engine/campaign.ts';
import { Game, type Pin, type SaveState } from './engine/game.ts';
import { evidencePins, hasEvidence, slotProgress, uncoveredSlots } from './engine/evidence.ts';
import { fmtHM, fmtKoShort, parseLocal } from './engine/time.ts';
import { getLang, setLang, t, type Lang } from './i18n.ts';
import { clear, h, storage } from './ui/dom.ts';
import { NARROW, WM, type UiCtx } from './ui/wm.ts';
import { lineContext } from './engine/linepin.ts';
import { PIN_TIP_KEY, terminalApp } from './ui/apps/terminal.ts';
import { messengerApp } from './ui/apps/messenger.ts';
import { mailApp } from './ui/apps/mail.ts';
import { notesApp } from './ui/apps/notes.ts';
import { boardApp } from './ui/apps/board.ts';
import { reportApp } from './ui/apps/report.ts';
import { dashboardApp, playtestApp } from './ui/apps/misc.ts';
import { AudioManager } from './audio/audio.ts';
import { caseManifest, cueFor, replyCues } from './engine/voices.ts';
import { installAudioUnlock } from './audio/unlock.ts';
import { runBriefing } from './ui/briefing.ts';
import { renderHintPanel } from './ui/hintpanel.ts';
import { mountObjectives } from './ui/objectives.ts';
import { applyMotionPref, showMoment } from './ui/motion.ts';
import { flashAnchor, mountTour, toolGuide, tourKey, TOUR_MISSED_KEY, TOUR_SEEN_KEY } from './ui/tour.ts';
import { EXPERIENCE_KEY, experienceRules, parseExperience, shouldAskExperience, type Experience } from './engine/experience.ts';
import { EXPERT_KEY, parseExpert } from './engine/expert.ts';
import { goalCard } from './ui/goal.ts';
import { checkpointKey, mountFinale } from './ui/finale.ts';
import { modal } from './ui/modal.ts';
import type { ClueDef, TourStep } from './engine/types.ts';
import type { Message } from './engine/build.ts';
import { grade, type ScoreResult } from './engine/scoring.ts';

// ------------------------------------------------------------------ campaign: which case runs (docs/campaign-ladder.md)
const campaign = new Campaign(CAMPAIGN);
const PROGRESS_KEY = 'no-handover:campaign';
const CURRENT_KEY = 'no-handover:current';
/** Last grade per finished case (src/engine/campaign.ts parseGrades): survives "이 사건 처음부터". */
const GRADES_KEY = 'no-handover:grades';
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
  storage.remove(TOUR_MISSED_KEY);
  storage.remove(PIN_TIP_KEY);
  storage.remove(EXPERIENCE_KEY); // asked again on the lock screen
  storage.remove(EXPERT_KEY);
  storage.remove(PROGRESS_KEY);
  storage.remove(CURRENT_KEY);
  storage.remove(GRADES_KEY);
}
let progress: Progress = parseProgress(storage.get(PROGRESS_KEY));
/** "터미널이 익숙해요 / 처음이에요" (src/engine/experience.ts): null until the player has chosen. */
let experience: Experience | null = parseExperience(storage.get(EXPERIENCE_KEY));
const rules = () => experienceRules(experience);
/** 숙련자 모드 (src/engine/expert.ts): per profile, off unless chosen; a started case keeps its own mode. */
let expertPref = parseExpert(storage.get(EXPERT_KEY));
const saveProgress = () => storage.set(PROGRESS_KEY, JSON.stringify(progress));
const ENTRY = campaign.pick(params.get('case'), storage.get(CURRENT_KEY), progress);
const CASE = ENTRY.cs!;
storage.set(CURRENT_KEY, CASE.id);
const SAVE_KEY = `no-handover:save:${CASE.id}`;
const caseLabel = (e: CampaignEntry) => `${t('case.label', { n: e.slot })}${e.tutorial ? ` · ${t('case.tutorial')}` : ''}`;
document.title = `${t('game.title')} — ${caseLabel(ENTRY)} ${CASE.title}`;
/** Set while this case's save is being thrown away: nothing may write it back before the reload. */
let resetting = false;
/** Open another case (full reload: one Game per page). */
function goCase(id: string): void {
  storage.set(CURRENT_KEY, id);
  const q = new URLSearchParams({ case: id });
  if (params.get('lang')) q.set('lang', params.get('lang')!);
  location.href = `${location.pathname}?${q}`;
}
/**
 * Leaving this case for another one always asks first, in game (a stray click or a tool that
 * auto-accepts browser dialogs used to land the player in the next case).
 */
async function confirmCase(to: CampaignEntry, how: 'skip' | 'list'): Promise<boolean> {
  const toLabel = `${caseLabel(to)} 「${to.title}」`;
  const ok = await modal({
    kind: 'modal-case',
    title: t('case.switchTitle', { to: toLabel }),
    body: t(how === 'skip' ? 'case.switchSkip' : 'case.switchList', { from: caseLabel(ENTRY) }),
    ok: t('case.switchGo', { to: caseLabel(to) }),
    cancel: t('case.switchStay'),
    focusCancel: true,
  });
  game.log('case-switch', { to: to.id, how, ok });
  return ok;
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
  // 숙련자 모드: `?senior=1` or the profile's choice; ignored for a case already started in the other mode
  settings.senior = params.has('senior') ? params.get('senior') !== '0' : expertPref;
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
let grades = parseGrades(storage.get(GRADES_KEY));
const recordGrade = (g: string | null | undefined) => {
  if (!g) return;
  grades = { ...grades, [CASE.id]: g };
  storage.set(GRADES_KEY, JSON.stringify(grades));
};
if (game.st.finished) {
  markSolved(); // saves from before the campaign existed
  if (!grades[CASE.id]) recordGrade(saveInfo(game.serialize())?.grade);
}
// music is one-shot stings by default; `?music=loop` lets a music.* cue loop (ambience always loops)
// only this case's music and voices: a session fetches (and preloads) one case's sounds, in one format
const audio = new AudioManager(caseManifest(game.cs), { storage, musicLoops: params.get('music') === 'loop' });
(window as unknown as { __game: Game; __audio: AudioManager }).__game = game; // e2e and facilitator console access
(window as unknown as { __audio: AudioManager }).__audio = audio;
// the first click or key anywhere (lock screen included) starts sound; logged for the playtest
installAudioUnlock(audio, { hintText: t('tb.soundHint'), onRunning: (info) => game.log('audio-unlock', { ...info }) });
/** True while the opening briefing covers the screen: play time (and the hint timers) stand still. */
let briefingActive = false;

let saveTimer = 0;
const save = () => {
  clearTimeout(saveTimer);
  if (!resetting) saveTimer = window.setTimeout(() => !resetting && storage.set(SAVE_KEY, game.serialize()), 250);
};

// ------------------------------------------------------------------ DOM skeleton
const desktop = h('div#desktop');
const tasks = h('div.tasks');
const clock = h('div.clock');
/** A tray button's words: icon-only on narrow screens (the name stays for screen readers and tools). */
const tbLabel = (text: string, keep = false) => h(`span.tb-label${keep ? '.keep' : ''}`, null, text);
const notifBtn = h('button.tray-btn', { title: t('tb.notifications'), 'aria-label': t('tb.notifications') }, '🔔');
const hintBtn = h('button.tray-btn', { title: t('tb.hint'), dataset: { tour: 'hint' } }, `💡 ${t('tb.hint')}`);
const goalBtn = h('button.tray-btn.goalbtn', { title: t('goal.title'), 'aria-label': t('goal.title'), dataset: { tour: 'goal' } }, '🎯 ', tbLabel(t('goal.short')));
const ptBtn = h('button.tray-btn', { title: t('app.playtest') }, '📋');
// "터미널이 익숙해요": the coach marks fold into this one entry (only in cases that have a tour)
const guideBtn = h('button.tray-btn.guidebtn', { title: t('guide.open'), 'aria-label': t('guide.open'), dataset: { tour: 'guide' } }, '🧭 ', tbLabel(t('guide.short')));
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
async function skipTutorial(): Promise<void> {
  if (!nextAfterTutorial || !(await confirmCase(nextAfterTutorial, 'skip'))) return;
  game.log('tutorial-skip', { to: nextAfterTutorial.id });
  storage.set(SAVE_KEY, game.serialize());
  progress = campaign.skipTo(nextAfterTutorial.id, progress);
  saveProgress();
  goCase(nextAfterTutorial.id);
}
const skipBtn =
  nextAfterTutorial && !progress.solved.includes(CASE.id)
    ? h('button.tray-btn.skiptut', { title: `${caseLabel(nextAfterTutorial)} 「${nextAfterTutorial.title}」`, onclick: () => void skipTutorial() }, '⏭ ', tbLabel(t('case.skipShort')))
    : null;
// a finished case: the way on to the next one stays in the taskbar (the debrief has the same button)
const nextEntry = campaign.next(CASE.id);
const nextBtn = h('button.tray-btn.nextcase-btn', { type: 'button', hidden: true, onclick: () => nextEntry && goCase(nextEntry.id) }, ...(nextEntry ? [tbLabel(`${t('case.next')} `, true), `→ ${caseLabel(nextEntry)}`] : []));
if (nextEntry) nextBtn.title = `${caseLabel(nextEntry)} 「${nextEntry.title}」`;
function syncNextBtn(): void {
  nextBtn.hidden = !(nextEntry && game.st.finished);
}
syncNextBtn();
const taskbar = h('div#taskbar', null, h('div.brand', null, t('game.title'), h('small', null, t('game.titleKo'))), tasks, skipBtn, nextBtn, guideBtn, goalBtn, hintBtn, notifBtn, helpBtn, h('div.soundctl', null, soundBtn, volume), ptBtn, clock);
const toasts = h('div.toasts', { 'aria-live': 'polite' });
document.body.append(desktop, taskbar, toasts);
/**
 * While the lock screen or the opening briefing covers the desktop, nothing behind it is reachable
 * by mouse, keyboard or screen reader (the briefing's own 건너뛰기 was easy to confuse with the
 * taskbar's "⏭ 튜토리얼 건너뛰기" behind it).
 */
const setCovered = (on: boolean) => {
  for (const el of [desktop, taskbar, toasts]) {
    el.inert = on;
    // inert already leaves the accessibility tree; aria-hidden also tells DOM-based tools
    if (on) el.setAttribute('aria-hidden', 'true');
    else el.removeAttribute('aria-hidden');
  }
};
setCovered(true);

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
    // a phone shows two at most: they sit over the terminal there (placeToasts)
    while (toasts.childElementCount > (matchMedia(NARROW).matches ? 2 : 4)) toasts.firstElementChild?.remove();
    placeToasts();
    return el;
  },
  pinBtn(p) {
    const isPinned = () => game.st.pins.some((x) => x.text === p.text && x.source === p.source);
    // named after its line, so a list of buttons (a screen reader, a snapshot tool) tells them apart
    const line = p.text.replace(/\s+/g, ' ').trim();
    const b = h('button.pinbtn', { type: 'button', title: t('pin.add'), 'aria-label': t('pin.name', { line: line.length > 40 ? `${line.slice(0, 40)}…` : line }), 'aria-pressed': 'false' }, '📌');
    const sync = () => {
      const on = isPinned();
      b.classList.toggle('pinned', on);
      b.setAttribute('aria-pressed', String(on));
    };
    b.addEventListener('sync', sync);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      ctx.pinNow({ ...p, via: p.kind === 'line' ? 'line-btn' : 'btn' });
      sync();
    });
    sync();
    return b;
  },
  pinNow(p) {
    if (game.st.pins.some((x) => x.text === p.text && x.source === p.source)) {
      for (const old of toasts.querySelectorAll('.toast.pintoast')) old.remove();
      ctx.toast(h('div', null, `📌 ${t('pin.already')}`), () => wm.open('board')).classList.add('pintoast');
      return null;
    }
    const pin = game.pin(p);
    pinToast(pin);
    return pin;
  },
  avatar(id, size = 34) {
    const p = game.cs.people[id];
    const el = h(`span.av${id === game.cs.owner && game.st.finale?.grey ? '.left' : ''}`, { style: { width: `${size}px`, height: `${size}px`, background: p?.color ?? '#888', fontSize: `${Math.round(size * 0.42)}px` }, title: p?.name ?? id });
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

/** "증거 N개": the checklist's pins goal, else one per report field with evidence kinds. */
const pinsGoal = (): number => {
  const goal = (game.cs.opening?.objectives.items ?? []).flatMap((it) => it.any).reduce((n, c) => ('pins' in c ? Math.max(n, c.pins) : n), 0);
  return goal || slotProgress(game.cs, game.st.pins).length || 1;
};
/**
 * After a pin: one short toast (it replaces the previous pin toast) with the count that matters,
 * the pinned line, and a click that brings the board to the front.
 */
function pinToast(pin: Pin): void {
  for (const old of toasts.querySelectorAll('.toast.pintoast')) old.remove();
  const counts = evidencePins(game.cs, [pin]).length > 0;
  const n = game.evidencePins().length;
  const goal = pinsGoal();
  const ready = hasEvidence(game.cs) && n >= goal && uncoveredSlots(game.cs, game.st.pins) === 0;
  const head = !counts
    ? t('pin.toastOther')
    : t(ready ? 'pin.toastReady' : 'pin.toast', { n: n > goal ? t('pin.nth', { n: String(n) }) : `${n}/${goal}` });
  const text = pin.text.replace(/\s+/g, ' ').trim();
  const el = ctx.toast(
    h(
      'div',
      null,
      h(`div.pintoast-head${ready ? '.ready' : ''}`, null, `📌 ${head}`),
      h('div.pintoast-line', { title: text }, text.length > 90 ? `${text.slice(0, 89)}…` : text),
      pin.cmd ? h('div.pintoast-src', null, `${pin.host} $ ${pin.cmd}`) : null,
    ),
    () => wm.open('board'),
  );
  el.classList.add('pintoast');
}
/** The report can go: enough evidence pins and every field with kinds has one. */
const reportReady = (): boolean => game.evidencePins().length >= pinsGoal() && uncoveredSlots(game.cs, game.st.pins) === 0;
/**
 * A terminal line just proved a clue that some report field accepts as evidence, and the report is
 * not ready yet: a non-blocking toast "보고서에는 이 줄을 핀하세요 (n/N)" with the line; a click pins it.
 * Not in 숙련자 모드 (no unasked help there), not for lines already on the board.
 */
function pinPrompt(c: ClueDef): boolean {
  if (game.st.settings.senior || briefingActive || !hasEvidence(game.cs) || reportReady()) return false;
  if (!game.cs.accusation.slots.some((s) => s.evidence?.some((k) => k.clues.includes(c.id)))) return false;
  if (!String(game.st.clues[c.id]?.via ?? '').startsWith('cmd:')) return false;
  if (game.st.pins.some((p) => p.clueIds.includes(c.id))) return false;
  // the newest output line that proves it, with the source the terminal gives that line
  for (const tb of game.st.tabs) {
    let i = tb.lines.length - 1;
    while (i >= 0 && !(tb.lines[i].cls !== 'sys' && tb.lines[i].text.trim() && game.cluesFor(tb.lines[i].text).includes(c.id))) i--;
    if (i < 0) continue;
    const { source, host, cmd } = lineContext(tb.lines, i, { host: game.shell.frame(tb.session).host, label: tb.label });
    const text = tb.lines[i].text;
    for (const old of toasts.querySelectorAll('.toast.pinprompt')) old.remove();
    const line = text.replace(/\s+/g, ' ').trim();
    const el = ctx.toast(
      h(
        'div',
        null,
        h('div.pintoast-head', null, `📌 ${t('pin.prompt', { n: `${game.evidencePins().length}/${pinsGoal()}` })}`),
        h('div.pintoast-line', { title: line }, line.length > 90 ? `${line.slice(0, 89)}…` : line),
        h('button.pinprompt-btn', { type: 'button' }, t('pin.promptBtn')),
      ),
      () => {
        if (game.st.pins.some((p) => p.text === text && p.source === source)) return;
        pinToast(game.pin({ kind: 'line', text, source, host, cmd, via: 'prompt' }));
      },
    );
    el.classList.add('pinprompt');
    return true;
  }
  return false;
}
// one prompt per command: of the clues one output proved, a key clue first, then case order
const promptQueue: ClueDef[] = [];
game.on('clue', (c) => {
  if (promptQueue.push(c as ClueDef) > 1) return;
  setTimeout(() => {
    const all = promptQueue.splice(0);
    const order = [...all.filter((x) => x.key), ...all.filter((x) => !x.key)];
    for (const x of order) if (pinPrompt(x)) return;
  }, 0);
});

/** Width of the right-hand 📌 column of a window (terminal lines, messages, mail and memo lines). */
const PIN_COL = 48;
type Box = { left: number; right: number; top: number; bottom: number };
const meets = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
/**
 * Toasts sit bottom-right. They keep off every open window's 📌 column (a toast over the newest
 * message's 📌 took the click: "the pin did nothing"): narrower beside the windows when there is
 * room, else left of that column. They also lift above a tray coach mark they would cover.
 */
function placeToasts(): void {
  toasts.style.bottom = '';
  toasts.style.right = '';
  toasts.style.top = '';
  toasts.style.maxWidth = '';
  if (!toasts.childElementCount) return;
  const wins = [...desktop.querySelectorAll<HTMLElement>('.window:not(.min)')];
  const cols = wins.map((w) => w.getBoundingClientRect()).map((r) => ({ left: r.right - PIN_COL, right: r.right, top: r.top, bottom: r.bottom }));
  for (let pass = 0; pass < 2; pass++) {
    const hits = cols.filter((c) => meets(c, toasts.getBoundingClientRect()));
    if (!hits.length) break;
    if (matchMedia(NARROW).matches) {
      // a phone or a small tablet: the windows fill the width, so there is no room beside them (left
      // of the column the toasts ran off the screen and covered the prompt and the picked line's 📌
      // toolbar). Over the top of the window, under its title bar, instead.
      const bars = wins.map((w) => w.querySelector('.titlebar')?.getBoundingClientRect().bottom ?? 0);
      toasts.style.top = `${Math.max(8, ...bars) + 6}px`;
      toasts.style.bottom = 'auto';
      toasts.style.maxWidth = `${window.innerWidth - 24}px`;
      return;
    }
    const room = window.innerWidth - Math.max(...hits.map((c) => c.right)) - 8 - 12;
    if (room >= 220 && !toasts.style.right) toasts.style.maxWidth = `${room}px`;
    else {
      toasts.style.maxWidth = '';
      toasts.style.right = `${window.innerWidth - Math.min(...hits.map((c) => c.left)) + 8}px`;
      break;
    }
  }
  const mark = document.querySelector<HTMLElement>('.tour');
  if (!mark) return;
  const m = mark.getBoundingClientRect();
  if (!meets(m, toasts.getBoundingClientRect())) return;
  toasts.style.bottom = `${Math.max(taskbar.offsetHeight + 12, window.innerHeight - m.top + 8)}px`;
}
/** A desktop icon under an open window leaves the accessibility tree (a click at its centre would reach the window). */
function exposeIcons(): void {
  const wins = [...desktop.querySelectorAll<HTMLElement>('.window:not(.min)')].map((w) => w.getBoundingClientRect());
  for (const icon of desktop.querySelectorAll<HTMLElement>('.icon')) {
    const r = icon.getBoundingClientRect();
    const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
    if (wins.some((w) => x > w.left && x < w.right && y > w.top && y < w.bottom)) icon.setAttribute('aria-hidden', 'true');
    else icon.removeAttribute('aria-hidden');
  }
}
wm.reserveRight = () => {
  const todo = desktop.querySelector('.todo');
  if (!todo) return 0;
  const r = todo.getBoundingClientRect();
  const d = desktop.getBoundingClientRect();
  // narrow screens keep the checklist bottom-left, clear of the windows' right edge
  return r.width && r.left > d.left + d.width / 2 ? Math.max(0, d.right - r.left) : 0;
};
wm.onFocus = (id) => game.focus(id);
wm.onLayout = () => {
  placeToasts();
  exposeIcons();
};
window.addEventListener('resize', () => wm.relayout());
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
/** The evidence board stays one click away in the taskbar, even under a maximized window (shown once its icon is). */
const boardTask = wm.pinTask('board')!;

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
  const board = ICONS.find((i) => i.app === 'board');
  boardTask.hidden = !board || !iconVisible(board);
  const n = game.st.pins.length;
  const text = n ? (n > 99 ? '99+' : String(n)) : '';
  let tb = boardTask.querySelector('.badge');
  if (!text) tb?.remove();
  else if (!tb) boardTask.appendChild((tb = h('span.badge', { 'aria-label': t('pin.count', { n: String(n) }) }, text)));
  else if (tb.textContent !== text) tb.textContent = text;
};

const chair = `<svg id="wallpaper-chair" viewBox="0 0 200 260" aria-hidden="true"><g fill="none" stroke="#e9dcc3" stroke-width="7" stroke-linecap="round"><path d="M50 20 L50 150"/><path d="M150 20 L150 150"/><path d="M50 40 L150 40"/><path d="M50 75 L150 75"/><path d="M38 150 L162 150"/><path d="M50 150 L44 250"/><path d="M150 150 L158 250"/><path d="M60 150 L64 238"/><path d="M140 150 L136 238"/><path d="M46 205 L156 205"/></g></svg>`;
desktop.insertAdjacentHTML('beforeend', chair);
desktop.appendChild(h('div.wall-caption', null, '바탕화면: 의자 (2026, 직접 만듦)'));
desktop.appendChild(iconsEl);
let objectivesUi: ReturnType<typeof mountObjectives> | null = null;
let tourUi: ReturnType<typeof mountTour> = null;
/** The desktop stickies in case order (the last scene can pulse one: src/engine/types.ts EndingBeat `act`). */
const stickyEls: HTMLElement[] = [];
for (const s of game.cs.stickies) {
  const el = h('div.sticky', { style: { left: `${s.x}%`, top: `${s.y}%`, background: s.color ?? '#F2D94E' }, title: '포스트잇' }, s.text);
  stickyEls.push(el);
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
  pop = h('div.popover.goalpop', { role: 'dialog', 'aria-label': t('goal.title') }, goalCard(game.cs, game.st.pins));
  document.body.appendChild(pop);
}
goalBtn.onclick = () => (pop?.classList.contains('goalpop') ? closePop() : openGoal());
document.addEventListener('nh-goal', openGoal);

helpBtn.onclick = () => {
  if (pop) return closePop();
  game.log('help');
  pop = h('div.popover', { role: 'dialog' }, h('h3', null, `❓ ${t('help.title')}`), goalCard(game.cs, game.st.pins));
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
  // 숙련자 모드: applies to the next case that starts; this one keeps the mode it began in
  const xBtn = (on: boolean) =>
    h('button.ghost-btn', { type: 'button', 'aria-pressed': String(expertPref === on), dataset: { expert: on ? '1' : '0' }, onclick: () => (setExpert(on, 'help'), closePop(), helpBtn.click()) }, on ? t('exp.expertOn') : t('exp.expertOff'));
  pop.appendChild(
    h(
      'div.exp-set.expert-set',
      { role: 'group', 'aria-label': t('exp.expertSetting') },
      h('span', null, `${t('exp.expertSetting')}:`),
      xBtn(true),
      xBtn(false),
      h('small.muted', null, t('exp.expertNote', { mode: game.st.settings.senior ? t('exp.modeExpert') : t('exp.modeNormal') })),
    ),
  );
  if (guideSteps.length) pop.appendChild(h('div.help-acts', null, h('button.ghost-btn.guide-open', { type: 'button', onclick: openGuide }, `🧭 ${t('guide.open')}`)));
  pop.appendChild(h('div.help-acts', null, h('button.ghost-btn.cases-open', { type: 'button', onclick: showCaseList }, `☰ ${t('case.list')}`)));
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
  objectivesUi?.refresh();
}
function setExpert(on: boolean, via: 'boot' | 'help'): void {
  expertPref = on;
  storage.set(EXPERT_KEY, on ? '1' : '0');
  game.log('expert', { on, via });
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
    // every 📌 on screen (messages, mail, memo lines too) follows pins added or removed elsewhere
    if (types.includes('pins')) for (const b of document.querySelectorAll('.pinbtn')) b.dispatchEvent(new Event('sync'));
    objectivesUi?.refresh();
    tourUi?.refresh();
    wm.relayout();
    // the goal card's "증거 n/N" follows the pins while it is open
    if (types.includes('pins') && pop?.classList.contains('goalpop')) pop.replaceChildren(goalCard(game.cs, game.st.pins));
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
// one colleague speaks at a time: a line waits for the one playing (two trigger messages, a report reply)
let voiceQueue = Promise.resolve();
function say(cue: string): void {
  voiceQueue = voiceQueue
    .then(async () => {
      const hd = await audio.play(cue);
      await new Promise((r) => setTimeout(r, hd.duration * 1000 + 250));
    })
    .catch(() => {}); // a failed line must not silence the ones after it
}
// the report's reply after a wrong submission (report.ts): its lines in order
document.addEventListener('nh-reply', (e) => replyCues(game.cs, String((e as CustomEvent).detail)).forEach(say));
game.on('message', (m) => {
  const msg = m as Message;
  const last = game.st.log[game.st.log.length - 1];
  const reason = last?.type === 'message' ? String(last.reason ?? '') : '';
  if (reason === 'ask' || reason === 'ending-skip') return; // the player's own quick reply, or a skipped scene line: no ding, no toast
  void audio.play('sfx.ding');
  // the last scene: the colleague's DM opens where it lands (src/engine/game.ts ending)
  if (reason === 'ending') wm.open('messenger', msg.channel);
  // the colleague's recorded line (src/engine/voices.ts); no file = subtitles only
  const cue = cueFor(game.cs, msg.from, msg.text);
  if (cue) say(cue);
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
/** The terminal's newest output that a window opening by itself must leave uncovered (px above the prompt). */
const NEWEST_OUTPUT_PX = 170;
/** A notebook page that turned but stayed closed (see 'note' below): the scene's toast in the same beat opens that page. */
let heldNote: string | null = null;
game.on('toast', (text) => {
  const id = heldNote ?? memoNote;
  heldNote = null;
  ctx.toast(h('div', null, String(text)), () => wm.open('notes', id));
});
// a found clue opened more report choices (gated options): say so, the toast opens the report
game.on('options-unlocked', () => {
  if (!game.st.finished) ctx.toast(h('div.toast-options', null, h('b', null, '📝 '), t('report.newOptions')), () => wm.open('report'));
});
game.on('note', (p) => {
  const id = String(p);
  // "터미널이 익숙해요": no window opens by itself; the scene's toast still offers to open it
  if (!rules().autoWindows) {
    heldNote = id;
    setTimeout(() => (heldNote = null), 0);
    return game.log('auto-window-held', { app: 'notes', id });
  }
  // the memo pops up by itself where it leaves the terminal whole, else over the terminal's older
  // lines only — never on the lines just printed (it covered the decisive line), and the typing stays
  // in the prompt; too little room even for that: it stays closed and a toast offers the page
  if (wm.isOpen('notes')) {
    // already on the desktop where the player left it: the page turns, the window stays put
    wm.instance('notes')?.open?.(id);
    return;
  }
  const typing = document.activeElement?.closest('.window[data-app="terminal"] .tin') ? (document.activeElement as HTMLElement) : null;
  const spot = wm.spotClearOf('notes', 'terminal');
  if (spot) {
    const termFocused = wm.focused === 'terminal';
    wm.open('notes', id);
    wm.moveTo('notes', spot.x, spot.y);
    if (termFocused) wm.focus('terminal');
    typing?.focus({ preventScroll: true });
    return;
  }
  const over = wm.spotOverOlder('notes', 'terminal', NEWEST_OUTPUT_PX);
  if (over) {
    wm.open('notes', id);
    // the memo is in front; the prompt keeps the keyboard (the notebook takes no focus of its own)
    wm.moveTo('notes', over.x, over.y, over.w, over.h);
    return;
  }
  heldNote = id;
  game.log('auto-window-held', { app: 'notes', id, why: 'covers-terminal' });
  setTimeout(() => {
    if (heldNote !== id) return; // the scene's own toast took it
    heldNote = null;
    const title = game.cs.notes.find((n) => n.id === id)?.title ?? '';
    ctx.toast(h('div', null, h('b', null, '📒 '), t('notes.newPage', { title })), () => wm.open('notes', id));
    desktop.querySelector('.icon[data-app="notes"]')?.classList.add('bump');
    setTimeout(() => desktop.querySelector('.icon[data-app="notes"]')?.classList.remove('bump'), 900);
  }, 0);
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
  if (game.st.finished && game.cs.finale) {
    // the season finale: no score here (it comes after the credits); the report window closes, 오미래's mail opens
    const r = sc as ScoreResult;
    markSolved();
    recordGrade(grade(r.total, r.max));
    syncNextBtn();
    audio.stopLoop('music.tension', 1500);
    void audio.play('sfx.done');
    wm.close('report');
  } else if (game.st.finished) {
    const r = sc as ScoreResult;
    showMoment({ kind: 'result', title: r.allCorrect ? t('moment.solved') : t('moment.closed'), sub: `${r.total} / ${r.max}`, tone: r.allCorrect ? 'good' : 'plain', holdMs: 2200 });
    markSolved();
    recordGrade(grade(r.total, r.max));
    skipBtn?.remove(); // solved: no tutorial left to skip
    syncNextBtn();
    audio.stopLoop('music.tension', 1500);
    void audio.play('music.reveal', { gain: (sc as ScoreResult).allCorrect ? 1 : 0.8 });
  } else audio.loop('music.tension'); // a wrong report raises the stakes
});
// ------------------------------------------------------------------ the last scene (case `ending`, docs/case-format.md §15)
// After the final report: colleagues' DMs, 도윤's notebook writing itself, a mail, maybe one thing to
// do; then the debrief. A bar at the bottom (and Esc) goes straight to the debrief.
let endingBar: HTMLElement | null = null;
function syncEnding(): void {
  const act = game.endingAwaits();
  // an act waits for the player: the terminal glows, the sticky pulses, the bar says what to press
  desktop.querySelector('.window[data-app="terminal"]')?.classList.toggle('act', !!act);
  stickyEls.forEach((el, i) => el.classList.toggle('act', act?.sticky === i));
  if (!game.endingActive()) {
    if (endingBar) wm.keepAbove(null);
    endingBar?.remove();
    endingBar = null;
    return;
  }
  if (!endingBar) {
    endingBar = h(
      'div.ending-bar',
      { role: 'region', 'aria-label': t('ending.bar') },
      h('span.ending-tag', null, `🎬 ${t('ending.bar')}`),
      h('span.ending-act', { hidden: true }),
      h('button.ending-skip', { type: 'button', onclick: () => game.skipEnding() }, t('ending.skip')),
    );
    document.body.appendChild(endingBar);
    // the scene's terminal and notebook stay whole above the bar (their newest line was behind it)
    wm.keepAbove(endingBar);
  }
  const hint = endingBar.querySelector<HTMLElement>('.ending-act')!;
  hint.hidden = !act;
  hint.textContent = act ? `⌨️ ${[...act.prefill].length > 22 ? `${[...act.prefill].slice(0, 21).join('')}…` : act.prefill} · ${t('ending.act')}` : '';
}
game.on('ending', (what) => {
  syncEnding();
  if (what === 'done' && !game.cs.finale) wm.open('report');
});
game.on('ending-note', (p) => {
  syncEnding();
  const { id, line, quiet, sign } = p as { id: string; line?: string; quiet: boolean; sign?: boolean };
  if (quiet) {
    if (wm.isOpen('notes')) wm.instance('notes')?.open?.(id);
    return;
  }
  wm.open('notes', { id, write: sign ? 'sign' : line === undefined ? 'reveal' : 'line' });
});
game.on('ending-mail', (p) => {
  const { id, quiet } = p as { id: string; quiet: boolean };
  if (!quiet) wm.open('mail', id);
  else if (wm.isOpen('mail')) wm.instance('mail')?.refresh?.('mail');
});
game.on('ending-act', (a) => {
  const act = a as { tab: number; prefill: string };
  wm.open('terminal', { tab: act.tab, input: act.prefill });
  syncEnding();
  void audio.play('sfx.pulse');
});
// an act that times out (or is done without a notebook line) moves the scene on: keep the glow in step
game.on('save', () => game.st.ending && !game.st.ending.done && syncEnding());
// 도윤's notebook writing a line: soft key clicks while it writes (notes.ts 'nh-writing')
document.addEventListener('nh-writing', (e) => {
  const ms = Number((e as CustomEvent).detail) || 0;
  const t0 = performance.now();
  const tick = () => {
    if (performance.now() - t0 > ms) return;
    void audio.play(KEY_CLICKS[Math.floor(Math.random() * KEY_CLICKS.length)], { gain: 0.6, pan: (Math.random() * 2 - 1) * 0.2 });
    setTimeout(tick, 90 + Math.random() * 60);
  };
  tick();
});
// the sign lit letter by letter in the finale: a tick per letter (notes.ts 'nh-sign-letter'), the last one a chime
document.addEventListener('nh-sign-letter', (e) => void audio.play(Number((e as CustomEvent).detail) >= 3 ? 'sfx.done' : 'sfx.tick'));
// the season finale (Case 4): the choice, the cards, 은재's reply, the credits, the line for the next person
const finaleUi = mountFinale(ctx, audio, () => {
  // what the season remembers for 은재's reply: 물주기 in Case 3, hint steps over every case played
  let watered = false;
  let hints = 0;
  for (const e of campaign.playable()) {
    let st: { log?: { type: string; action?: string; line?: string }[] } | null = null;
    try {
      st = e.id === CASE.id ? game.st : JSON.parse(storage.get(`no-handover:save:${e.id}`) ?? 'null');
    } catch {
      st = null;
    }
    for (const ev of st?.log ?? []) {
      if (e.id === 'friday-1802' && ((ev.type === 'ending' && ev.action === 'act') || (ev.type === 'cmd' && /^물주기\b/.test(ev.line ?? '')))) watered = true;
      if (ev.type === 'rung3') hints++;
    }
  }
  return { watered, hints };
});
// "다른 곳에 넘겨 보기": the save from just before the choice comes back, and nothing writes over it before the reload
document.addEventListener('nh-finale-again', () => {
  const back = storage.get(checkpointKey(CASE.id));
  if (!back) return;
  resetting = true;
  clearTimeout(saveTimer);
  storage.set(SAVE_KEY, back);
  goCase(CASE.id); // not a plain reload: a ?fresh=1 in the address would wipe the save again
});
// Esc skips the scene (not while a dialog, a popover or the result moment has the key)
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !game.endingActive() || document.querySelector('.moment, .modal-back, .popover')) return;
  game.skipEnding();
});
syncEnding();

// "처음부터" (lock screen, debrief, playtest panel): always asks first; the case list asks for any case
document.addEventListener('nh-reset', () => void confirmRestart(ENTRY));

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
  // "11/10 (화) 09:30": narrow screens show the time only
  const stamp = fmtKoShort(now);
  const cut = stamp.lastIndexOf(' ') + 1;
  clock.append(h('div', null, h('span.clock-date', null, stamp.slice(0, cut)), stamp.slice(cut)), h(`div.due${over ? '.over' : ''}`, null, over ? t('tb.overdue') : `${t('tb.deadline')} ${fmtHM(game.deadline())}`));
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
  if (n - lastSave > 5000 && game.st.unlocked && !resetting) {
    lastSave = n;
    storage.set(SAVE_KEY, game.serialize());
  }
}
setInterval(loop, 1000);
document.addEventListener('visibilitychange', () => (last = performance.now()));
window.addEventListener('beforeunload', () => !resetting && storage.set(SAVE_KEY, game.serialize()));

// ------------------------------------------------------------------ boot
/** The desktop as the player first sees it: terminal open with the half-typed prompt pulsing. */
function revealDesktop(first: boolean) {
  renderIcons();
  renderClock();
  // 익숙해요 folds the steps of the guided checklists (the cases 숙련자 모드 has an overlay for, 0–2); Case 3's short list stays for everyone
  objectivesUi = mountObjectives(desktop, ctx, audio, { steps: () => rules().steps || !CASE.expert });
  objectivesUi.refresh(); // the sticky is on the desktop before the first windows size themselves around it
  if (first && !game.cs.opening) wm.open('mail', 'brief');
  // "터미널이 익숙해요" (and 숙련자 모드 on top of it) promises no window opens by itself: in every case the terminal waits behind its icon
  if (rules().autoWindows) wm.open('terminal');
  else game.log('auto-window-held', { app: 'terminal' });
  objectivesUi.refresh();
  tourUi ??= mountTour(game, {
    blocked: () => briefingActive || !game.st.unlocked || game.st.finished || !!document.querySelector('.moment, #briefing'),
    collapsed: () => !rules().coachMarks,
    // a mark that hid on its timer is not lost: say where it went (the toast opens the guide)
    onMissed: (s) => ctx.toast(h('div.toast-missed', null, h('b', null, '🧭 '), t('guide.missed', { title: s.title })), () => openGuide()),
  });
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
  setCovered(true);
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
      setCovered(false);
      if (!replay) wm.instance('terminal')?.focus?.(); // the prompt the desktop opened with (focus could not land while covered)
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
  else {
    setCovered(false);
    revealDesktop(first);
  }
  // the season finale carries on where it stood (or starts, after "다른 곳에 넘겨 보기"); once it is over,
  // 이어서 하기 opens on the debrief, where "다른 곳에 넘겨 보기" waits (it used to land on a bare desktop)
  finaleUi?.resume();
  if (!first && game.cs.finale && game.finaleState()?.done) wm.open('report');
  save();
}

const resumable = game.st.unlocked && game.st.playMs > 0;
/** First run on this profile: the unlock button becomes the "터미널이 익숙해요 / 처음이에요" choice. */
const askExperience = shouldAskExperience(experience, resumable);
const choose = (e: Experience, expert = false) => {
  // 처음이에요 never starts in 숙련자 모드; the case is rebuilt in the chosen mode before it starts
  // (first: the rebuild starts a fresh play log, which then records the choice)
  game.setSenior(expert);
  setExperience(e, 'boot');
  setExpert(expert, 'boot');
  start(true);
};
const expChoice = h(
  'div.expq',
  { role: 'group', 'aria-labelledby': 'expq-q' },
  h('p.expq-q#expq-q', null, t('exp.question')),
  h(
    'div.expq-opts',
    null,
    h('button.exp-familiar', { type: 'button', dataset: { exp: 'familiar' }, onclick: () => choose('familiar') }, h('span', null, `⌨️ ${t('exp.familiar')}`), h('small', null, t('exp.familiarSub'))),
    h('button.primary.exp-new', { type: 'button', dataset: { exp: 'new' }, onclick: () => choose('new'), autofocus: true }, h('span', null, `🌱 ${t('exp.new')}`), h('small', null, t('exp.newSub'))),
  ),
  // the harder way for terminal-savvy players: 익숙해요 plus 숙련자 모드 (src/engine/expert.ts)
  h('button.linkbtn.exp-expert', { type: 'button', dataset: { exp: 'expert' }, onclick: () => choose('familiar', true) }, h('span', null, `🧗 ${t('exp.familiar')} · ${t('exp.expert')}`), h('small', null, t('exp.expertSub'))),
  h('p.expq-note', null, t('exp.note')),
);
/** Tutorial only: experienced players jump to the next case (Case 0 is marked skipped). */
const skipLink = skipBtn && nextAfterTutorial ? h('button.linkbtn.skip', { onclick: () => void skipTutorial() }, `${t('case.skip')} ${caseLabel(nextAfterTutorial)} 「${nextAfterTutorial.title}」`) : null;

/** "이 사건 처음부터": after a confirm, throw away that case's save and open it on its lock screen. Solved/grade records stay. */
async function confirmRestart(e: CampaignEntry): Promise<void> {
  const keeps = progress.solved.includes(e.id) ? ` ${t('case.restartKeeps')}` : '';
  const yes = await modal({ kind: 'modal-restart', title: t('case.restartQ', { c: `${caseLabel(e)} 「${e.title}」` }), body: `${t('case.restartNote')}${keeps}`, ok: t('case.restartOk'), cancel: t('case.cancel'), focusCancel: true });
  game.log('case-restart', { case: e.id, ok: yes });
  if (!yes) return;
  if (e.id === CASE.id) {
    resetting = true; // the unload handler and the save timers must not write this case back
    clearTimeout(saveTimer);
  }
  storage.remove(`no-handover:save:${e.id}`);
  storage.remove(`no-handover:report:${e.id}`);
  goCase(e.id);
}

/** Case list: every rung with its state (locked / new / in progress / solved with grade), the next case, and a restart per case. */
function showCaseList(): void {
  closePop();
  document.querySelector('#cases')?.remove();
  const up = progress.solved.length || progress.skipped.length ? campaign.upNext(progress) : null;
  const list = h('ol.caselist');
  for (const e of campaign.entries) {
    const current = e.id === CASE.id;
    const save = !e.cs ? null : current ? saveInfo(game.serialize()) : saveInfo(storage.get(`no-handover:save:${e.id}`));
    const st = campaign.state(e.id, progress, save);
    const g = grades[e.id];
    // a locked case says which case opens it, and links there (or back to the case on screen)
    const blocker = st === 'locked' ? campaign.blocker(e.id, progress) : null;
    const label: Record<CaseState, string> = {
      locked: `🔒 ${blocker ? t('case.lockedBy', { c: caseLabel(blocker) }) : t('case.locked')}`,
      soon: t('case.soon'),
      new: t('case.new'),
      playing: `▶ ${t('case.playing')}${g ? ` · ${t('case.prevGrade', { g })}` : ''}`,
      done: `✓ ${t('case.solved')}${g ? ` · ${t('case.grade', { g })}` : ''}`,
      skipped: t('case.skipped'),
    };
    const isNext = up?.id === e.id;
    const playable = st !== 'locked' && st !== 'soon';
    const openLabel = st === 'playing' ? t('case.resume') : isNext ? `${t('case.next')} →` : t('case.play');
    list.appendChild(
      h(
        `li.case-${st}${current ? '.current' : ''}${isNext ? '.next' : ''}`,
        { dataset: { id: e.id, state: st } },
        h('div.cl-head', null, h('b', null, caseLabel(e)), h('span.cl-when', null, e.when), isNext ? h('span.cl-next', null, t('case.next')) : null, h('span.cl-st', null, label[st])),
        h('div.cl-title', null, e.title),
        h('div.cl-pr', null, e.principle),
        playable
          ? h(
              'div.cl-acts',
              null,
              current ? h('span.cl-here', null, t('case.here')) : h('button.cl-open', { type: 'button', onclick: async () => (await confirmCase(e, 'list')) && goCase(e.id) }, openLabel),
              save?.started ? h('button.cl-restart', { type: 'button', onclick: () => void confirmRestart(e) }, `↺ ${t('case.restart')}`) : null,
            )
          : blocker
            ? h(
                'div.cl-acts',
                null,
                blocker.id === CASE.id
                  ? h('button.cl-back', { type: 'button', onclick: () => close() }, t('case.backHere'))
                  : h('button.cl-back', { type: 'button', onclick: async () => (await confirmCase(blocker, 'list')) && goCase(blocker.id) }, t('case.goBlocker', { c: caseLabel(blocker) })),
              )
            : null,
      ),
    );
  }
  const close = () => {
    dlg.remove();
    if (boot.isConnected) focusBoot();
  };
  const dlg = h(
    'div#cases',
    { role: 'dialog', 'aria-label': t('case.listTitle'), onkeydown: (ev: KeyboardEvent) => ev.key === 'Escape' && !document.querySelector('.modal-back') && close() },
    h('div.cl-card', null, h('h3', null, t('case.listTitle')), list, h('button.primary', { onclick: close }, t('case.close'))),
  );
  document.body.appendChild(dlg);
  (dlg.querySelector('.cl-open, button.primary') as HTMLElement | null)?.focus();
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
    resumable && game.st.finished && nextEntry
      ? [
          h('button.primary.boot-next', { onclick: () => goCase(nextEntry.id), autofocus: true }, `${t('case.next')} → ${caseLabel(nextEntry)} 「${nextEntry.title}」`),
          h('br'),
          h('button', { onclick: () => start(false) }, t('boot.review')),
          h('button', { onclick: () => document.dispatchEvent(new CustomEvent('nh-reset')) }, t('boot.restart')),
        ]
      : resumable
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
