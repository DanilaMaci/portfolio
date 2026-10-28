// The production response headers (public/_headers). These pin the security policy so an edit cannot quietly weaken
// it; scripts/smoke-browser.mjs checks in a real browser that the policy blocks nothing the site needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHeaders } from '../scripts/serve-dist.mjs';

const rules = parseHeaders(readFileSync('public/_headers', 'utf8'));
const forPath = (path) => Object.fromEntries(rules.filter((r) => r.pattern.test(path)).flatMap((r) => r.headers));
const all = forPath('/');
const csp = Object.fromEntries((all['Content-Security-Policy'] ?? '').split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

test('CSP: deny by default; scripts and styles only from this site, never inline or eval', () => {
  assert.deepEqual(csp['default-src'], ["'none'"]);
  for (const d of ['script-src', 'style-src']) {
    assert.deepEqual(csp[d], ["'self'"], d);
  }
  assert.doesNotMatch(all['Content-Security-Policy'], /unsafe-inline|unsafe-eval|\*|data:|http:/);
});

test('CSP: no framing, no <base>, no plugins, forms only to this site, Trusted Types on', () => {
  assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
  assert.deepEqual(csp['base-uri'], ["'none'"]);
  assert.deepEqual(csp['object-src'], ["'none'"]);
  assert.deepEqual(csp['form-action'], ["'self'"]);
  assert.deepEqual(csp['require-trusted-types-for'], ["'script'"]);
});

test('HSTS for at least a year; nosniff; no framing (legacy header too)', () => {
  const age = Number(/max-age=(\d+)/.exec(all['Strict-Transport-Security'])?.[1]);
  assert.ok(age >= 31536000, `max-age ${age}`);
  assert.equal(all['X-Content-Type-Options'], 'nosniff');
  assert.equal(all['X-Frame-Options'], 'DENY');
  assert.equal(all['Cross-Origin-Opener-Policy'], 'same-origin');
});

test('Referrer-Policy keeps same-origin referrers (the hero intro reads them) and sends none to other sites', () => {
  // 'no-referrer' would make the intro replay on every internal click; looser ones leak URLs to other sites.
  assert.equal(all['Referrer-Policy'], 'same-origin');
});

test('Permissions-Policy turns off camera, microphone and location', () => {
  for (const f of ['camera=()', 'microphone=()', 'geolocation=()']) assert.ok(all['Permissions-Policy'].includes(f), f);
});

test('hashed build files are cached for a year; HTML is not', () => {
  assert.match(forPath('/_astro/x.abc123.js')['Cache-Control'], /max-age=31536000, immutable/);
  assert.equal(all['Cache-Control'], undefined);
});
