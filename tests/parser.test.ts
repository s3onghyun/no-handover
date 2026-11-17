import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandAliases, parse, ParseError, wordText } from '../src/engine/parser.ts';

const words = (src: string) => parse(src).map((it) => it.pipeline.cmds.map((c) => c.words.map(wordText)));

test('simple words and whitespace', () => {
  assert.deepEqual(words('ls   -al  ~'), [[['ls', '-al', '~']]]);
});

test('single and double quotes keep spaces; empty quotes are an argument', () => {
  assert.deepEqual(words(`grep "too many" 'a  b' ""`), [[['grep', 'too many', 'a  b', '']]]);
});

test('pipes and lists with connectors', () => {
  const items = parse('crontab -l | tail -3; ls /etc/cron.d/ && echo ok || echo no');
  assert.equal(items.length, 4);
  assert.equal(items[0].pipeline.cmds.length, 2);
  assert.deepEqual(items.map((i) => i.next), [';', '&&', '||', null]);
});

test('command substitution, nested and inside double quotes', () => {
  const it = parse('ls /proc/$(pgrep -f payment-api | head -1)/fd | wc -l');
  const w = it[0].pipeline.cmds[0].words[1];
  assert.equal(w.length, 3);
  assert.deepEqual(w[1], { t: 'sub', src: 'pgrep -f payment-api | head -1' });
  const q = parse('echo "x $(echo $(whoami)) y"')[0].pipeline.cmds[0].words[1];
  assert.ok(q.some((p) => p.t === 'sub' && p.src === 'echo $(whoami)'));
});

test('variables', () => {
  const w = parse('echo $HOME ${USER}x')[0].pipeline.cmds[0].words;
  assert.deepEqual(w[1], [{ t: 'var', name: 'HOME', q: false }]);
  assert.equal(w[2][0].t, 'var');
});

test('comments: whole line and trailing', () => {
  assert.deepEqual(parse('# 갔다 와서 마저.'), []);
  assert.deepEqual(words('ls -l # trailing'), [[['ls', '-l']]]);
  assert.deepEqual(words('echo a#b'), [[['echo', 'a#b']]]);
});

test('redirections are parsed, not treated as words', () => {
  const c = parse('journalctl -u cron 2>/dev/null > out.txt')[0].pipeline.cmds[0];
  assert.deepEqual(c.words.map(wordText), ['journalctl', '-u', 'cron']);
  assert.deepEqual(c.redirs.map((r) => r.op), ['2>', '>']);
  assert.equal(parse('cmd 2>&1')[0].pipeline.cmds[0].redirs[0].op, '2>&1');
});

test('syntax errors', () => {
  assert.throws(() => parse('ls |'), ParseError);
  assert.throws(() => parse('| ls'), ParseError);
  assert.throws(() => parse('echo "unterminated'), ParseError);
  assert.throws(() => parse('echo $(ls'), ParseError);
  assert.throws(() => parse('sleep 1 &'), ParseError);
});

test('alias expansion: first word of each command, value may contain pipes and lists', () => {
  const aliases = new Map([
    ['밤', 'crontab -l; ls /etc/cron.d/'],
    ['fds', 'ls /proc/$(pgrep -f payment-api | head -1)/fd | wc -l'],
    ['ll', 'ls -alh'],
  ]);
  assert.equal(expandAliases('밤', aliases), 'crontab -l; ls /etc/cron.d/');
  assert.equal(expandAliases('ll ~/bin | head', aliases), 'ls -alh ~/bin | head');
  assert.equal(expandAliases('echo fds', aliases), 'echo fds');
  assert.equal(expandAliases('fds', aliases), 'ls /proc/$(pgrep -f payment-api | head -1)/fd | wc -l');
  assert.equal(expandAliases("'ll'", aliases), "'ll'");
});

test('alias that refers to itself does not loop', () => {
  assert.equal(expandAliases('ls x', new Map([['ls', 'ls --color']])), 'ls --color x');
});
