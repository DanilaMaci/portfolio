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

// The child never inherits CI or PRIVACY_DENY from the runner (CI and the Cloudflare build set them), so the
// negative controls behave the same locally and in a pipeline.
export function runScript(script, cwd, args = []) {
  const env = { ...process.env };
  delete env.CI;
  delete env.PRIVACY_DENY;
  const r = spawnSync(process.execPath, [resolve('scripts', script), ...args], { cwd, encoding: 'utf8', env });
  return { code: r.status, out: r.stdout + r.stderr };
}
