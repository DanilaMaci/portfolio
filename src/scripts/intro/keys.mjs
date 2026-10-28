// Pure logic for the hero intro (the typing animation). No DOM here, so tests/intro.test.mjs can run it in Node.
// A key script is what the visitor sees typed, mistakes included:
//   ←  deletes one character (backspace)
//   ⇥  completes the rest of the command at once (Tab completion)
// Every other character is typed as is. frames(keys, cmd).at(-1).text must equal cmd (the test checks the page).

export function frames(keys, cmd) {
  const out = [];
  let text = '';
  for (const key of keys) {
    if (key === '←') text = text.slice(0, -1);
    else if (key === '⇥') text = cmd;
    else text += key;
    out.push({ key, text });
  }
  return out;
}

// Milliseconds to wait after a key. Backspaces are quick, a Tab is a short pause, letters vary like a person typing.
// Faster or slower overall: change these numbers (tests/intro.test.mjs has a ceiling on the total).
export function delay(key, random = Math.random) {
  if (key === '←') return 90;
  if (key === '⇥') return 250;
  return 50 + Math.round(random() * 70);
}
