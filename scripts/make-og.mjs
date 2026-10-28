// Draws public/og.png (1200x630), the preview image shown when the site link is shared (LinkedIn, Slack, messages).
// Name and headline are read from the built home page, colours from tokens.css, fonts from public/fonts, so the card
// matches the site. Run after a build when the headline changes:  npm run build && node scripts/make-og.mjs --force
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = 'public/og.png';
if (existsSync(OUT) && !process.argv.includes('--force')) throw new Error(`${OUT} exists; pass --force to redraw it`);
const html = readFileSync('dist/index.html', 'utf8');
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
const name = strip(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)[1]);
const headline = strip(/<p class="headline"[^>]*>([\s\S]*?)<\/p>/.exec(html)[1]);
const root = /:root \{([\s\S]*?)\n\}/.exec(readFileSync('src/styles/tokens.css', 'utf8'))[1];
const token = (n) => new RegExp(`--color-${n}:\\s*(#[0-9a-fA-F]{6})`).exec(root)[1];
const font = (f) => `url(data:font/woff2;base64,${readFileSync(`public/fonts/${f}`).toString('base64')})`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const page = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: M; font-weight: 400; src: ${font('ibm-plex-mono-latin-400-normal.woff2')}; }
@font-face { font-family: M; font-weight: 600; src: ${font('ibm-plex-mono-latin-600-normal.woff2')}; }
@font-face { font-family: S; font-weight: 600; src: ${font('ibm-plex-sans-latin-600-normal.woff2')}; }
html, body { margin: 0; width: 1200px; height: 630px; background: ${token('bg')}; }
body { box-sizing: border-box; padding: 96px 88px; display: flex; flex-direction: column; font-family: M; color: ${token('text')}; border-top: 12px solid ${token('accent')}; }
.p { color: ${token('muted')}; font-size: 30px; } .p b { color: ${token('accent')}; font-weight: 400; }
h1 { font-size: 78px; font-weight: 600; margin: 18px 0 22px; }
.h { font-family: S; font-weight: 600; font-size: 42px; color: ${token('accent')}; margin: 0; }
.t { margin-top: auto; display: flex; justify-content: space-between; font-size: 28px; color: ${token('muted')}; }
.t span:last-child { color: ${token('link')}; }
</style><div class="p"><b>~</b> $ whoami</div><h1>${esc(name)}</h1><p class="h">${esc(headline)}</p>
<div class="t"><span>Software · Embedded · Data</span><span>danilamacijauskas.dev</span></div>`;

const dir = mkdtempSync(join(tmpdir(), 'og-'));
writeFileSync(join(dir, 'og.html'), page);
const chromePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
await new Promise((resolve, reject) => {
  const c = spawn(chromePath, ['--headless=new', `--user-data-dir=${join(dir, 'profile')}`, '--hide-scrollbars', '--window-size=1200,630', `--screenshot=${join(process.cwd(), OUT)}`, '--virtual-time-budget=2000', `file://${join(dir, 'og.html')}`], { stdio: 'ignore' });
  c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`chrome exited ${code}`))));
});
rmSync(dir, { recursive: true, force: true });
console.log(`${OUT}: "${name}" / "${headline}"`);
