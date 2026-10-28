// Shared by the negative-control tests: run a script from scripts/ inside a temp directory.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// files: { 'dist/index.html': '...' }. Returns the temp dir.
export function tempProject(files) {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-test-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

// The child never inherits the CI variables or the deny-list secret from the runner (GitHub Actions and Cloudflare set
// them), so the negative controls behave the same locally and in a pipeline.
export const cleanEnv = () => {
  const env = { ...process.env };
  for (const k of ['CI', 'GITHUB_ACTIONS', 'CF_PAGES', 'WORKERS_CI', 'PRIVACY_DENY']) delete env[k];
  return env;
};
export function runScript(script, cwd, args = []) {
  const env = cleanEnv();
  const r = spawnSync(process.execPath, [resolve('scripts', script), ...args], { cwd, encoding: 'utf8', env });
  return { code: r.status, out: r.stdout + r.stderr };
}
