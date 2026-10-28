// Page transition: a click on a link to another page of this site prints a short boot log (like a Linux start-up)
// over the dimmed page, then navigates. The @view-transition rule in global.css crossfades from the log to the new page (Chrome, Edge,
// Safari 18.2+; other browsers just switch). Skipped with reduced motion, and for modifier/middle clicks, new tabs,
// downloads, links in the terminal dialog and same-page anchors. Lines are drawn with textContent only.
import { bootLines } from './shell.mjs';

const motionOK = matchMedia('(prefers-reduced-motion: no-preference)');
const STEP = 50; // ms between lines
const LEAVE = 300; // ms until the browser navigates
let leaving = false; // a second click while leaving is ignored (no stacked logs)

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
  e.preventDefault();
  if (leaving) return;
  leaving = true;
  show(bootLines(url.pathname, a.textContent ?? ''));
  setTimeout(() => location.assign(url.href), LEAVE);
  setTimeout(reset, 3000); // navigation failed (e.g. offline): give the page back
});

function reset() {
  leaving = false;
  document.querySelectorAll('.boot').forEach((b) => b.remove());
}
// Back/forward can restore this page from the browser cache with the log still on top: remove it.
addEventListener('pageshow', reset);
