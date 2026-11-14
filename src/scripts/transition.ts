// Page transition: the first click per tab on a link to another page of this site prints a short boot log (like a Linux
// start-up) over the dimmed page, then navigates. Clicks on project cards and the project page's back link never show
// it: the card image morphs into the project image instead (public/morph-init.js). The @view-transition rule in
// global.css crossfades from the log to the new page (Chrome, Edge, Safari 18.2+; other browsers just switch).
// Skipped with reduced motion, and for modifier/middle clicks, new tabs, downloads, links in the terminal dialog and
// same-page anchors. Lines are drawn with textContent only.
import { bootLines } from './shell.mjs';

const motionOK = matchMedia('(prefers-reduced-motion: no-preference)');
const STEP = 40; // ms between lines
const LEAVE = 200; // ms until the browser navigates
const KEY = 'bootlog'; // sessionStorage flag: the log was shown in this tab
let leaving: string | null = null; // target URL while the log shows; the latest click wins, Escape goes there at once
let leaveTimer: number | undefined; // goes to `leaving` after LEAVE
let failTimer: number | undefined; // gives the page back if the navigation has not happened after 3 s
// True once per tab session; blocked storage means no log.
function firstTime() {
  try {
    if (sessionStorage.getItem(KEY)) return false;
    sessionStorage.setItem(KEY, '1');
    return true;
  } catch {
    return false;
  }
}

function show(lines: ReturnType<typeof bootLines>) {
  const box = document.createElement('div');
  box.className = 'boot';
  box.setAttribute('aria-hidden', 'true');
  document.body.append(box);
  lines.forEach((l, i) =>
    setTimeout(() => {
      const p = document.createElement('p');
      if (l.cmd) {
        const sigil = document.createElement('span');
        sigil.className = 'prompt-sigil';
        sigil.textContent = '$ ';
        p.append(sigil, l.cmd);
      } else {
        const ok = document.createElement('span');
        ok.className = 'boot-ok';
        ok.textContent = '  OK  ';
        p.append('[', ok, '] ', l.ok ?? '');
      }
      box.append(p);
    }, i * STEP),
  );
}

addEventListener('click', (e) => {
  if (!motionOK.matches || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.('a');
  if (!a || a.target || a.hasAttribute('download') || a.closest('dialog')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname === location.pathname) return;
  if (leaving) {
    e.preventDefault();
    clearTimeout(leaveTimer);
    leaving = url.href;
    location.assign(leaving);
    return;
  }
  if (a.closest('.project, .project-page > .prompt-line') || !firstTime()) return; // plain navigation, CSS crossfade
  e.preventDefault();
  leaving = url.href;
  show(bootLines(url.pathname, a.textContent ?? ''));
  leaveTimer = setTimeout(() => location.assign(url.href), LEAVE);
  failTimer = setTimeout(() => { // navigation failed (e.g. offline): give the page back, and let the log show again next time
    reset();
    try { sessionStorage.removeItem(KEY); } catch {}
  }, 3000);
});
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !leaving) return;
  clearTimeout(leaveTimer);
  location.assign(leaving);
});

function reset() {
  clearTimeout(leaveTimer);
  clearTimeout(failTimer);

  leaving = null;
  document.querySelectorAll('.boot').forEach((b) => b.remove());
}
// Back/forward can restore this page from the browser cache with the log still on top: remove it. pagehide: the page
// is frozen with the 3 s timer pending; it must not fire after Back and drop the once-per-session flag.
addEventListener('pageshow', reset);
addEventListener('pagehide', () => clearTimeout(failTimer));
