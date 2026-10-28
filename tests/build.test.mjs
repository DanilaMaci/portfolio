import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
  );

// Title, images and draft flag from each project's frontmatter (plain `key: value` lines).
function projects() {
  const dir = 'src/content/projects';
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const fm = readFileSync(join(dir, f), 'utf8').split(/^---\s*$/m)[1] ?? '';
      const get = (k) => fm.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1].trim().replace(/^(["'])(.*)\1$/, '$2');
      // every image path in the frontmatter: the cover, gallery entries, a video poster
      const images = [...fm.matchAll(/assets\/projects\/[^\s"']+/g)].map((m) => m[0]);
      return { file: f, slug: f.replace(/\.md$/, ''), title: get('title'), images, draft: get('draft') === 'true', text: fm };
    });
}
const drafts = () => projects().filter((p) => p.draft);

test('published projects contain no leftover placeholder text', () => {
  for (const p of projects().filter((x) => !x.draft)) assert.doesNotMatch(p.text, /placeholder|lorem|TODO/i, p.file);
});

// Needs `npm run build` to have run first (npm test does that).
test('draft projects (titles and images) do not appear in dist/', () => {
  assert.ok(existsSync('dist/index.html'), 'run the build first');
  const texts = walk('dist')
    .filter((f) => /\.(html|xml|txt|json|js|css)$/.test(f))
    .map((f) => [f, readFileSync(f, 'utf8')]);
  const assets = existsSync('dist/_astro') ? readdirSync('dist/_astro') : [];
  for (const p of drafts()) {
    assert.ok(p.title, `${p.file}: no title parsed`);
    for (const [f, t] of texts) assert.ok(!t.includes(p.title), `${p.file}: title "${p.title}" found in ${f}`);
    for (const image of p.images) {
      const stem = basename(image).replace(/\.[^.]+$/, '');
      // Astro names files <stem>.<hash>.<ext> (original) or <stem>_<hash>.<ext> (resized)
      assert.ok(!assets.some((a) => a.startsWith(stem + '.') || a.startsWith(stem + '_')), `${p.file}: image ${stem} found in dist/_astro`);
    }
    // public/ is copied verbatim, so a draft's video folder would be published
    assert.ok(!existsSync(`dist/media/${p.slug}`), `${p.file}: dist/media/${p.slug}/ exists but the project is a draft`);
  }
});
