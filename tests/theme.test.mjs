// Static checks for the light/dark theme. Limit: these read CSS and markup as text; they cannot prove the browser
// applies the right palette. That is checked by screenshots (reports/screens/<stamp>-theme/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const css = readFileSync('src/styles/tokens.css', 'utf8');
const base = readFileSync('src/layouts/Base.astro', 'utf8');
const init = readFileSync('public/theme-init.js', 'utf8');
const head = (html) => html.slice(html.indexOf('<head'), html.indexOf('</head>'));

test('tokens.css: selectors present for the four OS x stored-choice combinations', () => {
  // dark OS, nothing stored: only :root applies (the light media block does not match a dark OS)
  assert.match(css, /^:root \{\s*color-scheme: dark;/m);
  // light OS, nothing stored: media block, guarded so a stored "dark" still wins
  assert.match(css, /@media \(prefers-color-scheme: light\) \{\s*:root:not\(\[data-theme="dark"\]\) \{\s*color-scheme: light;/);
  // stored "light" (any OS): explicit block; stored "dark" (any OS): only :root, since the media block excludes it
  assert.match(css, /:root\[data-theme="light"\] \{\s*color-scheme: light;/);
});

test('init script: tiny, guarded, sets data-theme only for light or dark', () => {
  assert.ok(init.trim().split('\n').length <= 15);
  assert.match(init, /try \{[\s\S]*localStorage\.getItem\('theme'\)[\s\S]*\} catch/);
  assert.match(init, /t === 'light' \|\| t === 'dark'/);
  assert.match(init, /dataset\.theme = t/);
});

test('head order: meta tags, then the blocking init script, then any stylesheet', () => {
  const h = head(base);
  const script = h.indexOf('<script is:inline src="/theme-init.js"></script>');
  assert.ok(script > 0, 'blocking external init script in head (no async/defer)');
  assert.ok(h.lastIndexOf('<meta') < script, 'all meta tags come before the script');
  assert.equal((h.match(/name="theme-color"/g) ?? []).length, 2);
  assert.match(h, /media="\(prefers-color-scheme: dark\)"/);
  assert.match(h, /media="\(prefers-color-scheme: light\)"/);
  assert.ok(!/<link[^>]*stylesheet/.test(h.slice(0, script)), 'no stylesheet before the script');
});

test('nav: toggle li is hidden and sits before the terminal li; the toggle is a dark/light switch', () => {
  const toggle = base.indexOf('<li hidden><ThemeToggle');
  const term = base.indexOf('<li hidden><Terminal');
  assert.ok(toggle > 0 && term > toggle);
  const comp = readFileSync('src/components/ThemeToggle.astro', 'utf8');
  assert.ok(!comp.includes('data-terminal-open'));
  assert.match(comp, /<button[^>]*role="switch"[^>]*aria-checked="true"[^>]*aria-label="dark \/ light: dark theme"[^>]*data-theme-toggle/);
  assert.match(comp, /data-opt="dark">dark<[\s\S]*data-opt="light">light</);
  assert.doesNotMatch(comp, /aria-pressed|title=|<button[^>]*\shidden/);
});

test('built page (when dist exists): same head order', { skip: !existsSync('dist/index.html') }, () => {
  const h = head(readFileSync('dist/index.html', 'utf8'));
  const m = /<script[^>]*src="\/theme-init\.js"[^>]*>/.exec(h);
  assert.ok(m, 'init script present');
  assert.ok(!/async|defer|type="module"/.test(m[0]), 'blocking (no async/defer/module)');
  const script = m.index;
  assert.ok(h.lastIndexOf('<meta') < script);
  const sheet = h.search(/<link[^>]*rel="stylesheet"|<style/);
  assert.ok(sheet === -1 || sheet > script, 'stylesheet after the script');
});
