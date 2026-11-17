// Tiny DOM helper: h('div.cls#id', { onclick, title, ... }, ...children)

type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown> & { style?: Partial<CSSStyleDeclaration> | string; dataset?: Record<string, string> };

export function h<K extends keyof HTMLElementTagNameMap>(sel: K | `${K}.${string}` | `${K}#${string}`, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K];
export function h(sel: string, props?: Props | null, ...children: Child[]): HTMLElement;
export function h(sel: string, props?: Props | null, ...children: Child[]): HTMLElement {
  const m = /^([a-z0-9]+)((?:[.#][\w-]+)*)$/i.exec(sel);
  const el = document.createElement(m ? m[1] : 'div');
  if (m?.[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g) ?? []) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'style') {
      if (typeof v === 'string') el.setAttribute('style', v);
      else Object.assign(el.style, v);
    } else if (k === 'dataset') Object.assign(el.dataset, v as Record<string, string>);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function download(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode or quota: game still runs, just without saving */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
