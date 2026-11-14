import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { contrast, parseTokens, parseThemes, evaluate } from '../scripts/check-contrast.mjs';
import { tempProject, runScript } from './helpers.mjs';

const GOOD = `:root { --color-bg:#111111; --color-surface:#1c1c1c; --color-text:#e8e8e8; --color-muted:#a8a8a8;
  --color-accent:#9ad0b4; --color-on-accent:#111111; --color-link:#9db9f0; --color-success:#8fd69a; --color-warning:#e0be6a; --color-error:#f09a94;
  --color-border:#707070; --color-border-strong:#909090; }`;
const errors = (css) => evaluate(css).errors;
const LIGHT = `--color-bg:#f4f4f4; --color-surface:#e6e6e6; --color-text:#111111; --color-muted:#444444;
  --color-accent:#1a3f99; --color-on-accent:#f4f4f4; --color-link:#0b4f77; --color-success:#2d5a14; --color-warning:#6e4600; --color-error:#9a0f36;
  --color-border:#c0c0c0; --color-border-strong:#666666;`;
const TWO = (media = LIGHT, attr = LIGHT) => `${GOOD}
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { ${media} } }
:root[data-theme="light"] { ${attr} }`;
const withToken = (name, value) => GOOD.replace('}', ` --color-${name}: ${value}; }`);

test('known contrast ratios', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(1), '21.0');
  assert.equal(contrast('#777777', '#ffffff').toFixed(2), '4.48');
  assert.equal(contrast('#767676', '#ffffff').toFixed(2), '4.54');
  assert.equal(contrast('#123456', '#123456'), 1);
  assert.equal(contrast('#000', '#fff').toFixed(1), '21.0');
});

test('non-hex colour token throws', () => {
  assert.throws(() => parseTokens(':root { --color-bg: rgb(0, 0, 0); }'), /not a hex colour/);
  assert.throws(() => parseTokens(':root { --color-bg: var(--x); }'), /not a hex colour/);
});

test('alpha hex is rejected', () => {
  assert.throws(() => parseTokens(':root { --color-bg: #1118; }'), /opaque colours only/);
  assert.throws(() => parseTokens(':root { --color-bg: #11111180; }'), /opaque colours only/);
});

test('parses hex tokens, minified, and ignores comments', () => {
  assert.deepEqual(parseTokens(':root{--color-bg:#111;--font-mono:x}'), { bg: '#111' });
  assert.deepEqual(parseTokens(':root{--color-bg:#111}'), { bg: '#111' }); // no trailing semicolon
  assert.deepEqual(parseTokens('/* --color-bg: #fff; */ :root { --color-bg: #111; }'), { bg: '#111' });
});

test('a token defined twice in one block fails', () => {
  assert.throws(() => parseTokens(':root { --color-bg: #111; --color-bg: #fff; }'), /more than once in one block/);
  assert.throws(() => parseThemes(GOOD + GOOD), /holds colour tokens twice/);
});

test('themes: dark only, two identical light blocks, one light block, unknown selector, drift', () => {
  assert.equal(parseThemes(GOOD).light, null);
  assert.equal(parseThemes(TWO()).light.bg, '#f4f4f4');
  assert.throws(() => parseThemes(GOOD + '.x { --color-bg: #fff; }'), /unknown selector/);
  assert.throws(() => parseThemes(GOOD + ':root[data-theme="light"] { ' + LIGHT + ' }'), /needs both/);
  assert.throws(() => parseThemes(TWO(LIGHT, LIGHT.replace('#f4f4f4', '#f5f5f5'))), /drift/);
  // print block: accepted only when it repeats the light tokens exactly, and only once
  const PRINT = (body) => `@media print { :root, :root[data-theme="dark"], :root[data-theme="light"] { ${body} } }`;
  assert.deepEqual(parseThemes(TWO() + PRINT(LIGHT)).light, parseThemes(TWO()).light);
  assert.throws(() => parseThemes(TWO() + PRINT(LIGHT.replace('#444444', '#bbbbbb'))), /print block differs/);
  assert.throws(() => parseThemes(GOOD + PRINT(LIGHT)), /print block differs/);
  assert.throws(() => parseThemes(TWO() + PRINT(LIGHT) + PRINT(LIGHT)), /unknown selector/);
  // the same selector list outside @media print (or inside another at-rule) is not a print block
  const BARE = `:root, :root[data-theme="dark"], :root[data-theme="light"] { ${LIGHT} }`;
  assert.throws(() => parseThemes(TWO() + BARE), /unknown selector/);
  assert.throws(() => parseThemes(TWO() + `@media screen { ${BARE} }`), /unknown selector/);
});

test('both themes are checked and named in the table; a light-only failure fails', () => {
  const ok = evaluate(TWO());
  assert.deepEqual(ok.errors, []);
  assert.ok(ok.lines.some((l) => l.startsWith('dark ')) && ok.lines.some((l) => l.startsWith('light')));
  const bad = TWO(LIGHT.replace('#444444', '#bbbbbb'), LIGHT.replace('#444444', '#bbbbbb'));
  assert.match(evaluate(bad).errors.join(), /\[light\] muted on bg/);
  assert.match(evaluate(TWO(LIGHT.replace('--color-text:#111111;', ''), LIGHT.replace('--color-text:#111111;', ''))).errors[0], /\[light\] missing colour token --color-text/);
});

test('good tokens pass; unlisted token, missing token and low contrast fail', () => {
  assert.deepEqual(errors(GOOD), []);
  assert.match(errors(withToken('brand', '#ff00ff'))[0], /not in the contrast matrix/);
  assert.match(errors(GOOD.replace('--color-text:#e8e8e8;', ''))[0], /\[dark\] missing colour token --color-text/);
  assert.match(errors(GOOD.replace('#a8a8a8', '#333333'))[0], /muted on bg/);
  assert.match(errors(GOOD.replace('#9ad0b4', '#222222')).join(), /accent on surface/);
});

test('border-strong is required and must reach 3.0 on bg and surface', () => {
  assert.match(errors(GOOD.replace('--color-border-strong:#909090;', ''))[0], /missing colour token --color-border-strong/);
  assert.equal(errors(GOOD.replace('#909090', '#303030')).length, 2);
});

test('border is decorative: any value passes', () => {
  assert.deepEqual(errors(GOOD.replace('#707070', '#1d1d1d')), []);
});

test('the real tokens.css passes in both themes', () => {
  const r = evaluate(readFileSync('src/styles/tokens.css', 'utf8'));
  assert.deepEqual(r.errors, []);
  assert.ok(r.lines.some((l) => l.startsWith('light')));
});

test('real tokens: --color-on-accent in all three blocks, >= 4.5 on accent and on link, light border #9ba1bb', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // the colour blocks in file order: dark :root, light media block, light [data-theme="light"], print (= light)
  const blocks = [...css.matchAll(/\{([^{}]*--color-[^{}]*)\}/g)].map((m) => parseTokens(m[1]));
  assert.equal(blocks.length, 4, 'expected four colour token blocks (dark, two light, print)');
  const [dark, ...light] = blocks;
  for (const [i, b] of blocks.entries()) {
    assert.ok(b['on-accent'], `--color-on-accent missing in block ${i + 1} of 4`);
    for (const under of ['accent', 'link']) assert.ok(contrast(b['on-accent'] ?? '#000000', b[under]) >= 4.5, `on-accent on ${under}, block ${i + 1}`);
  }
  for (const b of light) assert.equal(b.border, '#9ba1bb');
  assert.ok(dark.bg);
});

test('negative control: script exits 1 on low contrast, a duplicate token, drifting light blocks, an unknown token', () => {
  const run = (css) => runScript('check-contrast.mjs', tempProject({ 'src/styles/tokens.css': css }));
  assert.equal(run(GOOD).code, 0);
  assert.equal(run(GOOD.replace('#a8a8a8', '#333333')).code, 1);
  assert.equal(run(GOOD + '@media (prefers-color-scheme: light) { :root { --color-bg: #fff; } }').code, 1);
  assert.equal(run(TWO()).code, 0);
  assert.equal(run(TWO(LIGHT.replace('#444444', '#bbbbbb'), LIGHT.replace('#444444', '#bbbbbb'))).code, 1); // light only fails
  assert.equal(run(TWO(LIGHT, LIGHT.replace('#f4f4f4', '#f5f5f5'))).code, 1); // drift
  assert.equal(run(withToken('brand', '#ff00ff')).code, 1);
});

test('--save never overwrites: two runs in the same minute make two directories', () => {
  const dir = tempProject({ 'src/styles/tokens.css': GOOD });
  assert.equal(runScript('check-contrast.mjs', dir, ['--save']).code, 0);
  assert.equal(runScript('check-contrast.mjs', dir, ['--save']).code, 0);
  assert.equal(readdirSync(`${dir}/reports/contrast`).length, 2);
});
