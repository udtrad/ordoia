# Deploying this site

BRIEF.md §9: static host, custom domain, TLS, HSTS, security headers, reproducible
from a clean checkout, and **a published version returning 404 is the most serious
operational failure this site can have.**

Everything below either is a command or is a decision with its trade-off stated.

---

## What the repo already provides

| Artifact | Where | What it does |
|---|---|---|
| `_headers` | built to `_site/_headers` | CSP, HSTS, Referrer-Policy, Permissions-Policy, X-Content-Type-Options, and the caching split |
| `_redirects` | built to `_site/_redirects` | extensionless forms of every clean URL, including the printed `/oal/v1.0` |
| `sitemap.xml`, `robots.txt`, `404.html` | built | §5 |
| check 14 | `npm test` | parses both files and fails the build if a directive is missing or widened |

Both files use a syntax **Netlify, Cloudflare Pages and Cloudflare Workers static assets
all read natively and identically**. Nothing has to be rewritten to move between them,
and that is deliberate: §9 asks for permanence to survive the host. The host below is a
choice, not a dependency — which is what makes it safe to have made one.

---

## The build needs a browser

`npm run build` is two steps:

```bash
eleventy                     # HTML, CSS, fonts, sitemap, robots, 404
node tools/build-pdf.mjs     # the scorecard PDF, rendered from the built site
```

The second needs Chromium, because §6 requires the PDF to be *generated in the build,
not exported by hand*. That shapes the deploy choice more than anything else here.

**Build in CI, deploy the artifact.** This is committed, not a sketch:
`.github/workflows/deploy.yml` on push to `main`, and `.github/workflows/canary.yml`
weekly. The shape is:

```text
npm ci → playwright install chromium → npm run build
       → npm test                        the gate. Do not deploy on red.
       → pages deploy --branch=ci-preview
       → ORDOIA_LIVE=<preview> npm test  check 15, before the domain moves
       → note the deployment in production now
       → pages deploy --branch=main
       → ORDOIA_LIVE=<domain> npm test   check 15, against the custom domain
       → on failure: roll back, then probe
```

**Why two deploys of the same artifact.** The preview stage catches everything that is a
property of the artifact and the project — `_headers` not applied, the soft-404 fallback,
the cache split, byte mutation by Pages, the default `Access-Control-Allow-Origin` — and
it catches them *before* `ordoia.com` changes. The production stage catches only what is
zone-scoped and therefore invisible on `*.pages.dev`: Email Address Obfuscation rewriting
the `mailto:` CTA, Rocket Loader, anything attached to the zone.

There is no promote-a-preview operation on Pages, so the artifact uploads twice. Pages
de-duplicates unchanged files by hash, so the second upload is cheap.

Byte-equality against a preview URL works **only because every URL in the artifact is
absolute against `src/_data/site.json`** — `rel="canonical"`, the sitemap and the printed
addresses are all fixed at build time, so the bytes served at `*.pages.dev` are the bytes
that will be served at the custom domain. If a page ever derived a URL from its request
host, the preview stage would go red, and it would be right to.

**`--branch` is not optional.** Measured against wrangler 4.120.0, not assumed:
`pages deploy` infers its branch from `git rev-parse --abbrev-ref HEAD`, and the Pages code
path — unlike the Workers one — has no CI fallback to `GITHUB_REF_NAME`. `actions/checkout`
leaves a detached HEAD, where that command returns the literal string `HEAD`. Without the
flag the upload is tagged with a branch that is not the production branch, so it lands as a
*preview*, `ordoia.com` never changes, and check 15 then fails with a byte mismatch that
reads as "the host mutated our bytes" when the truth is "we never deployed". Check 19 fails
the suite if a `pages deploy` line loses its `--branch`.

Secrets it needs: `CLOUDFLARE_API_TOKEN` (scope: Account → Cloudflare Pages → Edit) and
`CLOUDFLARE_ACCOUNT_ID`. Both are read from the environment by every script here and are
never written to a file, a log line or a URL.

**Everything is pinned to a commit.** The actions are SHA-pinned and wrangler is pinned to
an exact release, with the tag each SHA stood for in a trailing comment — that comment is
how a pin gets renewed deliberately rather than drifting. This repository pins Eleventy to
`3.1.2` and subsets its fonts from a SHA-pinned Adobe release; the deploy path was the one
unpinned thing in it, and it is the part that touches production. Check 19 enforces it.

This keeps the host as a dumb file server, makes the build reproducible from a clean
checkout on a machine you control, and means a host changing its build image cannot
change your bytes. It is also the only shape in which `npm test` genuinely gates the
deploy.

**Simpler alternative: build on the host.** Set the build command to
`npx playwright install --with-deps chromium && npm run build`, publish directory
`_site`, Node 22+. It works on both platforms but adds roughly a minute per deploy
and puts your artifact at the mercy of their build image. If you take this path,
`npm run build:html` skips the PDF step — but then the site ships two of the three
formats §6 requires, and check 14 will tell you so.

---

## The host: Cloudflare Pages

Decided 2026-08-08. The reasoning, because §9 asks for permanence to survive the host
and a choice with no recorded reason cannot be reviewed later:

**Netlify's current Free plan cannot hold the guarantee this site makes.** New accounts
are on credit-based pricing: **300 credits/month, a hard cap with no auto-recharge**, and
a **production deploy costs 15 credits**. Twenty deploys exhausts the month at zero
traffic. On exhaustion Netlify's docs are explicit — *"all of your web projects
(sites/apps) are paused and visitors to your web projects will find a `Site not
available` page"*, team-wide. That is §9's most serious operational failure, produced by
the plan's own design, on the artifact whose resolution is the practice's permanence
claim. It is closable only by paying.

**Cloudflare Pages: *"On both free and paid plans, requests to static assets are free and
unlimited."*** This site has no Functions, so the metered path does not apply to it.
Deploying prebuilt from CI consumes zero Pages builds. There is no overage that can take
the site down.

**The cost of choosing Cloudflare is that its edge rewrites HTML by default**, which is
the wrong shape for a practice whose product is that what it published is what it
published. Email Address Obfuscation is on by default on every new zone, rewrites
`mailto:` links and injects `email-decode.min.js` — which this site's own
`script-src 'none'` then blocks, leaving the services CTA dead. That risk is
configuration, so it is closable and, unlike a billing cap, **testable**. Check 15 tests
it on every deploy.

### Setting it up

Order matters: **harden the zone before pointing the domain at it**, so the mutating
defaults never serve a single request.

1. Add `ordoia.com` to Cloudflare as a zone and change the nameservers at Namecheap. An
   apex domain requires this; a subdomain would not.
2. **Before adding the custom domain** — Security → Settings → **Email Address
   Obfuscation → Off**. Confirm **Rocket Loader off**, **Bot Fight Mode off**, and that
   **Web Analytics is not enabled** (it injects a beacon; the zone's Traffic analytics is
   server-side and needs no script). SSL/TLS → **Full (strict)**, Always Use HTTPS on.
3. Any CAA records must permit `letsencrypt.org`, `pki.goog` and `ssl.com`, or
   certificate issuance for the custom domain fails.
4. Create the Pages project as **Direct Upload** — deploys come from CI, not from
   Cloudflare's builder. **This is a one-way door**: a Direct Upload project cannot be
   switched to Git integration later. It is the right door here, because the build needs
   Chromium and because CI is the only shape in which `npm test` gates the deploy.

   ```bash
   npx wrangler@4.120.0 pages project create ordoia --production-branch=main
   ```

   **The production branch must be `main`,** because that is what `deploy.yml` passes to
   `--branch` when it promotes. If the two ever disagree, every "production" deploy lands
   as a preview and the custom domain silently stops updating. On a Direct Upload project
   the production branch **cannot be changed from the dashboard** — it takes a call to the
   Update Project API — so it is worth getting right at creation.
5. Add `ordoia.com` as the custom domain. Build output directory `_site`; `_headers` and
   `_redirects` are picked up from it with no further configuration.

Do **not** enable the host's analytics beacons, form handling, or Functions. §9 is
explicit: no cookies, no client-side analytics, no tag manager, no pixel — which is what
lets the site ship with no consent banner. A practice that publishes a redaction rule
cannot run a tracker it has not disclosed. Note also that `_headers` and `_redirects` are
**not applied to Pages Functions responses**, so adding one would silently punch through
the CSP.

## The fallback: Netlify

Kept here because the portability claim above is only worth something if the escape route
stays written down.

1. `npx netlify deploy --prod --dir=_site`, publish directory `_site`.
2. Custom domain → `ordoia.com`, then **Verify DNS configuration** and let it provision
   the certificate. Netlify recommends a subdomain as primary when using external DNS,
   because an apex resolves to a single load-balancer address rather than routing on the
   CDN.
3. `_headers` and `_redirects` are picked up from the publish directory unchanged.
4. Never enable Real User Monitoring — it injects JavaScript. Netlify's Web Analytics is
   server-log based and does not.
5. Budget the Personal plan at minimum, for the auto-recharge. On Free, see above.

Cloudflare **Workers static assets** is the third door: it parses the same `_headers` and
`_redirects`, so migrating is a `wrangler.jsonc` with `assets.directory` and
`wrangler deploy` in place of `wrangler pages deploy`.

---

## Verify the deploy, not the build

Check 14 reads the files the build emits. It cannot see what a host actually returns — a
host that silently ignored `_headers`, or an edge that rewrote the HTML on its way out,
would pass every test in the suite and fail in production.

**Check 15 is that gap, closed.** It used to be four `curl` commands in this file; they
are gone, because one claim verified in one place beats two copies to keep in step.

```bash
ORDOIA_LIVE=https://ordoia.com npm test
```

Seven assertions, in order of what they defend:

| | Asserts | Catches |
|---|---|---|
| 1 | every page's served bytes equal its built bytes | any edge rewrite at all, without having to enumerate them |
| 2 | `/services/` still carries `mailto:hello@ordoia.com` and no `/cdn-cgi/l/email-protection` | Email Address Obfuscation, by name |
| 3 | no `<script>` and no `/cdn-cgi/` on any page in the sitemap | injected beacons, Rocket Loader |
| 4 | `/oal/v1.0` and every sitemap entry return 200 | §9's most serious failure |
| 5 | the required headers are on the wire and the CSP is not wider than built | a host that drops `_headers`; Pages' default `Access-Control-Allow-Origin: *` |
| 6 | a missing page returns **404** and still carries the CSP | Pages' SPA fallback turning every typo into a 200; an unprotected 404 |
| 7 | the version path is immutable and the live one is not | a host overriding `Cache-Control` |

It skips unless `ORDOIA_LIVE` is set, so `npm test` stays hermetic and a network outage
can never block a build. It runs automatically after every deploy, and weekly on a
schedule — see `.github/workflows/`. The weekly run is the only thing that would notice a
Cloudflare zone setting being switched on years from now, long after anyone remembers why
it was off.

Assertion 4 is the one this site's whole permanence argument rests on. Run it after any
DNS or host change, not only after a deploy.

---

## Rollback — what it answers, and what it cannot

If check 15 fails against the custom domain, `deploy.yml` rolls production back to the
deployment that was serving before the promotion, then runs a **narrow probe**.

```bash
node tools/pages-api.mjs current-production      # deployment=<id>, captured pre-promotion
node tools/pages-api.mjs rollback <id>
node tools/probe-live.mjs https://ordoia.com
```

**wrangler has no Pages rollback.** Measured against 4.120.0: `wrangler rollback` is a
Workers command by its own help text, and `wrangler pages deployment` offers `list`,
`create`, `tail` and `delete`. Rollback is REST only:

```text
GET  /accounts/{account_id}/pages/projects/{project}/deployments?env=production
POST /accounts/{account_id}/pages/projects/{project}/deployments/{id}/rollback
```

Three details that are easy to get wrong and are handled in `tools/pages-api.mjs`:

- **Only a successful *production* deployment is a valid rollback target.** A preview is
  not one — and this pipeline uploads a preview immediately before promoting, so "the most
  recent deployment" is reliably the wrong answer.
- **The target is captured before the promotion,** because afterwards the thing we want to
  return to is no longer the one in production.
- **The newest-first ordering of the listing is asserted, not trusted.** Rolling back to
  the wrong deployment is worse than not rolling back at all: it looks like a recovery.

**The probe is deliberately not check 15.** After a rollback the runner's `_site` holds the
build we just rolled *away from*, so byte-equality would fail on every successful recovery.
The probe asserts only what must be true of any good deployment: `/services/` returns 200,
carries `mailto:hello@ordoia.com`, and carries no `/cdn-cgi/`.

> **Rollback answers one question: *we shipped bad bytes.*** It does **not** fix the
> failure this practice fears most. If Email Address Obfuscation is switched on at the
> zone, rolling back republishes older bytes into the same zone and they are rewritten
> identically. The preview gate is what actually prevents that class, one stage earlier.
>
> The two are told apart by the probe: **green** means the bytes were the problem and
> production is healthy again; **red on `/cdn-cgi/`** means the zone is the problem, and no
> rollback can help — turn Email Address Obfuscation off under Security → Settings and
> re-run the workflow. `deploy.yml` writes exactly this into the job summary.

### The drill, which has not been run

**Nothing here has met the real Cloudflare API.** There is no account yet. Check 20 proves
that *given a listing* the right deployment is chosen, and that the probe catches a dead
CTA and a rewriting edge — it cannot prove a listing comes back in that shape, or that the
rollback POST does what its documentation says.

Before this path is trusted, run it once on a throwaway Pages project:

1. `wrangler pages project create ordoia-drill --production-branch=main`
2. Deploy a page, note the deployment id, deploy a visibly different one.
3. `CLOUDFLARE_PAGES_PROJECT=ordoia-drill node tools/pages-api.mjs current-production` —
   it must name the second deployment.
4. Roll back to the first; confirm the first is being served.
5. Point `tools/probe-live.mjs` at it and confirm the probe's verdict matches.
6. Delete the project.

Until step 6 is done and recorded in `CHECKS.md`, the rollback claim in this file is
documentation, in exactly the sense §13 item 6 uses the word.

---

## HSTS preload — deliberately not enabled

`_headers` sets `Strict-Transport-Security: max-age=63072000; includeSubDomains` and
**omits `preload`**.

`preload` is close to a one-way door: once the domain is in the browser preload list,
removing it takes months to propagate, and every present and future subdomain is
locked to HTTPS. That is the right end state, and it should be a decision taken once
the domain is settled and every subdomain that will ever exist can serve TLS — not a
side effect of a first deploy. Add the token and submit at
`hstspreload.org` when you are ready.

### `includeSubDomains` and the floor are both asserted

`max-age` and `includeSubDomains` are checked by check 14 and check 15, through the one
evaluator in `tests/lib/posture.js`. Two things follow, and both are deliberate:

**The floor is parsed, not pattern-matched.** It was `/max-age=\d{7,}/`, which accepts
`max-age=1000000` — eleven and a half days wearing the shape of a two-year commitment. The
value is now compared against 31,536,000 (one year). The site ships 63,072,000.

**`includeSubDomains` is required.** This page documented omitting `preload` as deliberate
and said nothing about this one, so its presence was an accident that looked like a
decision. Asserting it makes it a decision: every subdomain of `ordoia.com` must serve
HTTPS, which costs nothing at Let's Encrypt, and removing it later becomes a visible edit
to a check with a reason attached rather than a quiet weakening of the header. If a
subdomain ever genuinely cannot serve TLS, change the `Strict-Transport-Security` entry in
`posture.js` and log the reason in `CHANGES.md` — that is the intended path, not a
surprise.

---

## Uptime and certificate monitoring — and why it has to be external

§9 asks for both. Whatever you use, monitor **`https://ordoia.com/oal/v1.0`**
specifically, not just the apex. The home page being up tells you nothing about
whether a six-year-old scorecard's printed address still resolves, and that is the
failure with the longest tail.

**The weekly canary cannot be the answer, and pretending otherwise would be the defect.**
GitHub disables scheduled workflows in a repository with no activity for 60 days. This
site is finished by design — a rubric that changes quarterly is not a standard — so the
quiet period that switches the canary off is the *expected* state, and it switches off
exactly when it becomes the only thing watching.

There is no honest in-repo fix. A keepalive bot commit pollutes the history that is itself
the provenance evidence: a repository whose commits are cited on the face of a scorecard
cannot carry commits that mean nothing. A second workflow that re-enables the first has to
be triggered by something, and that something is the same problem one level up.

So liveness lives outside the repository. Two endpoints, two keyword assertions each:

| URL | Must contain | Must not contain |
|---|---|---|
| `https://ordoia.com/oal/v1.0` | `Ordoia Assurance Levels` | `/cdn-cgi/l/email-protection` |
| `https://ordoia.com/services/` | `mailto:hello@ordoia.com` | `/cdn-cgi/l/email-protection` |

Those keywords are not decoration. The pair catches precisely the Email Address
Obfuscation failure — the one zone setting that breaks the only conversion path on the
site — and they are the same pair `tools/probe-live.mjs` uses, deliberately: one failure
mode, one pair of strings, three places that look for it. Certificate expiry monitoring
comes free with almost any such service and closes the second half of §9's ask.

**If the external monitor lapses too, nothing notices.** That is the residual risk, and it
is accepted knowingly rather than papered over. It is also recorded in `canary.yml`'s own
header, where the next person to read that file will find it.

---

## Publishing a rubric version

§5: *"Snapshot directories are immutable: the build refuses to write to a version
directory that already exists."*

Taken literally that is unimplementable — `_site/oal/v1.0/` exists after the first build,
so a build refusing to write to an existing version directory would refuse the second
build and every one after it. The sentence is about **published bytes**, not about a
directory entry in an output folder, so the enforceable form is byte identity against a
manifest taken at publication:

```bash
npm run build
node tools/freeze-version.mjs 1.0     # writes versions/v1.0.json
npm test                              # check 21 now holds the build to it
git add versions/v1.0.json
```

Check 21 then fails on any later build that changes, adds or removes a single file under
`/oal/v1.0/`, and fails separately if a *superseded* version has no manifest at all.
`requirePublishableVersion` in `eleventy.config.js` guards the other direction — it stops
the build outright rather than regenerate a superseded version's page from a newer rubric.

**Do this at publication, not before.** Nothing is frozen today, and that is correct: v1.0
has not been published, and freezing a draft would claim a publication that has not
happened. The italic re-subset of 2026-08-09 — which took the rubric pages from 151.5 KiB
to 139.1 KiB — is exactly the kind of correction that has to stay free to land right up
until the first production deploy, and would have been unrecoverable one commit later.

Once frozen, `tools/freeze-version.mjs` refuses to re-freeze. Deleting the manifest by hand
is the deliberate act that overrides it, and it should appear in `CHANGES.md` with a reason
if it ever happens.

---

## Still open before launch

These are not deploy steps. They are decisions, and they sit in `CHANGES.md`:

- **The entity.** Terms and Privacy stay unbuilt until it exists, and `_redirects`
  deliberately routes neither.
- **Freeze `/oal/v1.0/` on the day it publishes.** The mechanism exists and is checked;
  the act has not been performed, because it must not be — see *Publishing a rubric
  version* below. The v1.1 publishing-process document (§11.3) is still unwritten.
- **Web-archive submission** on each published version, and the one-paragraph note on
  what happens to `/oal/v1.0` if the domain lapses (§5).
- **A mailbox at `hello@ordoia.com`.** The services page CTA is a `mailto:` to it and it
  is the only conversion path on the site. Stand it up and send a live test message
  before launch: a CTA that opens a mail client addressed to a mailbox that does not
  exist is worse than no CTA, and it is the one failure on this page that **no check in
  this repo can detect** — check 15 verifies the link survives the edge intact, not that
  anyone is reading what it sends. Set mail up *after* the nameserver migration, not
  across it.
- **Whether to also hold `ordoia.co.uk`.** The domain is printed on the face of every
  scorecard and cannot be changed afterwards, only redirected. Ordoia is positioned as a
  UK practice and `.co.uk` carries that signal where `.com` does not. Registering it and
  301-ing it here costs about £10/yr and forecloses the regret; it is recorded in
  `src/_data/site.json` under `formerDomains`, which is where its redirect would come
  from. Cheap now, unavailable later.
