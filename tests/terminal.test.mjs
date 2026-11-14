import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  run, complete, safeHref, jsonForScript, overflow, pushHistory, stepHistory, neofetch, EMAIL, MAX_LINES,
} from '../src/scripts/terminal/commands.mjs';

const ctx = {
  sections: [{ id: 'about', title: 'About' }, { id: 'projects', title: 'Projects' }, { id: 'contact', title: 'Contact' }],
  projects: [
    { title: 'Alpha Rover', slug: 'alpha-rover', summary: 'A rover.' },
    { title: 'Alpha Data', slug: 'alpha-data', summary: 'A pipeline.' },
    { title: 'Beta', slug: 'beta', summary: 'Beta thing.' },
  ],
  about: 'Hello, I build things.',
  github: 'https://github.com/example',
  linkedin: 'https://www.linkedin.com/in/example',
};
const texts = (r) => r.lines.map((l) => l.text + (l.link ? l.link.href : '')).join('\n');

test('help lists every command', () => {
  const out = texts(run('help', ctx));
  for (const c of ['help', 'ls', 'open', 'cat about', 'projects', 'contact', 'clear', 'exit']) assert.match(out, new RegExp(c));
});

test('ls lists sections and projects', () => {
  const out = texts(run('ls', ctx));
  assert.match(out, /about {2}projects {2}contact/);
  assert.match(out, /alpha-rover {2}alpha-data {2}beta/);
});

test('open and cd (alias) navigate to a section anchor or project URL', () => {
  assert.equal(run('open about', ctx).navigate, '/#about');
  assert.equal(run('cd projects', ctx).navigate, '/#projects');
  assert.equal(run('open beta', ctx).navigate, '/projects/beta/');
  assert.equal(run('cd Alpha Rover', ctx).navigate, '/projects/alpha-rover/');
});

test('open/cd argument errors', () => {
  assert.match(texts(run('open', ctx)), /^usage: open/);
  assert.match(texts(run('cd', ctx)), /^usage: cd/);
  const r = run('open nope', ctx);
  assert.equal(r.navigate, undefined);
  assert.match(texts(r), /no such section or project: nope/);
});

test('a project slug that is not [a-z0-9-] is never turned into a URL', () => {
  const bad = { ...ctx, projects: [{ title: 'X', slug: '../evil', summary: '' }] };
  assert.equal(run('open ../evil', bad).navigate, undefined);
});

test('a section id that is not [a-z0-9-] is never turned into a URL', () => {
  const bad = { ...ctx, sections: [{ id: '//evil.example', title: 'X' }] };
  assert.equal(run('open //evil.example', bad).navigate, undefined);
  assert.equal(run('open x', bad).navigate, undefined);
});

test('cat about, about alias, cat errors', () => {
  assert.equal(texts(run('cat about', ctx)), ctx.about);
  assert.equal(texts(run('about', ctx)), ctx.about);
  assert.match(texts(run('cat', ctx)), /^usage: cat about/);
  assert.match(texts(run('cat x', ctx)), /cat: x: no such file/);
});

test('projects lists slug and summary; empty list says so', () => {
  assert.match(texts(run('projects', ctx)), /alpha-rover - A rover\./);
  assert.match(texts(run('projects', { ...ctx, projects: [] })), /No projects yet/);
});

test('contact prints only the domain email and the two links', () => {
  const r = run('contact', ctx);
  assert.equal(r.lines.length, 3);
  assert.equal(r.lines[0].text, `Email: ${EMAIL}`);
  assert.equal(r.lines[1].link.href, ctx.github);
  assert.equal(r.lines[2].link.href, ctx.linkedin);
});

test('clear and exit results', () => {
  assert.deepEqual(run('clear', ctx), { lines: [], clear: true });
  assert.deepEqual(run('exit', ctx), { lines: [], close: true });
});

test('unknown input names the first word as typed', () => {
  assert.equal(texts(run('Frobnicate now', ctx)), 'command not found: Frobnicate. Type help.');
});

test('case and whitespace are ignored; empty input prints nothing', () => {
  assert.equal(run('  OPEN   About  ', ctx).navigate, '/#about');
  assert.equal(texts(run('HELP', ctx)), texts(run('help', ctx)));
  assert.deepEqual(run('', ctx), { lines: [] });
  assert.deepEqual(run('   \t ', ctx), { lines: [] });
});

test('hostile text stays text in the line objects', () => {
  const evil = { ...ctx, about: '<script>alert(1)</script>', projects: [{ title: 'T', slug: 'a-b', summary: '<img onerror=x>' }] };
  assert.equal(run('about', evil).lines[0].text, '<script>alert(1)</script>');
  assert.equal(run('projects', evil).lines[0].text, 'a-b - <img onerror=x>');
  for (const l of run('help', evil).lines) assert.deepEqual(Object.keys(l), ['text']);
  assert.match(run('<script>', evil).lines[0].text, /^command not found: <script>/);
});

test('jsonForScript keeps "</script><img onerror=...>" inert and round-trips', () => {
  const data = { title: '</script><img src=x onerror=alert(1)>', n: 1 };
  const s = jsonForScript(data);
  assert.ok(!s.includes('<'));
  assert.deepEqual(JSON.parse(s), data);
});

test('complete: unique, ambiguous, none', () => {
  assert.deepEqual(complete('he', ctx), ['help']);
  assert.deepEqual(complete('c', ctx).sort(), ['cat', 'cd', 'clear', 'contact', 'cv']);
  assert.deepEqual(complete('zz', ctx), []);
  assert.deepEqual(complete('open be', ctx), ['open beta']);
  assert.deepEqual(complete('OPEN alpha', ctx), ['open alpha-rover', 'open alpha-data']);
  assert.deepEqual(complete('cd x', ctx), []);
  assert.deepEqual(complete('cat a', ctx), ['cat about']);
  assert.deepEqual(complete('help x', ctx), []);
});

test('safeHref allows https allow-listed hosts and same origin; rejects the rest', () => {
  const o = 'https://danilamacijauskas.dev';
  assert.ok(safeHref('https://github.com/x', o));
  assert.ok(safeHref('https://www.linkedin.com/in/x', o));
  assert.ok(safeHref('/projects/a/', o));
  assert.equal(safeHref('javascript:alert(1)', o), null);
  assert.equal(safeHref('//evil.com', o), null);
  assert.equal(safeHref('http://github.com/x', o), null);
  assert.equal(safeHref('https://github.com.evil.com/', o), null);
  assert.equal(safeHref('https://evil.com/', o), null);
  assert.equal(safeHref('data:text/html,hi', o), null);
});

test('overflow caps the log at 200 lines', () => {
  assert.equal(MAX_LINES, 200);
  assert.equal(overflow(150), 0);
  assert.equal(overflow(200), 0);
  assert.equal(overflow(205), 5);
});

test('history: push skips empty/duplicate, step clamps', () => {
  let h = pushHistory([], 'ls');
  h = pushHistory(h, 'ls');
  h = pushHistory(h, '');
  h = pushHistory(h, 'help');
  assert.deepEqual(h, ['ls', 'help']);
  assert.equal(stepHistory(h, 2, -1), 1);
  assert.equal(stepHistory(h, 0, -1), 0);
  assert.equal(stepHistory(h, 2, 1), 2);
  assert.equal(pushHistory(Array(100).fill('a'), 'b').length, 100);
});

test('easter eggs: neofetch card uses ctx facts, logo column aligned', () => {
  const c = { ...ctx, now: 'MSc Test, Uni', skills: [{ track: 'Software', line: 'Python, C' }, { track: 'Data', line: 'SQL' }] };
  const lines = run('neofetch', c).lines.map((l) => l.text);
  assert.ok(lines.some((l) => l.endsWith('danila@portfolio')));
  assert.ok(lines.some((l) => l.endsWith('Now: MSc Test, Uni')));
  assert.ok(lines.some((l) => l.endsWith('Software: Python, C')));
  assert.ok(lines.some((l) => l.endsWith(`Contact: ${EMAIL}`)));
  const col = lines[0].indexOf('danila@portfolio');
  for (const l of lines) if (l.length > col) assert.notEqual(l[col], ' ', `info column starts at ${col}: "${l}"`);
  assert.deepEqual(run('fastfetch', c), run('NEOFETCH', c));
  assert.ok(neofetch(ctx).length >= 5, 'works without skills/now');
});

test('easter eggs: sudo, rm, editors, whoami, git answer; hidden from help and Tab', () => {
  assert.match(texts(run('sudo rm -rf /', ctx)), /not in the sudoers file/);
  assert.match(texts(run('rm -rf /', ctx)), /cannot remove '\/': read-only/);
  assert.match(texts(run('vim', ctx)), /no editors here/);
  assert.match(texts(run('whoami', ctx)), /visitor/);
  assert.match(texts(run('git log', ctx)), /open path/);
  const help = texts(run('help', ctx));
  for (const c of ['neofetch', 'sudo', 'vim', 'whoami']) assert.ok(!help.includes(c), `${c} listed in help`);
  assert.match(help, /hidden/);
  assert.deepEqual(complete('neo', ctx), []);
  assert.deepEqual(complete('su', ctx), []);
});

// ---- I5: usability fixes ----
const mctx = { ...ctx, projects: [...ctx.projects, { title: 'Mould Detect', slug: 'mould-detect', summary: 'Mould.' }] };

test('open/cd: unique prefix opens the project or section; exact match still wins', () => {
  const r = run('open mould', mctx);
  assert.equal(r.navigate, '/projects/mould-detect/');
  assert.equal(texts(r), 'Opening mould-detect...');
  assert.equal(run('cd cont', mctx).navigate, '/#contact');
  assert.equal(texts(run('cd cont', mctx)), 'Opening contact...');
  const exact = { ...mctx, projects: [{ title: 'Al', slug: 'al', summary: '' }, { title: 'Alpha', slug: 'alpha', summary: '' }] };
  assert.equal(run('open al', exact).navigate, '/projects/al/');
  assert.equal(run('open about', mctx).navigate, '/#about');
});

test('open: ambiguous prefix lists candidates and opens nothing; no match still errors', () => {
  const r = run('open alpha', mctx);
  assert.equal(r.navigate, undefined);
  assert.match(texts(r), /alpha-rover/);
  assert.match(texts(r), /alpha-data/);
  assert.match(texts(run('open zzz', mctx)), /no such section or project: zzz/);
  assert.match(texts(run('open', mctx)), /^usage: open/);
});

test('unknown command close to a known one suggests it', () => {
  assert.equal(texts(run('hlep', ctx)), 'command not found: hlep. Did you mean: help?');
  assert.equal(texts(run('Projcts', ctx)), 'command not found: Projcts. Did you mean: projects?');
  assert.equal(texts(run('thme', ctx)), 'command not found: thme. Did you mean: theme?');
});

test('suggestion threshold: 3 letters or fewer need distance 1; far words get the old message', () => {
  assert.match(texts(run('lz', ctx)), /Did you mean: ls\?/);
  assert.equal(texts(run('lxyz', ctx)), 'command not found: lxyz. Type help.');
  assert.equal(texts(run('cx', ctx)), 'command not found: cx. Did you mean: cd, cv?');
  assert.equal(texts(run('qqq', ctx)), 'command not found: qqq. Type help.');
  assert.equal(texts(run('Frobnicate', ctx)), 'command not found: Frobnicate. Type help.');
});

test('hidden commands are never suggested', () => {
  assert.ok(!texts(run('neofech', ctx)).includes('neofetch'));
  assert.ok(!texts(run('whoam', ctx)).includes('whoami'));
});

test('theme: sets light/dark, bare shows current and usage, bad arg shows usage', () => {
  assert.deepEqual(run('theme light', ctx).theme, 'light');
  assert.equal(texts(run('theme light', ctx)), 'Theme: light.');
  assert.equal(run('THEME dark', ctx).theme, 'dark');
  assert.equal(texts(run('theme dark', ctx)), 'Theme: dark.');
  const bare = run('theme', { ...ctx, currentTheme: 'dark' });
  assert.equal(bare.theme, undefined);
  assert.equal(texts(bare), 'Theme: dark. Usage: theme light|dark');
  const bad = run('theme blue', ctx);
  assert.equal(bad.theme, undefined);
  assert.match(texts(bad), /usage: theme light\|dark/);
});

test('cv and print: print on the home page, hint elsewhere', () => {
  const home = run('cv', { ...ctx, path: '/' });
  assert.equal(home.print, true);
  assert.equal(texts(home), 'Opening the print dialog. Choose "Save as PDF" for a one-page CV.');
  assert.equal(run('print', { ...ctx, path: '/' }).print, true);
  const away = run('cv', { ...ctx, path: '/projects/beta/' });
  assert.equal(away.print, undefined);
  assert.equal(texts(away), 'cv: go to the home page first (cd ~), then run cv.');
});

test('help and Tab completion list theme and cv', () => {
  const out = texts(run('help', ctx));
  assert.match(out, /theme light\|dark/);
  assert.match(out, /\bcv\b/);
  assert.deepEqual(complete('th', ctx), ['theme']);
  assert.deepEqual(complete('cv', ctx), ['cv']);
  assert.deepEqual(complete('theme d', ctx), ['theme dark']);
  assert.deepEqual(complete('theme ', ctx).sort(), ['theme dark', 'theme light']);
});

test('cd ~ goes home', () => {
  assert.equal(run('cd ~', ctx).navigate, '/');
});
