// I2 (one-page print) and I3 (footer status line, /colophon). Needs `npm run build` first (npm test does that).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkNames, commitInfo, statusSegments, cspFrom } from '../src/lib/build.mjs';
import { serve } from '../scripts/serve-dist.mjs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
// Written out here, independent of the code under test: adding a check means adding it here and to the colophon reasons.
const names = ['pins', 'tokens', 'contrast', 'privacy', 'history', 'links', 'inline'];
const text = (html) => html.replace(/<[^>]+>/g, '|').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

test('checkNames reads the check scripts from the npm "check" script', () => {
  assert.deepEqual(checkNames('node scripts/check-a.mjs && node scripts/check-b-c.mjs'), ['a', 'b-c']);
  assert.deepEqual(checkNames(pkg.scripts.check), names);
});

test('commitInfo: git first, then the Workers Builds env, else nothing (never a fake hash)', () => {
  const git = (out) => (args) => { if (out === null) throw new Error('no git'); return out[args[0]] ?? ''; };
  assert.deepEqual(commitInfo(git({ 'rev-parse': 'abc1234\n', branch: 'main\n' }), {}), { hash: 'abc1234', branch: 'main' });
  assert.deepEqual(commitInfo(git(null), { WORKERS_CI_COMMIT_SHA: '0123456789abcdef', WORKERS_CI_BRANCH: 'main' }), { hash: '0123456', branch: 'main' });
  assert.deepEqual(commitInfo(git(null), { WORKERS_CI_COMMIT_SHA: '0123456789abcdef' }), { hash: '0123456', branch: '' });
  assert.deepEqual(commitInfo(git(null), {}), { hash: '', branch: '' });
  // detached HEAD: hash yes, branch not read reliably
  assert.deepEqual(commitInfo(git({ 'rev-parse': 'abc1234', branch: '' }), {}), { hash: 'abc1234', branch: '' });
  // detached HEAD in CI: branch from WORKERS_CI_BRANCH
  assert.deepEqual(commitInfo(git({ 'rev-parse': 'abc1234', branch: '' }), { WORKERS_CI_BRANCH: 'main' }), { hash: 'abc1234', branch: 'main' });
  // hostile values: hash must be 7-40 hex after trimming, branch a plain ref name of at most 40 characters
  assert.deepEqual(commitInfo(git({ 'rev-parse': '  ABCDEF1 ', branch: 'main' }), {}), { hash: '', branch: '' });
  assert.deepEqual(commitInfo(git({ 'rev-parse': '<b>x</b>', branch: 'main' }), {}), { hash: '', branch: '' });
  assert.deepEqual(commitInfo(git({ 'rev-parse': 'zzzzzzz', branch: 'main' }), {}), { hash: '', branch: '' });
  assert.deepEqual(commitInfo(git({ 'rev-parse': '   ', branch: 'main' }), {}), { hash: '', branch: '' });
  assert.deepEqual(commitInfo(git(null), { WORKERS_CI_COMMIT_SHA: '"><script>', WORKERS_CI_BRANCH: 'main' }), { hash: '', branch: '' });
  assert.deepEqual(commitInfo(git(null), { WORKERS_CI_COMMIT_SHA: ' 0123456789abcdef\n', WORKERS_CI_BRANCH: ' feat/x ' }), { hash: '0123456', branch: 'feat/x' });
  assert.deepEqual(commitInfo(git({ 'rev-parse': 'abc1234', branch: '<b>x</b>' }), {}), { hash: 'abc1234', branch: '' });
  assert.deepEqual(commitInfo(git({ 'rev-parse': 'abc1234', branch: 'a'.repeat(100000) }), {}), { hash: 'abc1234', branch: '' });
});

test('statusSegments: no hash segment without a hash; brackets only with a branch; says "checks" not "passed"', () => {
  const none = statusSegments({ hash: '', branch: '', date: '2026-11-13', checks: 7 }).map((s) => s.text);
  assert.deepEqual(none, ['built 2026-11-13', '7 checks']);
  const hashOnly = statusSegments({ hash: 'abc1234', branch: '', date: '2026-11-13', checks: 7 }).map((s) => s.text);
  assert.deepEqual(hashOnly, ['abc1234', 'built 2026-11-13', '7 checks']);
  const full = statusSegments({ hash: 'abc1234', branch: 'main', date: '2026-11-13', checks: 7 }).map((s) => s.text);
  assert.deepEqual(full, ['[main]', 'abc1234', 'built 2026-11-13', '7 checks']);
  assert.ok(!full.join().includes('passed'));
});

test('cspFrom returns the Content-Security-Policy value of public/_headers', () => {
  assert.equal(cspFrom('/*\n  X-A: 1\n  Content-Security-Policy: default-src \'none\'; x\n'), "default-src 'none'; x");
});

test('built footer: status line count equals the checks in package.json, links to /colophon/', () => {
  const html = readFileSync('dist/index.html', 'utf8');
  const line = html.match(/<p class="status-line">[\s\S]*?<\/p>/)?.[0];
  assert.ok(line, 'no status line in the footer');
  assert.match(text(line), new RegExp(`\\|${names.length} checks\\|`));
  assert.match(line, /<a href="\/colophon\/">how this site is checked<\/a>/);
  assert.ok(!/passed/.test(line));
  assert.match(html, /<footer[\s\S]*Danila Macijauskas · Static site built with Astro · No cookies, no tracking/);
});

test('built /colophon/: lists exactly the checks of package.json, shows the CSP verbatim', () => {
  const html = readFileSync('dist/colophon/index.html', 'utf8');
  const rows = [...html.matchAll(/<span class="label" translate="no">([\w-]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(rows, names);
  assert.equal([...html.matchAll(/<span class="label" translate="no">[\w-]+<\/span> <span>\S[^<]*<\/span>/g)].length, names.length, 'every check has a reason');
  const csp = cspFrom(readFileSync('public/_headers', 'utf8'));
  assert.ok(csp.length > 50);
  const pre = html.match(/<pre class="code-block" translate="no">([\s\S]*?)<\/pre>/)?.[1].replace(/&#39;/g, "'");
  assert.equal(pre, csp);
  assert.match(html, /<h1[^>]*>How this site is built and checked<\/h1>/);
  assert.match(html, /<span aria-hidden="true">\$ <\/span>npm test/);
  assert.match(html, /Cloudflare builds this site with npm test and deploys only if it passes\./);
  assert.ok(!/Lighthouse|passed at/i.test(html));
  assert.match(readFileSync('dist/sitemap.xml', 'utf8'), /\/colophon\/<\/loc>/);
});

// ---- I2: print gives ONE A4 page. Needs Chrome (like scripts/smoke-browser.mjs); skipped without it, e.g. on Cloudflare.
const chromePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && existsSync(p));
const skip = !chromePath ? 'Chrome not found (set CHROME_PATH): print page-count test skipped' : !existsSync('dist/index.html') ? 'dist/ missing' : false;

// Page count: Chrome's PDF has one `/Type /Page` dictionary per page (the page tree is `/Type /Pages`, so the
// regex forbids a following "s"). Cross-checked with the root `/Count N` of the page tree.
function pdfPages(pdf) {
  const s = pdf.toString('latin1');
  const objs = (s.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  const counts = [...s.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/g)].map((m) => Number(m[1] ?? m[2]));
  assert.ok(counts.length === 0 || Math.max(...counts) === objs, `page objects ${objs} vs /Count ${counts}`);
  return objs;
}

test('print: the home page is exactly one A4 page', { skip, timeout: 60000 }, async () => {
  const PORT = 4711, CDP = 9451;
  const server = await serve(PORT);
  const profile = mkdtempSync(join(tmpdir(), 'ideas-chrome-'));
  const ci = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] : [];
  const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, ...ci, 'about:blank'], { stdio: 'ignore' });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    let page;
    for (let i = 0; i < 120 && !page; i++) {
      await wait(250);
      try { page = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    }
    assert.ok(page, 'Chrome did not start');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) pending.get(m.id)(m), pending.delete(m.id); };
    const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
    await send('Page.enable');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await wait(1500);
    // the terminal dialog may be open when `cv` calls window.print(): open it and check it is hidden in print
    await send('Runtime.evaluate', { expression: "document.querySelector('dialog[data-terminal]')?.showModal()" });
    await send('Emulation.setEmulatedMedia', { media: 'print', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const hidden = await send('Runtime.evaluate', { expression: "(() => { const d = document.querySelector('dialog[data-terminal]'); return !d || getComputedStyle(d).display === 'none'; })()", returnByValue: true });
    assert.equal(hidden.result.result.value, true, 'terminal dialog visible in print');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const r = await send('Page.printToPDF', { paperWidth: 8.27, paperHeight: 11.69, printBackground: false, preferCSSPageSize: true });
    const pdf = Buffer.from(r.result.data, 'base64');
    assert.ok(pdf.subarray(0, 5).toString() === '%PDF-');
    if (process.env.PRINT_PDF_OUT) (await import('node:fs')).writeFileSync(process.env.PRINT_PDF_OUT, pdf);
    assert.equal(pdfPages(pdf), 1, 'The home page no longer prints on one A4 page. Print shows only the first three projects (src/styles/print.css); trim the Path/Skills print rules there or shorten the content, or adjust this test if more pages are intended.');
  } finally {
    chrome.kill();
    server.close();
    await wait(300);
    rmSync(profile, { recursive: true, force: true });
  }
});
