// Runs the privacy rules over every line ever added in git history (`git log -p -m --all`; -m includes merge diffs),
// and requires every author and committer email to be a GitHub no-reply address (commit metadata is public too).
// Commit messages are not scanned. Heuristic plus deny-list, not a guarantee.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { scanLine, loadDeny, exempt } from './check-privacy.mjs';

// Returns [{commit, file, line, msg}] for the added lines in a `git log -p --format=@@commit %H` dump.
export function scanLog(log, deny = []) {
  const hits = [];
  let commit = '';
  let file = '';
  let line = 0;
  for (const l of log.split('\n')) {
    if (l.startsWith('@@commit ')) commit = l.slice(9, 16);
    else if (l.startsWith('diff --git ')) file = l.split(' b/').pop();
    else if (l.startsWith('@@ ')) line = Number(/\+(\d+)/.exec(l)?.[1] ?? 1) - 1;
    else if (l.startsWith('+++') || l.startsWith('---')) continue;
    else if (l.startsWith('+') || l.startsWith(' ')) {
      line++;
      if (l.startsWith('+') && !exempt(file)) {
        for (const msg of scanLine(l.slice(1), deny)) hits.push({ commit, file, line, msg });
      }
    }
  }
  return hits;
}

// Emails allowed in commit metadata: GitHub no-reply addresses (also used by bots), and GitHub's own web-UI committer.
const NOREPLY = /@users\.noreply\.github\.com$|^noreply@github\.com$/i;
// lines: "<hash> <author email> <committer email>". Returns messages that never contain the email itself.
export function badIdentities(lines) {
  return lines
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      const [hash, author, committer] = l.split(' ');
      return [['author', author], ['committer', committer]]
        .filter(([, e]) => !NOREPLY.test(e ?? ''))
        .map(([role, e]) => `commit ${hash}: ${role} email (domain ${String(e).split('@')[1] ?? '?'}) is not a GitHub no-reply address`);
    });
}

function run() {
  let log;
  try {
    log = execFileSync('git', ['log', '-p', '-m', '--all', '--no-color', '--format=@@commit %H'], {
      encoding: 'utf8',
      maxBuffer: 1 << 30,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    if (/does not have any commits/.test(String(e.stderr))) {
      console.log('history ok (no commits yet)');
      return;
    }
    console.error(`could not read git history: ${String(e.stderr).trim() || e.message}`);
    process.exit(1);
  }
  const hits = scanLog(log, loadDeny());
  for (const h of hits) console.error(`commit ${h.commit} ${h.file}:${h.line}: ${h.msg}`);
  const ids = badIdentities(execFileSync('git', ['log', '--all', '--format=%h %ae %ce'], { encoding: 'utf8' }));
  for (const m of ids) console.error(m);
  if (hits.length || ids.length) process.exit(1);
  console.log('history ok');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) run();
