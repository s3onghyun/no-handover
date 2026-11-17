// Virtual filesystem: an in-memory tree per host with owners, modes and lazy content.

export interface VNode {
  name: string;
  type: 'dir' | 'file';
  owner: string;
  group: string;
  mode: number;
  mtime: number;
  children?: Map<string, VNode>;
  /** File content, or a generator for large/dynamic content (e.g. /proc/<pid>/fd listings). */
  content?: string | (() => string);
  /** Dynamic directory: children computed on demand. */
  list?: () => VNode[];
  private?: boolean;
  binary?: string;
  /** Symlink target text shown by ls -l (fd entries). */
  link?: string;
}

export interface Who {
  user: string;
  groups: string[];
  sudo?: boolean;
}

export type VfsError = 'ENOENT' | 'ENOTDIR' | 'EISDIR' | 'EACCES';

export class Vfs {
  readonly root: VNode;
  private readonly defaultMtime: number;
  constructor(defaultMtime: number) {
    this.defaultMtime = defaultMtime;
    this.root = { name: '/', type: 'dir', owner: 'root', group: 'root', mode: 0o755, mtime: defaultMtime, children: new Map() };
  }

  static normalize(path: string, cwd = '/', home = '/'): string {
    let p = path;
    if (p === '~') p = home;
    else if (p.startsWith('~/')) p = home + p.slice(1);
    if (!p.startsWith('/')) p = (cwd.endsWith('/') ? cwd : cwd + '/') + p;
    const out: string[] = [];
    for (const part of p.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') out.pop();
      else out.push(part);
    }
    return '/' + out.join('/');
  }

  static dirname(path: string): string {
    const i = path.lastIndexOf('/');
    return i <= 0 ? '/' : path.slice(0, i);
  }

  static basename(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1) || '/';
  }

  private childrenOf(n: VNode): Map<string, VNode> {
    if (n.list) return new Map(n.list().map((c) => [c.name, c]));
    return n.children ?? new Map();
  }

  /** Create parent dirs as needed (owned like the nearest existing parent unless given). */
  mkdirp(path: string, owner = 'root', group = owner, mode = 0o755): VNode {
    let cur = this.root;
    for (const part of Vfs.normalize(path).split('/').filter(Boolean)) {
      let next = cur.children!.get(part);
      if (!next) {
        next = { name: part, type: 'dir', owner, group, mode, mtime: this.defaultMtime, children: new Map() };
        cur.children!.set(part, next);
      }
      if (next.type !== 'dir') throw new Error(`not a dir: ${path}`);
      cur = next;
    }
    return cur;
  }

  writeFile(path: string, content: string | (() => string), opts: Partial<Omit<VNode, 'name' | 'type' | 'content'>> = {}): VNode {
    const p = Vfs.normalize(path);
    const parent = this.mkdirp(Vfs.dirname(p), opts.owner ?? 'root', opts.group ?? opts.owner ?? 'root');
    const node: VNode = {
      name: Vfs.basename(p),
      type: 'file',
      owner: opts.owner ?? 'root',
      group: opts.group ?? opts.owner ?? 'root',
      mode: opts.mode ?? 0o644,
      mtime: opts.mtime ?? this.defaultMtime,
      content,
      private: opts.private,
      binary: opts.binary,
      link: opts.link,
    };
    parent.children!.set(node.name, node);
    return node;
  }

  /** Append a line to a (possibly new) file with static content. */
  appendLine(path: string, line: string, opts: Partial<VNode> = {}): void {
    const n = this.lookup(path);
    if (n && n.type === 'file' && typeof n.content === 'string') {
      n.content = n.content ? `${n.content}\n${line}` : line;
      return;
    }
    this.writeFile(path, line, opts);
  }

  mount(path: string, node: VNode): void {
    const p = Vfs.normalize(path);
    const parent = this.mkdirp(Vfs.dirname(p));
    node.name = Vfs.basename(p);
    parent.children!.set(node.name, node);
  }

  /** Lookup without permission checks. */
  lookup(path: string): VNode | null {
    let cur = this.root;
    for (const part of Vfs.normalize(path).split('/').filter(Boolean)) {
      if (cur.type !== 'dir') return null;
      const next = this.childrenOf(cur).get(part);
      if (!next) return null;
      cur = next;
    }
    return cur;
  }

  static can(n: VNode, who: Who, bit: 4 | 1): boolean {
    if (who.sudo || who.user === 'root') return true;
    if (n.owner === who.user) return ((n.mode >> 6) & bit) !== 0;
    if (who.groups.includes(n.group)) return ((n.mode >> 3) & bit) !== 0;
    return (n.mode & bit) !== 0;
  }

  /** Resolve with traverse (x) checks on every ancestor dir. */
  resolve(path: string, who: Who): VNode | VfsError {
    let cur = this.root;
    const parts = Vfs.normalize(path).split('/').filter(Boolean);
    for (const part of parts) {
      if (cur.type !== 'dir') return 'ENOTDIR';
      if (!Vfs.can(cur, who, 1)) return 'EACCES';
      const next = this.childrenOf(cur).get(part);
      if (!next) return 'ENOENT';
      cur = next;
    }
    return cur;
  }

  readFile(path: string, who: Who): string | VfsError {
    const n = this.resolve(path, who);
    if (typeof n === 'string') return n;
    if (n.type === 'dir') return 'EISDIR';
    if (!Vfs.can(n, who, 4)) return 'EACCES';
    return typeof n.content === 'function' ? n.content() : n.content ?? '';
  }

  readDir(path: string, who: Who): VNode[] | VfsError {
    const n = this.resolve(path, who);
    if (typeof n === 'string') return n;
    if (n.type !== 'dir') return 'ENOTDIR';
    if (!Vfs.can(n, who, 4)) return 'EACCES';
    return [...this.childrenOf(n).values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  static size(n: VNode): number {
    if (n.type === 'dir') return 4096;
    if (n.link) return 64;
    const c = typeof n.content === 'function' ? n.content() : n.content ?? '';
    return new TextEncoder().encode(c).length + (c ? 1 : 0);
  }

  static modeString(n: VNode): string {
    const t = n.link ? 'l' : n.type === 'dir' ? 'd' : '-';
    const bits = 'rwxrwxrwx';
    let s = '';
    for (let i = 0; i < 9; i++) s += n.mode & (1 << (8 - i)) ? bits[i] : '-';
    return t + s;
  }
}

export const errText: Record<VfsError, string> = {
  ENOENT: 'No such file or directory',
  ENOTDIR: 'Not a directory',
  EISDIR: 'Is a directory',
  EACCES: 'Permission denied',
};
