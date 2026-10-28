// Reads colour tokens from tokens.css and checks WCAG contrast per theme (dark `:root`, light in the media block and in `[data-theme="light"]`). `--save` also writes reports/contrast/<stamp>/.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function parseHex(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (h.length !== 6) throw new Error(`bad hex ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const luminance = (hex) => {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Returns { name: hex } for every --color-* token. Throws on a duplicate, a non-hex or a non-opaque value.
export function parseTokens(css) {
  const tokens = {};
  for (const [, name, value] of stripComments(css).matchAll(/--color-([\w-]+)\s*:\s*([^;}]+)/g)) {
    const v = value.trim();
    if (name in tokens) throw new Error(`--color-${name} is defined more than once in one block`);
    if (/^#([0-9a-f]{4}|[0-9a-f]{8})$/i.test(v)) throw new Error(`--color-${name}: "${v}" has an alpha channel; opaque colours only`);
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
      throw new Error(`--color-${name}: "${v}" is not a hex colour; the contrast check cannot evaluate it`);
    }
    tokens[name] = v;
  }
  return tokens;
}

// Colour-token blocks by selector: dark = `:root`, the two light blocks must be identical.
const SELECTORS = {
  ':root': 'dark',
  ':root[data-theme="light"]': 'light',
  ':root:not([data-theme="dark"])': 'light (media)',
};

// Returns { dark, light } token maps (light is null when the css has no light block). Throws on an unknown selector
// that holds colour tokens, a duplicate selector, a missing or drifting light block.
export function parseThemes(css) {
  const blocks = {};
  for (const [, sel, body] of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!body.includes('--color-')) continue;
    const key = sel.trim().split('\n').pop().trim().replace(/\s+/g, ' ');
    if (!(key in SELECTORS)) throw new Error(`colour tokens under unknown selector "${key}"; expected :root, :root[data-theme="light"] or the prefers-color-scheme block`);
    if (key in blocks) throw new Error(`${key} holds colour tokens twice`);
    blocks[key] = parseTokens(body);
  }
  const names = Object.keys(SELECTORS);
  if (!blocks[names[0]]) throw new Error('no :root block with colour tokens');
  const light = names.slice(1).filter((n) => blocks[n]);
  if (light.length === 1) throw new Error(`light theme needs both ${names[1]} and ${names[2]}; only ${light[0]} found`);
  if (light.length === 2 && JSON.stringify(sortKeys(blocks[names[1]])) !== JSON.stringify(sortKeys(blocks[names[2]]))) {
    throw new Error('the two light blocks differ (drift); they must be identical');
  }
  return { dark: blocks[names[0]], light: light.length ? blocks[names[1]] : null };
}
const sortKeys = (o) => Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1));

// Every --color-* token must be listed here. `min: null` = decorative, listed but not checked.
const TEXT = ['text', 'muted', 'accent', 'link', 'success', 'warning', 'error'];
const MATRIX = [
  ...TEXT.map((token) => ({ token, min: 4.5 })),
  { token: 'border-strong', min: 3.0 }, // form controls
  { token: 'border', min: null },
];
const BACKGROUNDS = ['bg', 'surface'];

// Full matrix for one theme; pushes table rows to lines and problems to errors.
function checkTheme(name, t, lines, errors) {
  const listed = new Set(['bg', 'surface', ...MATRIX.map((r) => r.token)]);
  for (const n of Object.keys(t)) if (!listed.has(n)) errors.push(`[${name}] --color-${n} is not in the contrast matrix; add it to scripts/check-contrast.mjs`);
  for (const n of listed) if (!t[n]) errors.push(`[${name}] missing colour token --color-${n}`);
  for (const { token, min } of MATRIX) {
    if (!t[token] || min === null) continue;
    for (const bg of BACKGROUNDS) {
      if (!t[bg]) continue;
      const r = contrast(t[token], t[bg]);
      const ok = r >= min;
      if (!ok) errors.push(`[${name}] ${token} on ${bg}: ${r.toFixed(2)} < ${min}`);
      lines.push(`${name.padEnd(6)} ${token.padEnd(14)} ${bg.padEnd(12)} ${r.toFixed(2).padStart(5)}   ${min.toFixed(1)}   ${ok ? 'pass' : 'FAIL'}`);
    }
  }
  if (t.border) lines.push(`${name.padEnd(6)} border         (decorative: listed, not checked)`);
}

// Returns { lines, errors }; errors is empty when everything passes.
export function evaluate(css) {
  const { dark, light } = parseThemes(css);
  const errors = [];
  const lines = ['theme  foreground     background   ratio   min   result'];
  checkTheme('dark', dark, lines, errors);
  if (light) checkTheme('light', light, lines, errors);
  return { lines, errors };
}

// Writes reports/contrast/<stamp>[-N]/contrast.txt without ever reusing an existing directory.
function save(out) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  mkdirSync('reports/contrast', { recursive: true });
  for (let i = 1; ; i++) {
    const dir = `reports/contrast/${stamp}${i === 1 ? '' : `-${i}`}`;
    try {
      mkdirSync(dir);
    } catch (e) {
      if (e.code === 'EEXIST') continue;
      throw e;
    }
    writeFileSync(`${dir}/contrast.txt`, out + '\n', { flag: 'wx' });
    return dir;
  }
}

function run() {
  const { lines, errors } = evaluate(readFileSync('src/styles/tokens.css', 'utf8'));
  const out = lines.join('\n');
  console.log(out);
  if (process.argv.includes('--save')) console.log(`saved ${save(out)}/contrast.txt`);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
