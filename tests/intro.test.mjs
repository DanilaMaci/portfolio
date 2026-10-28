// The hero intro: the key-script logic, and the built page (the commands it types end as the text in the HTML).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frames, delay } from '../src/scripts/intro/keys.mjs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const hero = /<section class="hero"[\s\S]*?<\/section>/.exec(html)[0];
const cmds = [...hero.matchAll(/<span class="cmd" data-keys="([^"]*)">([^<]*)<\/span>/g)].map((m) => ({ keys: m[1], cmd: m[2] }));

test('frames: letters append, ← deletes, ⇥ completes the command', () => {
  assert.deepEqual(frames('ab←c', 'ac').map((f) => f.text), ['a', 'ab', 'a', 'ac']);
  assert.equal(frames('cat ap⇥', 'cat approach.txt').at(-1).text, 'cat approach.txt');
  assert.equal(frames('←←x', 'x').at(-1).text, 'x', 'backspace on empty text is harmless');
});

test('delay: backspace and Tab fixed, letters between 50 and 120 ms', () => {
  assert.equal(delay('←'), 90);
  assert.equal(delay('⇥'), 250);
  assert.equal(delay('a', () => 0), 50);
  assert.equal(delay('a', () => 1), 120);
});

test('built hero: every typed command ends exactly as the text in the HTML', () => {
  assert.ok(cmds.length >= 2, `found ${cmds.length} typed commands`);
  for (const { keys, cmd } of cmds) assert.equal(frames(keys, cmd).at(-1).text, cmd, `keys "${keys}"`);
});

test('built hero: the typing takes at most 2.2 s even with the slowest letters', () => {
  const ms = cmds.flatMap(({ keys }) => [...keys].map((k) => delay(k, () => 1))).reduce((a, b) => a + b, 0);
  assert.ok(ms <= 2200, `${ms} ms of typing`);
});
