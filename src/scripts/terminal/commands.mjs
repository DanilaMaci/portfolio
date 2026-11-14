// Pure terminal logic: no DOM, no globals. terminal.ts only draws what these functions return.
// A "line" is { text, link? } with link = { label, href }; the DOM layer renders it with textContent only.

export const EMAIL = 'contact@danilamacijauskas.dev';
export const MAX_LINES = 200;
const MAX_HISTORY = 100;
const LINK_HOSTS = ['github.com', 'linkedin.com', 'www.linkedin.com'];
const COMMANDS = ['help', 'ls', 'open', 'cd', 'cat', 'about', 'projects', 'contact', 'theme', 'cv', 'clear', 'exit'];

const t = (text) => ({ text });

// JSON for a <script type="application/json"> block: "<" is escaped so "</script>" in data cannot end the block.
export function jsonForScript(x) {
  return JSON.stringify(x).replace(/</g, '\\u003c');
}

// Returns the href if it is https on an allow-listed host, or on the page's own origin; otherwise null.
export function safeHref(href, origin) {
  let u;
  try {
    u = new URL(href, origin);
  } catch {
    return null;
  }
  if (u.origin === origin) return u.href;
  return u.protocol === 'https:' && LINK_HOSTS.includes(u.hostname) ? u.href : null;
}

// How many old lines to drop so that `count` lines fit in `max`.
export const overflow = (count, max = MAX_LINES) => Math.max(0, count - max);

export function pushHistory(history, entry) {
  if (!entry || history[history.length - 1] === entry) return history;
  return [...history, entry].slice(-MAX_HISTORY);
}

// idx === history.length means "the empty line being typed". dir: -1 = Up, +1 = Down.
export function stepHistory(history, idx, dir) {
  return Math.min(history.length, Math.max(0, idx + dir));
}

const names = (ctx) => [...ctx.sections.map((s) => s.id), ...ctx.projects.map((p) => p.slug)];

// Exact id/slug/title wins; else a unique prefix of a section id or project slug. { url } | { many: [names] } | null
function resolve(arg, ctx) {
  if (arg === '~') return { url: '/', name: 'home' };
  const exact = resolveExact(arg, ctx);
  if (exact) return exact;
  const hits = names(ctx).filter((n) => n.startsWith(arg));
  if (hits.length > 1) return { many: hits };
  return hits.length ? resolveExact(hits[0], ctx) : null;
}

function resolveExact(arg, ctx) {
  const section = ctx.sections.find((s) => s.id === arg || s.title.toLowerCase() === arg);
  if (section && /^[a-z0-9-]+$/.test(section.id)) return { url: `/#${section.id}`, name: section.id };
  const project = ctx.projects.find((p) => p.slug === arg || p.title.toLowerCase() === arg);
  if (project && /^[a-z0-9-]+$/.test(project.slug)) return { url: `/projects/${project.slug}/`, name: project.slug };
  return null;
}

// Edit distance (Levenshtein), for "Did you mean".
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

const suggest = (word) => COMMANDS.filter((c) => distance(word, c) <= (c.length <= 3 ? 1 : 2));

const projectLines = (ctx) =>
  ctx.projects.length
    ? [...ctx.projects.map((p) => t(`${p.slug} - ${p.summary}`)), t('Type "open <name>" to read one.')]
    : [t('No projects yet.')];

const about = (ctx) => [t(ctx.about)];

const contact = (ctx) => {
  const lines = [t(`Email: ${EMAIL}`)];
  if (ctx.github) lines.push({ text: 'GitHub: ', link: { label: ctx.github, href: ctx.github } });
  if (ctx.linkedin) lines.push({ text: 'LinkedIn: ', link: { label: ctx.linkedin, href: ctx.linkedin } });
  return lines;
};

// Easter egg: `neofetch` prints a profile card next to a small terminal logo, like the Linux tool. Its facts come
// from ctx (built from src/lib/profile.ts), so nothing here is invented or duplicated.
const LOGO = [' .-----------.', ' | >_        |', ' |           |', " '-----------'", '    _|___|_'];
export function neofetch(ctx) {
  const info = [
    'danila@portfolio',
    '----------------',
    ...(ctx.now ? [`Now: ${ctx.now}`] : []),
    ...(ctx.skills ?? []).map((s) => `${s.track}: ${s.line}`),
    `Contact: ${EMAIL}`,
  ];
  const width = Math.max(...LOGO.map((l) => l.length)) + 3;
  const rows = Math.max(LOGO.length, info.length);
  // pre: drawn without wrapping (the log scrolls sideways on narrow screens), so the logo column stays aligned
  return Array.from({ length: rows }, (_, i) => ({ text: ((LOGO[i] ?? '').padEnd(width) + (info[i] ?? '')).trimEnd(), pre: true }));
}

const HELP = [
  t('Commands (you can also click the buttons below):'),
  t('  help             show this list'),
  t('  ls               list sections and projects'),
  t('  open <name>      go to a section or project (alias: cd)'),
  t('  cat about        read the short bio (or just: about)'),
  t('  projects         list projects'),
  t('  contact          how to reach me'),
  t('  theme light|dark switch the colour theme'),
  t('  cv               print the home page as a one-page CV (alias: print)'),
  t('  clear            empty this screen'),
  t('  exit             back to the normal page'),
  t('Tip: Up/Down repeat earlier commands, Tab completes, Ctrl+` opens or closes this window.'),
  t('Some Linux commands are hidden here. Try one.'),
];

// run(input, ctx) -> { lines, navigate?, clear?, close?, theme?, print? }; ctx.path / ctx.currentTheme are set by the DOM layer
export function run(input, ctx) {
  const words = input.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [] };
  const [cmd, ...args] = words.map((w) => w.toLowerCase());
  const arg = args.join(' ');
  switch (cmd) {
    case 'help':
      return { lines: HELP };
    case 'ls':
      return {
        lines: [
          t('Sections: ' + (ctx.sections.map((s) => s.id).join('  ') || '-')),
          t('Projects: ' + (ctx.projects.map((p) => p.slug).join('  ') || '-')),
        ],
      };
    case 'open':
    case 'cd': {
      if (!arg) return { lines: [t(`usage: ${cmd} <section|project>. Type ls to see the names.`)] };
      const found = resolve(arg, ctx);
      if (!found) return { lines: [t(`${cmd}: no such section or project: ${arg}. Type ls.`)] };
      if (found.many) return { lines: [t(`${cmd}: ${arg} is ambiguous. Did you mean: ${found.many.join(', ')}?`)] };
      return { lines: [t(`Opening ${found.name}...`)], navigate: found.url };
    }
    case 'theme':
      if (arg === 'light' || arg === 'dark') return { lines: [t(`Theme: ${arg}.`)], theme: arg };
      if (!arg) return { lines: [t(`Theme: ${ctx.currentTheme ?? 'unknown'}. Usage: theme light|dark`)] };
      return { lines: [t('usage: theme light|dark')] };
    case 'cv':
    case 'print':
      if (ctx.path !== '/') return { lines: [t('cv: go to the home page first (cd ~), then run cv.')] };
      return { lines: [t('Opening the print dialog. Choose "Save as PDF" for a one-page CV.')], print: true };
    case 'cat':
      if (!arg) return { lines: [t('usage: cat about')] };
      return arg === 'about' ? { lines: about(ctx) } : { lines: [t(`cat: ${arg}: no such file. Try: cat about`)] };
    case 'about':
      return { lines: about(ctx) };
    case 'projects':
      return { lines: projectLines(ctx) };
    case 'contact':
      return { lines: contact(ctx) };
    case 'clear':
      return { lines: [], clear: true };
    case 'exit':
      return { lines: [], close: true };
    // Hidden commands (not in help or Tab completion).
    case 'neofetch':
    case 'fastfetch':
      return { lines: neofetch(ctx) };
    case 'whoami':
      return { lines: [t('visitor (that is you). I am Danila: type about.')] };
    case 'sudo':
      return { lines: [t('visitor is not in the sudoers file. This incident will be reported.')] };
    case 'rm':
      return { lines: [t(`rm: cannot remove '${args.filter((a) => !a.startsWith('-')).join(' ') || '.'}': read-only portfolio (it is in git anyway)`)] };
    case 'vim':
    case 'vi':
    case 'nano':
    case 'emacs':
      return { lines: [t(`${cmd}: no editors here, so nobody gets stuck. Type exit to leave.`)] };
    case 'git':
      return { lines: [t('The Path section is my git log. Type: open path')] };
    default: {
      const near = suggest(cmd);
      return { lines: [t(`command not found: ${words[0]}. ` + (near.length ? `Did you mean: ${near.join(', ')}?` : 'Type help.'))] };
    }
  }
}

// complete(line, ctx) -> full-line candidates (0 = nothing, 1 = unique, more = ambiguous).
export function complete(line, ctx) {
  const m = /^\s*(\S*)(\s+(.*))?$/.exec(line.toLowerCase());
  if (!m) return [];
  const [, cmd, rest, arg] = m;
  if (rest === undefined) return COMMANDS.filter((c) => c.startsWith(cmd));
  const pool = cmd === 'open' || cmd === 'cd' ? names(ctx) : cmd === 'cat' ? ['about'] : cmd === 'theme' ? ['light', 'dark'] : [];
  return pool.filter((n) => n.startsWith(arg)).map((n) => `${cmd} ${n}`);
}
