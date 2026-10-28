import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInline } from '../scripts/check-inline.mjs';
import { tempProject, runScript } from './helpers.mjs';

const n = (s) => checkInline(s, 'x.html').length;

test('clean pages pass', () => {
  assert.equal(n('<link rel="stylesheet" href="/a.css"><script type="module" src="/a.js"></script>'), 0);
  assert.equal(n('<script type="application/json" id="d">{"a":"style=1"}</script><p data-style="x">'), 0);
});

test('inline style, style attribute and inline script fail', () => {
  assert.equal(n('<style>a{}</style>'), 1);
  assert.equal(n('<p style="color:red">'), 1);
  assert.equal(n('<script>alert(1)</script>'), 1);
  assert.equal(n('<script type="module">x()</script>'), 1);
});

test('script exits non-zero on a bad dist', () => {
  const bad = tempProject({ 'dist/index.html': '<style>a{}</style>' });
  assert.equal(runScript('check-inline.mjs', bad).code, 1);
  const ok = tempProject({ 'dist/index.html': '<p>hi</p>' });
  assert.equal(runScript('check-inline.mjs', ok).code, 0);
});
