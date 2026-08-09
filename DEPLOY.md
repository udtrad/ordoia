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
       → npm test                      the gate. Do not deploy on red.
       → wrangler pages deploy _site
       → ORDOIA_LIVE=… npm test        check 15, against what the host returned
```

Secrets it needs: `CLOUDFLARE_API_TOKEN` (scope: Account → Cloudflare Pages → Edit) and
`CLOUDFLARE_ACCOUNT_ID`.

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

## Uptime and certificate monitoring

§9 asks for both. Whatever you use, monitor **`https://ordoia.com/oal/v1.0`**
specifically, not just the apex. The home page being up tells you nothing about
whether a six-year-old scorecard's printed address still resolves, and that is the
failure with the longest tail.

---

## Still open before launch

These are not deploy steps. They are decisions, and they sit in `CHANGES.md`:

- **The entity.** Terms and Privacy stay unbuilt until it exists, and `_redirects`
  deliberately routes neither.
- **Version content immutability.** `/oal/v1.0/` has its own frozen stylesheet, fonts
  and favicon, but its *content* still generates from the live `oal.json`. The build
  refuses outright the moment a second version is published, so this cannot ship wrong
  quietly — but freeze it, and write the v1.1 publishing process document, before
  there is ever a v1.1.
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
