// Dates in project frontmatter are UTC midnights. The day count runs from `since` to `checked` (never to today),
// so a page can never claim more days than were checked.
const DAY = 86_400_000;
export const daysBetween = (since, checked) => Math.round((checked - since) / DAY);

// The component for frontmatter `diagram: mould-detect` (src/components/diagrams/MouldDetect.astro) from the import.meta.glob
// result; an unknown key throws, so the build fails instead of silently dropping the diagram.
export function diagramComponent(key, glob) {
  if (!key) return undefined;
  const file = key.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase()) + '.astro';
  const hit = Object.entries(glob).find(([path]) => path.endsWith('/' + file));
  if (!hit) throw new Error(`diagram "${key}": no component ${file}. Known: ${Object.keys(glob).map((p) => p.split('/').pop()).join(', ')}`);
  return hit[1].default;
}

// Test-only (a schema refine cannot see it: YAML has already rolled the date). YAML turns 2026-02-31 into 3 Mar before the schema sees it, so dates are checked in the raw frontmatter text:
// every YYYY-MM-DD that does not survive a round trip through Date.
export const impossibleDates = (text) =>
  [...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((m) => m[0]).filter((s) => { const d = new Date(`${s}T00:00:00Z`); return isNaN(d) || d.toISOString().slice(0, 10) !== s; });

// Not Intl.DateTimeFormat('en-GB'): current ICU prints "Sept" for September, so a fixed month list keeps the output stable.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatDate = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
