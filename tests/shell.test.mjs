import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shellPath, bootLines } from '../src/scripts/shell.mjs';

test('shellPath: home is ~, trailing slashes dropped', () => {
  assert.equal(shellPath('/'), '~');
  assert.equal(shellPath('/projects/fromo/'), '~/projects/fromo');
});

test('bootLines: cd, then three OK lines naming the path and the link text', () => {
  const l = bootLines('/projects/fromo/', '  FROMO\n ');
  assert.deepEqual(l[0], { cmd: 'cd ~/projects/fromo' });
  assert.deepEqual(l.slice(1).map((x) => x.ok), ['Mounted ~/projects/fromo', 'Started FROMO', 'Reached target page']);
  assert.equal(bootLines('/', '').at(2).ok, 'Started ~', 'empty link text falls back to the path');
  assert.ok(bootLines('/', 'x'.repeat(200)).at(2).ok.length <= 'Started '.length + 48);
});

test('bootLines output is plain text (rendered with textContent)', () => {
  const l = bootLines('/', '<img src=x onerror=alert(1)>');
  assert.equal(l[2].ok, 'Started <img src=x onerror=alert(1)>');
});
