# Portfolio site: danilamacijauskas.dev

My personal portfolio: a fast, static site with a terminal look that links to my projects. It is also a small
engineering project in its own right: every page is checked automatically for broken links, readable contrast,
private data and a strict security policy before it can be deployed.

## How it fits together

- **Astro** builds plain HTML and CSS from `src/pages/` and one Markdown file per project in `src/content/projects/`.
  The site works without JavaScript; the scripts only add extras.
- **Design tokens**: every colour and font lives in `src/styles/tokens.css` (dark and light themes); layout is in
  `src/styles/global.css`.
- **Small scripts** (`src/scripts/`): the dark/light switch, the hero's typing intro, the optional terminal (pure
  command logic in `terminal/commands.mjs`, DOM code in `terminal/terminal.ts`) and the page-transition boot log.
- **Checks** (`scripts/check-*.mjs`, `tests/`, `scripts/smoke-browser.mjs`) and the **security headers**
  (`public/_headers`) keep the published site honest; see below.

## Run it locally

Needs Node 24 (`.nvmrc`; 22.12 or newer works) and, for the browser test, Google Chrome.

```sh
npm ci                 # install the exact dependency versions from package-lock.json
npm run dev            # dev server with hot reload: http://localhost:4321 (draft projects are shown here)
npm test               # type check, build, unit tests and all checks (about a minute)
npm run test:browser   # headless Chrome against dist/, served with the production security headers
```

Expected: `npm test` prints `inline ok` as its last check, and `npm run test:browser` with `browser smoke test ok`. Without a
`.private/deny.txt` the privacy check prints a warning and runs its pattern rules only (see below).

## Add a project

1. Copy `docs/project-template.md` to `src/content/projects/<slug>.md` (the file name becomes the URL
   `/projects/<slug>/`) and fill in the fields. Pictures go in `src/assets/projects/` (cover `image`, optional
   `gallery`); a short demo clip in `public/media/<slug>/`, only once the project is published.
2. Keep `draft: true` while writing: drafts appear in `npm run dev` only and never reach the build.
3. Set `draft: false` once it has a live URL or a public repo (the schema in `src/content.config.ts` refuses it
   otherwise). The home page then shows its card and "See projects" button; `npm test` fails if a published project
   still contains placeholder text.

## Commands

- `npm run build`: build to `dist/`
- `npm run test:unit`: unit tests only (`node --test tests/*.test.mjs`)
- `npm run check`: all checks (pins, tokens, contrast, privacy, history, links, inline); needs a built `dist/`
- `npm run preview:prod`: serve `dist/` at http://127.0.0.1:4700 with the production headers
- `node scripts/check-contrast.mjs --save`: also writes the contrast table to `reports/contrast/<date-time>/`
- `npm run build && node scripts/make-og.mjs --force`: redraw the link-preview image `public/og.png` after the
  headline changes

## Why these checks exist

- **pins**: every dependency version is exact, so an install next year gives the same site as today.
- **tokens**: colours and font names live only in `src/styles/tokens.css`, so restyling is one file; text never uses
  a background colour.
- **contrast**: text stays readable (WCAG AA: 4.5:1, form borders 3:1) on both backgrounds, in both themes.
- **privacy**: no phone number, address, personal email or entry from a private deny-list reaches the repo or the
  built site. It is a heuristic (patterns for emails, phones, Eircodes, street addresses) plus the deny-list, read
  from `.private/deny.txt` (gitignored, one literal per line) or, in CI, from the `PRIVACY_DENY` secret (one per line,
  or one line separated by `|`). Not a
  guarantee: read what you publish.
- **history**: the same rules over every past commit, plus every commit's author and committer email must be a
  GitHub no-reply address, because deleting something later does not remove it from history.
- **links**: every local link, image, `srcset` entry and CSS `url()` in `dist/` exists with the exact letter case
  (the live host is case-sensitive; a Mac is not).
- **inline**: no inline scripts or styles in the built HTML, so the strict Content-Security-Policy can forbid them.
- **headers**: the policy in `public/_headers` (CSP with Trusted Types, HSTS, no framing, no referrer to other sites)
  is pinned by `tests/headers.test.mjs`; the browser smoke test proves it blocks nothing the site needs.

## Troubleshooting

- **Dev server shows an image error or no project cards** after `npm run build` or `astro check`: those rewrite
  Astro's shared cache without the drafts. Run `touch src/content/projects/*.md` (`npm test` does this for you).
- **`npm run test:browser` cannot find Chrome**: set `CHROME_PATH` to the browser binary.
- **CI fails at the privacy check with "no deny-list in CI"**: add the `PRIVACY_DENY` repository secret. Pull
  requests from forks get no secrets, so their CI fails by design.

## Deploy and security

Cloudflare Pages builds the site with `npm test`, so any failing check blocks a deploy, and no deploy token exists.
GitHub Actions runs the same tests plus the browser smoke test on every push (`.github/workflows/ci.yml`: read-only
permissions, actions pinned to commit SHAs, `npm audit` for runtime dependencies). Git hooks in `.githooks/` stop a
commit with private data or a non-private author email; enable them once per clone with
`git config core.hooksPath .githooks`. Step-by-step setup: [docs/deploy.md](docs/deploy.md).

## Status

- **Works**: home page, project pages, 404, dark/light themes, typing intro, optional terminal, page transitions;
  `npm test` (about 100 unit tests plus checks) and the browser smoke test pass; Lighthouse 100 in all four categories on
  mobile and desktop (local build, 2026-10-28).
- **Not yet**: no project is published (all drafts until live); the contact form is planned (email link for now);
  the site is not deployed yet.
- **Limits**: tested in Chrome (headless) only, not yet in Safari, Firefox or with a screen reader; page transitions
  use the View Transitions API (Chrome, Edge, Safari 18.2+; other browsers simply navigate).
- **Later**: self-hosting on a Raspberry Pi; `dist/` and the headers carry over (see docs/deploy.md).

## Licence

The code is MIT-licensed (see [LICENSE](LICENSE)). The written content, my photo and the project images are
© Danila Macijauskas, all rights reserved.

## Credits

- Colour palette: [Tokyo Night](https://github.com/folke/tokyonight.nvim) by folke, Apache-2.0.
- Fonts: IBM Plex, SIL Open Font License 1.1 (licence files in `public/fonts/`).
