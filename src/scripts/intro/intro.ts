// DOM glue for the hero intro: types each `.cmd` from its data-keys script; the rest of the hero is always visible.
// It runs only if public/theme-init.js set data-intro before the first paint (motion allowed, not arriving from
// another page of the site); without it the hero is plain static HTML. Any key, click or scroll finishes it at once.
// If this script never runs, a CSS fallback in global.css shows the commands after 2 s.
import { frames, delay } from './keys.mjs';

const root = document.documentElement;
const hero = document.querySelector<HTMLElement>('.hero');
const cursor = hero?.querySelector<HTMLElement>('.cursor');

if (hero && cursor && 'intro' in root.dataset) {
  let skip = false;
  let wake = () => {}; // ends the pause in progress, so a skip takes effect at once
  const finish = () => {
    skip = true;
    wake();
  };
  for (const type of ['keydown', 'pointerdown', 'scroll']) addEventListener(type, finish, { once: true, passive: true });
  const wait = (ms: number) =>
    skip
      ? Promise.resolve()
      : new Promise<void>((r) => {
          const t = setTimeout(r, ms);
          wake = () => (clearTimeout(t), r());
        });
  const end = cursor.parentElement!;
  const endNext = cursor.nextSibling; // the cursor goes back here at the end (before the "type a command" hint)

  (async () => {
    hero.querySelector('.cmd')?.before(cursor); // idle, blinking prompt for a moment, then typing starts
    await wait(450);
    for (const el of hero.querySelectorAll<HTMLElement>('.cmd')) {
      const cmd = el.textContent ?? '';
      el.textContent = '';
      el.classList.add('shown');
      el.after(cursor);
      cursor.classList.add('typing');
      for (const f of frames(el.dataset.keys ?? cmd, cmd)) {
        if (skip) break;
        el.textContent = f.text;
        await wait(delay(f.key));
      }
      el.textContent = cmd;
      await wait(400); // the pause before Enter
    }
    cursor.classList.remove('typing');
    end.insertBefore(cursor, endNext);
    delete root.dataset.intro;
  })();
}
