// Report options must not give the answer away (playtest: "the longest, most specific option is
// always right", and options named facts the player had not found yet), and every slot asks for
// cited evidence that the board can show as met / missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CaseFile, SlotDef } from '../src/engine/types.ts';
import { caseZeroWiki } from '../src/cases/case-0-wiki.ts';
import { caseOneCron } from '../src/cases/case-1-cron.ts';
import { caseTwoDeleted } from '../src/cases/case-2-deleted.ts';
import { caseFriday1802 } from '../src/cases/friday-1802.ts';

const CASES: CaseFile[] = [caseZeroWiki, caseOneCron, caseTwoDeleted, caseFriday1802];

const len = (s: string) => [...s].length;
const right = (s: SlotDef) => s.options.filter((o) => (s.type === 'single' ? o.correct : (o.weight ?? 0) > 0));
const wrong = (s: SlotDef) => s.options.filter((o) => !right(s).includes(o));

/** Options the report shows before any clue is found (gated red herrings come later). */
const shownAtStart = (s: SlotDef) => s.options.filter((o) => !o.needs?.length);

for (const cs of CASES) {
  test(`${cs.id}: no slot's correct option is the strictly longest one`, () => {
    for (const s of cs.accusation.slots) {
      // check both the full list and what the report shows before any red herring unlocks
      for (const opts of [s.options, shownAtStart(s)]) {
        const longest = Math.max(...opts.map((o) => len(o.text)));
        const top = opts.filter((o) => len(o.text) === longest);
        const ok = right(s);
        assert.ok(!(top.length === 1 && ok.includes(top[0])), `${cs.id}/${s.id}: correct option "${top[0].id}" is the strictly longest (${longest})`);
      }
    }
  });

  test(`${cs.id}: options are of similar length (longest ≤ 1.5 × shortest; right and wrong average within 20 %)`, () => {
    for (const s of cs.accusation.slots) {
      const ls = s.options.map((o) => len(o.text));
      assert.ok(Math.max(...ls) <= 1.5 * Math.min(...ls), `${cs.id}/${s.id}: lengths ${ls.join(', ')}`);
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const r = avg(right(s).map((o) => len(o.text)));
      const w = avg(wrong(s).map((o) => len(o.text)));
      assert.ok(r <= w * 1.2 && r >= w * 0.8, `${cs.id}/${s.id}: right ${r.toFixed(0)} vs wrong ${w.toFixed(0)}`);
    }
  });

  test(`${cs.id}: correct options are never gated; gates name real clues or triggers`, () => {
    const ids = new Set([...cs.clues.map((c) => c.id), ...cs.triggers.map((t) => t.id)]);
    for (const s of cs.accusation.slots) {
      for (const o of right(s)) assert.ok(!o.needs?.length, `${cs.id}/${s.id}/${o.id} is correct and gated`);
      for (const o of s.options) for (const c of o.needs ?? []) assert.ok(ids.has(c), `${cs.id}/${s.id}/${o.id}: unknown clue or trigger ${c}`);
    }
  });

  test(`${cs.id}: no option text names a fact only an undiscovered clue reveals`, () => {
    // what the player sees before finding anything: the briefing, the brief mail, the report and
    // the checklist (title, prompts, items) — facts in there are not discoveries
    const brief = cs.mails.find((m) => m.id === cs.opening?.briefing.mail);
    const items = cs.opening?.objectives.items ?? [];
    const open = [
      cs.title, cs.subtitle, cs.accusation.intro ?? '', cs.goal?.intro ?? '',
      ...(cs.opening?.briefing.lines.map((l) => l.text) ?? []), cs.opening?.briefing.mailPreview ?? '', brief?.subject ?? '', brief?.body ?? '',
      ...cs.accusation.slots.flatMap((s) => [s.title, s.prompt]),
      ...items.flatMap((i) => [i.text, i.hint ?? '']),
    ].join('\n').toLowerCase();
    for (const s of cs.accusation.slots) {
      for (const o of s.options) {
        const text = o.text.toLowerCase();
        for (const c of cs.clues) {
          if (o.needs?.includes(c.id)) continue; // shown only after this clue is found
          for (const tok of facts(c.label)) {
            if (open.includes(tok)) continue;
            assert.ok(!text.includes(tok), `${cs.id}/${s.id}/${o.id} names "${tok}" from undiscovered clue ${c.id} (${c.label})`);
          }
        }
      }
    }
  });

  test(`${cs.id}: every slot asks for evidence; kinds name real clues and the right answer can be cited`, () => {
    const byId = new Map(cs.clues.map((c) => [c.id, c]));
    for (const s of cs.accusation.slots) {
      assert.ok(s.evidence?.length, `${cs.id}/${s.id} has no evidence kinds`);
      const kinds = new Set<string>();
      for (const k of s.evidence!) {
        assert.ok(!kinds.has(k.id), `${cs.id}/${s.id}: duplicate kind ${k.id}`);
        kinds.add(k.id);
        assert.ok(k.clues.length, `${cs.id}/${s.id}/${k.id} has no clues`);
        for (const c of k.clues) assert.ok(byId.has(c), `${cs.id}/${s.id}/${k.id}: unknown clue ${c}`);
        // the label is a kind of evidence, not a found fact
        for (const c of cs.clues) for (const tok of facts(c.label)) assert.ok(!k.label.toLowerCase().includes(tok), `${cs.id}/${s.id}/${k.id} label names "${tok}"`);
      }
      // at least one kind can be met by a key clue (the evidence the case is built on)
      assert.ok(s.evidence!.some((k) => k.clues.some((c) => byId.get(c)!.key)), `${cs.id}/${s.id}: no kind takes a key clue`);
    }
  });
}

/**
 * Distinctive facts in a clue label: clock times, sizes and percentages, long numbers (PIDs,
 * counts), paths, and identifiers that are not just the command that shows them.
 */
function facts(label: string): string[] {
  const out = new Set<string>();
  const add = (s: string) => out.add(s.toLowerCase());
  for (const m of label.matchAll(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g)) add(m[0]);
  for (const m of label.matchAll(/\d+(?:[.,]\d+)*\s?(?:GB\/h|G|M|GB|%)/g)) add(m[0].replace(/\s/g, ''));
  for (const m of label.matchAll(/\d{3,}(?:,\d{3})*|\d{1,3}(?:,\d{3})+/g)) add(m[0]);
  for (const m of label.matchAll(/(?:~|\/)[\w.\-/~<>]*[\w]/g)) if (m[0].length > 2) add(m[0]);
  for (const m of label.matchAll(/[A-Za-z][A-Za-z0-9_\-.]{3,}/g)) if (!COMMANDS.has(m[0].toLowerCase())) add(m[0]);
  return [...out];
}

/** Command and tool names that say how a clue was seen, not what it says. */
const COMMANDS = new Set(
  'tail head grep cat less journalctl systemctl status crontab history which type echo printenv getent last sudo git branch log show access.log ssh pgrep pidof ps ls lh du df env vim bash cron journald logrotate nginx debug info file files'.split(' '),
);
