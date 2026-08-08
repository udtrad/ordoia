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
import { TARGET, IS_HANDOVER, htmlFiles, urlFor } from '../lib/harness.js';

const read = (name) => readFile(path.join(TARGET, name), 'utf8');

/** Directives that must be present, and the shape each must have. */
const REQUIRED_HEADERS = [
  { name: 'Content-Security-Policy', must: /default-src 'self'/ },
  { name: 'Strict-Transport-Security', must: /max-age=\d{7,}/ },
  { name: 'Referrer-Policy', must: /no-referrer|strict-origin/ },
  { name: 'Permissions-Policy', must: /geolocation=\(\)/ },
  { name: 'X-Content-Type-Options', must: /nosniff/ },
];

/** Widenings that would quietly undo the posture. */
const FORBIDDEN_IN_CSP = [
  { name: "script-src permitting inline or eval", re: /script-src[^;]*(?:'unsafe-inline'|'unsafe-eval')/ },
  { name: 'a wildcard source', re: /(?:^|[\s;])(?:default|script|style|img|font|connect|frame)-src[^;]*\*/ },
  { name: 'an off-origin host', re: /(?:https?:)?\/\/(?!')[a-z0-9.-]+\.[a-z]{2,}/i },
];

test('check 14 — the security headers exist and say what §9 requires', async (t) => {
  if (IS_HANDOVER) return t.skip('the handover ships no deploy configuration — that is the point');

  assert.ok(
    existsSync(path.join(TARGET, '_headers')),
    'no _headers in the build. §9 requires HSTS, a CSP permitting only own origin, ' +
      'Referrer-Policy, Permissions-Policy and X-Content-Type-Options, and a header ' +
      'file that is not deployed is a header that does not exist.'
  );

  const headers = await read('_headers');
  const missing = REQUIRED_HEADERS.filter(({ name, must }) => {
    const line = headers.split('\n').find((l) => l.trim().startsWith(name + ':'));
    return !line || !must.test(line);
  }).map((h) => h.name);

  assert.deepEqual(missing, [], `security headers missing or malformed: ${missing.join(', ')}`);

  const csp = headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:')) || '';
  const widened = FORBIDDEN_IN_CSP.filter(({ re }) => re.test(csp)).map((f) => f.name);
  assert.deepEqual(
    widened,
    [],
    `the CSP has been widened past own-origin: ${widened.join(', ')}. Check 6 is green, ` +
      `so nothing on this site needs it — and the no-consent-banner posture rests on it.`
  );
});

test('check 14 — a version path is cached immutably and a current path is not', async (t) => {
  if (IS_HANDOVER) return t.skip('no deploy configuration on the handover');

  const headers = await read('_headers');
  const blocks = headers.split(/\n(?=\/)/);

  const version = blocks.find((b) => /^\/oal\/v\d+\.\d+\//.test(b));
  assert.ok(version, 'no cache rule for a version path — §5 asks for long-lived immutable caching there');
  assert.match(
    version,
    /Cache-Control:.*immutable/,
    'a version path is not cached immutably. It is frozen by construction, so anything ' +
      'less is throwing away the one place caching is free.'
  );
  assert.match(version, /max-age=(?:2592000|31536000|\d{8,})/, 'the version path cache is not long-lived');

  const root = blocks.find((b) => b.trim().startsWith('/*'));
  assert.ok(root, 'no default header block');
  assert.doesNotMatch(
    root,
    /Cache-Control:.*immutable/,
    'current paths are cached immutably, so a correction to the live rubric would not reach ' +
      'a reader who had already visited. §5: short on current paths.'
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

  assert.deepEqual(
    listed,
    built,
    `sitemap.xml does not match what was built.\n  listed: ${listed.join(' ')}\n  built:  ${built.join(' ')}`
  );
  assert.ok(!listed.includes('/404.html'), 'the sitemap lists the 404 page, which is a list of what does not exist');
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
  await withSource(({ sources }) => {
    for (const { html } of sources) {
      for (const m of html.matchAll(/ordoia\.co\.uk(\/[A-Za-z0-9._~\-/]*)/g)) {
        printed.add(m[1].replace(/[.,;)]$/, '').split('#')[0]);
      }
    }
  });

  const unrouted = [...printed]
    .filter((p) => p !== '/' && !p.endsWith('/'))
    .filter((p) => !new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'm').test(redirects))
    .sort();

  assert.deepEqual(
    unrouted,
    [],
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
