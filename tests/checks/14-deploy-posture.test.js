/**
 * Check 14 — deploy posture.
 *
 * BRIEF.md §9: "Static host, custom domain, TLS, HSTS. Security headers: a CSP that
 * permits only own origin (check 6 makes this achievable), Referrer-Policy,
 * Permissions-Policy, X-Content-Type-Options." §5 adds `sitemap.xml`, `robots.txt`,
 * a real 404, and long-lived immutable caching on version paths.
 *
 * Every one of those is a claim the site makes about itself, and §13 item 6 is the
 * standard it is judged against: "Nothing the site says about itself — no third-party
 * requests, no tracking, no gate, permanent addresses — is true only by convention."
 *
 * A header file nobody parses is a convention. This parses it.
 *
 * What this check CANNOT establish, stated because the rubric would ask: it reads the
 * files the build emits, not the responses a host returns. A host that silently drops
 * `_headers` would pass here and fail in production. The one-line curl that closes
 * that gap is in DEPLOY.md, and it belongs to the deploy rather than to the build.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { TARGET, REPO_ROOT, IS_HANDOVER, htmlFiles, urlFor, SITE, printedAddresses } from '../lib/harness.js';

const read = (name) => readFile(path.join(TARGET, name), 'utf8');

import {
  REQUIRED_HEADERS,
  HSTS_FLOOR_SECONDS,
  parseCsp,
  cspWidenings,
  evaluateHeaders,
  parseHeadersFile,
  headersFromBlock,
  overlappingDeclarations,
} from '../lib/posture.js';
import { survey } from '../lib/population.js';

test('check 14 — the security headers exist and say what §9 requires', async (t) => {
  if (IS_HANDOVER) return t.skip('the handover ships no deploy configuration — that is the point');

  assert.ok(
    existsSync(path.join(TARGET, '_headers')),
    'no _headers in the build. §9 requires HSTS, a CSP permitting only own origin, ' +
      'Referrer-Policy, Permissions-Policy and X-Content-Type-Options, and a header ' +
      'file that is not deployed is a header that does not exist.'
  );

  // Parsed into blocks, not scanned line by line.
  //
  // This test used to find each header with `lines.find(l => l.startsWith(name + ':'))`,
  // which takes the first occurrence of a name **anywhere in the file** regardless of the
  // path it is scoped to. A Content-Security-Policy declared only under `/oal/v1.0/*`
  // satisfied this check for the whole site — the rubric page defended, and the eight
  // pages carrying the £2,500 CTA not. The controls test below pins that case.
  const blocks = parseHeadersFile(await read('_headers'));

  const s = survey({
    blocks: 'path blocks in _headers',
    policies: 'blocks carrying a Content-Security-Policy',
  });
  s.count('blocks', blocks.length);
  s.mayBeEmpty(
    'policies',
    'a build could legitimately scope every policy to /*, which declares one CSP and is ' +
      'counted below; this population exists to make the per-block widening scan visible'
  );

  const root = blocks.find((b) => b.pattern === '/*');
  assert.ok(
    root,
    'no /* block in _headers. Every path on this site has to carry the posture, so the ' +
      'default block is the one that cannot be missing.'
  );

  // The invariant, written not to depend on Cloudflare's unverified precedence between
  // two matching blocks: /* alone must satisfy §9, and no block anywhere may widen.
  // Correct under "last match wins" and under "all matching blocks apply".
  s.failAll(evaluateHeaders(headersFromBlock(root)).map((f) => `/* — ${f}`));

  for (const block of blocks) {
    const csp = block.headers.get('content-security-policy');
    if (!csp) continue;
    s.count('policies');
    s.failAll(cspWidenings(csp).map((f) => `${block.pattern} — ${f}`));
  }

  // Cloudflare joins two matching declarations of one header with a comma instead of
  // letting the narrower rule win. See overlappingDeclarations() for what that did to the
  // frozen version directory's Cache-Control, and why check 15 could not have caught it.
  s.failAll(overlappingDeclarations(blocks));

  // §2.3. Check 15 asserts Access-Control-Allow-Origin is absent on the wire and tells the
  // operator to remove it with exactly this line — and the line did not exist, in a file
  // whose parser could not have seen it either. Whether Pages sends the header at all is
  // undocumented; detaching one that was never sent costs nothing, and the alternative is
  // discovering the answer from a red check after ordoia.com has already published.
  if (!root.removals.has('access-control-allow-origin')) {
    s.fail(
      'the /* block does not detach Access-Control-Allow-Origin. Nothing here is meant to ' +
        'be read cross-origin, and check 15 fails on the wire if the host sends it.'
    );
  }

  s.report(
    `the deploy posture §9 requires is missing or has been widened past own-origin. ` +
      `Check 6 is green, so nothing on this site needs the widening — and the ` +
      `no-consent-banner posture rests on it.`
  );
});

test('check 14 — a version path is cached immutably, and nothing else declares its cache', async (t) => {
  if (IS_HANDOVER) return t.skip('no deploy configuration on the handover');

  // The same parser as above, rather than a third hand-rolled split of the same file.
  // The previous `headers.split(/\n(?=\/)/)` kept each block as raw text, so every
  // assertion below was a substring match over a comment as readily as over a directive.
  const blocks = parseHeadersFile(await read('_headers'));

  const version = blocks.find((b) => /^\/oal\/v\d+\.\d+\//.test(b.pattern));
  assert.ok(version, 'no cache rule for a version path — §5 asks for long-lived immutable caching there');

  const versionCache = version.headers.get('cache-control') ?? '';
  assert.match(
    versionCache,
    /immutable/,
    'a version path is not cached immutably. It is frozen by construction, so anything ' +
      'less is throwing away the one place caching is free.'
  );

  const versionMaxAge = Number(/max-age\s*=\s*(\d+)/.exec(versionCache)?.[1] ?? 0);
  assert.ok(
    versionMaxAge >= 2_592_000,
    `the version path cache is ${versionMaxAge}s, under the 30 days §5 asks for. The ` +
      `previous assertion matched the digit count rather than the number, the same ` +
      `defect the HSTS floor carried.`
  );

  // The /* block must declare no Cache-Control at all, and that is deliberate rather than
  // an omission. Cloudflare applies every matching block and joins repeated header values
  // with a comma, so a Cache-Control here would concatenate with the immutable rule above
  // on every asset in the frozen version directory. Current paths take Cloudflare's
  // default — `public, max-age=0, must-revalidate`, which is shorter than the 600s this
  // block used to declare, so §5's "short on current paths" holds a fortiori.
  //
  // Asserted rather than left implicit so that reinstating it is a red suite rather than a
  // plausible-looking one-line improvement.
  const root = blocks.find((b) => b.pattern === '/*');
  assert.ok(root, 'no default header block');
  assert.equal(
    root.headers.get('cache-control'),
    undefined,
    'the /* block declares a Cache-Control. Every version asset matches both /* and ' +
      '/oal/v1.0/*, and Cloudflare joins the two values rather than letting the narrower ' +
      'one win — so this would put two max-ages and a must-revalidate on the wire for the ' +
      'one directory that can never be corrected after publication. src/_headers carries ' +
      'the reasoning; §5 is satisfied by the host default, which is shorter still.'
  );
});

test('check 14 — robots, sitemap and a real 404 are all built', async (t) => {
  if (IS_HANDOVER) return t.skip('none of these exist on the handover');

  for (const file of ['robots.txt', 'sitemap.xml', '404.html']) {
    assert.ok(existsSync(path.join(TARGET, file)), `${file} is not in the build (§5)`);
  }

  // §5 asks for "a 404 that is a page rather than a host default".
  const notFound = await read('404.html');
  assert.ok(notFound.length > 2000, 'the 404 is a stub rather than a page');
  assert.match(notFound, /<main/, 'the 404 does not use the site layout');

  const robots = await read('robots.txt');
  assert.match(robots, /^Sitemap: https:\/\/\S+\/sitemap\.xml$/m, 'robots.txt does not point at the sitemap');

  // Every built page, and only built pages. A sitemap listing an address that 404s
  // is the same defect as a printed one that 404s, with a wider audience.
  const sitemap = await read('sitemap.xml');
  const listed = [...sitemap.matchAll(/<loc>https:\/\/[^/]+([^<]*)<\/loc>/g)].map((m) => m[1]).sort();
  const built = (await htmlFiles()).map(urlFor).filter((u) => u !== '/404.html').sort();

  // Both sides can go empty: `listed` if the <loc> shape changes, `built` if htmlFiles()
  // finds nothing. Two empty arrays are deepEqual, so without this the strongest assertion
  // in the test would pass on a build that produced no pages at all.
  const s = survey({ listed: 'addresses listed in sitemap.xml', built: 'HTML pages built' });
  s.count('listed', listed.length);
  s.count('built', built.length);
  if (listed.join('\n') !== built.join('\n')) {
    s.fail(
      `sitemap.xml does not match what was built.\n  listed: ${listed.join(' ')}\n  built:  ${built.join(' ')}`
    );
  }
  if (listed.includes('/404.html')) {
    s.fail('the sitemap lists the 404 page, which is a list of what does not exist');
  }
  s.report('the sitemap must list every built page and nothing else');
});

test('check 14 — every printed permanent address has an extensionless redirect', async (t) => {
  if (IS_HANDOVER) return t.skip('no deploy configuration on the handover');

  assert.ok(existsSync(path.join(TARGET, '_redirects')), 'no _redirects in the build');
  const redirects = await read('_redirects');

  // The addresses that appear as printed text rather than as hrefs are the ones a
  // human types six years from now. §9 names one of these 404ing as the most serious
  // operational failure this site can have.
  const printed = new Set();
  const { withSource } = await import('../lib/harness.js');

  // This is the guard lesson 8 produced. Without it, a domain change turns the matcher
  // into a no-op: `printed` goes empty, `unrouted` goes empty, and the assertion below
  // passes while asserting nothing — on the one check that defends §9's worst-case
  // failure. Check 9 carried it from the start; this check did not, and a domain change is
  // what exposed that. It is expressed through survey() now, and the same discipline has
  // since been applied to every other check in the suite.
  const s = survey({
    sources: 'source files scanned',
    printed: `addresses on ${SITE.domain} printed as text`,
  });

  await withSource(({ sources }) => {
    for (const { html } of sources) {
      s.count('sources');
      printedAddresses(html, printed);
    }
  });

  s.count('printed', printed.size);

  const unrouted = [...printed]
    .filter((p) => p !== '/' && !p.endsWith('/'))
    .filter((p) => !new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'm').test(redirects))
    .sort();

  s.failAll(unrouted);
  s.report(
    `a printed address has no redirect rule, so it depends on the host guessing:\n  ${unrouted.join('\n  ')}`
  );
});

test('check 14 — the scorecard ships in all three formats §6 requires', async (t) => {
  if (IS_HANDOVER) return t.skip('the handover ships HTML and markdown, not a generated PDF');

  const oal = JSON.parse(await readFile(path.join(TARGET, '..', 'src/_data/oal.json'), 'utf8'));
  const base = `scorecard/ordoia-scorecard-audit-oal-v${oal.current}`;

  assert.ok(existsSync(path.join(TARGET, 'scorecard/index.html')), 'no scorecard HTML');
  assert.ok(existsSync(path.join(TARGET, `${base}.md`)), `no ${base}.md`);
  assert.ok(
    existsSync(path.join(TARGET, `${base}.pdf`)),
    `no ${base}.pdf. §6: "The PDF is generated in the build, not exported by hand." ` +
      `Run npm run build rather than eleventy alone.`
  );

  const pdf = await readFile(path.join(TARGET, `${base}.pdf`));
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-', 'the scorecard PDF is not a PDF');
  assert.ok(pdf.length > 10_000, `the scorecard PDF is implausibly small (${pdf.length} bytes)`);

  // A4 at 72pt/inch is 595.276 x 841.89. Read the first MediaBox out of the file
  // rather than trusting the flag that asked for it.
  const box = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  assert.ok(box, 'the PDF declares no MediaBox');
  const width = parseFloat(box[3]);
  const height = parseFloat(box[4]);
  assert.ok(
    Math.abs(width - 595.28) < 2 && Math.abs(height - 841.89) < 2,
    `the scorecard PDF is ${width}x${height}pt, not A4 (595.28x841.89pt). It gets printed.`
  );
});

/**
 * The posture controls, modelled on check 4's.
 *
 * Everything above asserts the shipped posture is intact. Nothing above would notice if
 * the evaluator itself stopped discriminating — and a tightening cannot be trusted until
 * it has been shown to reject the thing it was written to reject and to accept the thing
 * the site actually ships.
 *
 * This is also how every future tightening gets proven without touching production: add
 * the widening here as a must-catch, watch it fail, then tighten.
 *
 * It reads no site and no build, so it is correctly out of check 16's scope.
 */
test('check 14 — the posture evaluator still tells a widening from the shipped policy (controls)', async () => {
  // REPO_ROOT, not TARGET: these are controls over the evaluator and the policy this repo
  // ships, so they mean the same thing whichever target the suite was pointed at. They are
  // the one part of check 14 that stays live on the handover and on the empty fixture.
  const shipped = await readFile(path.join(REPO_ROOT, 'src/_headers'), 'utf8');
  const shippedCsp = parseHeadersFile(shipped)
    .find((b) => b.pattern === '/*')
    .headers.get('content-security-policy');
  assert.ok(shippedCsp, 'src/_headers has no CSP under /* to use as the must-permit control');

  // ── CSP widenings that must be caught ──────────────────────────────────────────────
  //
  // The first two are the reason this exists. The old detector anchored on `//`, so
  // `script-src example.com` — a bare authority, which is valid CSP and permits an
  // off-origin script — went through unflagged.
  const mustCatch = [
    ["script-src example.com", 'a bare authority host'],
    ["script-src https://cdn.example.com", 'a scheme-and-authority host'],
    ["script-src 'self' 'unsafe-inline'", 'inline script'],
    ["script-src 'unsafe-eval'", 'eval'],
    ["default-src *", 'a bare wildcard'],
    ["img-src *.example.com", 'a wildcard host'],
    ["style-src https:", 'a scheme-wide source, which is every host on that scheme'],
    ["script-src 'strict-dynamic'", "'strict-dynamic', which delegates trust to whatever loads"],
    ["default-src 'self'; script-src 'unsafe-hashes'", "'unsafe-hashes'"],
    ["default-src 'self'; report-uri https://collector.example.com/csp", 'an off-origin report sink'],
  ];
  for (const [csp, why] of mustCatch) {
    assert.ok(
      cspWidenings(csp).length > 0,
      `the CSP detector missed ${why}, which it must catch: ${csp}`
    );
  }

  // ── and what must not be flagged ───────────────────────────────────────────────────
  //
  // `style-src-attr 'unsafe-inline'` is the single most likely false positive in this
  // file. The build emits `style="--p:var(--p1)"` on every tick of every measure, the
  // shipped CSP permits exactly that and nothing else inline, and a naive tightening
  // turns the site red on its own design rather than on a defect.
  const mustPermit = [
    [shippedCsp, 'the shipped CSP, read from src/_headers rather than copied'],
    ["style-src-attr 'unsafe-inline'", "the tick markup's own deliberate exception"],
    ["img-src 'self' data:", 'inline image data, which fetches nothing'],
    ['upgrade-insecure-requests', 'a directive that takes no sources at all'],
    ["script-src 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='", 'a hash of our own content'],
    ["default-src 'none'; frame-ancestors 'none'", "'none' everywhere"],
    ["default-src 'self'; report-uri /csp-report", 'a report sink on our own origin'],
  ];
  for (const [csp, why] of mustPermit) {
    assert.deepEqual(
      cspWidenings(csp),
      [],
      `the CSP detector flagged ${why}, which the site ships or legitimately may: ${csp}`
    );
  }

  // ── the HSTS floor ─────────────────────────────────────────────────────────────────
  //
  // The old matcher was /max-age=\d{7,}/, which accepts 1000000 — eleven and a half
  // days, presented as a two-year commitment. Seven digits is not a duration.
  const hsts = REQUIRED_HEADERS.find((h) => h.name === 'Strict-Transport-Security');
  assert.equal(HSTS_FLOOR_SECONDS, 31_536_000, 'the HSTS floor is one year, in seconds');
  assert.notEqual(hsts.ok('max-age=1000000; includeSubDomains'), true, 'max-age=1000000 is 11.6 days');
  assert.notEqual(hsts.ok('max-age=63072000'), true, 'includeSubDomains is required (see DEPLOY.md)');
  assert.notEqual(hsts.ok('includeSubDomains'), true, 'no max-age at all');
  assert.equal(hsts.ok('max-age=63072000; includeSubDomains'), true, 'the shipped HSTS must pass');
  assert.equal(hsts.ok('max-age=31536000; includeSubDomains; preload'), true, 'exactly the floor passes');

  // ── the block-scoping defect ───────────────────────────────────────────────────────
  //
  // This is the bug that made 2.2 worth doing. Check 14 used to find a header by
  // line-prefix across the whole file, so a CSP declared only under /oal/v1.0/* satisfied
  // the check for every path on the site — including the eight pages that had none.
  const scopedOnly = [
    '/oal/v1.0/*',
    `  Content-Security-Policy: ${shippedCsp}`,
    '  Strict-Transport-Security: max-age=63072000; includeSubDomains',
    '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: geolocation=()',
    '  X-Content-Type-Options: nosniff',
    '',
    '/*',
    '  Cache-Control: public, max-age=600, must-revalidate',
  ].join('\n');
  const scopedBlocks = parseHeadersFile(scopedOnly);
  const root = scopedBlocks.find((b) => b.pattern === '/*');
  assert.ok(root, 'the control fixture must still have a /* block for the evaluator to read');
  assert.notDeepEqual(
    evaluateHeaders(headersFromBlock(root)),
    [],
    'a posture declared only under /oal/v1.0/* must not satisfy the whole site. This is the ' +
      'defect the line-prefix .find() had: it took the first occurrence of a header name ' +
      'anywhere in the file, whatever path it was scoped to.'
  );

  // ── the parser's own assumptions ───────────────────────────────────────────────────
  const { directives, duplicated } = parseCsp("default-src 'self'; script-src 'none'; upgrade-insecure-requests");
  assert.deepEqual(directives.get('default-src'), ["'self'"]);
  assert.deepEqual(directives.get('upgrade-insecure-requests'), [], 'a valueless directive parses to no sources');
  assert.deepEqual(duplicated, []);

  // CSP takes the *first* occurrence of a directive and ignores the rest, so a repeat is
  // never a widening on the wire — but it is always a defect, and the day the first one
  // is deleted it silently becomes one. Reported, not ignored.
  const repeated = parseCsp("script-src 'none'; script-src 'unsafe-inline'");
  assert.deepEqual(repeated.directives.get('script-src'), ["'none'"], 'first occurrence wins, per spec');
  assert.deepEqual(repeated.duplicated, ['script-src']);
  assert.ok(
    cspWidenings("script-src 'none'; script-src 'unsafe-inline'").length > 0,
    'a repeated directive must be reported even though the browser ignores the second'
  );

  // Removal syntax. §2.3: check 15 tells the operator to remove a header with
  // `! Access-Control-Allow-Origin`, and the parser could not see such a line at all —
  // it has no colon, and every colon-less line was dropped.
  const withRemoval = parseHeadersFile(['/*', '  ! Access-Control-Allow-Origin', '  X-Content-Type-Options: nosniff'].join('\n'));
  assert.deepEqual([...withRemoval[0].removals], ['access-control-allow-origin']);
  assert.equal(withRemoval[0].headers.get('x-content-type-options'), 'nosniff');

  // ── overlapping declarations ───────────────────────────────────────────────────────
  //
  // The exact shape this site shipped until it was measured against Cloudflare's
  // documentation. Pinned as a control because the joined value is *plausible* — it
  // contains the word `immutable`, so the check that reads it on the wire stays green.
  const overlapping = parseHeadersFile(
    [
      '/*',
      '  Cache-Control: public, max-age=600, must-revalidate',
      '/oal/v1.0/*',
      '  Cache-Control: public, max-age=31536000, immutable',
    ].join('\n')
  );
  const overlaps = overlappingDeclarations(overlapping);
  assert.equal(overlaps.length, 1, 'a header declared under both /* and /oal/v1.0/* must be caught');
  assert.match(overlaps[0], /cache-control/);
  assert.match(
    overlaps[0],
    /max-age=600, must-revalidate, public, max-age=31536000, immutable/,
    'the finding has to show the joined value, because that string still contains ' +
      '"immutable" and is why check 15 would have stayed green over it'
  );

  // Patterns that cannot both match one request must not be flagged. /oal/v1.0/fonts/ is
  // not under /fonts/, which is what lets the frozen copies take the immutable rule while
  // the live ones take a week.
  assert.deepEqual(
    overlappingDeclarations(
      parseHeadersFile(
        [
          '/fonts/*',
          '  Cache-Control: public, max-age=604800',
          '/oal/v1.0/*',
          '  Cache-Control: public, max-age=31536000, immutable',
        ].join('\n')
      )
    ),
    [],
    'two disjoint prefixes must not be reported as overlapping'
  );

  // Different header names under overlapping patterns are fine — that is inheritance
  // working as documented, and it is how /* carries the posture for every path.
  assert.deepEqual(
    overlappingDeclarations(
      parseHeadersFile(
        ['/*', '  X-Content-Type-Options: nosniff', '/oal/v1.0/*', '  Cache-Control: immutable'].join('\n')
      )
    ),
    []
  );
});
