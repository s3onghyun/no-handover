// The season finale (Case 4, case `finale`; the ending design notes (not in this repo) §4-6): after the last
// scene (`ending`: 오미래's "네 번째", the hidden sign, the 24th handover line) the player hands
// 인수인계서 v5 to someone, and that choice is the ending: a black card, 은재's grey profile, her
// one live reply with the workshop photo (not in the title ending), 도윤's crontab "what I kept
// running", the v5 credits, a 15-second line for the next person, and the endings found so far.
// The hidden bad ending: the player's own `crontab -r` on the PC takes the plant's reminder with it.
//
// Every step is a game state (src/engine/game.ts setFinale), so a reload resumes where it stood.

import { h, storage } from './dom.ts';
import { feedbackLine } from './feedback.ts';
import { modal } from './modal.ts';
import { reducedMotion } from './motion.ts';
import type { UiCtx } from './wm.ts';
import type { AudioManager } from '../audio/audio.ts';
import type { FinaleDef } from '../engine/types.ts';

export const ENDINGS_KEY = 'no-handover:endings';
export const NEXT_LINE_KEY = 'no-handover:next-line';
export const checkpointKey = (caseId: string) => `no-handover:finale-checkpoint:${caseId}`;

/** Endings reached on this profile (the five choices and the hidden one). */
export function endingsFound(): string[] {
  try {
    const v = JSON.parse(storage.get(ENDINGS_KEY) ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
function recordEnding(id: string): void {
  const all = endingsFound();
  if (!all.includes(id)) storage.set(ENDINGS_KEY, JSON.stringify([...all, id]));
}

/** What the season remembers for 은재's reply (other cases' saves on this profile). */
export interface SeasonInfo {
  /** 물주기 run in Case 3 (its last scene or any time). */
  watered: boolean;
  /** Hint steps opened over every case played (record, not cost). */
  hints: number;
}

/** 은재's reply body for a choice (null: the title ending gets none). Pure, for tests. */
export function replyBody(f: FinaleDef, choice: string, o: { signFound: boolean; watered: boolean; forwarded: boolean; noHints: boolean }): string | null {
  const first = f.reply.first[choice];
  if (!first) return null;
  const extra = [o.watered ? f.reply.watered : '', o.forwarded ? f.reply.forwarded : '', o.noHints ? f.reply.noHints : ''].filter(Boolean);
  const body = f.reply.body.flatMap((l) => (l === '{extra}' ? extra : [l]));
  return ['도윤님,', first, o.signFound ? f.reply.signFound : f.reply.signMissed, ...body, f.reply.sign].join('\n');
}

/** The credits for a choice: v5 ticked by the people who stayed, or (nobody) v4 as 은재 left it plus the 24th line. */
export function creditLines(f: FinaleDef, choice: string, v4: string): string[] {
  if (choice !== 'nobody') return f.credits;
  const lines = v4.split('\n');
  const open = lines.filter((l) => l.startsWith('- [ ]'));
  // the 24th line is in the file by now (the last scene appended it); count it once either way
  const done = lines.filter((l) => l.startsWith('- [x]')).length + (lines.includes(f.handover.line) ? 0 : 1);
  return [`## 체크리스트 (${done}/${done + open.length})`, ...open, f.handover.line, '작성: 남은재 (v1–v4) · 한도윤 (v5: 아무에게도 넘기지 않음)'];
}

/** How the record's "숨은 사인" turns ✓ (it only counts what the game saw: the notebook page opened before the choice). */
export const SIGN_HOW = '직접 찾았다면: 넘기기 전에 도윤 메모장의 「은재님이 나한테 남긴 한 줄들」을 열면 ✓ 로 남아요.';

/** Where 은재's drafts are, on the record once an ending has been seen (nothing else on screen pointed there). */
export const DRAFTS_HOW = '어디 있냐면: 메일 → 「은재 메일 · 이 PC」 → 임시보관함. 잠긴 초안이 비밀번호 힌트를 줘요.';

export function mountFinale(ctx: UiCtx, audio: AudioManager, season: () => SeasonInfo): { refresh(): void; resume(): void } | null {
  const g = ctx.game;
  const f = g.cs.finale;
  if (!f) return null;
  let layer: HTMLElement | null = null;
  let bar: HTMLElement | null = null;
  let shown = '';
  const reduce = () => reducedMotion();
  const clearLayer = () => {
    layer?.remove();
    layer = null;
  };
  const setBar = (label: string | null, next?: () => void) => {
    const had = !!bar;
    bar?.remove();
    bar = null;
    if (!label) {
      if (had) ctx.wm.keepAbove(null);
      return;
    }
    bar = h('div.ending-bar.finale-bar', { role: 'region', 'aria-label': label }, h('span.ending-tag', null, `🎬 ${label}`), next ? h('button.ending-skip.finale-next', { type: 'button', onclick: next }, '계속 ▸') : null);
    document.body.appendChild(bar);
    // "이 자리에 두고 가는 것": the crontab's last lines stay above the bar (they were cut off behind it)
    ctx.wm.keepAbove(bar);
  };
  const go = (step: string, patch: Record<string, unknown> = {}) => g.setFinale({ step, ...patch });

  // ---------------------------------------------------------------- steps
  function choice(): void {
    audio.stopLoop('amb.office', 900);
    setBar(null);
    const st = g.finaleState()!;
    const opts = f!.choice.options.filter((o) => !o.needsSign || st.signFound);
    const box = h(
      'div.finale-choice',
      { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'fc-q' },
      h('h2#fc-q', null, f!.choice.question),
      h('p.fc-note', null, f!.choice.note),
      h('div.fc-opts', null, ...opts.map((o) => h('button.fc-opt', { type: 'button', dataset: { choice: o.id }, onclick: () => void pick(o.id) }, o.label))),
    );
    layer = h('div.finale-layer.finale-choice-back', null, box);
    document.body.appendChild(layer);
    (box.querySelector('button') as HTMLElement | null)?.focus();
  }
  async function pick(id: string): Promise<void> {
    const ok = await modal({ kind: 'modal-handover', title: f!.choice.options.find((o) => o.id === id)!.label, body: f!.choice.confirm, ok: f!.choice.ok, cancel: f!.choice.back, focusCancel: true });
    if (!ok) return;
    clearLayer();
    recordEnding(id);
    void audio.play('music.finale');
    go('card', { choice: id });
  }

  function card(): void {
    const c = f!.cards[g.finaleState()!.choice!];
    const lines = c.lines.map((l) => h('p.fcard-line', null, l));
    const next = () => go('grey');
    layer = h('div.finale-layer.finale-card', { role: 'dialog', 'aria-modal': 'true', 'aria-label': c.title }, h('h2', null, `「${c.title}」`), ...lines, h('button.ghost-btn.finale-next', { type: 'button', onclick: next }, '계속 ▸'));
    document.body.appendChild(layer);
    if (!reduce()) lines.forEach((el, i) => ((el.style.animationDelay = `${0.6 + i * 1.6}s`), el.classList.add('in')));
    (layer.querySelector('button') as HTMLElement).focus();
  }

  function grey(): void {
    // the PC's messenger session: 은재's profile turns grey at last ("메신저: 대상 아님" until now)
    g.setFinale({ grey: true });
    ctx.wm.open('messenger', 'pc-dm-seojin');
    ctx.toast(h('div', null, h('b', null, '💬 '), '남은재 (퇴사)'));
    setBar('남은재 (퇴사)', () => go(f!.reply.first[g.finaleState()!.choice!] ? 'reply' : 'crontab'));
  }

  function reply(): void {
    const st = g.finaleState()!;
    const s = season();
    const body = replyBody(f!, st.choice!, { signFound: st.signFound, watered: s.watered, forwarded: (g.st.forwarded ?? []).length > 0, noHints: s.hints === 0 });
    // who told her: a colleague's DM lands first (once; a reload does not repeat it)
    if (body && f!.reply.before) g.finaleMessage(f!.reply.before);
    if (body && !g.st.mailsDelivered.includes(f!.reply.mail)) {
      g.setMailBody(f!.reply.mail, body);
      g.deliverMail(f!.reply.mail);
    }
    ctx.wm.open('mail', f!.reply.mail);
    setBar('남은재 (개인 메일)', () => go('crontab'));
  }

  function crontab(): void {
    const st = g.finaleState()!;
    const ct = f!.crontab.byChoice[st.choice!] ?? f!.crontab.byChoice.default;
    const tab = g.cs.terminalTabs.findIndex((x) => x.host === f!.crontab.host);
    if (!g.st.log.some((e) => e.type === 'crontab-set' && e.text === ct.text)) {
      g.setCrontab(f!.crontab.host, f!.crontab.user, ct.text);
      g.runCommand(tab, 'crontab -l');
      g.st.tabs[tab].lines.push({ text: ct.next, cls: 'dim' });
    }
    ctx.wm.open('terminal', tab);
    setBar('이 자리에 두고 가는 것', () => go('credits'));
  }

  function credits(): void {
    const st = g.finaleState()!;
    const v4 = String(g.world.hosts.get(f!.handover.host)?.vfs.lookup(f!.handover.path)?.content ?? '');
    const lines = creditLines(f!, st.choice!, v4).map((l) => h(`div.credit${l.startsWith('- [') ? '.item' : l.startsWith('##') ? '.head' : '.sign'}`, null, l));
    layer = h('div.finale-layer.finale-credits', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '인수인계서 v5' }, h('div.credits-roll', null, ...lines), h('button.ghost-btn.finale-next', { type: 'button', onclick: () => go('line') }, '계속 ▸'));
    document.body.appendChild(layer);
    if (!reduce()) lines.forEach((el, i) => ((el.style.animationDelay = `${0.4 + i * 0.9}s`), el.classList.add('in')));
    setBar(null);
    (layer.querySelector('button') as HTMLElement).focus();
  }

  function line(): void {
    const nl = f!.nextLine;
    const readme = String(g.world.hosts.get(nl.host)?.vfs.lookup(nl.path)?.content ?? '');
    const input = h('input.fl-input', { type: 'text', maxlength: 120, 'aria-label': nl.prompt, placeholder: nl.prompt }) as HTMLInputElement;
    const fill = h('div.fl-fill');
    let left = nl.seconds * 1000;
    const done = () => {
      clearInterval(timer);
      const text = input.value.trim() || nl.empty;
      if (!g.st.log.some((e) => e.type === 'append' && e.path === nl.path)) g.appendTo(nl.host, nl.path, ['', text, nl.sign]);
      storage.set(NEXT_LINE_KEY, text);
      go('stats', { line: text });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault(); // the same Enter must not press the next screen's button
      done();
    });
    const timer = window.setInterval(() => {
      left -= 100;
      fill.style.width = `${Math.max(0, (left / (nl.seconds * 1000)) * 100)}%`;
      if (left <= 0) done();
    }, 100);
    layer = h(
      'div.finale-layer.finale-line',
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': nl.prompt },
      h('div.fl-bar', { role: 'timer', 'aria-label': `${nl.seconds}초` }, fill),
      h('pre.fl-readme', null, readme),
      h('label.fl-row', null, input),
      h('div.fl-sign', null, nl.sign),
      h('p.fl-hint', null, `${nl.prompt} · Enter (${nl.seconds}초)`),
    );
    document.body.appendChild(layer);
    input.focus();
  }

  function stats(): void {
    const st = g.finaleState()!;
    const found = endingsFound();
    const drafts = g.cs.mails.filter((m) => m.password).length;
    const read = g.cs.mails.filter((m) => m.password && g.st.opened.includes(`mail:${m.id}`)).length;
    const back = storage.get(checkpointKey(g.cs.id));
    layer = h(
      'div.finale-layer.finale-stats',
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': '시즌 기록', tabindex: '-1' },
      h('h2', null, `엔딩 ${found.length} / ${f!.endings.length}`),
      h('ul.fs-endings', null, ...f!.endings.map((e) => h(`li${found.includes(e.id) ? '.got' : ''}`, { dataset: { ending: e.id } }, found.includes(e.id) ? `✓ 「${e.title}」` : '· ???'))),
      h('ul.fs-facts', null, h('li', null, `숨은 사인 ${st.signFound ? '✓ 직접 찾음' : '✗ 피날레에서 봄'}`, st.signFound ? null : h('div.fs-how', null, SIGN_HOW)), h('li', null, `은재의 초안 ${read} / ${drafts} 읽음`, read < drafts ? h('div.fs-how.fs-drafts', null, DRAFTS_HOW) : null), h('li', null, `힌트 단계 ${season().hints}개 (시즌)`), st.line ? h('li.fs-line', null, `다음 사람에게: “${st.line}” — 한도윤`) : null),
      h(
        'div.fs-acts',
        null,
        back ? h('button.ghost-btn.fs-again', { type: 'button', onclick: () => document.dispatchEvent(new CustomEvent('nh-finale-again')) }, '다른 곳에 넘겨 보기') : null,
        h('button.primary-btn.fs-debrief', { type: 'button', onclick: () => (go('done', { done: true }), clearLayer(), ctx.wm.open('report')) }, '해설 보기'),
      ),
      feedbackLine(),
    );
    document.body.appendChild(layer);
    // focus the record itself, not 해설 보기: an Enter still on its way from the line before (its
    // 15 s ran out mid-typing) pressed that button and skipped the record and its replay
    const self = layer;
    self.focus({ preventScroll: true });
  }

  const STEPS: Record<string, () => void> = { choice, card, grey, reply, crontab, credits, line, stats };

  function refresh(): void {
    const st = g.finaleState();
    if (!st || st.done) {
      if (shown) (clearLayer(), setBar(null));
      shown = '';
      return;
    }
    if (st.step === shown) return;
    clearLayer();
    shown = st.step;
    STEPS[st.step]?.();
  }

  // the last scene ended (or was skipped): the 24th line is there, and the choice comes
  const begin = () => {
    if (g.finaleState() || !g.st.finished) return;
    const hd = String(g.world.hosts.get(f.handover.host)?.vfs.lookup(f.handover.path)?.content ?? '');
    if (!hd.includes(f.handover.line)) g.appendTo(f.handover.host, f.handover.path, [f.handover.line]);
    storage.set(checkpointKey(g.cs.id), g.serialize());
    go('choice', { signFound: g.st.triggersFired.includes(f.signTrigger) });
  };
  g.on('ending', (what) => what === 'done' && begin());
  g.on('finale', () => refresh());

  // the hidden bad ending: the PC's crontab removed, the plant's Monday reminder with it
  let bad: HTMLElement | null = null;
  g.on('crontab-removed', (p) => {
    const r = p as { host: string; user: string };
    if (r.host !== f.bad.host || r.user !== f.bad.user || bad) return;
    recordEnding('monstera');
    void audio.play('sfx.wilt');
    bad = h(
      'div.finale-layer.finale-bad',
      { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'fb-t' },
      h('h2#fb-t', null, f.bad.title),
      h('p', null, f.bad.sub),
      h(
        'button.ghost-btn.fb-back',
        {
          type: 'button',
          onclick: () => {
            g.restoreCrontab(f.bad.host, f.bad.user);
            bad?.remove();
            bad = null;
            // show the note the restore left under `crontab -r` (the tab re-renders)
            const tab = g.cs.terminalTabs.findIndex((x) => x.host === f.bad.host);
            if (tab >= 0 && ctx.wm.isOpen('terminal')) ctx.wm.instance('terminal')?.open?.(tab);
          },
        },
        f.bad.back,
      ),
    );
    document.body.appendChild(bad);
    (bad.querySelector('button') as HTMLElement).focus();
  });

  // a reload: carry on where the finale stood, or start it if the last scene had ended
  const resume = () => {
    if (g.st.finished && g.st.ending?.done && !g.finaleState()) begin();
    else refresh();
  };
  return { refresh, resume };
}
