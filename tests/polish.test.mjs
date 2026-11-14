// Acceptance tests for the visual-polish build (docs/design/visual-polish-spec.md). Read the built pages in dist/
// (run after `astro build`) and src/styles/global.css. Written before the build: each assertion names the missing thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const home = read('../dist/index.html');
const nf = read('../dist/404.html');
const css = read('../src/styles/global.css');
const projects = readdirSync(new URL('../dist/projects/', import.meta.url)).map((s) => [s, read(`../dist/projects/${s}/index.html`)]);
const heroOf = (html) => /<section class="hero"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
const count = (html, re) => html.match(re)?.length ?? 0;
const primaries = (html) => count(html, /class="[^"]*\bbutton-primary\b[^"]*"/g);

// ---- CSS helpers: comments removed, then a brace-depth walk. Every leaf block (one with no nested `{`) is a rule or
// an at-rule such as @view-transition; `ctx` lists the at-rule preludes (@media ...) that enclose it.
function leafRules(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  const out = [];
  let start = 0;
  let lastOpen = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      stack.push(text.slice(start, i).trim());
      lastOpen = i;
      start = i + 1;
    } else if (text[i] === '}') {
      const prelude = stack.pop();
      if (lastOpen >= 0 && text.lastIndexOf('{', i) === lastOpen) out.push({ sel: prelude, body: text.slice(lastOpen + 1, i), ctx: stack.filter((s) => s.startsWith('@')) });
      lastOpen = -1;
      start = i + 1;
    } else if (text[i] === ';' && lastOpen < 0) start = i + 1; // @import etc. at depth 0
  }
  return out;
}
const rules = leafRules(css);
const decls = (r) => r.body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]);

test('home: the first section after the hero is projects', () => {
  const after = home.slice(home.indexOf('</section>', home.indexOf('<section class="hero"')) + 10);
  assert.match(/<section[^>]*>/.exec(after)?.[0] ?? '', /aria-labelledby="projects"/);
});

test('exactly one filled primary button in the home hero, on each project page and on 404', () => {
  assert.equal(primaries(heroOf(home)), 1, 'home hero');
  assert.equal(primaries(nf), 1, '404.html');
  for (const [slug, html] of projects) assert.equal(primaries(html), 1, `project ${slug}`);
});

test('project hero image loads eagerly with high priority', () => {
  for (const [slug, html] of projects) {
    const img = /<img[^>]*class="[^"]*\bproject-image\b[^"]*"[^>]*>/.exec(html)?.[0];
    if (!img) continue; // fallback block, no image
    assert.match(img, /loading="eager"/, `${slug}: loading`);
    assert.match(img, /fetchpriority="high"/, `${slug}: fetchpriority`);
  }
});

test('global.css: no scale() transforms', () => {
  const hits = rules.filter((r) => /scale\(/.test(r.body)).map((r) => r.sel);
  assert.deepEqual(hits, []);
});

test('global.css: no bare ease keywords in transitions or animations (var(--ease-*) is fine)', () => {
  const bad = [];
  for (const r of rules)
    for (const [prop, val] of decls(r)) {
      if (!/^(transition|animation)(-timing-function)?$/.test(prop)) continue;
      const bare = val.replace(/var\([^)]*\)|cubic-bezier\([^)]*\)/g, '');
      if (/(^|[\s,])ease(-in|-out|-in-out)?(?=[\s,]|$)/.test(bare)) bad.push(`${r.sel} { ${prop}: ${val} }`);
    }
  assert.deepEqual(bad, []);
});

test('every :hover rule (global.css and ThemeToggle.astro) is inside @media (hover: hover) and (pointer: fine)', () => {
  const toggle = read('../src/components/ThemeToggle.astro');
  const toggleCss = /<style[^>]*>([\s\S]*?)<\/style>/.exec(toggle)?.[1] ?? '';
  const all = [...rules.map((r) => ({ ...r, file: 'global.css' })), ...leafRules(toggleCss).map((r) => ({ ...r, file: 'ThemeToggle.astro' }))];
  const bad = all
    .filter((r) => r.sel.includes(':hover'))
    .filter((r) => !r.ctx.some((c) => /^@media[^{]*\(\s*hover\s*:\s*hover\s*\)[^{]*\(\s*pointer\s*:\s*fine\s*\)/.test(c)))
    .map((r) => `${r.file}: ${r.sel}`);
  assert.deepEqual(bad, [], ':hover rule outside @media (hover: hover) and (pointer: fine)');
});

test('home cards: path wrapped in .card-path', () => {
  assert.match(home, /<span class="card-path">~\/projects\/[^<]+<\/span>/);
});

test('home hero: status dot inside .availability, tracks line (not a .cmd) with software / embedded / data', () => {
  const hero = heroOf(home);
  assert.match(hero, /<p class="availability">\s*<span class="status-dot"[^>]*><\/span>/, '.status-dot inside .availability');
  const out = /<p class="tracks-out">([\s\S]*?)<\/p>/.exec(hero)?.[1];
  assert.ok(out, '.tracks-out missing');
  assert.deepEqual([...out.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map((m) => m[1].trim()), ['software', 'embedded', 'data']);
  const ls = /<p class="prompt-line[^"]*ls-line[^"]*"[^>]*>[\s\S]*?<\/p>/.exec(hero)?.[0];
  assert.ok(ls, 'ls tracks prompt line (.ls-line) missing');
  assert.match(ls, /ls tracks/);
  assert.doesNotMatch(ls, /class="cmd"/, 'the ls tracks line must not be a .cmd');
});

test('project page: .facts with 2-3 .fact sections, gallery grid, hero links are buttons', () => {
  for (const [slug, html] of projects) {
    const facts = /<div class="facts">([\s\S]*?)<\/div>/.exec(html)?.[1];
    assert.ok(facts, `${slug}: .facts missing`);
    // Problem and My role are always there; Result only when the project has one (investment-visualisation has none).
    const n = count(facts, /<section class="fact"/g);
    assert.ok(n >= 2 && n <= 3, `${slug}: ${n} .fact sections, expected 2 or 3`);
    assert.equal(n, count(facts, /<h2 class="label-heading"/g), `${slug}: every fact has its label heading`);
    if (/<h2[^>]*>Screenshots<\/h2>/.test(html)) {
      const g = /<div class="gallery">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
      assert.ok(count(g, /<figure/g) >= 1, `${slug}: figures not wrapped in .gallery`);
    }
    const ul = /<ul class="actions hero-links">([\s\S]*?)<\/ul>/.exec(html)?.[1];
    assert.ok(ul, `${slug}: ul.actions.hero-links missing`);
    const links = [...ul.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
    assert.ok(links.length > 0, `${slug}: no hero links`);
    for (const a of links) assert.match(a, /class="[^"]*\bbutton\b/, `${slug}: ${a}`);
  }
});

test('404: two action links, to / and /#projects', () => {
  const a = /<p class="actions">([\s\S]*?)<\/p>/.exec(nf)?.[1];
  assert.ok(a, '.actions missing on 404');
  assert.deepEqual([...a.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]), ['/', '/#projects']);
});

test('translate="no" on the email <code> and on .commit spans', () => {
  assert.match(home, /<code translate="no">/);
  const commits = home.match(/<span class="commit"[^>]*>/g) ?? [];
  assert.ok(commits.length > 0);
  for (const c of commits) assert.match(c, /translate="no"/);
});

test('view transitions: card-image group and @view-transition only under prefers-reduced-motion: no-preference', () => {
  for (const sel of ['::view-transition-group(card-image)', '@view-transition']) {
    const r = rules.filter((x) => x.sel.replace(/\s+/g, ' ').includes(sel));
    assert.ok(r.length > 0, `${sel} missing in global.css`);
    for (const x of r) assert.ok(x.ctx.some((c) => /prefers-reduced-motion:\s*no-preference/.test(c)), `${sel} is not inside a no-preference block`);
  }
});

test('morph naming: a render-blocking head script (not the deferred module), a data attribute, rules under no-preference', () => {
  for (const [name, html] of [['dist/index.html', home], ['a project page', projects[0][1]]]) {
    const tag = /<script[^>]*src="\/morph-init\.js"[^>]*>/.exec(html.slice(0, html.indexOf('</head>')))?.[0];
    assert.ok(tag, `${name}: /morph-init.js missing from <head>`);
    assert.ok(!/async|defer|type="module"/.test(tag), `${name}: morph-init.js must block rendering`);
  }
  const js = read('../public/morph-init.js');
  for (const ev of ['pageswap', 'pagereveal']) assert.ok(js.includes(`'${ev}'`), `morph-init.js: ${ev}`);
  assert.doesNotMatch(js, /\.style\b|viewTransitionName/, 'the name is a data attribute, not a CSSOM style write');
  const ts = read('../src/scripts/transition.ts');
  assert.doesNotMatch(ts, /pageswap|pagereveal|viewTransitionName/, 'naming moved out of the deferred module');
  for (const sel of ['[data-morph]', 'img.card-image[data-morph]']) {
    const r = leafRules(css).filter((x) => x.sel.replace(/\s+/g, ' ') === sel);
    assert.equal(r.length, 1, `${sel} rule`);
    assert.ok(r[0].ctx.some((c) => /prefers-reduced-motion:\s*no-preference/.test(c)), `${sel} outside the no-preference block`);
  }
  assert.doesNotMatch(css, /\[style\*=/, 'no substring match on the style attribute');
});
