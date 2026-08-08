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

Both files use the syntax **Netlify and Cloudflare Pages read natively and
identically**, which is why this repo does not pick one. Nothing has to be rewritten
to move between them, and that is deliberate: §9 asks for permanence to survive the
host.

---

## The build needs a browser

`npm run build` is two steps:

```bash
eleventy                     # HTML, CSS, fonts, sitemap, robots, 404
node tools/build-pdf.mjs     # the scorecard PDF, rendered from the built site
```

The second needs Chromium, because §6 requires the PDF to be *generated in the build,
not exported by hand*. That shapes the deploy choice more than anything else here.

**Recommended: build in CI, deploy the artifact.**

```yaml
# .github/workflows/deploy.yml — sketch, not yet committed
- uses: actions/setup-node@v4
  with: { node-version: '22' }
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: npm run build
- run: npm test                      # the gate. 45 checks. Do not deploy on red.
- # then publish _site/ to the host
```

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

## Cloudflare Pages

1. Connect the repository, or `npx wrangler pages deploy _site`.
2. Build output directory: `_site`.
3. Custom domain → `ordoia.co.uk`. TLS is issued automatically; set SSL/TLS mode to
   **Full (strict)**.
4. `_headers` and `_redirects` are picked up from the output directory with no further
   configuration.

## Netlify

1. Connect the repository, or `npx netlify deploy --prod --dir=_site`.
2. Publish directory: `_site`.
3. Custom domain → `ordoia.co.uk`, then **Verify DNS configuration** and let it
   provision the certificate.
4. `_headers` and `_redirects` are picked up from the publish directory.

Either way, do **not** enable the host's analytics, form handling, or edge functions.
§9 is explicit: no cookies, no client-side analytics, no tag manager, no pixel — which
is what lets the site ship with no consent banner. A practice that publishes a
redaction rule cannot run a tracker it has not disclosed.

---

## Verify the deploy, not the build

Check 14 reads the files the build emits. It cannot see what a host actually returns —
a host that silently ignored `_headers` would pass every test here and fail in
production. These four commands close that gap and belong to the deploy:

```bash
# 1. The headers are actually on the wire.
curl -sI https://ordoia.co.uk/ | grep -iE 'content-security-policy|strict-transport|referrer-policy|permissions-policy|x-content-type'

# 2. The printed permanent address resolves. This is the one that matters most.
curl -sI https://ordoia.co.uk/oal/v1.0 | head -1     # expect 200, or 301 then 200
curl -sIL https://ordoia.co.uk/oal/v1.0 | grep -E '^HTTP'

# 3. The version path is cached immutably and the live one is not.
curl -sI https://ordoia.co.uk/oal/v1.0/styles.css | grep -i cache-control   # immutable
curl -sI https://ordoia.co.uk/styles.css          | grep -i cache-control   # short

# 4. Nothing leaves the origin. Should print only ordoia.co.uk.
curl -s https://ordoia.co.uk/oal/ | grep -oE 'https?://[a-z0-9.-]+' | sort -u
```

Run 2 again after **every** deploy, and after any DNS or host change. It is the single
assertion this site's whole permanence argument rests on.

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

---

## Uptime and certificate monitoring

§9 asks for both. Whatever you use, monitor **`https://ordoia.co.uk/oal/v1.0`**
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
