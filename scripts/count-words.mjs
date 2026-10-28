// Counts the words a visitor can read in <main> of a built page (default dist/index.html), in total and per <section>.
// Run after `npm run build`: node scripts/count-words.mjs [file]. Not part of npm test (the word budget is a guide).
// Dropped before counting: <script> (including the JSON data block), <style>, <template> and elements with the
// `hidden` attribute. A word is a whitespace-separated token with a letter or digit in it, so "·" and "–" don't count.
// Not an HTML parser: a hidden element that contains another element of the same tag is cut at the inner close tag.
import { readFileSync } from 'node:fs';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function visibleText(html) {
  return html
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(\w+)\b[^>]*\shidden(?=[\s>=/])[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
      e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m),
    );
}

const countWords = (text) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const file = process.argv[2] ?? 'dist/index.html';
const html = readFileSync(file, 'utf8');
const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
if (!main) {
  console.error(`count-words: no <main> in ${file}`);
  process.exit(1);
}
for (const [, label, body] of main[1].matchAll(/<section\b[^>]*aria-labelledby="([^"]+)"[^>]*>([\s\S]*?)<\/section>/gi)) {
  console.log(`${label.padEnd(10)} ${countWords(visibleText(body))}`);
}
console.log(`${'total'.padEnd(10)} ${countWords(visibleText(main[1]))}  (${file}, <main> only)`);
