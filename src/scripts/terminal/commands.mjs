// Pure terminal logic: no DOM, no globals. terminal.ts only draws what these functions return.
// A "line" is { text, link? } with link = { label, href }; the DOM layer renders it with textContent only.

export const EMAIL = 'contact@danilamacijauskas.dev';
export const MAX_LINES = 200;
const MAX_HISTORY = 100;
const LINK_HOSTS = ['github.com', 'linkedin.com', 'www.linkedin.com'];
const COMMANDS = ['help', 'ls', 'open', 'cd', 'cat', 'about', 'projects', 'contact', 'clear', 'exit'];

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

function resolve(arg, ctx) {
  const section = ctx.sections.find((s) => s.id === arg || s.title.toLowerCase() === arg);
  if (section) return `/#${section.id}`;
  const project = ctx.projects.find((p) => p.slug === arg || p.title.toLowerCase() === arg);
  if (project && /^[a-z0-9-]+$/.test(project.slug)) return `/projects/${project.slug}/`;
  return null;
}

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
  t('  clear            empty this screen'),
  t('  exit             back to the normal page'),
  t('Tip: Up/Down repeat earlier commands, Tab completes, Ctrl+` opens or closes this window.'),
  t('Some Linux commands are hidden here. Try one.'),
];

// run(input, ctx) -> { lines, navigate?, clear?, close? }
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
      const navigate = resolve(arg, ctx);
      if (!navigate) return { lines: [t(`${cmd}: no such section or project: ${arg}. Type ls.`)] };
      return { lines: [t(`Opening ${arg}...`)], navigate };
    }
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
    default:
      return { lines: [t(`command not found: ${words[0]}. Type help.`)] };
  }
}

// complete(line, ctx) -> full-line candidates (0 = nothing, 1 = unique, more = ambiguous).
export function complete(line, ctx) {
  const m = /^\s*(\S*)(\s+(.*))?$/.exec(line.toLowerCase());
  if (!m) return [];
  const [, cmd, rest, arg] = m;
  if (rest === undefined) return COMMANDS.filter((c) => c.startsWith(cmd));
  const pool = cmd === 'open' || cmd === 'cd' ? names(ctx) : cmd === 'cat' ? ['about'] : [];
  return pool.filter((n) => n.startsWith(arg)).map((n) => `${cmd} ${n}`);
}
