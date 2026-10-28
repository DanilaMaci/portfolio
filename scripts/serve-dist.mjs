// Serves dist/ on 127.0.0.1 with the response headers from public/_headers, like the live host does. Used by
// scripts/smoke-browser.mjs, and by hand to see the production site with its security headers:
//   node scripts/serve-dist.mjs [port]      (default 4700)
// Missing files get dist/404.html with status 404; a directory serves its index.html.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, relative, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

// [{ pattern: RegExp, headers: [[name, value]] }] from the _headers text. Absolute-URL rules (https://...) are for
// other hostnames (previews) and are skipped here.
export function parseHeaders(text) {
  const rules = [];
  for (const raw of text.split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      const p = raw.trim();
      rules.push({ pattern: p.startsWith('/') ? new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$') : null, headers: [] });
    } else if (rules.length) {
      const i = raw.indexOf(':');
      rules.at(-1).headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
    }
  }
  return rules.filter((r) => r.pattern);
}

export function serve(port = 4700, root = 'dist') {
  const rules = parseHeaders(readFileSync('public/_headers', 'utf8'));
  const server = createServer((req, res) => {
    let path;
    try {
      path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      return res.writeHead(400).end(); // malformed %-escape
    }
    let file = resolve(root, '.' + path);
    const rel = relative(resolve(root), file);
    if (rel.startsWith('..') || isAbsolute(rel)) return res.writeHead(400).end(); // no escape from dist/
    if (rel === '_headers' || rel === '_redirects') file = join(root, '__not_served__'); // config, like on Pages
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    let status = 200;
    if (!existsSync(file)) [file, status] = [join(root, '404.html'), 404];
    for (const r of rules) if (r.pattern.test(path)) for (const [k, v] of r.headers) res.setHeader(k, v);
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.writeHead(status).end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] ?? 4700);
  await serve(port);
  console.log(`dist/ with production headers: http://127.0.0.1:${port}/`);
}
