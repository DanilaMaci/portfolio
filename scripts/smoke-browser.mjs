// Browser smoke test of the built site (dist/), served WITH the production headers (scripts/serve-dist.mjs), in
// headless Chrome over the DevTools protocol. Covers the behaviour unit tests cannot: the DOM glue (intro, theme
// switch, terminal, page transition) and that the Content-Security-Policy blocks nothing the site needs.
//   npm run build && npm run test:browser      (CI runs it after `npm test`)
//   SMOKE_URL=https://danilamacijauskas.dev npm run test:browser      (the live site, after a deploy)
// Chrome: $CHROME_PATH, else the usual macOS/Linux locations. Exit code 1 on any failure.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from './serve-dist.mjs';

const CHROMES = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const chromePath = CHROMES.find((p) => p && existsSync(p));
const live = process.env.SMOKE_URL?.replace(/\/$/, '');
if (!live && !existsSync('dist/index.html')) throw new Error('dist/ is missing: run `npm run build` first');
if (!chromePath) throw new Error('Chrome not found: set CHROME_PATH');

const PORT = 4710;
const CDP = 9450;
const base = live ?? `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` (${detail})`}`);
  if (!ok) failures.push(name);
};

const server = live ? { close() {} } : await serve(PORT);
const profile = mkdtempSync(join(tmpdir(), 'smoke-chrome-')); // scratch outside the project
// CI (Linux containers/VMs): no sandbox, no /dev/shm limits, no GPU. Chrome's stderr is kept so a failed start says why.
const ciFlags = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] : [];
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--window-size=1280,860', ...ciFlags, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeLog = '';
let chromeExit = null;
chrome.stderr.on('data', (d) => (chromeLog += d));
chrome.on('exit', (code) => (chromeExit = code));

try {
  let page;
  for (let i = 0; i < 120 && !page && chromeExit === null; i++) {
    await wait(250);
    try { page = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch {}
  }
  if (!page) {
    console.error(`Chrome did not start (${chromePath}, exit ${chromeExit ?? 'none, timed out after 30 s'}). Its last output:\n${chromeLog.slice(-2000)}`);
    process.exitCode = 1;
    throw new Error('no browser');
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
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
  // True once `expr` is truthy, polling up to `ms` (the page may be mid-navigation, where evaluate throws).
  const until = async (expr, ms = 3000) => {
    for (let t = 0; t < ms; t += 50) {
      try { if (await ev(expr)) return true; } catch {}
      await wait(50);
    }
    return false;
  };
  const go = async (path, ms = 600) => { problems.length = 0; await send('Page.navigate', { url: base + path }); await wait(ms); };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  // CSP violations are also collected in the page, in case the log event wording changes.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__csp=[];addEventListener('securitypolicyviolation',e=>__csp.push(e.violatedDirective+' '+e.blockedURI))" });

  // 1. Headers arrive as configured.
  const h = (await fetch(base + '/')).headers;
  check('headers: CSP, HSTS, nosniff, referrer policy', /default-src 'none'/.test(h.get('content-security-policy') ?? '') && !!h.get('strict-transport-security') && h.get('x-content-type-options') === 'nosniff' && h.get('referrer-policy') === 'same-origin');

  // 2. Every page loads with no errors and no CSP violations.
  const projectPages = existsSync('dist/projects') ? readdirSync('dist/projects').map((s) => `/projects/${s}/`) : [];
  for (const path of ['/', '/404.html', '/colophon/', ...projectPages]) {
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

  // 6. Page transition: the boot log shows once per tab session, never on card clicks; nothing is left after Back.
  const bootCount = () => ev("document.querySelectorAll('.boot').length");
  await media('no-preference');
  await go('/404.html', 600);
  await ev("sessionStorage.removeItem('bootlog')");
  await ev("document.querySelector('.brand').click()");
  await wait(100);
  const boot = await bootCount();
  const landed = (await until("location.pathname === '/'", 3000)) ? '/' : await ev('location.pathname'); // no fixed deadline: CI runners are slow
  check('transition: first brand click shows the boot log at 100 ms, then navigates', boot >= 1 && landed === '/', JSON.stringify({ boot, landed }));
  await go(projectPages[0] ?? '/404.html', 600); // sessionStorage.bootlog is set now
  await ev("document.querySelector('.brand').click()");
  let seen = 0;
  for (let t = 0; t < 4; t++) { await wait(100); seen += (await bootCount()) ?? 0; }
  await wait(500);
  const second = await ev('location.pathname');
  check('transition: a second non-card click shows no boot log and still navigates', seen === 0 && second === '/', JSON.stringify({ seen, second }));
  const cspHome = await ev('window.__csp');
  problems.length = 0;
  await ev("document.querySelector('.project .card-title a').click()");
  seen = 0;
  for (let t = 0; t < 4; t++) { await wait(100); seen += (await bootCount()) ?? 0; }
  await wait(700);
  const card = await ev('location.pathname');
  const cspCard = await ev('window.__csp');
  check('transition: a project card click shows no boot log, lands on the project, 0 CSP violations, no console problems', seen === 0 && /^\/projects\//.test(card) && !cspHome.length && !cspCard.length && !problems.length, JSON.stringify({ seen, card, csp: [...cspHome, ...cspCard], problems }));
  await ev('history.back()');
  await wait(1000);
  check('transition: nothing left after Back', (await bootCount()) === 0);

  // 6b. Slow network (150 ms per request): the page script arrives after the first frame, which is when the
  // card-image morph and the "navigation failed" timer used to go wrong.
  await send('Network.enable');
  const slow = (latency) => send('Network.emulateNetworkConditions', { offline: false, latency, downloadThroughput: -1, uploadThroughput: -1 });
  // Observable for "this page was named for the morph": after the transition is ready, an animation runs on
  // ::view-transition-new(card-image). Only the new page's own naming creates that pseudo-element, so it is 'fade'
  // (old image alone) when the naming script came too late. Recorded by a script injected before the page's own.
  const recorder = await send('Page.addScriptToEvaluateOnNewDocument', { source: "addEventListener('pagereveal', e => { window.__vt = e.viewTransition ? 'pending' : 'none'; e.viewTransition?.ready.then(() => { window.__vt = document.getAnimations().some((a) => a.effect?.pseudoElement === '::view-transition-new(card-image)') ? 'morph' : 'fade'; }, () => { window.__vt = 'skipped'; }); })" });
  await media('no-preference');
  await slow(150);
  await go('/', 1800);
  await ev("document.querySelector('.project .card-image').scrollIntoView({ block: 'center' })");
  await ev("document.querySelector('.project .card-title a').click()");
  await until("/^\\/projects\\//.test(location.pathname)", 4000);
  await wait(900);
  check('slow network: a card click morphs the image into the project page', (await ev('window.__vt')) === 'morph', String(await ev('window.__vt')));
  await ev("window.__vt = ''; history.back()");
  await until("location.pathname === '/'", 4000);
  await wait(900);
  check('slow network: browser Back morphs the image back into its card', (await ev('window.__vt')) === 'morph', String(await ev('window.__vt')));
  // The 3 s "navigation failed" timer must not survive in the back/forward cache and drop the once-per-session flag.
  await ev("sessionStorage.removeItem('bootlog'); document.querySelector('.site-footer a[href=\"/colophon/\"]').click()");
  const onColophon = await until("location.pathname === '/colophon/'", 4000);
  await wait(300);
  await ev('history.back()');
  await until("location.pathname === '/'", 4000);
  await wait(3600);
  check('transition: the boot-log flag survives Back (the 3 s failure timer is cancelled)', onColophon && (await ev("sessionStorage.getItem('bootlog')")) === '1');
  // A second click on another link while the log shows goes to that link, not to the first one.
  await ev("sessionStorage.removeItem('bootlog'); document.querySelector('.site-footer a[href=\"/colophon/\"]').click()");
  await wait(60);
  await ev("document.querySelector('.project .card-title a').click()");
  await until("/^\\/projects\\//.test(location.pathname)", 4000);
  await wait(1500); // a stale first-link timer would now send the page to /colophon/
  const second2 = await ev('location.pathname');
  check('transition: a second click while the log shows goes to the second link', /^\/projects\//.test(second2), second2);
  await slow(0);
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: recorder.identifier });

  // 7. Without JavaScript nothing un-hides the JS-only controls: they must ship hidden in the HTML.
  const html = await (await fetch(base + '/')).text();
  check('no JS: theme switch, terminal button and prompt hint ship hidden', /<li hidden><button[^>]*data-theme-toggle/.test(html) && /<li hidden><button[^>]*data-terminal-open/.test(html) && /<button[^>]*prompt-hint[^>]*hidden/.test(html));

  // 8. Phone and desktop layout, reduced motion: touch targets, 404 footer, horizontal overflow, layout shift.
  await media('reduce');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__cls=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)__cls+=e.value}).observe({type:'layout-shift',buffered:true})}catch{}" });
  for (const [w, hgt, mobile] of [[390, 844, true], [1400, 1000, false]]) {
    const tag = `${w}x${hgt}`;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: hgt, deviceScaleFactor: 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
    for (const path of ['/', '/404.html', '/colophon/', ...projectPages]) {
      await go(path, 1100);
      const m = await ev("({ cls: window.__cls, over: document.documentElement.scrollWidth - document.documentElement.clientWidth, foot: document.querySelector('.site-footer').getBoundingClientRect().bottom, ih: innerHeight })");
      check(`${tag} ${path}: no horizontal overflow, CLS <= 0.02`, m.over === 0 && m.cls <= 0.02, JSON.stringify(m));
      if (path === '/404.html') check(`${tag} 404: footer bottom equals the viewport height`, Math.abs(m.foot - m.ih) <= 1, JSON.stringify(m));
    }
    if (!mobile) continue;
    await go('/', 900);
    const t = await ev("({ nav: [...document.querySelectorAll('.site-header nav a')].map(a => a.getBoundingClientRect().height).filter(x => x > 0), end: document.querySelector('.prompt-end')?.getBoundingClientRect().height, coarse: matchMedia('(pointer: coarse)').matches })");
    check('390 home: header nav links are >= 44 px high', t.nav.length > 0 && t.nav.every((x) => x >= 44), JSON.stringify(t.nav));
    check('390 home: the .prompt-end hit band is >= 44 px high', t.end >= 44, String(t.end));
    if (t.coarse) {
      await ev("document.querySelector('[data-terminal-open]').click()");
      await wait(300);
      const close = await ev("document.querySelector('.term-close')?.getBoundingClientRect().height");
      check('390 terminal: Close button is >= 44 px high (pointer: coarse)', close >= 44, String(close));
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    } else {
      // Chrome did not report a coarse pointer over CDP: test that the rule exists instead of the measured height.
      const rule = await ev("[...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => r.media && /pointer:\\s*coarse/.test(r.conditionText ?? r.media.mediaText) && [...r.cssRules].some(c => /\\.term button/.test(c.selectorText) && c.style.minHeight)); } catch { return false; } })");
      check('390 terminal: a (pointer: coarse) rule sets min-height on .term button (coarse pointer not emulated)', rule);
    }
  }
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });

  ws.close();
} finally {
  chrome.kill();
  server.close();
  await wait(300);
  rmSync(profile, { recursive: true, force: true });
}

console.log(failures.length ? `\n${failures.length} browser check(s) failed` : '\nbrowser smoke test ok');
process.exit(failures.length ? 1 : 0);
