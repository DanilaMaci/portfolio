import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkHtml, checkCss } from '../scripts/check-links.mjs';
import { tempProject, runScript } from './helpers.mjs';

const files = new Set(['/index.html', '/favicon.svg', '/page/index.html', '/img/a b.png', '/img/a.png', '/img/a@2x.png', '/fonts/x.woff2', '/assets/site.css']);
const html = (s, from = '/index.html') => checkHtml(s, from, files);

test('good links pass', () => {
  assert.deepEqual(html('<a href="/page/">x</a><link href="/favicon.svg"><a href="#top">t</a><a href="https://x.dev">e</a>'), []);
  assert.deepEqual(html('<a href="../index.html">x</a>', '/page/index.html'), []);
  assert.deepEqual(html('<a href="/page/?q=1#s">x</a><a href="mailto:a@b.c">m</a><a href="//cdn.x/y">c</a>'), []);
});

test('missing file and missing page are reported', () => {
  assert.equal(html('<a href="/nope.html">x</a>').length, 1);
  assert.equal(html('<a href="/nope/">x</a>').length, 1);
  assert.equal(html('<a href="/page">x</a>').length, 1); // directory without trailing slash is not a file
});

test('case mismatch is broken (case-sensitive hosts)', () => {
  assert.equal(html('<link href="/Favicon.svg">').length, 1);
  assert.equal(html('<a href="/Page/">x</a>').length, 1);
});

test('srcset entries are checked', () => {
  assert.deepEqual(html('<img src="/img/a.png" srcset="/img/a.png 1x, /img/a@2x.png 2x">'), []);
  assert.equal(html('<img src="/img/a.png" srcset="/img/a.png 1x, /img/missing@2x.png 2x">').length, 1);
});

test('CSS url() in <style>, style="" and css files', () => {
  assert.equal(html('<style>a{background:url(/img/none.png)}</style>').length, 1);
  assert.equal(html('<p style="background:url(\'/img/none.png\')">x</p>').length, 1);
  assert.deepEqual(html('<style>@font-face{src:url("/fonts/x.woff2")}</style>'), []);
  assert.equal(checkCss('@font-face{src:url(/fonts/Missing.woff2) format("woff2")}', '/assets/site.css', files).length, 1);
  assert.deepEqual(checkCss('a{src:url(../fonts/x.woff2);b:url(data:image/png;base64,AAA=);c:url(#g)}', '/assets/site.css', files), []);
});

test('percent-encoding is decoded; bad escapes are broken', () => {
  assert.deepEqual(html('<img src="/img/a%20b.png">'), []);
  assert.equal(html('<img src="/img/a%20c.png">').length, 1);
  assert.equal(html('<img src="/img/%E0%A4%A.png">').length, 1);
});

test('data-src is not treated as src', () => {
  assert.deepEqual(html('<img data-src="/nothing.png">'), []);
});

test('negative control: the script exits 1 on a broken or wrongly-cased link', () => {
  const bad = tempProject({ 'dist/index.html': '<a href="/Favicon.svg">x</a>', 'dist/favicon.svg': '<svg/>' });
  assert.equal(runScript('check-links.mjs', bad).code, 1);
  const ok = tempProject({ 'dist/index.html': '<a href="/favicon.svg">x</a>', 'dist/favicon.svg': '<svg/>' });
  assert.equal(runScript('check-links.mjs', ok).code, 0);
  assert.equal(runScript('check-links.mjs', tempProject({ 'x': '' })).code, 1); // no dist/
});
