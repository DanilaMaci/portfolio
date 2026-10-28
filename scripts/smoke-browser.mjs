// Browser smoke test of the built site (dist/), served WITH the production headers (scripts/serve-dist.mjs), in
// headless Chrome over the DevTools protocol. Covers the behaviour unit tests cannot: the DOM glue (intro, theme
// switch, terminal, page transition) and that the Content-Security-Policy blocks nothing the site needs.
//   npm run build && npm run test:browser      (CI runs it after `npm test`)
// Chrome: $CHROME_PATH, else the usual macOS/Linux locations. Exit code 1 on any failure.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from './serve-dist.mjs';

const CHROMES = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const chromePath = CHROMES.find((p) => p && existsSync(p));
if (!existsSync('dist/index.html')) throw new Error('dist/ is missing: run `npm run build` first');
if (!chromePath) throw new Error('Chrome not found: set CHROME_PATH');

const PORT = 4710;
const CDP = 9450;
const base = `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` (${detail})`}`);
  if (!ok) failures.push(name);
};

const server = await serve(PORT);
const profile = mkdtempSync(join(tmpdir(), 'smoke-chrome-')); // scratch outside the project
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--window-size=1280,860', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });

try {
  let targets;
  for (let i = 0; i < 60 && !targets; i++) {
    await wait(250);
    try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); } catch {}
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const problems = []; // console errors, exceptions, CSP violations on the current page
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) pending.get(m.id)(m.result), pending.delete(m.id);
    if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).split('\n')[0]);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('log: ' + m.params.entry.text);
  };
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const media = (motion) => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: motion }, { name: 'prefers-color-scheme', value: 'dark' }] });
  const go = async (path, ms = 600) => { problems.length = 0; await send('Page.navigate', { url: base + path }); await wait(ms); };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  // CSP violations are also collected in the page, in case the log event wording changes.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__csp=[];addEventListener('securitypolicyviolation',e=>__csp.push(e.violatedDirective+' '+e.blockedURI))" });

  // 1. Headers arrive as configured.
  const h = (await fetch(base + '/')).headers;
  check('headers: CSP, HSTS, nosniff, referrer policy', /default-src 'none'/.test(h.get('content-security-policy') ?? '') && !!h.get('strict-transport-security') && h.get('x-content-type-options') === 'nosniff' && h.get('referrer-policy') === 'same-origin');

  // 2. Every page loads with no errors and no CSP violations.
  const projectPages = existsSync('dist/projects') ? readdirSync('dist/projects').map((s) => `/projects/${s}/`) : [];
  for (const path of ['/', '/404.html', ...projectPages]) {
    await media('reduce');
    await go(path, 900);
    const csp = await ev('window.__csp');
    check(`page ${path}: no errors, no CSP violations`, !problems.length && !csp.length, [...problems, ...csp].join('; '));
  }

  // 3. Hero intro: content visible at once, commands typed, intro ends.
  await media('no-preference');
  await go('/', 150);
  const early = await ev("({ intro: 'intro' in document.documentElement.dataset, h1: getComputedStyle(document.querySelector('h1')).visibility, lede: getComputedStyle(document.querySelector('.lede')).visibility })");
  check('intro: starts, name and lede visible from the first paint', early.intro && early.h1 === 'visible' && early.lede === 'visible', JSON.stringify(early));
  await wait(5000);
  const late = await ev("({ intro: 'intro' in document.documentElement.dataset, cmds: [...document.querySelectorAll('.hero .cmd')].map(c => c.textContent) })");
  check('intro: commands typed in full, then it ends', !late.intro && late.cmds.join('|') === 'whoami|cat approach.txt', JSON.stringify(late));
  await media('reduce');
  await go('/', 300);
  check('intro: never with reduced motion', !(await ev("'intro' in document.documentElement.dataset")));

  // 4. Theme switch toggles, persists over a reload.
  const before = await ev("document.querySelector('[data-theme-toggle]').getAttribute('aria-checked')");
  await ev("document.querySelector('[data-theme-toggle]').click()");
  await go('/', 400);
  const after = await ev("({ checked: document.querySelector('[data-theme-toggle]').getAttribute('aria-checked'), theme: document.documentElement.dataset.theme })");
  check('theme switch: toggles and persists', before === 'true' && after.checked === 'false' && after.theme === 'light', JSON.stringify({ before, after }));
  await ev("localStorage.clear()");

  // 5. Terminal: Ctrl+` opens, neofetch prints, Escape closes.
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '`', code: 'Backquote', modifiers: 2 });
  await wait(300);
  await ev("(() => { const i = document.getElementById('term-input'); i.value = 'neofetch'; i.form.requestSubmit(); })()");
  await wait(200);
  const term = await ev("({ open: document.querySelector('dialog[data-terminal]').open, pre: document.querySelectorAll('.term-pre').length })");
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await wait(200);
  check('terminal: opens, runs neofetch, closes', term.open && term.pre >= 5 && !(await ev("document.querySelector('dialog[data-terminal]').open")), JSON.stringify(term));

  // 6. Page transition: boot log on an internal link, gone after Back.
  await media('no-preference');
  await go('/404.html', 600);
  await ev("document.querySelector('.brand').click()");
  await wait(150);
  const boot = await ev("document.querySelectorAll('.boot p').length");
  await wait(1200);
  const landed = await ev('location.pathname');
  await ev('history.back()');
  await wait(1000);
  check('transition: boot log, navigates, nothing left after Back', boot >= 1 && landed === '/' && (await ev("document.querySelectorAll('.boot').length")) === 0, JSON.stringify({ boot, landed }));

  // 7. Without JavaScript nothing un-hides the JS-only controls: they must ship hidden in the HTML.
  const html = await (await fetch(base + '/')).text();
  check('no JS: theme switch, terminal button and prompt hint ship hidden', /<li hidden><button[^>]*data-theme-toggle/.test(html) && /<li hidden><button[^>]*data-terminal-open/.test(html) && /<button[^>]*prompt-hint[^>]*hidden/.test(html));

  ws.close();
} finally {
  chrome.kill();
  server.close();
  await wait(300);
  rmSync(profile, { recursive: true, force: true });
}

console.log(failures.length ? `\n${failures.length} browser check(s) failed` : '\nbrowser smoke test ok');
process.exit(failures.length ? 1 : 0);
