/**
 * Check 15 — the host serves what the build made.
 *
 * Check 14 states its own limit in its header: it reads the files the build emits,
 * not the responses a host returns. A host that silently dropped `_headers`, or an
 * edge that rewrote the HTML on its way out, would pass every check in this suite
 * and fail in production. This check closes that gap, and it is the only one here
 * that cannot run without a live deployment.
 *
 *   ORDOIA_LIVE=https://ordoia.com npm test
 *
 * Skipped when `ORDOIA_LIVE` is unset, so `npm test` stays hermetic and keeps
 * gating CI. That is deliberate: a check that needs the internet to pass must not
 * be able to block a build by being offline.
 *
 * Why byte-equality rather than a list of things not to inject: the hosts this site
 * can run on all rewrite HTML under some configuration. Cloudflare's Email Address
 * Obfuscation is on by default on every new zone, rewrites `mailto:` links, and
 * injects `email-decode.min.js` — which this site's own `script-src 'none'` then
 * blocks, leaving the services CTA dead and a CSP violation on every load. Rocket
 * Loader, analytics beacons and minifiers fail the same way. Enumerating them dates
 * badly. Comparing the bytes does not.
 *
 * §13 item 6 is the standard: "Nothing the site says about itself — no third-party
 * requests, no tracking, no gate, permanent addresses — is true only by convention."
 * Until this check runs green against the real host, all of it is convention.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { TARGET, htmlFiles, urlFor, SITE } from '../lib/harness.js';
import { evaluateHeaders, parseHeadersFile } from '../lib/posture.js';
import { survey } from '../lib/population.js';

const LIVE = process.env.ORDOIA_LIVE?.replace(/\/+$/, '');
const SKIP = 'set ORDOIA_LIVE=https://<host> to check what a host actually returns';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * How long a single request may take before it counts as a failure.
 *
 * There is a timeout here because the first run of this check did not have one, and
 * took 95 seconds per assertion against a parked domain that accepted the connection
 * and then said nothing. A check that hangs is worse than a check that fails: in CI
 * it burns the job's whole budget and reports nothing about why.
 */
const TIMEOUT_MS = Number(process.env.ORDOIA_LIVE_TIMEOUT_MS || 10_000);

/**
 * Fetch a path from the live site.
 *
 * Network failure is returned rather than thrown, so an unreachable host produces
 * the assertion's own message instead of an unhandled rejection three frames away.
 */
async function live(pathname, init = {}) {
  try {
    const res = await fetch(LIVE + pathname, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...init,
    });
    return { ok: true, res };
  } catch (err) {
    // `err.name` is tested first on purpose. A timed-out fetch is a DOMException whose
    // `code` is the numeric 23, so reading `code` before `name` reports "23" and loses
    // the one fact worth having — that the host accepted the connection and said nothing.
    if (err.name === 'TimeoutError') return { ok: false, error: `no response in ${TIMEOUT_MS}ms` };
    return { ok: false, error: err.cause?.code || err.cause?.message || err.code || err.message };
  }
}

async function liveText(pathname) {
  const r = await live(pathname);
  if (!r.ok) return { error: r.error };
  return { status: r.res.status, body: await r.res.text(), headers: r.res.headers };
}

/** Every URL the sitemap lists, as site-relative paths. */
async function sitemapPaths() {
  const xml = await readFile(path.join(TARGET, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map((m) => m[1] || '/');
}

test('check 15 — the bytes served are the bytes built', async (t) => {
  if (!LIVE) return t.skip(SKIP);

  const mismatched = [];
  const unreachable = [];
  // Both result arrays start empty and are supposed to end empty, so an empty
  // `htmlFiles()` makes the strongest assertion in the suite pass having compared nothing.
  // That is not hypothetical here: this check runs in CI immediately after a deploy, where
  // a wrong working directory or an output directory that moved would produce exactly that
  // — and report the deploy as byte-perfect.
  const s = survey({ compared: 'built pages compared against the host' });

  for (const file of await htmlFiles()) {
    const url = urlFor(file);
    if (url === '/404.html') continue; // not served at its own path; asserted separately below
    s.count('compared');

    const built = await readFile(path.join(TARGET, file));
    const r = await live(url);
    if (!r.ok) {
      unreachable.push(`${url} — ${r.error}`);
      continue;
    }
    if (r.res.status !== 200) {
      unreachable.push(`${url} — HTTP ${r.res.status}`);
      continue;
    }

    const served = Buffer.from(await r.res.arrayBuffer());
    if (sha256(served) !== sha256(built)) {
      mismatched.push(`${url} — built ${built.length}B, served ${served.length}B`);
    }
  }

  s.failAll(unreachable.map((u) => `unreachable: ${u}`));
  s.failAll(
    mismatched.map((m) => `byte mismatch: ${m}`)
  );
  s.report(
    `the host is not serving what the build made. Either a page did not come back, or ` +
      `something between the build and the browser rewrote the HTML — an edge feature, a ` +
      `minifier, or an injected script.`
  );
});

test('check 15 — the services CTA survives the edge intact', async (t) => {
  if (!LIVE) return t.skip(SKIP);

  const { error, status, body } = await liveText('/services/');
  assert.ok(!error, `/services/ is unreachable — ${error}`);
  assert.equal(status, 200, `/services/ returned HTTP ${status}`);

  // Subsumed by the byte check above; kept separate because this is the £2,500
  // conversion path and it deserves to fail by name rather than as a hash mismatch.
  assert.ok(
    body.includes(`mailto:${SITE.email}`),
    `the services page no longer carries mailto:${SITE.email}. This is the only ` +
      `conversion path on the site.`
  );
  assert.ok(
    !body.includes('/cdn-cgi/l/email-protection'),
    `the CTA has been rewritten to /cdn-cgi/l/email-protection. Cloudflare's Email ` +
      `Address Obfuscation is on — turn it off in the zone (Security > Settings). ` +
      `Its decode script is blocked by this site's own script-src 'none', so the ` +
      `link is dead rather than obfuscated.`
  );
});

test('check 15 — nothing on the wire runs JavaScript', async (t) => {
  if (!LIVE) return t.skip(SKIP);

  const offenders = [];
  for (const pathname of await sitemapPaths()) {
    const { error, body } = await liveText(pathname);
    if (error) {
      offenders.push(`${pathname} — unreachable (${error})`);
      continue;
    }
    if (/<script[\s>]/i.test(body)) offenders.push(`${pathname} — carries a <script> tag`);
    if (body.includes('/cdn-cgi/')) offenders.push(`${pathname} — carries a /cdn-cgi/ reference`);
  }

  assert.deepEqual(
    offenders,
    [],
    `check 6 is green on the build, so anything here was added by the host:\n  ${offenders.join('\n  ')}`
  );
});

test('check 15 — every printed permanent address resolves', async (t) => {
  if (!LIVE) return t.skip(SKIP);

  // §9: "A published version returning 404 is the most serious operational failure
  // this site can have." `/oal/v1.0` is printed on the face of every scorecard ever
  // issued under OAL v1.0, and is typed by hand years later.
  const printed = ['/oal/v1.0', ...(await sitemapPaths())];
  const broken = [];

  for (const pathname of [...new Set(printed)]) {
    const r = await live(pathname);
    if (!r.ok) broken.push(`${pathname} — unreachable (${r.error})`);
    else if (r.res.status !== 200) broken.push(`${pathname} — HTTP ${r.res.status}`);
  }

  assert.deepEqual(
    broken,
    [],
    `a permanent address does not resolve on the live host:\n  ${broken.join('\n  ')}`
  );
});

test('check 15 — the security headers are on the wire, not just in the file', async (t) => {
  if (!LIVE) return t.skip(SKIP);

  const r = await live('/');
  assert.ok(r.ok, `the site root is unreachable — ${r.error}`);
  const got = r.res.headers;

  // The same evaluator check 14 runs over `_headers`, backed by a live Headers object
  // instead of a parsed block. Each check used to write its own pass over the shared
  // table, and check 14's was wrong — see the header of tests/lib/posture.js. One
  // evaluator is the only way the file-level and wire-level verdicts cannot drift.
  const findings = evaluateHeaders((name) => got.get(name.toLowerCase()));
  assert.deepEqual(
    findings,
    [],
    `what the host returns does not match the posture the build declared:\n  ` +
      `${findings.join('\n  ')}\n` +
      `_headers is in the deploy directory; either the host did not apply it, or it ` +
      `applied it and then widened the result.`
  );

  // Cloudflare Pages adds `Access-Control-Allow-Origin: *` to every static response
  // unless `_headers` removes it. Nothing here is meant to be read cross-origin.
  assert.equal(
    got.get('access-control-allow-origin'),
    null,
    `the host is sending Access-Control-Allow-Origin: ${got.get('access-control-allow-origin')}. ` +
      `Remove it with "! Access-Control-Allow-Origin" in _headers.`
  );
});

test('check 15 — a missing page is a real 404, and still carries the policy', async (t) => {
  if (!LIVE) return t.skip(SKIP);

  const r = await live('/this-page-does-not-exist-' + Date.now());
  assert.ok(r.ok, `the host is unreachable — ${r.error}`);

  // Cloudflare Pages falls back to single-page-app behaviour — every unknown path
  // returns `/index.html` with HTTP 200 — when no top-level 404.html is deployed.
  // This site builds one; a 200 here means it did not ship.
  assert.equal(
    r.res.status,
    404,
    `a missing page returned HTTP ${r.res.status}, not 404. A soft 404 tells crawlers ` +
      `every mistyped address is a real page, and hides genuinely broken links.`
  );

  assert.ok(
    r.res.headers.get('content-security-policy'),
    `the 404 response carries no Content-Security-Policy. Whether _headers applies to ` +
      `404s is undocumented on Cloudflare Pages — this check is how we know.`
  );
});

test('check 15 — the cache split survives the host', async (t) => {
  if (!LIVE) return t.skip(SKIP);

  const blocks = parseHeadersFile(await readFile(path.join(TARGET, '_headers'), 'utf8'));
  const versioned = blocks.find((b) => /^\/oal\/v\d+\.\d+\//.test(b.pattern));
  assert.ok(versioned, 'no version-path block in _headers to verify against');

  const frozen = await live('/oal/v1.0/styles.css');
  assert.ok(frozen.ok, `/oal/v1.0/styles.css is unreachable — ${frozen.error}`);
  assert.match(
    frozen.res.headers.get('cache-control') || '',
    /immutable/,
    `the frozen version asset is not served immutable. Cloudflare Pages defaults static ` +
      `responses to "public, max-age=0, must-revalidate"; this means _headers did not override it.`
  );

  const current = await live('/styles.css');
  assert.ok(current.ok, `/styles.css is unreachable — ${current.error}`);
  assert.doesNotMatch(
    current.res.headers.get('cache-control') || '',
    /immutable/,
    'the live stylesheet is served immutable, so a correction would never reach a returning reader'
  );
});
