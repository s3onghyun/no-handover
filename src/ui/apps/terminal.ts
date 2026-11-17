import { clear, h } from '../dom.ts';
import { t } from '../../i18n.ts';
import type { AppDef } from '../wm.ts';
import type { OutLine } from '../../engine/shell.ts';

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
    const term = h('div.term', null, tabsEl, out, h('div.tin', null, ps1, input));
    body.appendChild(term);
    term.addEventListener('mouseup', () => {
      if (!window.getSelection()?.toString()) input.focus();
    });

    const tab = () => g.tab(cur);
    const host = () => g.shell.frame(tab().session).host;

    const lineEl = (l: OutLine, source: string) => {
      // tutorial: lines that prove a clue are marked yellow (clmystery's CLUE marker)
      const clue = g.cs.rail?.highlightClues && l.cls !== 'sys' && l.cls !== 'err' && l.text.trim() && g.cluesFor(l.text).length > 0;
      const el = h(`div.tline${l.cls ? '.' + l.cls : ''}${clue ? '.clue' : ''}`, null, l.text || '​');
      if (l.text.trim() && l.cls !== 'sys') el.appendChild(ctx.pinBtn({ kind: 'line', text: l.text, source }));
      return el;
    };

    const renderAll = () => {
      clear(out);
      let source = tab().label;
      const frag = document.createDocumentFragment();
      for (const l of tab().lines) {
        if (l.cls === 'sys') source = `${host()} · ${l.text.replace(/^\S+\$ /, '')}`;
        frag.appendChild(lineEl(l, source));
      }
      out.appendChild(frag);
      out.scrollTop = out.scrollHeight;
    };

    const renderTabs = () => {
      clear(tabsEl);
      g.st.tabs.forEach((tb, i) => {
        tabsEl.appendChild(
          h(`button.ttab${i === cur ? '.sel' : ''}`, { role: 'tab', 'aria-selected': String(i === cur), onclick: () => select(i) }, tb.label),
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

    const select = (i: number) => {
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
        let source = `${host()} · ${line}`;
        const frag = document.createDocumentFragment();
        for (const l of tab().lines.slice(before)) {
          if (l.cls === 'sys') source = `${host()} · ${l.text.replace(/^\S+\$ /, '')}`;
          frag.appendChild(lineEl(l, source));
        }
        out.appendChild(frag);
        while (out.childElementCount > 700) out.firstElementChild?.remove();
        out.scrollTop = out.scrollHeight;
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
    setTimeout(() => input.focus(), 0);

    return {
      focus: () => setTimeout(() => input.focus(), 0),
      refresh: (type?: string) => {
        if (type !== 'pins') return;
        // pins changed: update pin markers without re-rendering output
        out.querySelectorAll('.pinbtn').forEach((b) => (b as HTMLElement).dispatchEvent(new Event('sync')));
      },
      open: (arg) => {
        if (typeof arg === 'number') select(arg);
      },
    };
  },
};
