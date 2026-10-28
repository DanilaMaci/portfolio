// Reads the built home page (run after `astro build`): section structure, the shared about sentence, the hero-only
// prompt and the optional photo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const ctx = JSON.parse(/<script type="application\/json" id="terminal-data">(.*?)<\/script>/s.exec(html)[1]);
const profileDir = new URL('../src/assets/profile/', import.meta.url);
const photoFile = existsSync(profileDir) ? readdirSync(profileDir).find((f) => /\.(jpe?g|png|webp)$/i.test(f)) : undefined;
const astroDir = new URL('../dist/_astro/', import.meta.url);
const photoAssets =
  photoFile && existsSync(astroDir) ? readdirSync(astroDir).filter((f) => f.startsWith(photoFile.replace(/\.[^.]+$/, ''))) : [];

test('sections are about, projects, path, skills, contact, each a visible h2', () => {
  assert.deepEqual(
    ctx.sections.map((s) => s.id),
    ['about', 'projects', 'path', 'skills', 'contact'],
  );
  for (const { id, title } of ctx.sections) assert.match(html, new RegExp(`<h2[^>]*id="${id}"[^>]*>${title}</h2>`));
  assert.doesNotMatch(html, /id="(education|experience)"/);
});

test('the about sentence has no characters that HTML would escape', () => {
  assert.doesNotMatch(ctx.about, /[&<"']/);
  assert.ok(html.includes(ctx.about));
});

test('only the hero has shell prompts', () => {
  const hero = /<section class="hero"[\s\S]*?<\/section>/.exec(html)[0];
  const all = html.match(/class="prompt-line[ "]/g)?.length ?? 0;
  assert.ok(all >= 1);
  assert.equal(hero.match(/class="prompt-line[ "]/g)?.length, all);
  assert.doesNotMatch(html, /prompt-cmd|prompt-heading/);
});

test('the photo is in dist only when an image exists in src/assets/profile/', () => {
  if (photoFile) {
    assert.match(html, /<img[^>]*class="photo[ "][^>]*alt="Danila Macijauskas"|<img[^>]*alt="Danila Macijauskas"[^>]*class="photo[ "]/);
    assert.ok(photoAssets.length > 0, 'no photo asset in dist/_astro');
  } else {
    assert.doesNotMatch(html, /class="photo"/);
    assert.deepEqual(photoAssets, []);
  }
});

test('hero CTAs follow the published-project count: See projects only when one is published', () => {
  const dir = new URL('../src/content/projects/', import.meta.url);
  const published = readdirSync(dir).filter((f) => f.endsWith('.md') && !/^draft:\s*true\s*$/m.test(readFileSync(new URL(f, dir), 'utf8')));
  const section = /<section class="hero"[\s\S]*?<\/section>/.exec(html)[0];
  const hero = /<p class="actions[^"]*">([\s\S]*?)<\/p>/.exec(section)[1];
  const primary = /<a class="button button-primary" href="([^"]*)"/.exec(hero)[1];
  if (published.length > 0) assert.equal(primary, '#projects');
  else {
    assert.match(primary, /^mailto:/);
    assert.match(hero, /href="https:\/\/github\.com\/[^"]*">GitHub</);
    assert.doesNotMatch(hero, /See projects/);
  }
});

test('the link-preview image named in og:image exists in dist', () => {
  const url = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
  assert.ok(url, 'og:image meta missing');
  assert.ok(existsSync(new URL('../dist' + new URL(url).pathname, import.meta.url)), `${url} not in dist`);
});
