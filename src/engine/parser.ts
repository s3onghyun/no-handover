// A small POSIX-ish shell parser: lists (; && ||), pipelines (|), redirections, quoting,
// $VAR, $(...) command substitution, ~ and glob markers, # comments.

export type Part =
  | { t: 'lit'; v: string; q: boolean }
  | { t: 'sub'; src: string }
  | { t: 'var'; name: string; q: boolean };
export type Word = Part[];

export type RedirOp = '>' | '>>' | '<' | '2>' | '2>>' | '2>&1' | '&>';
export interface Redir {
  op: RedirOp;
  target?: Word;
}

export interface SimpleCmd {
  words: Word[];
  redirs: Redir[];
  /** Source span of the command and of its first word (for alias expansion). */
  start: number;
  end: number;
  firstStart: number;
  firstEnd: number;
}

export interface Pipeline {
  cmds: SimpleCmd[];
}

export interface ListItem {
  pipeline: Pipeline;
  /** Connector that follows this pipeline. */
  next: ';' | '&&' | '||' | null;
}

export class ParseError extends Error {}

const META = new Set([' ', '\t', '|', ';', '&', '<', '>', '\n']);

export function wordText(w: Word): string {
  return w.map((p) => (p.t === 'lit' ? p.v : p.t === 'var' ? '$' + p.name : `$(${p.src})`)).join('');
}

/** True if the word is a single unquoted literal (alias candidates, glob candidates). */
export function plainLiteral(w: Word): string | null {
  if (w.length === 1 && w[0].t === 'lit' && !w[0].q) return w[0].v;
  return null;
}

export function parse(src: string): ListItem[] {
  let i = 0;
  const n = src.length;
  const items: ListItem[] = [];

  const readSub = (): string => {
    // at "$(": find the matching ")" honouring quotes and nesting
    i += 2;
    const s = i;
    let depth = 1;
    while (i < n) {
      const c = src[i];
      if (c === "'") {
        const j = src.indexOf("'", i + 1);
        if (j < 0) throw new ParseError('unexpected EOF while looking for matching `\'\'');
        i = j + 1;
        continue;
      }
      if (c === '"') {
        i++;
        while (i < n && src[i] !== '"') i += src[i] === '\\' ? 2 : 1;
        if (i >= n) throw new ParseError('unexpected EOF while looking for matching `"\'');
        i++;
        continue;
      }
      if (c === '(') depth++;
      if (c === ')') {
        depth--;
        if (depth === 0) {
          const out = src.slice(s, i);
          i++;
          return out;
        }
      }
      i++;
    }
    throw new ParseError("unexpected EOF while looking for matching `)'");
  };

  const readVar = (q: boolean): Part => {
    i++; // $
    if (src[i] === '{') {
      const j = src.indexOf('}', i);
      if (j < 0) throw new ParseError('bad substitution');
      const name = src.slice(i + 1, j);
      i = j + 1;
      return { t: 'var', name, q };
    }
    const m = /^[A-Za-z_][A-Za-z0-9_]*|^[?$#0-9]/.exec(src.slice(i));
    if (!m) return { t: 'lit', v: '$', q };
    i += m[0].length;
    return { t: 'var', name: m[0], q };
  };

  const readWord = (): Word => {
    const parts: Word = [];
    const lit = (v: string, q: boolean) => {
      const last = parts[parts.length - 1];
      if (last && last.t === 'lit' && last.q === q) last.v += v;
      else parts.push({ t: 'lit', v, q });
    };
    while (i < n && !META.has(src[i])) {
      const c = src[i];
      if (c === '\\') {
        if (i + 1 < n) lit(src[i + 1], true);
        i += 2;
      } else if (c === "'") {
        const j = src.indexOf("'", i + 1);
        if (j < 0) throw new ParseError("unexpected EOF while looking for matching `''");
        lit(src.slice(i + 1, j), true);
        if (j === i + 1) lit('', true);
        i = j + 1;
      } else if (c === '"') {
        i++;
        let any = false;
        while (i < n && src[i] !== '"') {
          any = true;
          if (src[i] === '\\' && i + 1 < n && '"\\$`'.includes(src[i + 1])) {
            lit(src[i + 1], true);
            i += 2;
          } else if (src[i] === '$' && src[i + 1] === '(') parts.push({ t: 'sub', src: readSub() });
          else if (src[i] === '$') parts.push(readVar(true));
          else {
            lit(src[i], true);
            i++;
          }
        }
        if (i >= n) throw new ParseError('unexpected EOF while looking for matching `"\'');
        if (!any) lit('', true);
        i++;
      } else if (c === '$' && src[i + 1] === '(') {
        parts.push({ t: 'sub', src: readSub() });
      } else if (c === '$') {
        parts.push(readVar(false));
      } else if (c === '(' || c === ')') {
        throw new ParseError(`syntax error near unexpected token \`${c}'`);
      } else {
        lit(c, false);
        i++;
      }
    }
    return parts;
  };

  const skipWs = () => {
    while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
  };

  let cmds: SimpleCmd[] = [];
  let cur: SimpleCmd | null = null;
  const endCmd = () => {
    if (cur) {
      cur.end = i;
      cmds.push(cur);
      cur = null;
    }
  };
  const endPipeline = (next: ListItem['next']) => {
    endCmd();
    if (cmds.length === 0) {
      if (next === null && items.length === 0) return;
      if (next !== null || items.length) throw new ParseError(`syntax error near unexpected token \`${next ?? 'newline'}'`);
    }
    items.push({ pipeline: { cmds }, next });
    cmds = [];
  };

  while (true) {
    skipWs();
    if (i >= n || src[i] === '\n') break;
    const c = src[i];
    if (c === '#' && !cur) break; // comment to end of line
    if (c === '#' && cur && (src[i - 1] === ' ' || src[i - 1] === '\t')) break;
    if (c === '|') {
      if (src[i + 1] === '|') {
        i += 2;
        endPipeline('||');
        continue;
      }
      i++;
      endCmd();
      if (cmds.length === 0) throw new ParseError("syntax error near unexpected token `|'");
      skipWs();
      if (i >= n) throw new ParseError("syntax error near unexpected token `|'");
      continue;
    }
    if (c === ';') {
      i++;
      endPipeline(';');
      continue;
    }
    if (c === '&') {
      if (src[i + 1] === '&') {
        i += 2;
        endPipeline('&&');
        continue;
      }
      if (src[i + 1] === '>') {
        i += 2;
        skipWs();
        if (!cur) cur = { words: [], redirs: [], start: i, end: i, firstStart: i, firstEnd: i };
        (cur as SimpleCmd).redirs.push({ op: '&>', target: readWord() });
        continue;
      }
      throw new ParseError('background jobs (&) are not available in this session');
    }
    if (c === '>' || c === '<' || (c === '2' && (src[i + 1] === '>') && (!cur || src[i - 1] === ' '))) {
      let op: RedirOp;
      if (src.startsWith('2>&1', i)) op = '2>&1';
      else if (src.startsWith('2>>', i)) op = '2>>';
      else if (src.startsWith('2>', i)) op = '2>';
      else if (src.startsWith('>>', i)) op = '>>';
      else if (c === '>') op = '>';
      else op = '<';
      i += op.length;
      if (!cur) cur = { words: [], redirs: [], start: i, end: i, firstStart: i, firstEnd: i };
      if (op === '2>&1') {
        (cur as SimpleCmd).redirs.push({ op });
        continue;
      }
      skipWs();
      if (i >= n || META.has(src[i])) throw new ParseError('syntax error near unexpected token `newline\'');
      (cur as SimpleCmd).redirs.push({ op, target: readWord() });
      continue;
    }
    const ws = i;
    const w = readWord();
    if (!cur) cur = { words: [], redirs: [], start: ws, end: ws, firstStart: ws, firstEnd: i };
    const cc = cur as SimpleCmd;
    if (cc.words.length === 0) {
      cc.firstStart = ws;
      cc.firstEnd = i;
    }
    cc.words.push(w);
  }
  if (cur || cmds.length) endPipeline(null);
  else if (items.length && items[items.length - 1].next && items[items.length - 1].next !== ';') {
    throw new ParseError('syntax error: unexpected end of file');
  }
  return items;
}

/**
 * Expand aliases textually (bash does it before parsing words). Each alias name expands at most
 * once per line to avoid recursion; returns the rewritten line.
 */
export function expandAliases(line: string, aliases: Map<string, string>): string {
  let out = line;
  const used = new Set<string>();
  for (let pass = 0; pass < 3; pass++) {
    let items: ListItem[];
    try {
      items = parse(out);
    } catch {
      return out;
    }
    const spans: { s: number; e: number; v: string; name: string }[] = [];
    for (const it of items)
      for (const c of it.pipeline.cmds) {
        if (!c.words.length) continue;
        const name = plainLiteral(c.words[0]);
        if (name && aliases.has(name) && !used.has(name)) spans.push({ s: c.firstStart, e: c.firstEnd, v: aliases.get(name)!, name });
      }
    if (!spans.length) break;
    spans.sort((a, b) => b.s - a.s);
    for (const sp of spans) out = out.slice(0, sp.s) + sp.v + out.slice(sp.e);
    for (const sp of spans) used.add(sp.name);
  }
  return out;
}
