import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { scanText } from '../scripts/check-privacy.mjs';
import { scanLog, badIdentities } from '../scripts/check-history.mjs';
import { tempProject, runScript } from './helpers.mjs';

// Every number and address below is synthetic.
const hit = (s, deny) => scanText(s, deny).length > 0;

test('flags synthetic emails (domain allow-list)', () => {
  assert.ok(hit('mail user@example.invalid please'));
  assert.ok(hit('mail someone@gmail.com'));
  assert.ok(hit('mail name [at] example [dot] invalid'));
  assert.ok(hit('mail name(at)example.invalid'));
  assert.ok(!hit('mail hello@danilamacijauskas.dev or Hello@DanilaMacijauskas.dev'));
  assert.ok(hit('mail hello@evil.danilamacijauskas.dev.example.invalid'));
});

test('flags phone formats', () => {
  for (const s of [
    '+353 87 000 0000', '+353-87-000-0000', '+353870000000', '00353 87 000 0000', '00353870000000',
    '+353 (0)87 000 0000', '(+353) 87 000 0000', '087 000 0000', '087-000-0000', '0870000000', '085 000 0000',
    '07700 900000', '07700900000', '+44 7700 900000', '+1 555 123 4567',
    '(555) 123-4567', '(555)123-4567', '555-123-4567', '555.123.4567', '1-800-555-0199',
    '123 456 789', '12-345-678-90', 'tel:+353870000000',
  ]) {
    assert.ok(hit(`call ${s} now`), s);
    assert.ok(hit(s), s);
  }
});

test('does not flag hashes, numbers, dates, versions', () => {
  for (const s of [
    'integrity="sha512-Xk3+1234567890abcdefg/+987654321hijklmno+0123456789=="',
    '<svg viewBox="0 0 24 24">', 'viewBox="0 0 1200 630"',
    'published 2026-10-27 and 2026-10-27T10:13:01.123Z', 'built 2026-10-27 10:13:01', '27.10.2026 and 27/10/2026',
    'width: 1234567890px; line-height: 1.5; margin: 0.123456789rem', 'padding: 10 20 30 40',
    '"astro": "7.3.8", astro@7.3.8, #123456789', 'ip 192.168.100.200', 'version 10.20.30.40.50',
    'years 2019 2020 2021', 'path d="M12.5 14.25 18.75 3.5 12 2"', 'color: #a1b2c3d4',
    'commit 3f2a9c1b7d4e5f60a1b2c3d4e5f60a1b2c3d4e5f', 'https://x.dev/a/1234567890123/b',
    'user-1234567890 id=1234567890 a1234567890', 'cache-1700000000-1700000001',
  ]) {
    assert.ok(!hit(s), s);
  }
});

test('flags Eircodes and street addresses', () => {
  assert.ok(hit('Dublin D02 X285'));
  assert.ok(hit('Cork T12AD34'));
  assert.ok(hit('Dublin D6W AD12'));
  assert.ok(!hit('colour #D02X285 and word A12BC345'));
  assert.ok(hit('I live at 12 Example Street, Dublin'));
  assert.ok(hit('lives at 4 Fake Park Road'));
  assert.ok(!hit('I built 3 small tools and 12 projects in a street-level view'));
});

test('deny-list: case-insensitive, formatting-insensitive, never printed', () => {
  const deny = [{ n: 7, text: 'Secret Name' }, { n: 9, text: '087 111 2222' }];
  assert.deepEqual(scanText('hi SECRET name!', deny), [{ line: 1, msg: 'deny-list entry #7' }]);
  const flat = scanText('x 0871112222', deny).map((h) => h.msg);
  assert.ok(flat.includes('deny-list entry #9'));
  for (const h of [...scanText('hi SECRET name', deny), ...scanText('call 087-111-2222', deny)]) {
    assert.ok(!/secret|111/i.test(h.msg), h.msg);
  }
});

test('reports line numbers and never prints the full number or email', () => {
  const [h] = scanText('a\nb\ncall 087 000 0000 or user@example.invalid');
  assert.equal(h.line, 3);
  const all = scanText('call 087 000 0000 or user@example.invalid').map((x) => x.msg).join();
  assert.ok(!all.includes('0000') && !all.includes('user@'));
});

test('history: scans added lines only, skips exempt paths, reports commit and line', () => {
  const log = [
    '@@commit abcdef1234567', 'diff --git a/src/a.txt b/src/a.txt', '--- /dev/null', '+++ b/src/a.txt', '@@ -0,0 +1,3 @@',
    '+ok', '+call 087 000 0000', '+fine',
    '@@commit 1234567abcdef', 'diff --git a/tests/x.mjs b/tests/x.mjs', '@@ -1 +1 @@', '-call 087 000 0000', '+call 087 000 0000',
    'diff --git a/src/b.txt b/src/b.txt', '@@ -1,2 +5,2 @@', ' context 087 111 2222', '+clean',
  ].join('\n');
  const hits = scanLog(log);
  assert.equal(hits.length, 1);
  assert.deepEqual([hits[0].commit, hits[0].file, hits[0].line], ['abcdef1', 'src/a.txt', 2]);
  assert.deepEqual(scanLog(''), []);
});

test('negative control: check-privacy exits 1 on a phone number, an email and a deny-list hit', () => {
  const dir = (extra) => tempProject({ 'README.md': 'clean text', 'dist/index.html': '<p>hi</p>', ...extra });
  assert.equal(runScript('check-privacy.mjs', dir({})).code, 0);
  assert.equal(runScript('check-privacy.mjs', dir({ 'src/a.md': 'call 087 000 0000' })).code, 1);
  assert.equal(runScript('check-privacy.mjs', dir({ 'src/a.md': 'mail user@example.invalid' })).code, 1);
  assert.equal(runScript('check-privacy.mjs', dir({ 'docs/n.md': 'a Zebra Lane thing', '.private/deny.txt': 'zebra lane\n' })).code, 1);
  const built = runScript('check-privacy.mjs', tempProject({ 'dist/x.json': '{"p":"+353 87 000 0000"}' }));
  assert.equal(built.code, 1); // dist text files are scanned
  const r = runScript('check-privacy.mjs', dir({ 'docs/n.md': 'a Zebra Lane thing', '.private/deny.txt': 'zebra lane\n' }));
  assert.match(r.out, /deny-list entry #1/);
  assert.doesNotMatch(r.out, /zebra/i);
  assert.match(runScript('check-privacy.mjs', dir({})).out, /WARNING/); // missing deny-list warns
});

test('negative control: check-history exits 1 on a number in an old commit, 0 on empty history', () => {
  const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t.invalid', ...a], { cwd, stdio: 'pipe' });
  const dir = tempProject({ 'a.txt': 'call 087 000 0000\n' });
  git(dir, 'init', '-q');
  assert.equal(runScript('check-history.mjs', dir).code, 0); // no commits yet
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'x');
  assert.equal(runScript('check-history.mjs', dir).code, 1);
  execFileSync('sh', ['-c', 'echo clean > a.txt && git -c user.name=t -c user.email=t@t.invalid commit -qam y'], { cwd: dir });
  assert.equal(runScript('check-history.mjs', dir).code, 1); // still in the old commit
});

// The deny-list in CI comes from the PRIVACY_DENY secret (there is no .private/ there).
const runWithEnv = (dir, env) => {
  const r = spawnSync(process.execPath, [resolve('scripts', 'check-privacy.mjs')], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout + r.stderr };
};

test('CI without a deny-list fails instead of silently skipping it', () => {
  const dir = tempProject({ 'notes.md': 'nothing private here' });
  const r = runWithEnv(dir, { CI: 'true', PRIVACY_DENY: '' });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /PRIVACY_DENY/);
});

test('PRIVACY_DENY secret: a listed value is caught and never printed', () => {
  const secret = 'Zebra-Quokka-4417';
  const dir = tempProject({ 'notes.md': `call me at ${secret} please` });
  const r = runWithEnv(dir, { CI: 'true', PRIVACY_DENY: `first-unused\n${secret}` });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /deny-list entry #2/);
  assert.ok(!r.out.includes(secret), 'the secret value appeared in the output');
});

test('commit metadata: only GitHub no-reply author/committer emails pass, and the email is never printed', () => {
  assert.deepEqual(badIdentities('abc1234 1+me@users.noreply.github.com noreply@github.com\n'), []);
  const bad = badIdentities('abc1234 someone@private.example 1+me@users.noreply.github.com\n');
  assert.equal(bad.length, 1);
  assert.match(bad[0], /author email \(domain private\.example\)/);
  assert.ok(!bad[0].includes('someone@'), 'local part printed');
});
