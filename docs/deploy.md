# Deploy runbook (Cloudflare now, Raspberry Pi later)

My checklist for putting the site live. Every step that touches an account I do by hand in the dashboards; nothing
here runs automatically.

## 0. Before the first push (once)
- [x] Git hooks on (2026-10-28): `git config core.hooksPath .githooks` (pre-commit: no-reply author AND committer
      email via `git var`, nothing from `.private/`, privacy scan; pre-push: history scan). Needed again in a fresh clone.
- [x] Domain: registered at Blacknight; transfer lock on; RDAP shows no registrant data (only the registrar) [checked
      2026-10-28]; nameservers switched to Cloudflare (registry confirmed).
- [x] `npm test && npm run test:browser` green; final pre-release review done (repo scan, README check, fresh-copy
      setup, independent new-developer review) [2026-10-28].
- [ ] Two-factor login on: Blacknight, Cloudflare, GitHub (passkey or app, not SMS); save the backup codes offline.

## 1. GitHub
- [ ] Create the repo (public recommended for a portfolio; private works the same). First commit and push by hand.
- [ ] Settings → Secrets and variables → Actions → New secret `PRIVACY_DENY`: paste the lines of `.private/deny.txt`
      (one per line). CI fails without it, by design.
- [ ] Settings → Code security: secret scanning + push protection, Dependabot alerts on.
- [ ] Settings → Rules → protect `main`: require the `ci` check to pass; block force-pushes and deletion.
- [ ] Settings → Emails: "Keep my email address private" and "Block command line pushes that expose my email" on.

## 2. Cloudflare Pages
- [ ] Workers & Pages → Create → Pages → connect GitHub, pick the repo (grant access to this repo only).
- [ ] Build command `npm test`, output directory `dist`, production branch `main`. Also set the variable
      `NODE_VERSION=24` (`.nvmrc` should be honoured; the image default is 22, which also works: engines >= 22.12).
      Check the Node version in the first build log.
- [ ] Settings → Variables and secrets → add `PRIVACY_DENY` as a **Secret**, for Production and Preview. The field is
      single-line: put the entries on one line separated by `|` (e.g. `first|second|third`). The build fails without
      it, by design.
- [ ] Custom domains → add `danilamacijauskas.dev` (and `www.danilamacijauskas.dev` redirecting to it, optional).
      Needs the zone active on Cloudflare (nameservers switched: done).
- [ ] DNS hardening (Cloudflare dashboard): DNSSEC → enable, then add the DS record it shows at Blacknight; CAA
      records are optional (Cloudflare manages certificates).
- [ ] After the first deploy, check: `curl -sI https://danilamacijauskas.dev/ | grep -i -E 'content-security|strict-transport|referrer'`,
      the 404 page at `/nope` and `/nope/`, and securityheaders.com / observatory.mozilla.org (expect A+).

## 3. Email (Cloudflare Email Routing)
- [ ] Email → Email Routing → enable (adds MX, SPF, DKIM).
- [ ] Destination address: the private inbox; click the verification link.
- [ ] Custom address `contact@danilamacijauskas.dev` → that inbox. Send a test from another account.
- [ ] DMARC: Email → DMARC Management on (or a TXT `_dmarc` record `v=DMARC1; p=quarantine`, relaxed alignment,
      no `rua` with a private address). Revisit alignment if you later send as contact@ through a sending service.
- Replies from Gmail reveal the private address. To reply as contact@, add a sending service later (research:
  kept in the private notes).

## 4. What protects what
| Risk | Protection |
|---|---|
| Private data in a commit | pre-commit hook + `npm test` privacy check (deny-list from `.private/` or the `PRIVACY_DENY` secret) |
| Private data in old history | pre-push hook + check-history in GitHub Actions (full clone, merge diffs included). The Pages build likely clones shallow, so its history scan covers little; it still runs the full privacy scan of the files |
| Private email in commit metadata | GitHub no-reply address; pre-commit checks the real author/committer (`git var`); check-history checks every commit's author and committer in CI; GitHub's "block pushes that expose my email" as backstop |
| Script injection / XSS | No inline code (check-inline), strict CSP with Trusted Types, all DOM writes via textContent |
| Clickjacking, referrer leaks | `frame-ancestors 'none'` + X-Frame-Options, `Referrer-Policy: same-origin` |
| Malicious dependency update | Exact pins (check-pins), `npm ci` from the lockfile, `npm audit` in CI, actions pinned to SHAs |
| Leaked deploy credentials | None exist: Pages pulls from GitHub; CI has read-only repo access and only the deny-list secret |
| Broken page shipped | Pages builds with `npm test`; CI adds the browser smoke test |
| Hooks skipped (`--no-verify`) | Hooks are a convenience; CI and the Pages build repeat every check |

Accepted risk: in CI the `PRIVACY_DENY` secret is in the environment of the whole `npm test` step, so build-time
dependencies could read it. They are exact-pinned and audited; splitting the step would duplicate the test recipe.
Pull requests from forks get no secrets, so their CI fails by design (no outside contributors expected).

## Contact form (later stage)
Needs CSP edits in `public/_headers` (Turnstile: `script-src` and `frame-src https://challenges.cloudflare.com`;
`connect-src`/`form-action` for the Function) and matching updates to tests/headers.test.mjs.

## 5. Raspberry Pi later
Same `dist/`. nginx equivalent of `public/_headers` (server block): `add_header` for each header line under `/*`,
`location /_astro/ { add_header Cache-Control "public, max-age=31536000, immutable"; }`, `error_page 404 /404.html;`,
TLS via Let's Encrypt (certbot). Then point the DNS A/AAAA records at the Pi (or a Cloudflare Tunnel, no open ports).
