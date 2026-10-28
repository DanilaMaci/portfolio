// Scans tracked files (git ls-files -co --exclude-standard) and built text files in dist/ for personal data:
// emails, phone numbers, Eircodes, street addresses and anything in the private deny-list.
// This is a heuristic plus a deny-list. It is NOT a guarantee. Git history is checked by check-history.mjs.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const ALLOWED_EMAIL_DOMAINS = ['danilamacijauskas.dev'];
export const DENY_FILE = '.private/deny.txt';

// tests/ builds fake phone numbers and emails on purpose.
export const exempt = (path) => path.startsWith('tests/');

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g; // last label letters only: pkg@1.2.3 is no email
const OBFUSCATED_EMAIL = /[\w.+-]+\s*[[({]\s*at\s*[\])}]\s*[\w-]+(?:\s*[[({]?\s*dot\s*[\])}]?\s*[\w-]+|\.[\w-]+)+/gi;
const NOT_AFTER = String.raw`(?<![\w.#/=@%+:-])`; // a number must not continue a word, hash, path, URL or hex colour
const NOT_AFTER_INTL = String.raw`(?<![\w.#/=@%+-])`; // like NOT_AFTER, but "tel:+353..." is allowed
const NOT_BEFORE = String.raw`(?![\w%])`;
const PHONE_INTL = new RegExp(`${NOT_AFTER_INTL}(?:\\+|00)\\d{1,3}(?:[ .()-]*\\d){6,12}${NOT_BEFORE}`, 'g'); // +353 (0)87..., 00353...
const PHONE_LOCAL = new RegExp(`${NOT_AFTER}0[78]\\d(?:[ .-]?\\d){7,8}${NOT_BEFORE}`, 'g'); // Irish 08x, UK 07x
const PHONE_US = new RegExp(`${NOT_AFTER}(?:\\+?1[ .-]?)?(?:\\(\\d{3}\\)[ .-]?|\\d{3}[ .-])\\d{3}[ .-]\\d{4}${NOT_BEFORE}`, 'g');
const PHONE_GENERIC = new RegExp(`${NOT_AFTER}\\d{2,}(?:([ .-])\\d{2,}){2,}${NOT_BEFORE}`, 'g'); // 9+ digits, groups with one repeated separator
const EIRCODE = /(?<![\w#.-])(?:[ACDEFHKNPRTVWXY]\d{2}|D6W) ?[0-9ACDEFHKNPRTVWXY]{4}(?![\w-])/g;
const STREET = /\b\d{1,4}[A-Za-z]?,? (?:[A-Z][a-z']+ ){1,3}(?:Street|Road|Avenue|Lane|Drive|Close|Court|Crescent|Terrace|Square|Quay|Boulevard|Rd|Ave|Ln|Blvd)\b/g;

const digits = (s) => s.replace(/\D/g, '').length;
function plausiblePhone(m, generic) {
  const n = digits(m);
  if (n < 9 || n > 15) return false;
  if (!generic) return true;
  const groups = m.split(/\D/);
  if (/^\d{4}[ .-]\d{2}[ .-]\d{2}/.test(m)) return false; // date
  if (groups.every((g) => g.length === 4)) return false; // "2019 2020 2021"
  if (m.includes('.') && groups.length === 4 && groups.every((g) => g.length <= 3)) return false; // IPv4
  if (m.includes('.') && groups.some((g) => g.length < 3)) return false; // version-like or decimals
  return true;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// deny: [{n, text}] from loadDeny(). Messages never contain a deny-list value or a full phone/email.
export function scanLine(line, deny = []) {
  const msgs = [];
  for (const m of line.matchAll(EMAIL)) {
    if (!ALLOWED_EMAIL_DOMAINS.includes(m[1].toLowerCase())) msgs.push(`email at ${m[1]}`);
  }
  if (OBFUSCATED_EMAIL.test(line)) msgs.push('obfuscated email');
  OBFUSCATED_EMAIL.lastIndex = 0;
  const seen = new Set();
  for (const [re, generic] of [[PHONE_INTL], [PHONE_LOCAL], [PHONE_US], [PHONE_GENERIC, true]]) {
    for (const m of line.matchAll(re)) {
      if (plausiblePhone(m[0], generic) && !seen.has(m.index)) {
        seen.add(m.index);
        msgs.push(`phone-like number (${digits(m[0])} digits)`);
      }
    }
  }
  if (EIRCODE.test(line)) msgs.push('Eircode-like postcode');
  EIRCODE.lastIndex = 0;
  if (STREET.test(line)) msgs.push('street-address-like text');
  STREET.lastIndex = 0;
  const low = line.toLowerCase();
  const flat = norm(line);
  for (const d of deny) {
    if (low.includes(d.text.toLowerCase()) || (norm(d.text).length >= 6 && flat.includes(norm(d.text)))) {
      msgs.push(`deny-list entry #${d.n}`);
    }
  }
  return msgs;
}

export function scanText(text, deny = []) {
  return text.split('\n').flatMap((line, i) => scanLine(line, deny).map((msg) => ({ line: i + 1, msg })));
}

// One literal per line (case-insensitive), from .private/deny.txt or, where that file cannot exist (CI, the
// Cloudflare build), from the PRIVACY_DENY secret: one literal per line, or all on one line separated by | (Cloudflare's
// secret field is single-line). Without either: a warning locally, but a hard error
// when CI is set, so a pipeline can never silently run without the deny-list.
export function loadDeny(env = process.env) {
  const text = existsSync(DENY_FILE) ? readFileSync(DENY_FILE, 'utf8') : env.PRIVACY_DENY;
  if (!text) {
    if (env.CI) throw new Error(`no deny-list in CI: set the PRIVACY_DENY secret (one literal per line)`);
    console.warn(`WARNING: ${DENY_FILE} not found; only the pattern heuristics run. Create it (gitignored) with one literal per line.`);
    return [];
  }
  return text
    .split(/\r?\n|\|/)
    .map((l, i) => ({ n: i + 1, text: l.trim() }))
    .filter((d) => d.text);
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.astro', 'dist', '.private', 'reports']);
const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = d === '.' ? e.name : join(d, e.name);
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : walk(p);
    return [p];
  });

function candidateFiles() {
  let files;
  try {
    files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')
      .filter(Boolean);
  } catch {
    files = walk('.'); // not a git repo (or git missing)
  }
  const dist = existsSync('dist') ? walk('dist') : [];
  return [...new Set([...files, ...dist])].filter((f) => existsSync(f) && !exempt(f));
}

function run() {
  const deny = loadDeny();
  let scanned = 0;
  let bad = 0;
  for (const f of candidateFiles()) {
    const buf = readFileSync(f);
    if (buf.includes(0)) continue; // binary
    scanned++;
    for (const h of scanText(buf.toString('utf8'), deny)) {
      console.error(`${f}:${h.line}: ${h.msg}`);
      bad++;
    }
  }
  if (bad) process.exit(1);
  console.log(`privacy ok (${scanned} text files scanned, ${deny.length} deny-list entries)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) run();
