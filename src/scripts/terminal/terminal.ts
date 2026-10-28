// DOM glue for the optional terminal. All logic lives in commands.mjs; this file only draws and listens.
// At load: un-hide the button and register listeners. Everything else waits for the first open.
import { run, complete, safeHref, overflow, pushHistory, stepHistory } from './commands.mjs';

// Openers: the nav button, plus the "type a command" hint on the hero's last prompt line.
const openers = document.querySelectorAll<HTMLButtonElement>('[data-terminal-open]');
const dialog = document.querySelector<HTMLDialogElement>('dialog[data-terminal]');

if (openers.length && dialog) {
  let ctx: any;
  let log: HTMLElement;
  let input: HTMLInputElement;
  let history: string[] = [];
  let idx = 0;

  const line = (text: string, cls = '') => {
    const p = document.createElement('p');
    p.textContent = text;
    if (cls) p.className = cls;
    return p;
  };

  const print = (el: HTMLElement) => {
    log.append(el);
    for (let n = overflow(log.children.length); n > 0; n--) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
  };

  const printLine = (l: { text: string; pre?: boolean; link?: { label: string; href: string } }) => {
    const p = line(l.text, l.pre ? 'term-pre' : '');
    const href = l.link && safeHref(l.link.href, location.origin);
    if (l.link && href) {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = l.link.label;
      a.rel = 'noopener';
      p.append(a);
    } else if (l.link) {
      p.append(l.link.label);
    }
    print(p);
  };

  const go = (url: string) => {
    dialog.close();
    if (url.startsWith('/#') && location.pathname === '/') {
      location.hash = url.slice(2);
      const target = document.getElementById(url.slice(2));
      if (target) {
        target.tabIndex = -1;
        target.focus();
      }
    } else {
      location.assign(url);
    }
  };

  const exec = (text: string) => {
    if (text.trim()) {
      const echo = line('$ ' + text, 'term-echo');
      echo.setAttribute('aria-hidden', 'true'); // screen readers hear the output, not the echoed input
      print(echo);
    }
    history = pushHistory(history, text.trim());
    idx = history.length;
    const r = run(text, ctx);
    if (r.clear) log.replaceChildren();
    r.lines.forEach(printLine);
    if (r.close) dialog.close();
    if (r.navigate) go(r.navigate);
  };

  const init = () => {
    ctx = JSON.parse(document.getElementById('terminal-data')!.textContent!);
    log = dialog.querySelector<HTMLElement>('[role="log"]')!;
    input = dialog.querySelector<HTMLInputElement>('input')!;
    document.body.append(dialog); // the top layer does not care where it sits; the end of body keeps nav markup clean
    dialog.querySelector('[data-term-close]')!.addEventListener('click', () => dialog.close());
    dialog.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach((b) =>
      b.addEventListener('click', () => {
        exec(b.dataset.cmd!);
        if (!matchMedia('(pointer: coarse)').matches) input.focus();
      }),
    );
    dialog.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      exec(input.value);
      input.value = '';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        idx = stepHistory(history, idx, e.key === 'ArrowUp' ? -1 : 1);
        input.value = history[idx] ?? '';
      } else if (e.key === 'Tab' && !e.shiftKey && input.value.trim()) {
        const options: string[] = complete(input.value, ctx);
        if (!options.length) return;
        e.preventDefault();
        let common = options[0];
        for (const o of options) while (!o.startsWith(common)) common = common.slice(0, -1);
        if (common.length > input.value.length) input.value = common;
        if (options.length > 1) print(line(options.join('  ')));
      }
    });
  };

  const open = () => {
    const first = !ctx;
    if (first) init();
    dialog.showModal();
    if (first) {
      printLine({ text: 'Welcome. This is an optional text-based way to look around my portfolio. The normal page works too: press Close to go back.' });
      printLine({ text: 'Click a button below, or type help.' });
    }
    if (!matchMedia('(pointer: coarse)').matches) input.focus();
  };

  for (const opener of openers) {
    (opener.closest('li') ?? opener).hidden = false; // hidden without JS, so no dead button, empty bullet or gap
    opener.addEventListener('click', open);
  }
  addEventListener('keydown', (e) => {
    if (e.code === 'Backquote' && e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && !e.repeat) {
      e.preventDefault();
      if (dialog.open) dialog.close();
      else open();
    }
  });
}
