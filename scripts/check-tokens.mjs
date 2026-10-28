// Fails if a colour literal or font-family name appears anywhere in src/ except src/styles/tokens.css, or if a
// text colour (`color`, `fill`) uses a background/border token. Not a CSS parser: it splits text on `{ } ;`
// and reads `prop: value` declarations, plus quoted `key: "value"` pairs (JSX/TS style objects) and colour attributes.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const NAMED = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred
midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple
rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
whitesmoke yellow yellowgreen`.split(/\s+/),
);
const COLOUR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i;
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const KEYWORDS = /\b(?:inherit|initial|unset|none|normal|bold|bolder|lighter|italic|oblique|small-caps|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)\b/gi;
const NON_TEXT_TOKEN = /var\(\s*--color-(bg|surface|border)/;

const isColourProp = (p) => /(color|shadow)$/.test(p) || /^(fill|stroke)$/.test(p) || /^(background|border|outline)/.test(p);
const kebab = (p) => p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// Messages for one declaration. `full` = CSS declaration (colour functions are flagged in any property);
// otherwise only colour properties and font-family are looked at (attributes, style-object keys).
function checkDecl(rawProp, rawValue, full) {
  const p = kebab(rawProp);
  const custom = p.startsWith('--');
  const colour = isColourProp(p) || custom;
  const font = p === 'font-family' || p === 'font';
  if (!full && !colour && !font) return [];
  const msgs = [];
  const value = rawValue.replace(/url\([^)]*\)/gi, '');
  const bare = value.replace(/var\([^)]*\)/gi, ''); // names inside var(--x) are not colours or fonts
  if ((full || colour) && COLOUR_FN.test(value)) msgs.push('colour function');
  if (colour && HEX.test(value)) msgs.push(`hex colour in ${p}`);
  if (colour) {
    for (const w of bare.toLowerCase().match(/[a-z]+/g) ?? []) if (NAMED.has(w)) msgs.push(`named colour "${w}" in ${p}`);
  }
  if ((p === 'color' || p === 'fill') && NON_TEXT_TOKEN.test(value)) msgs.push(`${p} uses a background/border token`);
  if (p === 'font-family' && bare.replace(KEYWORDS, '').replace(/[\s,]/g, '')) msgs.push('literal font-family name');
  if (p === 'font') {
    const rest = bare.replace(KEYWORDS, '').replace(/[\d./%]+[a-z%]*/gi, '').replace(/[\s,]/g, '');
    if (rest) msgs.push('literal font name in font shorthand');
  }
  return msgs;
}

// CSS-like text (a file, a <style> body, a style="" value, a string literal). `at` = its offset inside `full`.
function scanCss(css, full, at, hits) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  for (const m of clean.matchAll(/[^{};]+/g)) {
    const d = /^(\s*)(--[\w-]+|[A-Za-z-][\w-]*)\s*:([\s\S]*)$/.exec(m[0]);
    if (!d) continue;
    const line = lineOf(full, at + m.index + d[1].length);
    for (const msg of checkDecl(d[2], d[3], true)) hits.push({ line, msg });
  }
}

const STRING = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const PAIR = /(["']?)([A-Za-z][\w-]*)\1\s*:\s*(["'`])((?:(?!\3)[^\n])*)\3/g; // color: "red", 'fontFamily': 'Arial'

// Code (ts/js/astro): CSS inside string literals, and key: "value" pairs.
function scanCode(text, hits) {
  for (const m of text.matchAll(STRING)) scanCss(m[0].slice(1, -1), text, m.index + 1, hits);
  for (const m of text.matchAll(PAIR)) {
    const line = lineOf(text, m.index);
    for (const msg of checkDecl(m[2], m[4], false)) hits.push({ line, msg });
  }
}

// Returns [{line, msg}] for one file's text. The extension decides how the file is read.
export function scanFile(name, text) {
  const hits = [];
  if (name.endsWith('.css')) scanCss(text, text, 0, hits);
  else if (/\.(md|mdx)$/.test(name)) {
    // prose is skipped on purpose (`#123`, "red"); only inline styles count
    for (const m of text.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      scanCss(m[1] ?? m[2], text, m.index + m[0].indexOf(m[1] ?? m[2]), hits);
    }
  } else {
    scanCode(text, hits);
    if (/\.(astro|svg|html)$/.test(name)) {
      for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
        scanCss(m[1], text, m.index + m[0].indexOf('>') + 1, hits);
      }
      for (const m of text.matchAll(/(?<![\w-])([a-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
        const line = lineOf(text, m.index);
        for (const msg of checkDecl(m[1], m[2] ?? m[3], false)) hits.push({ line, msg });
      }
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
  );

function run() {
  const files = walk('src').filter((f) => f !== join('src', 'styles', 'tokens.css') && /\.(css|astro|svg|ts|tsx|js|jsx|mjs|md|mdx)$/.test(f));
  let bad = 0;
  for (const f of files) {
    for (const h of scanFile(f, readFileSync(f, 'utf8'))) {
      console.error(`${f}:${h.line}: ${h.msg}`);
      bad++;
    }
  }
  if (bad) process.exit(1);
  console.log(`tokens ok (${files.length} files scanned)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) run();
