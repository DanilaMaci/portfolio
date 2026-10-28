// Strict-CSP precondition: dist HTML has no <style>, no style="" attribute, and no inline executable <script>
// (a <script> needs a src, or type="application/json" for data blocks).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function checkInline(html, name) {
  const bad = [];
  if (/<style[\s>]/i.test(html)) bad.push(`${name}: <style> element`);
  const noScriptBodies = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1');
  if (/(?<![\w-])style\s*=/i.test(noScriptBodies)) bad.push(`${name}: style= attribute`);
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    if (!/(?<![\w-])src\s*=/i.test(m[1]) && !/type\s*=\s*["']?application\/json/i.test(m[1])) {
      bad.push(`${name}: inline <script>`);
    }
  }
  return bad;
}

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

function run() {
  if (!existsSync('dist')) {
    console.error('dist/ is missing: run `npm run build` first');
    process.exit(1);
  }
  const bad = walk('dist')
    .filter((f) => f.endsWith('.html'))
    .flatMap((f) => checkInline(readFileSync(f, 'utf8'), f));
  if (bad.length) {
    console.error('Inline style/script found:\n' + bad.join('\n'));
    process.exit(1);
  }
  console.log('inline ok (no <style>, style=, or inline <script>)');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) run();
