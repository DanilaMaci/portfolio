// Fails unless every dependency, devDependency and override in package.json is an exact version (1.2.3 or 1.2.3-beta.1).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const EXACT = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

// Returns a message for each entry that is not an exact pin. Overrides can be nested objects.
export function badPins(pkg) {
  const bad = [];
  const visit = (where, name, v) => {
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(where, k === '.' ? name : `${name} > ${k}`, x);
    else if (typeof v !== 'string' || !EXACT.test(v)) bad.push(`package.json ${where}: ${name}@${v} is not an exact pin`);
  };
  for (const where of ['dependencies', 'devDependencies', 'overrides']) {
    for (const [name, v] of Object.entries(pkg[where] ?? {})) visit(where, name, v);
  }
  return bad;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bad = badPins(JSON.parse(readFileSync('package.json', 'utf8')));
  for (const m of bad) console.error(m);
  if (bad.length) process.exit(1);
  console.log('pins ok');
}
