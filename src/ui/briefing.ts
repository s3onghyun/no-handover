// Opening briefing (about 30-35 s, skippable with Esc or the 건너뛰기 button):
//   lock  Monday 09:00 lock screen, briefing sting
//   ring  a voice-message card from the team lead slides up (ring sfx)
//   voice the message plays; its subtitles type out like messenger bubbles. If the recorded
//         voice cue exists, typing is paced to its length; otherwise a soft typing loop plays.
//   mail  the CTO mail notification slides in
//   desk  onReveal() builds the desktop (terminal open, prompt pulsing) and the overlay fades
// Everything the characters say comes from the case file (opening.briefing); UI chrome from i18n.

import { h } from './dom.ts';
import { t } from '../i18n.ts';
import type { AudioManager, PlayHandle } from '../audio/audio.ts';
import type { CaseFile } from '../engine/types.ts';

export interface BriefingOpts {
  cs: CaseFile;
  audio: AudioManager;
  avatar(personId: string, size?: number): HTMLElement;
  name(personId: string): string;
  /** Called once when the desktop should appear (also on skip). */
  onReveal(): void;
  /** Called when the overlay is gone. */
  onDone(skipped: boolean, watchedMs: number, step: string): void;
  /** Time multiplier for tests and facilitators (?bspeed=4). Default 1. */
  speed?: number;
}

export type BriefingStep = 'lock' | 'ring' | 'voice' | 'mail' | 'desk';

class Cancelled extends Error {}

export function runBriefing(o: BriefingOpts): { skip(): void; el: HTMLElement } {
  const b = o.cs.opening!.briefing;
  const mail = o.cs.mails.find((m) => m.id === b.mail);
  const speed = Math.max(0.05, o.speed ?? 1);
  const started = performance.now();
  let step: BriefingStep = 'lock';
  let cancelled = false;
  let revealed = false;
  let finished = false;
  const timers = new Set<number>();
  const handles: PlayHandle[] = [];

  const sleep = (ms: number) =>
    new Promise<void>((res, rej) => {
      if (cancelled) return rej(new Cancelled());
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (cancelled) rej(new Cancelled());
        else res();
      }, ms / speed);
      timers.add(id);
    });

  // ---------------------------------------------------------------- DOM
  const skipBtn = h('button.brief-skip', { onclick: () => skip(), 'aria-label': t('brief.skip') }, t('brief.skip'), h('kbd', null, t('brief.skipKey')));
  const lock = h('div.brief-lock', null, h('div.brief-time', null, b.lockTime), h('div.brief-date', null, b.lockDate));
  const waves = h('div.brief-wave', { 'aria-hidden': 'true' }, ...Array.from({ length: 24 }, (_, i) => h('i', { style: { animationDelay: `${(i % 6) * 0.11}s` } })));
  const subs = h('div.brief-subs', { 'aria-live': 'polite' });
  const card = h(
    'div.brief-card',
    { role: 'dialog', 'aria-label': `${o.name(b.caller)} · ${b.kind === 'call' ? t('brief.call') : t('brief.voice')}` },
    h('div.brief-head', null, o.avatar(b.caller, 46), h('div', null, h('b', null, o.name(b.caller)), h('div.brief-sub', null, `${o.cs.people[b.caller]?.role ?? ''} · ${b.kind === 'call' ? t('brief.call') : t('brief.voice')}`)), h('span.brief-live', null, `● ${t('brief.playing')}`)),
    waves,
    subs,
  );
  const mailCard = mail
    ? h('div.brief-mail', { role: 'status' }, h('div.brief-mail-meta', null, `✉ ${t('brief.newMail')} · ${t('brief.now')}`), h('b', null, `${o.name(mail.from)} · ${mail.subject}`), h('div', null, b.mailPreview))
    : null;
  const el = h('div#briefing', { dataset: { step } }, lock, card, mailCard, skipBtn);
  document.body.appendChild(el);
  const setStep = (s: BriefingStep) => {
    step = s;
    el.dataset.step = s;
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      skip();
    }
  };
  document.addEventListener('keydown', onKey, true);

  const reveal = () => {
    if (revealed) return;
    revealed = true;
    o.onReveal();
  };

  const finish = (skipped: boolean, fadeMs: number) => {
    if (finished) return;
    finished = true;
    document.removeEventListener('keydown', onKey, true);
    for (const id of timers) clearTimeout(id);
    timers.clear();
    for (const hd of handles) hd.stop(skipped ? 150 : 600);
    o.audio.stopLoop('sfx.typing', 150);
    reveal();
    el.classList.add('out');
    el.style.transitionDuration = `${fadeMs}ms`;
    window.setTimeout(() => el.remove(), fadeMs);
    o.onDone(skipped, performance.now() - started, step);
  };

  function skip() {
    if (finished) return;
    cancelled = true;
    finish(true, 220);
  }

  // ---------------------------------------------------------------- sequence
  const typeLine = async (text: string, charMs: number) => {
    const bubble = h('div.brief-line.typing');
    subs.appendChild(bubble);
    const chars = [...text];
    for (let i = 0; i < chars.length; i++) {
      bubble.textContent = chars.slice(0, i + 1).join('');
      await sleep(charMs);
    }
    bubble.classList.remove('typing');
  };

  (async () => {
    try {
      void o.audio.play('music.briefing').then((hd) => handles.push(hd));
      await sleep(3000);
      setStep('ring');
      void o.audio.play('sfx.ring');
      await sleep(2200);
      setStep('voice');
      const totalChars = b.lines.reduce((a, l) => a + [...l.text].length, 0);
      const pauses = b.lines.reduce((a, l) => a + (l.pauseMs ?? 700), 0);
      let charMs = 72;
      if (b.voiceCue && (await o.audio.hasFile(b.voiceCue))) {
        const hd = await o.audio.play(b.voiceCue);
        handles.push(hd);
        // pace the subtitles to the recording (leave the pauses as they are)
        if (hd.duration > 0) charMs = Math.max(25, Math.min(140, (hd.duration * 1000 * 0.92 - pauses) / totalChars));
      } else o.audio.loop('sfx.typing');
      for (const l of b.lines) {
        await typeLine(l.text, charMs);
        o.audio.stopLoop('sfx.typing', 100);
        await sleep(l.pauseMs ?? 700);
        if (l !== b.lines[b.lines.length - 1] && !(await o.audio.hasFile(b.voiceCue ?? ''))) o.audio.loop('sfx.typing');
      }
      el.classList.add('voice-done');
      setStep('mail');
      void o.audio.play('sfx.mail');
      await sleep(4200);
      setStep('desk');
      reveal();
      await sleep(400);
      finish(false, 900);
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
    }
  })();

  return { skip, el };
}
