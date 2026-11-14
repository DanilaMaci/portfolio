import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { daysBetween, formatDate, diagramComponent, impossibleDates } from '../src/lib/evidence.mjs';

const d = (s) => new Date(`${s}T00:00:00Z`);

test('daysBetween counts whole days, across month and year boundaries', () => {
  assert.equal(daysBetween(d('2026-10-06'), d('2026-11-13')), 38);
  assert.equal(daysBetween(d('2026-10-06'), d('2026-10-06')), 0);
  assert.equal(daysBetween(d('2026-01-31'), d('2026-03-01')), 29);
  assert.equal(daysBetween(d('2026-12-31'), d('2027-01-01')), 1);
  assert.equal(daysBetween(d('2028-02-28'), d('2028-03-01')), 2); // leap year
});

test('formatDate gives "6 Oct 2026"', () => {
  assert.equal(formatDate(d('2026-10-06')), '6 Oct 2026');
  assert.equal(formatDate(d('2026-11-13')), '13 Nov 2026');
});

// Needs `npm run build` first (npm test does that).
const page = (slug) => readFileSync(`dist/projects/${slug}/index.html`, 'utf8');

test('mould-detect page shows the evidence line, days computed from the dates (not from today)', () => {
  const html = page('mould-detect');
  assert.match(html, /uptime room-node/);
  assert.match(html.replace(/<\/span><span>/g, ' · '), /logging since 6 Oct 2026 · 38 days · checked 13 Nov 2026/); // spans or plain text
});

test('a project without evidence/diagram renders neither block', () => {
  const html = page('investment-visualisation');
  assert.doesNotMatch(html, /class="evidence/);
  assert.doesNotMatch(html, /class="diagram/);
  assert.doesNotMatch(html, /Architecture/);
});

test('mould-detect architecture diagram: accessible, tokens-only SVG, caption text', () => {
  const html = page('mould-detect');
  const fig = html.match(/<figure class="diagram"[\s\S]*?<\/figure>/)?.[0];
  assert.ok(fig, 'diagram figure missing');
  const svg = fig.match(/<svg[\s\S]*?<\/svg>/)[0];
  assert.match(svg, /role="img"/);
  assert.match(svg, /<title[^>]*>[^<]+<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]+<\/desc>/);
  assert.doesNotMatch(fig, /style=/);
  assert.doesNotMatch(fig, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  assert.match(fig, /<figcaption>[^<]*Supabase[^<]*<\/figcaption>/);
  const arch = html.indexOf('>Architecture<');
  assert.ok(html.indexOf('>Result<') < arch && arch < html.indexOf('>Screenshots<'), 'Architecture sits between Result and Screenshots');
});

test('diagramComponent: unknown diagram key throws with the key and the known ones; known key resolves', () => {
  const glob = { '../../components/diagrams/MouldDetect.astro': { default: 'C' } };
  assert.equal(diagramComponent('mould-detect', glob), 'C');
  assert.equal(diagramComponent(undefined, glob), undefined);
  assert.throws(() => diagramComponent('nosuch', glob), /diagram "nosuch".*Nosuch\.astro.*MouldDetect/s);
});

test('impossibleDates: 2026-02-31 (YAML would roll it to 3 Mar) is reported; real dates are not', () => {
  assert.deepEqual(impossibleDates('evidence: { since: 2026-02-31, checked: 2026-03-01 }'), ['2026-02-31']);
  assert.deepEqual(impossibleDates('a: 2028-02-29\nb: 2026-13-01'), ['2026-13-01']);
  assert.deepEqual(impossibleDates('since: 2026-10-06'), []);
});

test('no project frontmatter contains an impossible date', () => {
  for (const f of readdirSync('src/content/projects').filter((n) => n.endsWith('.md'))) {
    const front = readFileSync(`src/content/projects/${f}`, 'utf8').split(/^---\s*$/m)[1] ?? '';
    assert.deepEqual(impossibleDates(front), [], `${f}: date does not exist (YAML would roll it over)`);
  }
});
