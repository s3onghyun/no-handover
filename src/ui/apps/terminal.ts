import { clear, h, storage } from '../dom.ts';
import { t } from '../../i18n.ts';
import type { AppDef } from '../wm.ts';
import type { OutLine } from '../../engine/shell.ts';
import { clueMark, nextRun, parsePrompt, type LineContext } from '../../engine/linepin.ts';
import { DUR, play } from '../motion.ts';

/** Set once the one-time "pin a single line" tip has been shown on this profile (?fresh=1 clears it). */
export const PIN_TIP_KEY = 'no-handover:pin-tip';
/** An output at least this long brings the tip (short ones need no help). */
const TIP_LINES = 8;

export const terminalApp: AppDef = {
  id: 'terminal',
  title: () => t('app.terminal'),
  icon: '🖥️',
  w: 920,
  h: 560,
  x: 130,
  y: 24,
  mount(body, ctx) {
    const g = ctx.game;
    let cur = 0;
    let histPos = -1;
    let draft = '';
    const touched = new Set<number>();

    const tabsEl = h('div.ttabs', { role: 'tablist' });
    const out = h('div.tout', { 'aria-live': 'polite' });
    const ps1 = h('span.ps1');
    const input = h('input', { type: 'text', spellcheck: false, autocomplete: 'off', 'aria-label': 'command', autocapitalize: 'off' }) as HTMLInputElement;
    // the picked line's toolbar: sits between the output and the prompt; every button is a 44 px target on touch
    const bar = h('div.tpinbar', { role: 'toolbar', 'aria-label': t('term.bar'), hidden: true });
    // the prompt comes before the output in the document (CSS puts it at the bottom): after a long
    // output a truncated accessibility snapshot still lists the command textbox
    const term = h('div.term', null, tabsEl, h('div.tin', null, ps1, input), out, bar);
    body.appendChild(term);
    term.addEventListener('mouseup', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('.tline[data-pin], .tpinbar')) return; // picking a line keeps the focus on it
      if (!window.getSelection()?.toString()) input.focus();
    });

    // ---- picking one line of output (src/engine/linepin.ts): click / tap / Shift+↑, then 📌 or P
    /** Per pinnable line element: its text and the host + command that printed it. */
    const info = new WeakMap<HTMLElement, { text: string; lc: LineContext; /** Marked lines: the clue ids they prove. */ mark: string }>();
    let sel: HTMLElement | null = null;
    const pinnable = () => [...out.querySelectorAll<HTMLElement>('.tline[data-pin]')];
    const isPinned = (el: HTMLElement) => {
      const d = info.get(el);
      return !!d && g.st.pins.some((p) => p.text === d.text && p.source === d.lc.source);
    };
    const renderBar = () => {
      clear(bar);
      bar.hidden = !sel;
      if (!sel) return;
      const d = info.get(sel)!;
      const marked = sel.classList.contains('maybe') || sel.classList.contains('clue');
      const hasMarks = !!out.querySelector('.tline.maybe, .tline.clue');
      const pinned = isPinned(sel);
      const btn = (cls: string, label: string, title: string, fn: () => void, extra: Record<string, unknown> = {}) =>
        h(`button.${cls}`, { type: 'button', title, 'aria-label': title, onclick: fn, ...extra }, label);
      bar.append(
        h(
          'div.tpb-line',
          null,
          h('span.tpb-src', null, `${d.lc.host} $ ${d.lc.cmd || '…'}`),
          marked ? h('span.tpb-maybe', null, t('term.maybeClue')) : null,
        ),
        h(
          'div.tpb-acts',
          null,
          btn('tpb-up', '↑', t('term.barUp'), () => move(-1)),
          btn('tpb-down', '↓', t('term.barDown'), () => move(1)),
          hasMarks ? btn('tpb-mark', t('term.barMark'), t('term.barMarkTitle'), () => jump(-1)) : null,
          h(`button.tpb-pin${pinned ? '.pinned' : ''}`, { type: 'button', 'aria-pressed': String(pinned), onclick: () => pinSel('line-bar') }, t(pinned ? 'term.barPinned' : 'term.barPin')),
          btn('tpb-close', '✕', t('term.barClose'), () => leave()),
          h('span.tpb-keys', { 'aria-hidden': 'true' }, t('term.barKeys')),
        ),
      );
    };
    const pick = (el: HTMLElement | null | undefined, focus = true, block: ScrollLogicalPosition = 'nearest') => {
      if (!el) return;
      sel?.classList.remove('sel');
      sel?.removeAttribute('tabindex');
      sel = el;
      el.classList.add('sel');
      el.tabIndex = -1;
      renderBar();
      el.scrollIntoView({ block });
      if (focus) el.focus({ preventScroll: true });
    };
    /** Drop the picked line; back to the prompt. */
    const leave = (focusInput = true) => {
      sel?.classList.remove('sel');
      sel?.removeAttribute('tabindex');
      sel = null;
      renderBar();
      if (focusInput) input.focus();
    };
    const move = (by: number) => {
      const list = pinnable();
      const i = sel ? list.indexOf(sel) : list.length;
      const j = Math.max(0, Math.min(list.length - 1, i + by));
      if (by > 0 && i === list.length - 1) return leave();
      pick(list[j]);
    };
    /**
     * Up (-1) or down (1) to the next run of lines marked "이 줄은 단서가 될 수 있어요", landing on the
     * run's first line (src/engine/linepin.ts nextRun: an hourly stats line repeated fifty times, or
     * the same error after every restart, is one stop).
     */
    const jump = (dir: -1 | 1) => {
      const list = pinnable();
      const j = nextRun(list.map((el) => info.get(el)?.mark ?? ''), sel ? list.indexOf(sel) : list.length, dir);
      if (j >= 0) pick(list[j], true, 'center'); // a jump lands mid-output, clear of the edges (and a phone's toasts)
    };
    const pinSel = (via: string) => {
      if (!sel) return;
      const d = info.get(sel)!;
      const pin = ctx.pinNow({ kind: 'line', text: d.text, source: d.lc.source, host: d.lc.host, cmd: d.lc.cmd, via });
      if (pin) play(sel, 'pinflash', DUR.base);
      renderBar();
      sel.focus({ preventScroll: true });
    };
    out.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!sel || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const page = Math.max(1, Math.floor(out.clientHeight / Math.max(12, sel.offsetHeight)) - 1);
      const k = e.key;
      if (k === 'ArrowUp' || k === 'ArrowDown') e.shiftKey ? jump(k === 'ArrowUp' ? -1 : 1) : move(k === 'ArrowUp' ? -1 : 1);
      else if (k === 'PageUp' || k === 'PageDown') move(k === 'PageUp' ? -page : page);
      else if (k === 'Home') pick(pinnable()[0]);
      else if (k === 'End') pick(pinnable().at(-1));
      else if (k === 'p' || k === 'P' || k === 'Enter' || k === ' ') pinSel('line-key');
      else if (k === 'Escape') leave();
      else if (k.length === 1) {
        // typing goes back to the prompt, with the key
        leave();
        input.value += k;
        input.classList.remove('frozen');
        tab().input = input.value;
        touched.add(cur);
      } else return;
      e.preventDefault();
    });
    // a click or tap on a line picks it (the toolbar shows its 📌); on the picked line it pins it.
    // Capture phase: the line's own 📌 stops its click, and it picks its line too. No pointerType
    // check: WebKit reports a tap's click as a mouse click.
    out.addEventListener(
      'click',
      (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const el = target.closest<HTMLElement>('.tline[data-pin]');
        if (!el || window.getSelection()?.toString()) return;
        if (target.closest('.pinbtn')) pick(el, false);
        else if (el === sel) pinSel('line-again');
        else pick(el);
      },
      true,
    );
    let tipped = false;
    /** One-time tip, the first time a long output arrives and nothing is pinned from the terminal yet. */
    const maybeTip = (added: number) => {
      if (tipped || added < TIP_LINES || g.st.pins.some((p) => p.kind === 'line')) return;
      tipped = true;
      if (storage.get(PIN_TIP_KEY)) return;
      storage.set(PIN_TIP_KEY, '1');
      g.log('pin-tip');
      ctx.toast(`📌 ${t('term.pinTip')}`);
    };
    /** Focus the prompt only while the terminal is the front window (a deferred focus must not pull it forward). */
    const focusPrompt = () => setTimeout(() => ctx.wm.focused === 'terminal' && input.focus(), 0);

    const tab = () => g.tab(cur);
    const host = () => g.shell.frame(tab().session).host;

    const lineEl = (l: OutLine, lc: LineContext, afterCmd: boolean) => {
      // a line some command's clue regex matches, once that command has found the clue: the tutorial's
      // yellow CLUE marker (clmystery) or, elsewhere, a faint edge "이 줄은 단서가 될 수 있어요"
      const mark = clueMark(g, l, afterCmd);
      const el = h(`div.tline${l.cls ? '.' + l.cls : ''}${mark === 'strong' ? '.clue' : mark === 'subtle' ? '.maybe' : ''}`, null, l.text || '\u200b');
      if (mark) el.title = t('term.maybeClue');
      if (l.text.trim() && l.cls !== 'sys') {
        el.dataset.pin = '';
        info.set(el, { text: l.text, lc, mark: mark ? g.cluesFor(l.text).sort().join(' ') : '' });
        el.appendChild(ctx.pinBtn({ kind: 'line', text: l.text, source: lc.source, host: lc.host, cmd: lc.cmd }));
      }
      return el;
    };
    /** Line elements for `lines`, with the context carried over from the lines before them. */
    const build = (lines: OutLine[], start: { lc: LineContext; after: boolean }) => {
      const frag = document.createDocumentFragment();
      let { lc, after } = start;
      for (const l of lines) {
        if (l.cls === 'sys') {
          after = true;
          const p = parsePrompt(l.text);
          if (p) lc = { host: p.host, cmd: p.cmd, source: `${p.host} · ${p.cmd}` };
        }
        frag.appendChild(lineEl(l, lc, after));
      }
      return frag;
    };
    const blank = (): { lc: LineContext; after: boolean } => ({ lc: { host: host(), cmd: '', source: tab().label }, after: false });

    const renderAll = () => {
      sel = null;
      renderBar();
      clear(out);
      out.appendChild(build(tab().lines, blank()));
      out.scrollTop = out.scrollHeight;
    };

    const renderTabs = () => {
      clear(tabsEl);
      g.st.tabs.forEach((tb, i) => {
        tabsEl.appendChild(
          h(`button.ttab${i === cur ? '.sel' : ''}`, { role: 'tab', 'aria-selected': String(i === cur), onclick: () => selectTab(i) }, tb.label),
        );
      });
      for (const d of g.cs.deadTabs ?? []) {
        tabsEl.appendChild(
          h('button.ttab.dead', {
            title: t('term.closedTab'),
            onclick: () => {
              tab().lines.push({ text: `[${d}] ${t('term.closedTab')}`, cls: 'dim' });
              renderAll();
            },
          }, d),
        );
      }
    };

    const renderPrompt = () => {
      ps1.textContent = g.shell.prompt(tab().session);
      input.value = tab().input;
      input.classList.toggle('frozen', !touched.has(cur) && !!g.cs.terminalTabs[cur]?.prefill && tab().input === g.cs.terminalTabs[cur]?.prefill);
    };

    const selectTab = (i: number) => {
      tab().input = input.value;
      cur = i;
      histPos = -1;
      renderTabs();
      renderAll();
      renderPrompt();
      input.focus();
    };

    const typedHistory = () =>
      g.st.log.filter((e) => e.type === 'cmd' && e.tab === tab().label).map((e) => String(e.line));

    const run = () => {
      const line = input.value;
      touched.add(cur);
      const before = tab().lines.length;
      const r = g.runCommand(cur, line);
      histPos = -1;
      if (r.clear || tab().lines.length < before) renderAll();
      else {
        const fresh = tab().lines.slice(before);
        // the echo of this command is the first new line: it sets the host and command for the rest
        out.appendChild(build(fresh, blank()));
        while (out.childElementCount > 700) out.firstElementChild?.remove();
        if (sel && !sel.isConnected) leave(false);
        out.scrollTop = out.scrollHeight;
        maybeTip(fresh.filter((l) => l.cls !== 'sys' && l.text.trim()).length);
      }
      renderPrompt();
    };

    input.addEventListener('input', () => {
      touched.add(cur);
      input.classList.remove('frozen');
      tab().input = input.value;
    });

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        run();
      } else if (e.key === 'ArrowUp' && e.shiftKey) {
        // pick the newest line of output: then ↑↓ move, P pins, Esc comes back here
        e.preventDefault();
        pick(pinnable().at(-1));
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const hist = typedHistory();
        if (!hist.length) return;
        if (histPos === -1) draft = input.value;
        histPos = e.key === 'ArrowUp' ? (histPos === -1 ? hist.length - 1 : Math.max(0, histPos - 1)) : histPos === -1 ? -1 : histPos + 1;
        if (histPos >= hist.length) histPos = -1;
        input.value = histPos === -1 ? draft : hist[histPos];
        tab().input = input.value;
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const c = g.shell.complete(tab().session, input.value);
        if (c.options.length > 1 && c.replace === input.value) {
          tab().lines.push({ text: `${g.shell.prompt(tab().session)} ${input.value}`, cls: 'sys' }, { text: c.options.join('  '), cls: 'dim' });
          renderAll();
        }
        input.value = c.replace;
        tab().input = input.value;
      } else if (e.key === 'c' && e.ctrlKey && input.selectionStart === input.selectionEnd) {
        e.preventDefault();
        tab().lines.push({ text: `${g.shell.prompt(tab().session)} ${input.value}^C`, cls: 'sys' });
        input.value = '';
        tab().input = '';
        renderAll();
      } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        tab().lines = [];
        renderAll();
      }
    });

    renderTabs();
    renderAll();
    renderPrompt();
    focusPrompt();

    return {
      focus: focusPrompt,
      refresh: (type?: string) => {
        if (type !== 'pins') return;
        // pins changed: update pin markers without re-rendering output
        out.querySelectorAll('.pinbtn').forEach((b) => (b as HTMLElement).dispatchEvent(new Event('sync')));
        if (sel) renderBar();
      },
      open: (arg) => {
        if (typeof arg === 'number') selectTab(arg);
      },
    };
  },
};
