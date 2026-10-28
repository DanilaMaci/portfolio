import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanFile } from '../scripts/check-tokens.mjs';
import { tempProject, runScript } from './helpers.mjs';

const n = (name, s) => scanFile(name, s).length;
const css = (s) => n('x.css', s);
const astro = (s) => n('x.astro', s);
const ts = (s) => n('x.ts', s);
const md = (s) => n('x.md', s);

test('flags one positive case per rule', () => {
  assert.equal(css('a { color: #fff; }'), 1);
  assert.equal(css('a { border: 1px solid #abcd; }'), 1);
  assert.equal(css('a { color: rgb(0, 0, 0); }'), 1);
  assert.equal(css('a { color: RGBA(0,0,0,.5); }'), 1);
  assert.equal(css('a { color: hsl(0 0% 0%); }'), 1);
  assert.equal(css('a { color: oklch(0.5 0.1 20); }'), 1);
  assert.equal(css('a { background: color-mix(in srgb, red, blue); }'), 3);
  assert.equal(css('a { color: Red; }'), 1);
  assert.equal(css('a { box-shadow: 0 0 2px black; }'), 1);
  assert.equal(css('a { font-family: Arial, sans-serif; }'), 1);
  assert.equal(css('a { font: 12px/1.5 Helvetica; }'), 1);
  assert.equal(astro('<style>\n a { color: #fff; }\n</style>'), 1);
  assert.equal(astro('<p style="color: #fff">x</p>'), 1);
  assert.equal(astro('<path fill="#ff0000" />'), 1);
  assert.equal(astro('<path stroke="red" />'), 1);
  assert.equal(ts('const s = "color: #fff";'), 1);
});

// Probes from the stage 1 review: each used to slip through.
test('regression: minified and multi-line CSS', () => {
  assert.equal(css('a{color:#fff}b{background:red}'), 2);
  assert.equal(css('a{margin:0;color:#fff;padding:0}'), 1);
  assert.equal(css('a {\n  margin: 0;\n  color:\n    #fff;\n}'), 1);
  assert.equal(css('@media (min-width:600px){a{color:#fff}}'), 1);
  assert.equal(css('a { color: #fff } /* color: #000; */'), 1); // comments ignored, real one counted
  assert.equal(css('/* a { color: #fff; } */ a { margin: 0 }'), 0);
  assert.equal(scanFile('x.css', 'a { margin: 0 }\n\nb {\n  color: #fff;\n}')[0].line, 4);
});

test('regression: missing colour functions', () => {
  for (const f of ['lab(50 20 20)', 'lch(50 20 20)', 'oklab(0.5 0.1 0.1)', 'hwb(0 0% 0%)', 'color(srgb 1 0 0)', 'light-dark(black, white)']) {
    assert.ok(css(`a { color: ${f}; }`) >= 1, f);
  }
  assert.ok(css('a { filter: drop-shadow(0 0 2px rgb(0 0 0)); }') >= 1); // function in a non-colour property
  assert.equal(css('a { color: var(--c, rgb(0 0 0)); }'), 1); // fallback inside var()
});

test('regression: missing colour properties', () => {
  for (const p of ['accent-color', 'caret-color', 'text-decoration-color', 'outline-color', 'text-shadow', 'fill', 'stroke', 'border-top', 'background-image', 'outline', 'column-rule-color', 'stop-color']) {
    assert.ok(css(`a { ${p}: #fff; }`) >= 1, p);
  }
  assert.equal(css(':root { --brand: #fff; }'), 1); // custom property outside tokens.css
});

test('regression: JSX/TS style objects', () => {
  assert.equal(ts('const s = { color: "#fff" };'), 1);
  assert.equal(ts("const s = { backgroundColor: 'red' };"), 1);
  assert.equal(ts('const s = { fontFamily: "Arial" };'), 1);
  assert.equal(ts('const s = { "border-color": "rgb(0 0 0)" };'), 1);
  assert.equal(astro('<p style={{ color: "#fff", fontFamily: "Arial" }}>x</p>'), 2);
  assert.equal(ts('const s = { color: "var(--color-text)", fontFamily: "var(--font-mono)" };'), 0);
});

test('regression: #123 and colour words in prose and URLs are not colours', () => {
  assert.equal(md('Issue #123 and #fff and red and rgb(0,0,0) in prose.'), 0);
  assert.equal(md('See [the bug](https://github.com/x/y/issues/#123) and https://x.dev/#abc123'), 0);
  assert.equal(astro('<p>Fixed in #123456, colour is red</p><a href="https://x.dev/page#fff">x</a>'), 0);
  assert.equal(ts('const url = "https://x.dev/#fff"; // see #123'), 0);
  assert.equal(css('a { background: url(#abc) no-repeat; margin: 0 }'), 0);
  assert.equal(md('<p style="color: #fff">x</p>'), 1); // inline style in markdown still counts
});

test('regression: text colours must not use background/border tokens', () => {
  assert.equal(css('a { color: var(--color-bg); }'), 1);
  assert.equal(css('a { color: var(--color-surface); }'), 1);
  assert.equal(css('a { color: var(--color-border); }'), 1);
  assert.equal(css('a { color:var(--color-border-strong) }'), 1);
  assert.equal(css('a { fill: var(--color-bg); }'), 1);
  assert.equal(astro('<path fill="var(--color-surface)" />'), 1);
  assert.equal(css('a { color: var(--color-text); fill: var(--color-accent); background: var(--color-bg); border-color: var(--color-border); }'), 0);
});

test('allows keywords, tokens, ids and urls', () => {
  for (const k of ['transparent', 'currentColor', 'inherit', 'initial', 'unset', 'none']) {
    assert.equal(css(`a { color: ${k}; background: ${k}; }`), 0, k);
  }
  assert.equal(css('a { color: var(--color-text); font-family: var(--font-mono); }'), 0);
  assert.equal(css('a { color: var(--color-gold-accent); }'), 0); // "gold" inside a token name
  assert.equal(css('a { font: var(--text-base) var(--font-mono); }'), 0);
  assert.equal(css('#add, #fade:hover { margin: 0; }'), 0);
  assert.equal(css('a:hover, button:focus-visible { margin: 0; }'), 0);
  assert.equal(css('a { fill: url(#grad); background: url(#abc) no-repeat; }'), 0);
  assert.equal(astro('<a href="#main">skip</a>'), 0);
  assert.equal(astro('<a href="#abc" id="fed">x</a>'), 0);
  assert.equal(astro('<meta name="theme-color" content="#111111" />'), 0);
  assert.equal(astro('<svg fill="currentColor" stroke="none"><path fill="url(#grad)" /></svg>'), 0);
  assert.equal(astro('<p>Text with red and #fff in body</p>'), 0);
});

test('does not flag non-colour props with colour-like words', () => {
  assert.equal(css('a { content: "red"; margin: 0 }'), 0);
});

test('negative control: the script exits 1 on a bad colour in src/, 0 on clean src/', () => {
  const dir = (extra) => tempProject({ 'src/styles/tokens.css': ':root { --color-bg: #111; }', 'src/a.css': 'a { margin: 0 }', ...extra });
  assert.equal(runScript('check-tokens.mjs', dir({})).code, 0);
  assert.equal(runScript('check-tokens.mjs', dir({ 'src/b.css': 'a{color:#fff}' })).code, 1);
  assert.equal(runScript('check-tokens.mjs', dir({ 'src/c.ts': 'export const s = { color: "red" };' })).code, 1);
});
