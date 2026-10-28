// Reads the built site (run after `astro build`): the terminal's data must match what the page really contains.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const m = /<script type="application\/json" id="terminal-data">(.*?)<\/script>/s.exec(html);
assert.ok(m, 'terminal data block missing from dist/index.html');
const ctx = JSON.parse(m[1]);

test('every terminal section id is an element id on the home page', () => {
  assert.ok(ctx.sections.length > 0);
  for (const { id } of ctx.sections) assert.match(html, new RegExp(`\\sid="${id}"`), `no element with id=${id}`);
});

test('every terminal project slug has a built page', () => {
  for (const { slug } of ctx.projects) {
    assert.match(slug, /^[a-z0-9-]+$/);
    assert.ok(existsSync(new URL(`../dist/projects/${slug}/index.html`, import.meta.url)), `missing page for ${slug}`);
  }
});

test('the terminal nav item is hidden in the static HTML (the li only, not also the button)', () => {
  const btn = /<button[^>]*data-terminal-open[^>]*>/.exec(html);
  assert.ok(btn, 'button missing');
  assert.doesNotMatch(btn[0], /\shidden[\s>=]/);
  assert.match(btn[0], /title="[^"]*Ctrl\+`/);
  assert.match(html, /<li hidden[^>]*><button[^>]*data-terminal-open/); // no empty bullet without JS
});

test('the about text in the terminal data is the first sentence of the About section', () => {
  const about = /<h2[^>]*id="about"[^>]*>[^<]*<\/h2>([\s\S]*?)<\/section>/.exec(html);
  assert.ok(about, 'no About section');
  assert.match(about[1], /<p>([^<]*)/);
  assert.ok(/<p>([^<]*)/.exec(about[1])[1].startsWith(ctx.about), 'about is not the first sentence of the story');
});
