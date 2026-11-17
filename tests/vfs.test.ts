import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vfs } from '../src/engine/vfs.ts';

test('normalize: relative, ~, .., trailing slashes', () => {
  assert.equal(Vfs.normalize('../b/./c/', '/home/a', '/home/a'), '/home/b/c');
  assert.equal(Vfs.normalize('~', '/', '/home/eunjae'), '/home/eunjae');
  assert.equal(Vfs.normalize('~/bin/x.sh', '/tmp', '/home/eunjae'), '/home/eunjae/bin/x.sh');
  assert.equal(Vfs.normalize('/../..', '/'), '/');
});

test('write, read, list, sizes', () => {
  const v = new Vfs(0);
  v.writeFile('/home/a/notes.txt', 'hello\nworld', { owner: 'a' });
  assert.equal(v.readFile('/home/a/notes.txt', { user: 'a', groups: ['a'] }), 'hello\nworld');
  const list = v.readDir('/home/a', { user: 'a', groups: ['a'] });
  assert.ok(Array.isArray(list));
  assert.deepEqual((list as { name: string }[]).map((n) => n.name), ['notes.txt']);
  assert.equal(Vfs.size(v.lookup('/home/a/notes.txt')!), 12);
});

test('errors: ENOENT, EISDIR, ENOTDIR', () => {
  const v = new Vfs(0);
  v.writeFile('/etc/hostname', 'x');
  const who = { user: 'u', groups: [] };
  assert.equal(v.readFile('/nope', who), 'ENOENT');
  assert.equal(v.readFile('/etc', who), 'EISDIR');
  assert.equal(v.readDir('/etc/hostname', who), 'ENOTDIR');
  assert.equal(v.resolve('/etc/hostname/x', who), 'ENOTDIR');
});

test('permissions: owner, group, other, sudo; traverse needs x on dirs', () => {
  const v = new Vfs(0);
  v.mkdirp('/home/sjkang', 'sjkang', 'sjkang', 0o700);
  v.writeFile('/home/sjkang/.bash_history', 'git log', { owner: 'sjkang', mode: 0o600 });
  v.writeFile('/var/log/auth.log', 'x', { owner: 'root', group: 'adm', mode: 0o640 });
  const eunjae = { user: 'eunjae', groups: ['eunjae', 'adm'] };
  assert.equal(v.readFile('/home/sjkang/.bash_history', eunjae), 'EACCES');
  assert.equal(v.readDir('/home/sjkang', eunjae), 'EACCES');
  assert.equal(v.readFile('/home/sjkang/.bash_history', { ...eunjae, sudo: true }), 'git log');
  assert.equal(v.readFile('/var/log/auth.log', eunjae), 'x');
  assert.equal(v.readFile('/var/log/auth.log', { user: 'guest', groups: [] }), 'EACCES');
});

test('dynamic directories and lazy content', () => {
  const v = new Vfs(0);
  let calls = 0;
  v.mount('/proc/1/fd', {
    name: 'fd', type: 'dir', owner: 'root', group: 'root', mode: 0o555, mtime: 0,
    list: () => Array.from({ length: 3 }, (_, i) => ({ name: String(i), type: 'file' as const, owner: 'root', group: 'root', mode: 0o700, mtime: 0, link: 'socket:[1]' })),
  });
  v.writeFile('/proc/1/limits', () => (calls++, 'Max open files 4096'));
  const list = v.readDir('/proc/1/fd', { user: 'x', groups: [] });
  assert.equal((list as unknown[]).length, 3);
  assert.equal(calls, 0);
  assert.equal(v.readFile('/proc/1/limits', { user: 'x', groups: [] }), 'Max open files 4096');
  assert.equal(calls, 1);
});

test('appendLine creates or extends a file', () => {
  const v = new Vfs(0);
  v.appendLine('/var/log/auth.log', 'a');
  v.appendLine('/var/log/auth.log', 'b');
  assert.equal(v.lookup('/var/log/auth.log')!.content, 'a\nb');
});

test('modeString', () => {
  const v = new Vfs(0);
  const d = v.mkdirp('/x', 'root', 'root', 0o750);
  assert.equal(Vfs.modeString(d), 'drwxr-x---');
});
