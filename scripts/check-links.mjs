// Every local href/src/srcset and CSS url() in dist/ must point at a file that exists, with exact letter case
// (macOS is case-insensitive, Cloudflare and Linux are not, so we look names up in a Set, not on disk).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';

const isRemote = (u) => !u || u.startsWith('#') || u.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(u);

// `from` is the root-relative path of the file holding the link, e.g. "/page/index.html".
// `files` is a Set of root-relative file paths in dist, e.g. "/index.html". Returns true if the link resolves.
function resolves(url, from, files) {
  let clean = url.split('#')[0].split('?')[0];
  try {
    clean = decodeURIComponent(clean);
  } catch {
    return false; // malformed % escape
  }
  const abs = posix.normalize(clean.startsWith('/') ? clean : posix.join(posix.dirname(from), clean));
  return abs.endsWith('/') ? files.has(abs + 'index.html') : files.has(abs);
}

const cssUrls = (css) => [...css.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)].map((m) => m[2].trim());

function urlsInHtml(html) {
  const urls = [];
  // lookbehind keeps `data-src` out but lets `xlink:href` in
  for (const m of html.matchAll(/(?<![\w-])(href|src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const v = (m[2] ?? m[3]).replaceAll('&amp;', '&');
    if (m[1].toLowerCase() === 'srcset') {
      for (const part of v.split(',')) urls.push(part.trim().split(/\s+/)[0]);
    } else urls.push(v);
  }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) urls.push(...cssUrls(m[1]));
  for (const m of html.matchAll(/(?<![\w-])style\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) urls.push(...cssUrls(m[1] ?? m[2]));
  return urls;
}

// Both return the list of broken links found in one file.
export const checkHtml = (html, from, files) =>
  urlsInHtml(html).filter((u) => !isRemote(u) && !resolves(u, from, files)).map((u) => `${from}: ${u}`);

export const checkCss = (css, from, files) =>
  cssUrls(css).filter((u) => !isRemote(u) && !resolves(u, from, files)).map((u) => `${from}: ${u}`);

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
  );

function run() {
  if (!existsSync('dist')) {
    console.error('dist/ is missing: run `npm run build` first');
    process.exit(1);
  }
  const rel = walk('dist').map((f) => '/' + posix.relative('dist', f.split('\\').join('/')));
  const files = new Set(rel);
  const broken = [];
  for (const p of rel) {
    if (p.endsWith('.html')) broken.push(...checkHtml(readFileSync(join('dist', p), 'utf8'), p, files));
    else if (p.endsWith('.css')) broken.push(...checkCss(readFileSync(join('dist', p), 'utf8'), p, files));
  }
  if (broken.length) {
    console.error('Broken local links:\n' + broken.join('\n'));
    process.exit(1);
  }
  console.log(`links ok (${rel.length} files in dist)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) run();
