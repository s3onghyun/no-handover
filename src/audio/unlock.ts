// Browser autoplay unlock: the AudioContext may only start inside a user gesture.
//
// - Every pointerdown / keydown / touchend anywhere on the page (capture phase, so it runs before
//   any button handler and even when a handler stops propagation) calls audio.unlock() until the
//   context is running. unlock() is cheap and idempotent, so the listeners stay on: Safari can
//   suspend the context again later (background tab, phone call) and the next tap resumes it.
// - When the tab becomes visible again, the context is resumed without waiting for a gesture.
// - While the context is not running, a small "click to enable sound" hint sits at the bottom of
//   the screen (lock screen included); it disappears as soon as sound can play. Mute does not
//   matter: a muted player still unlocks, so unmuting later works without another click.
// - onRunning fires once, the first time the context is running (main.ts logs it to the
//   playtest log as 'audio-unlock').

import type { AudioManager } from './audio.ts';

export interface UnlockInfo {
  /** ms since page load when the context first ran. */
  ms: number;
  /** Event type of the gesture that unlocked it (pointerdown, keydown, ...). */
  via: string;
  state: string;
  muted: boolean;
}

const GESTURES = ['pointerdown', 'keydown', 'touchend', 'mousedown'] as const;

export function installAudioUnlock(audio: AudioManager, opts: { hintText: string; onRunning?: (info: UnlockInfo) => void }): { hint: HTMLElement } {
  let via = '';
  let reported = false;
  const hint = document.createElement('div');
  hint.className = 'sound-hint';
  hint.setAttribute('role', 'status');
  hint.textContent = opts.hintText;
  Object.assign(hint.style, {
    position: 'fixed',
    left: '50%',
    bottom: '18px',
    transform: 'translateX(-50%)',
    zIndex: '10000',
    padding: '6px 12px',
    borderRadius: '999px',
    background: 'rgba(0,0,0,.55)',
    color: '#fff',
    font: '12px/1.4 system-ui, sans-serif',
    pointerEvents: 'none',
    opacity: '.85',
  } satisfies Partial<CSSStyleDeclaration>);

  const render = () => {
    const running = audio.running();
    // no WebAudio at all: nothing a click could fix, so no hint
    const show = !running && !(audio.unlocked && !audio.available());
    if (show && !hint.isConnected) document.body.appendChild(hint);
    if (!show && hint.isConnected) hint.remove();
    if (running && !reported) {
      reported = true;
      opts.onRunning?.({ ms: Math.round(audio.runningAt ?? performance.now()), via: via || 'unknown', state: audio.state(), muted: audio.muted });
    }
  };

  const onGesture = (e: Event) => {
    if (audio.running()) return;
    if (!via) via = e.type;
    audio.unlock();
    render();
  };
  for (const g of GESTURES) document.addEventListener(g, onGesture, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) audio.resumeIfNeeded();
  });
  audio.onChange(render);
  render();
  return { hint };
}
