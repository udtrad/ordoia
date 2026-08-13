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

### Three tokens, each as small as its job

Not one token used everywhere. The three jobs need different reach, and a single token
carrying the union of them is a token that can create zones from inside a workflow whose
only business is uploading files.

| Where | Secret | Permissions |
|---|---|---|
| `deploy.yml` | `CLOUDFLARE_API_TOKEN` | Account → Cloudflare Pages → Edit, **Zone → Cache Purge → Purge** |
| `canary.yml` | `CLOUDFLARE_ZONE_READ_TOKEN` | Zone → Zone Settings → Read, Zone → DNS → Read |
| Stage 6, local only | *(Keychain, not a repository secret)* | Zone → Zone → Edit **at account scope**, DNS Edit, Zone Settings Edit, Bot Management Edit, Cloudflare Pages Edit, Account Settings Read, Cache Purge |

Plus `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_ZONE_ID`, which are not secrets but are held as
ones so they are not printed into logs by accident. The zone id is what lets the deploy
token purge the cache **without** also being able to read the zone: the purge endpoint needs
an id, and looking that id up by name would require Zone Read.

Cache Purge is on the deploy token because the recovery path needs it — a rollback that
leaves the edge serving the bytes it rolled away from is not a recovery. It is a narrow
grant: it can empty a cache, not change a record or a setting.

The CI token cannot read the zone; the canary token cannot deploy. The setup token can do
both and **exists only for the duration of Stage 6** — it lives in the macOS Keychain, never
in this repository:

```bash
security add-generic-password -a ordoia -s cloudflare-setup-token -w   # prompts; never echoed
export CLOUDFLARE_API_TOKEN=$(security find-generic-password -a ordoia -s cloudflare-setup-token -w)
security delete-generic-password -a ordoia -s cloudflare-setup-token   # when Stage 6 is done
```

Read into the environment, never passed as an argument — an argv is visible in `ps` to every
process on the machine. Every script here reads from the environment and none of them writes
a token to a file, a log line or a URL; that handling lives once, in `tools/cf-api.mjs`.

**Zone creation needs the grant at *account* scope, not zone scope**, because at the moment
you make the call the zone does not exist to scope it to. That is the single most likely
thing to be wrong on a token that was made for deploying.

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

**And one of those defaults is invisible to check 15.** **Speed Brain** is enabled by
default on the Free plan. It does not touch the body: it adds a `Speculation-Rules`
response header pointing at a Cloudflare-hosted configuration, which tells the browser to
prefetch likely next navigations. Byte-equality therefore passes, and the header assertions
do not look for it — so the strongest check in this suite would stay green on a zone
issuing prefetch instructions on our behalf that we never disclosed. **Check 22 exists for
the class of setting check 15 structurally cannot see**, and it reads the zone
configuration rather than the bytes.

That is the honest statement of the trade: choosing Cloudflare means the site's posture is
partly a property of an account someone can change from a dashboard, and the answer is not
to trust the dashboard but to assert it weekly.

### Setting it up

Order matters, and the ordering that matters is not the obvious one. "Harden the zone
before pointing the domain at it" is right but insufficient, because a zone activates the
moment the nameservers resolve, and Cloudflare's zone scan imports whatever DNS it found —
including the registrar's parking `A` record. A zone that activates with a proxied address
record at the apex is serving something, with whatever defaults are still on.

So: **remove the apex address record and apply the settings while the zone is still
pending.** With no proxied web record at the apex, activation serves nothing, and the
hardening does not have to win a race against the first request.

`tools/zone-setup.mjs` does all of this, and **every mutating command is a dry run unless
`--apply` is passed.**

1. **Preflight.** `node tools/zone-setup.mjs preflight` — reads only, and prints what this
   token can actually reach. It exits non-zero if the token cannot be verified.
2. **Create the zone.** `node tools/zone-setup.mjs zone-create --apply`. It prints the two
   nameservers to set at Namecheap. Do not set them yet.
3. **DNS.** `node tools/zone-setup.mjs records` to see the diff, then `--apply`. The plan is
   `tools/dns-plan.json`: it removes the parking address record and the registrar's mail
   records, and adds DMARC. The mailbox's own MX, SPF and DKIM go in the plan first — see
   *Still open before launch*.
4. **Harden.** `node tools/zone-setup.mjs harden` to see the diff, then `--apply`. It
   re-reads and re-asserts afterwards, because a `PATCH` returning 200 is not evidence the
   value stuck. The table is `ZONE_SETTINGS` in that file, and **check 22 asserts the same
   table against the live zone** — one table, two consumers.

   Also confirm in the dashboard that **Web Analytics is not enabled**: it injects a beacon,
   and it is not a zone setting the API exposes here. The zone's Traffic analytics is
   server-side and needs no script.
5. Any CAA records must permit `letsencrypt.org`, `pki.goog` and `ssl.com`, or certificate
   issuance for the custom domain fails. There were none on 2026-08-09, so issuance is
   unrestricted; check 22 asserts that any that appear later still permit all three.
6. **Create the Pages project as Direct Upload** — deploys come from CI, not from
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
7. **Deploy and prove it, before the domain moves.** Everything above is project-scoped, and
   so is every unverified claim this repository makes about Cloudflare: `_headers` applied,
   the `! Access-Control-Allow-Origin` detach line, the 404 not being an SPA fallback, the
   cache split, byte-equality surviving the edge. All of them are observable on
   `ordoia.pages.dev` while `ordoia.com` is still parked.

   ```bash
   npm run build && npm test
   npx wrangler@4.120.0 pages deploy _site --project-name=ordoia --branch=main
   ORDOIA_LIVE=https://ordoia.pages.dev npm test
   ```

   Run the rollback drill here too — see below. The blast radius is a hostname nobody knows.
8. **Now** set the nameservers at Namecheap, wait for `status: active`, and re-run check 22:
   the settings were applied to a pending zone, and re-reading after activation is how that
   stops being an assumption.
9. **Attach the custom domain — this is the launch.**
   `node tools/zone-setup.mjs custom-domain --apply`, then
   `node tools/zone-setup.mjs records --apply` to add the apex CNAME, then verify.

   > **Cloudflare's documentation is wrong about this, in the direction that leaves you
   > staring at a domain that does not resolve.** The custom-domains page says that once the
   > nameservers point at Cloudflare it *"will proceed by creating a CNAME record for you"*.
   > That is the **dashboard** flow. Measured 2026-08-09: `POST /pages/projects/{p}/domains`
   > accepted the domain, returned `status: pending`, and stayed there with
   > `verification_data.error_message: "CNAME record not set"` while the zone had no address
   > record at all and `ordoia.com` did not resolve for anyone.
   >
   > This is the **fourth** time this project has been misled by Cloudflare documentation
   > that is true in one context and false in the one that matters — after the `_headers`
   > comma-join, the `pages deploy` branch inference, and the rollback listing. The pattern
   > is worth more than any of the individual findings: **their docs describe the dashboard;
   > this repository drives the API.**

   The record is therefore ours to create, and it is in `tools/dns-plan.json`. **The order
   still matters and is the documented one:** associate the domain with the Pages project
   *first*, then add the CNAME — a CNAME added without the association resolves to a 522.
   It must be **proxied**, or the traffic bypasses the zone and none of the settings check 22
   asserts apply to it.

   Certificate issuance took roughly four minutes, from Google as the CA, with no
   intervention. Do not read `status: pending` as a failure until the CNAME exists.

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
schedule — see `.github/workflows/`.

Assertion 4 is the one this site's whole permanence argument rests on. Run it after any
DNS or host change, not only after a deploy.

### Check 22 is the layer underneath

Check 15 reads bytes. It catches every zone setting that rewrites HTML, because they all
leave `/cdn-cgi/` behind. **It cannot catch the ones that do not** — Speed Brain adds a
response header and changes nothing in the body.

```bash
ORDOIA_ZONE_CHECK=1 npm test
```

Skipped unless that is set. But when it *is* set and the credentials are missing, it
**fails rather than skips**: an opt-in check that quietly skips itself in CI reports a green
gate having tested nothing, which is the shape `deploy.yml`'s "The preview must have an
address" step already exists to refuse.

The target table is `ZONE_SETTINGS` in `tools/zone-setup.mjs`, which is also what `harden`
applies — one table, two consumers, the same arrangement `tests/lib/posture.js` has for
headers and for the same reason. A setting in the table that Cloudflare's response does not
contain at all is a **failure**, not a silent pass: that is how a renamed or plan-gated
setting would otherwise turn this check into lesson 8 with a new denominator.

Both run weekly in `canary.yml`, on one `npm test`. Between them they are the only thing
that would notice a Cloudflare zone setting being switched on years from now, long after
anyone remembers why it was off.

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

### The drill was run on 2026-08-09, and it found three defects

Run on the `ordoia` project itself, after the Pages project existed and before the custom
domain was attached — a hostname nobody had been given, so the blast radius was a
throwaway's while the token, account and project were the real ones.

**It found that two of the three claims this section made were wrong.** That is the value
of a drill, and the reason the previous version of this paragraph — *"nothing here has met
the real Cloudflare API"* — was the most honest sentence in the file.

**1. `current-production` named the wrong deployment after a rollback.** Deploy A, deploy B,
roll back to A. Cloudflare then reports:

```text
project.latest_deployment    = B        the most recent upload
project.canonical_deployment = A        what the hostname actually serves
deployments?env=production   = [B, A]   newest first, B still "success"
```

The old implementation scanned that listing and answered **B** — the deployment that had
just been rolled away from, quite possibly because it was bad. `deploy.yml` captures this
value *before* promoting so it has a rollback target, so the consequence was exact: after
any rollback, the next failed deploy would "recover" onto the bytes rejected last time,
report success, and pass the probe. `canonical_deployment` is the authority, verified by
fetching with a cache-busting query string after a rollback.

**2. A rollback does not change what a reader receives.** After rolling back, the edge went
on serving the pre-rollback bytes and said so — `cf-cache-status: HIT`. A cache-busting
query string got the rolled-back page; a plain request did not, and neither did a
`Cache-Control: no-cache` request header. So the recovery path now purges the zone cache
between the rollback and the probe. **The probe cannot see this failure**: it asks whether
*a* healthy page is being served, not *which* one, and the stale page is a healthy page.

**3. A Pages hostname lags its own deployment.** A file uploaded seconds earlier returned
404 on the project alias at t+3s and 200 by t+8s, while the deployment's own
`<hash>.pages.dev` URL served it immediately. Both check-15 steps ran inside that window.
On the preview stage that is fail-safe — it refuses to promote. **On the production stage
the workflow answers a failed check by rolling back**, so a few seconds of lag would have
undone a good deployment and reported it as bad bytes. `tools/wait-for-origin.mjs` now runs
before each check, comparing bytes rather than waiting for a 200, and check 19 fails the
suite if a deploy ever loses its wait.

**What the drill confirmed:** the rollback POST works and its effect is real; the
deployments listing has the documented shape, `?env=production` filters as expected, and
`created_on` is a sortable ISO string; and rolling back to the deployment already serving
is refused by Cloudflare with `8000039`, not silently accepted.

Check 20 remains pure and offline, so `npm test` stays hermetic. Its fixtures are now built
from observed responses rather than documented ones.

**Run it on the real project, before the custom domain is attached.** A throwaway project
was the original plan and it is the weaker one: between creating the Pages project (step 6
above) and attaching the domain (step 9), `ordoia` itself is a hostname nobody has been
given, so the blast radius is the same as a throwaway's — and unlike a throwaway it also
proves the token, the account and the project name that the real deploys will use.

1. Deploy the build to production, then deploy a visibly different second one.
2. `node tools/pages-api.mjs current-production` — it must name the **second** deployment.
   If it names the first, or a preview, stop: the listing is not the shape check 20 assumes.
3. Roll back to the first; confirm the first is what `ordoia.pages.dev` serves.
4. `node tools/probe-live.mjs https://ordoia.pages.dev` and confirm the verdict matches.
5. Deploy the real build again.

Record the observed listing shape in `CHECKS.md`. Until that is done, the rollback claim in
this file is documentation, in exactly the sense §13 item 6 uses the word.

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

So liveness lives outside the repository — but its **configuration does not**. Four
monitors described only in someone's memory of a web form is the failure this practice
sells against. `tools/monitors.json` is the plan, `tools/monitor-setup.mjs` applies it,
and **check 24** reads the account back and fails if it has drifted.

| URL | Assertion | Better Stack `monitor_type` |
|---|---|---|
| `https://ordoia.com/oal/v1.0/` | contains `Ordoia Assurance Levels` | `keyword` |
| `https://ordoia.com/oal/v1.0/` | does **not** contain `/cdn-cgi/l/email-protection` | `keyword_absence` |
| `https://ordoia.com/services/` | contains `mailto:hello@ordoia.com` | `keyword` |
| `https://ordoia.com/services/` | does **not** contain `/cdn-cgi/l/email-protection` | `keyword_absence` |

**Two corrections to this table, made on 2026-08-11 by measuring rather than re-reading
it.** Both would have produced a monitor that alerted on its first run or watched nothing:

1. It asserted `mailto:hello@ordoia.com` on `/oal/v1.0`. **That page contains that string
   zero times** — the CTA is on `/services/`. Measured, not assumed.
2. It printed `https://ordoia.com/oal/v1.0` **without the trailing slash**, which returns
   **301** to the slashed form. A keyword monitor that does not follow redirects reads a
   redirect body and finds none of these strings. The plan sets `follow_redirects` as
   well, so the assertion survives the URL being written either way.

Those keywords are not decoration. The pair catches precisely the Email Address
Obfuscation failure — the one zone setting that breaks the only conversion path on the
site — and they are the same pair `tools/probe-live.mjs` uses, deliberately: one failure
mode, one pair of strings, three places that look for it.

**Four monitors, not two.** Better Stack puts the present/absent distinction in
`monitor_type` rather than in a flag beside the keyword, and takes one keyword per
monitor. Read off the API reference, not inferred from the UI.

### Setting up the monitors

The token never enters a file in this repository, an argv where `ps` would show it, or a
conversation. Same rule as the Cloudflare tokens.

```bash
# once: put the Better Stack API token in the Keychain
security add-generic-password -a ordoia -s betterstack-api-token -w

# every time: read it into the environment at call time
export BETTERSTACK_API_TOKEN=$(security find-generic-password \
  -a ordoia -s betterstack-api-token -w)

node tools/monitor-setup.mjs status          # reads, prints the diff, changes nothing
node tools/monitor-setup.mjs apply --apply   # makes the account match tools/monitors.json

ORDOIA_MONITOR_CHECK=1 npm test              # check 24 holds it to the plan
```

`status` is idempotent and safe to run at any time; `apply` without `--apply` still writes
nothing, so a mistyped command cannot change the account.

**Prove each monitor can fail before trusting it.** A monitor that has only ever been
green has not been shown to watch anything — the same argument this repository makes for
every check in its own suite. Point a throwaway `keyword` monitor at a URL lacking its
keyword and confirm it goes down; delete one real monitor and confirm check 24 goes red
naming it, then restore it with `apply --apply`.

`ssl_expiration` and `domain_expiration` are set in the plan's defaults, which closes the
certificate half of §9 and turns §5's domain-lapse worry into an alert rather than a
paragraph nobody has written yet.

**If the external monitor lapses too, nothing notices.** That is the residual risk, and it
is accepted knowingly rather than papered over. It is also recorded in `canary.yml`'s own
header, where the next person to read that file will find it. Check 24 narrows it but does
not close it: it verifies the monitor's *configuration*, not that anyone reads its alerts,
and it only runs when somebody runs the suite.

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
node tools/freeze-version.mjs 1.0     # writes versions/v1.0.json AND versions/v1.0/
npm test                              # check 21 now holds the build to it
git add versions/v1.0.json versions/v1.0/
```

**It stores the bytes, not only their hashes.** `versions/v<n>/` holds the snapshot's own
`styles.css` and fonts, and the build serves `/oal/v<n>/` from those — `src/` cannot reach
a published version. Until 2026-08-11 it could: the build re-copied the living stylesheet
into the frozen directory on every run, so "self-contained" was true of the snapshot's
*paths* and never of its *bytes*. The visible symptom was not a frozen page changing; it
was **the living stylesheet becoming un-editable**, because check 21 went red on any
change to it. See `CHANGES.md` row 40.

### When a published version is re-frozen

Twice now, so this is a practice and not an exception, and pretending otherwise is how a
document starts lying about its own repository.

| When | Why | What moved |
|---|---|---|
| 2026-08-11 | The frozen directory was re-copying the living `src/styles.css` on every build, which made the living sheet un-editable. `CHANGES.md` row 40. | The mechanism. No published word changed. |
| 2026-08-13 | Draft 6 §5.3 cut the rubric intro's intention clause. `CHANGES.md` row 114. | One sentence of published `<main>`, deliberately. |

**The rule, stated so the next one is a decision rather than a habit.** A re-freeze is
available only while a version's own publication date has not passed, and it is the
user's call, never engineering's. It costs three things every time, and all three are
deliverables rather than side effects:

1. **The provenance anchor is destroyed and re-minted.** `versions/v<n>.published-index.html`
   and the `PUBLISHED_SHA256` literal both change. The tool refuses to do this by itself
   (check 32 holds that refusal), so the override is deliberate: delete the manifest, the
   pinned directory **and** the retained document, rebuild, re-freeze, then update the
   literal in a reviewed diff.
2. **The frozen stylesheet becomes the stylesheet as at the re-freeze**, not as at
   publication. On 2026-08-13 that pulled a session's live design into the snapshot. It
   reached nothing — 0 computed-style differences across 45,444 values inside the frozen
   `<main>` — but that was **measured afterwards**, and it is the reason a re-freeze must
   be paired with the R2 comparison rather than assumed safe.
3. **This page has to be corrected.** It called the first re-freeze "not a precedent"; the
   second made that false, and a document claiming a constraint the repository does not
   observe is worse than one that is merely out of date.
4. **Returning visitors keep the old frozen stylesheet, and nothing can tell them not
   to.** `/oal/v1.0/styles.css` is served `immutable` for a year at a **stable,
   unfingerprinted URL** — correct while a published version never changes, which is the
   assumption a re-freeze breaks. A visitor who loaded the page before the re-freeze
   renders the new document against the old sheet, and a cache purge cannot reach them.
   Measured on 2026-08-13: **0 computed-style differences across 45,444 values** at four
   widths, so that deploy was safe — but it was safe because the session's CSS happened
   to touch only the footer and the grid, not because anything prevented otherwise.
   **Before the next re-freeze, either fingerprint the frozen stylesheet or run that same
   comparison.** The `immutable`-at-a-stable-URL shape is what row 71 already caught once
   on `/styles.css`.

After the publication date passes, the answer is a new version, not a re-freeze.

### What is frozen, since 2026-08-12: the content and its rendering, not the document

`index.html` was pinned too between 2026-08-11 and 2026-08-12 (`CHANGES.md` row 50). That
made the snapshot immutable across its whole surface — **including its chrome**, which was
never the intention and was not noticed until the footer changed. Measured on 2026-08-12:
eight of nine rendered pages carried the footer field list with the VAT registration and
`/oal/v1.0/` carried the launch footer, a sentence this repository had already withdrawn.
One site, two footers, and the frozen one advertising the site as it stood at publication.
Row 50 stated the cost — *"a page added to the site later will not appear in v1.0's footer
list"* — and stating it did not make it acceptable.

So the unit was re-cut (`CHANGES.md` row 65). **What is frozen is the `<main>` fragment
and the assets that render it**: `versions/v<n>/main.html`, `styles.css`, `fonts/`,
`favicon.svg`. The document at `/oal/v<n>/` is rendered live, like every other page, and
its masthead, version status and footer track the site.

**This was not a re-freeze, and the distinction is the whole reason it was available.**
`main.html` is a **byte-exact substring** of the document v1.0 was published as, whose
sha256 is still `0289c300dd07…`. That document is retained whole at
`versions/v1.0.published-index.html`, its hash is recorded in the manifest, and check 21
re-runs both comparisons on every commit — so the claim is measured rather than believed
because this paragraph says so. No published content byte moved. The sentence below about
2026-08-11 being the only re-freeze therefore still stands.

What the delivered document no longer is, and what to stop claiming: **byte-identical**.
`/oal/v<n>/index.html` changes whenever the chrome changes, by design. What is guaranteed
is that the rubric's words and their rendering do not — which is what a scorecard cites,
and what §13's "renders identically in 2032, styled by 2026's stylesheet" was actually
about. The published directory is also no longer **self-contained**: the page links a
shared `/chrome.<sha>.css` alongside its own frozen stylesheet. That is R1, and it is
deliberate.

**Re-freezing a published version is not a procedure.** The manifest's own header says a
changed byte means a new version, and that stands. It was done exactly once, on
2026-08-11, to carry a legibility fix into a rubric that was two days old, unannounced,
cited on no scorecard, and still a cache MISS at the edge. If you are reading this
considering a second one, the honest question is whether anyone could have relied on the
bytes — and after the first scorecard is issued the answer is yes, permanently. The
sequence, for the record:

```bash
rm -r versions/v1.0.json versions/v1.0/   # BOTH — see below
npm run build
node tools/freeze-version.mjs 1.0
node tools/zone-setup.mjs purge-cache --apply   # /oal/v1.0/* is immutable for a year
```

**Removing the manifest alone is not enough, and the failure is silent.** While
`versions/v1.0/` exists the build serves the snapshot from *those* bytes and `src/` cannot
reach it — that is the whole point of the decoupling. So a re-freeze that deletes only the
manifest rebuilds the *stored* stylesheet, hashes it, and records the identical bytes: the
command reports success and changes nothing. The stored directory has to go too, which
drops the build back to the `src/` fallback for one build.

Check 21 then fails on any later build that changes, adds or removes a single file under
`/oal/v1.0/`, and fails separately if a *superseded* version has no manifest at all.
`requirePublishableVersion` in `eleventy.config.js` guards the other direction — it stops
the build outright rather than regenerate a superseded version's page from a newer rubric.

**Do this at publication, not before.** Freezing a draft claims a publication that has not
happened, and the italic re-subset of 2026-08-09 — which took the rubric pages from
151.5 KiB to 139.1 KiB — is exactly the kind of correction that has to stay free to land
right up until the first production deploy, and would have been unrecoverable one commit
later.

> **v1.0 has been frozen since 2026-08-11.** This paragraph read *"nothing is frozen
> today, and that is correct: v1.0 has not been published"* for a day after it was, and the
> same sentence sat in `tools/freeze-version.mjs`'s own header. Both are corrected, and
> both are recorded rather than quietly edited: this is `CHANGES.md` row 42 a second time —
> a correction landing in one place and not the others — and the interesting part remains
> that the suite has no check which reads its own prose for consistency, and probably
> cannot have one. `versions/v1.0.json` is the authority on what is frozen; a document is
> not.

Once frozen, `tools/freeze-version.mjs` refuses to re-freeze. Deleting the manifest by hand
is the deliberate act that overrides it, and it should appear in `CHANGES.md` with a reason
if it ever happens.

---

## Still open before launch

These are not deploy steps. They are decisions, and they sit in `CHANGES.md`:

- **The entity.** Terms and Privacy stay unbuilt until it exists, and `_redirects`
  deliberately routes neither.
- **Web-archive submission** on each published version, and the one-paragraph note on
  what happens to `/oal/v1.0` if the domain lapses (§5). The *paragraph* is still
  unwritten; the *alert* exists since 2026-08-11 — `domain_expiration` on the Better Stack
  monitors, 30 days.

**Done 2026-08-10, and no longer outstanding:**

- **Freeze `/oal/v1.0/`.** Performed in the change that took the site live. Re-taken
  **twice** since: 2026-08-11 (`CHANGES.md` row 40, decoupling the frozen stylesheet) and
  2026-08-13 (row 114, draft 6 §5.3 cutting the rubric intro's intention clause). This
  entry said the first was *"not a precedent"* until the second one made that untrue, and
  it is withdrawn here rather than left standing — see *When a published version is
  re-frozen* below for what the practice actually is.
- **A mailbox at `hello@ordoia.com`.** Stood up on Namecheap Private Email and **proved
  end to end on 2026-08-11**: a message sent from the site's own CTA arrived in the
  mailbox, and a reply sent from it arrived back. That closes the one failure on this page
  **no check in this repository can detect** — check 15 verifies the link survives the
  edge intact, not that anyone is reading what it sends. It is also a precondition for the
  external monitor, whose alerts go to that address; a monitor configured before the
  mailbox was proved would have been reporting to nobody.

  **The nameserver move destroys what is there now.** Measured 2026-08-09: `ordoia.com`
  carries MX records at `eforward1–5.registrar-servers.com` and Namecheap's SPF include —
  their free Email Forwarding, which is **only available on Namecheap's own BasicDNS,
  PremiumDNS or FreeDNS**. Pointing the nameservers at Cloudflare ends it. So the mailbox
  is not a step that happens *after* the migration; its records have to be in
  `tools/dns-plan.json` and applied *before* it, or there is a window with MX records
  pointing at a service that no longer accepts the mail — which is worse than none,
  because it accepts the message and drops it.

  Decided 2026-08-09: **Namecheap Private Email**, so replies come *from* the address with
  aligned SPF and DKIM. Take its exact MX, SPF and DKIM values from the Private Email panel
  after purchase and put them in the plan; do not copy them from memory or from here.
- **Whether to also hold `ordoia.co.uk`.** The domain is printed on the face of every
  scorecard and cannot be changed afterwards, only redirected. Ordoia is positioned as a
  UK practice and `.co.uk` carries that signal where `.com` does not. Registering it and
  301-ing it here costs about £10/yr and forecloses the regret; it is recorded in
  `src/_data/site.json` under `formerDomains`, which is where its redirect would come
  from. Cheap now, unavailable later.
