// Pure helpers for the page transition (no DOM, so tests/shell.test.mjs runs them in Node).

// "/projects/fromo/" -> "~/projects/fromo", "/" -> "~"
export const shellPath = (pathname) => '~' + pathname.replace(/\/+$/, '');

// The boot-log lines printed while leaving a page. `label` is the clicked link's text (e.g. a project title).
export function bootLines(pathname, label) {
  const path = shellPath(pathname);
  const name = label.replace(/\s+/g, ' ').trim().slice(0, 48) || path;
  return [
    { cmd: `cd ${path}` },
    { ok: `Mounted ${path}` },
    { ok: `Started ${name}` },
    { ok: 'Reached target page' },
  ];
}
