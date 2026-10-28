import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badPins } from '../scripts/check-pins.mjs';
import { tempProject, runScript } from './helpers.mjs';

const bad = (deps, key = 'dependencies') => badPins({ [key]: deps }).length;

test('exact versions pass, including prereleases', () => {
  assert.equal(bad({ a: '1.2.3', b: '0.0.1', c: '10.20.30', d: '1.0.0-beta.1', e: '2.0.0-rc.0' }), 0);
});

test('ranges, tags, URLs and partial versions fail', () => {
  for (const v of ['^1.2.3', '~1.2.3', '>=1.0.0', '*', '1.x', '1', '1.2', 'latest', 'git+https://x.dev/a.git', 'file:../a', 'npm:b@1.0.0', '1.2.3 - 2.0.0', 'v1.2.3', '']) {
    assert.equal(bad({ a: v }), 1, v);
  }
});

test('devDependencies and (nested) overrides are checked', () => {
  assert.equal(bad({ a: '^1.0.0' }, 'devDependencies'), 1);
  assert.equal(bad({ a: '^1.0.0' }, 'overrides'), 1);
  assert.equal(bad({ a: { b: '~1.0.0', c: '1.0.0' } }, 'overrides'), 1);
  assert.equal(bad({ a: { '.': '1.0.0', b: '1.0.0' } }, 'overrides'), 0);
});

test('negative control: the script exits 1 on a range and 0 on exact pins', () => {
  const run = (deps) => runScript('check-pins.mjs', tempProject({ 'package.json': JSON.stringify({ dependencies: deps }) }));
  assert.equal(run({ a: '1.2.3' }).code, 0);
  assert.equal(run({ a: 'latest' }).code, 1);
});
