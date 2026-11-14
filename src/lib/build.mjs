// Facts read at build time for the footer status line and /colophon: nothing here is typed in by hand.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Runs git with these arguments and returns its output; injected in tests.
const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

// Names of the checks: every `node scripts/check-<name>.mjs` call in the npm "check" script.
export const checkNames = (script) => [...script.matchAll(/node scripts\/check-([\w-]+)\.mjs/g)].map((m) => m[1]);

// Short hash and branch. git first; else the Cloudflare Workers Builds variables WORKERS_CI_COMMIT_SHA and
// WORKERS_CI_BRANCH (names from Cloudflare's Workers Builds docs; the branch also fills in on a detached HEAD, common in CI);
// else empty strings, so the page prints no hash rather than a fake one. A hash is 7-40 hex digits, a branch a plain ref
// name of at most 40 characters; anything else is dropped. `run` is injected so tests need no repository.
export function commitInfo(run = git, env = process.env) {
  const ask = (args) => { try { return run(args).trim(); } catch { return ''; } };
  const hexHash = (v) => (/^[0-9a-f]{7,40}$/.test(v.trim()) ? v.trim().slice(0, 7) : '');
  const refName = (v) => (/^[A-Za-z0-9._\/-]{1,40}$/.test(v.trim()) ? v.trim() : '');
  const gitHash = hexHash(ask(['rev-parse', 'HEAD']));
  const hash = gitHash || hexHash(env.WORKERS_CI_COMMIT_SHA ?? '');
  if (!hash) return { hash: '', branch: '' };
  return { hash, branch: refName(gitHash ? ask(['branch', '--show-current']) : '') || refName(env.WORKERS_CI_BRANCH ?? '') };
}

// Segments of the status line, in order; an absent hash drops its segment, an absent branch drops the brackets.
export function statusSegments({ hash, branch, date, checks }) {
  return [
    ...(hash && branch ? [{ cls: 'st-branch', text: `[${branch}]` }] : []),
    ...(hash ? [{ cls: 'st-hash', text: hash }] : []),
    { cls: '', text: `built ${date}` },
    { cls: '', text: `${checks} checks` },
  ];
}

// The Content-Security-Policy value from the text of public/_headers.
export const cspFrom = (headers) => headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1].trim() ?? '';

// Read once per build process (not once per page).
export const buildFacts = {
  names: checkNames(JSON.parse(readFileSync('package.json', 'utf8')).scripts.check),
  csp: cspFrom(readFileSync('public/_headers', 'utf8')),
  ...commitInfo(),
  date: new Date().toISOString().slice(0, 10),
};
