/**
 * Check 6 — third-party requests.
 *
 * BRIEF.md §4: "Zero third-party runtime requests. Self-host and subset the
 * fonts... This is a performance decision and a data-protection one: no request
 * to a US font CDN means no third-party personal-data transfer, which is part of
 * why this site can ship without a consent banner."
 *
 * This is the check that makes the privacy posture true rather than stated. A
 * practice that publishes a redaction rule cannot leak a visitor's IP address to
 * a font CDN on every page load and describe itself as running no trackers.
 *
 * It is also what makes §9's own-origin CSP achievable: a CSP that permits only
 * `self` is unshippable until this check is green.
 *
 * EXPECTED RED ON THE HANDOVER: all seven pages carry a preconnect to
 * fonts.googleapis.com, a preconnect to fonts.gstatic.com, and a stylesheet
 * link to fonts.googleapis.com.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSite } from '../lib/harness.js';
import { ledgerFor } from '../lib/allowances.js';
import { survey } from '../lib/population.js';

test('check 6 — every runtime request stays on our own origin', async () => {
  const ledger = await ledgerFor(6);
  const offOrigin = [];
  // The population is *requests observed*, not off-origin requests. Those are the
  // findings, and they are supposed to be zero. A page that failed to load also makes zero
  // off-origin requests, and this check is the whole evidence for the no-consent-banner
  // posture — so it has to be able to tell "nothing left our origin" apart from "nothing
  // happened".
  const s = survey({
    pages: 'pages loaded',
    requests: 'runtime requests observed',
  });

  await withSite(async ({ origin, pages, browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('request', (req) => {
      s.count('requests');
      const url = req.url();
      if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('about:')) return;
      offOrigin.push({ page: page.url().replace(origin, '') || '/', url, type: req.resourceType() });
    });

    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'networkidle' });
      s.count('pages');
    }
    await context.close();
  });

  const violations = offOrigin
    .filter((r) => !ledger.allows(r.page, r.url))
    .map((r) => `${r.page}: ${r.type} -> ${r.url}`);

  // De-duplicate; the same font CSS on seven pages is one defect, not seven.
  const unique = [...new Set(violations)].sort();

  s.failAll(unique);
  s.report(
    `runtime requests left our origin — the no-consent-banner claim depends on this ` +
      `being empty:\n  ${unique.join('\n  ')}`
  );
  assert.deepEqual(ledger.unused().map((a) => a.id), [], 'stale check-6 allowances');
});

test('check 6 — no off-origin references in the markup either', async () => {
  // A request that never fires because the resource 404s is still a disclosure
  // of intent, and a preconnect fires a DNS lookup and a TLS handshake without
  // ever appearing as a resource request.
  //
  // Read tag by tag rather than attribute by attribute, because two kinds of
  // off-origin reference are not subresource requests and must be told apart from
  // the ones that are:
  //
  //   <a href>              a link a human clicks. Nothing is fetched until they do.
  //   <link rel="canonical"> metadata. It is required to be absolute, §5 requires
  //                         /oal to carry one, and no browser fetches it.
  //
  // Everything else carrying an off-origin URL is a subresource, and a subresource
  // is a visitor's IP address handed to somebody else on page load.
  const { withSource } = await import('../lib/harness.js');
  const ledger = await ledgerFor(6);
  const violations = [];
  const s = survey({ sources: 'source files scanned', tags: 'tags examined' });

  const METADATA_RELS = /^(canonical|alternate|author|license|me)$/i;

  await withSource(({ sources }) => {
    for (const { url, html } of sources) {
      s.count('sources');
      for (const [, rawTag, attrs] of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
        s.count('tags');
        const tag = rawTag.toLowerCase();
        if (tag === 'a') continue;

        const rel = attrs.match(/\brel\s*=\s*["']?([^"'\s>]+)/i);
        if (tag === 'link' && rel && METADATA_RELS.test(rel[1])) continue;

        for (const m of attrs.matchAll(/\b(?:href|src|srcset|action|data-src)\s*=\s*["']([^"']+)["']/gi)) {
          const value = m[1].trim();
          if (!/^(https?:)?\/\//i.test(value)) continue;
          if (ledger.allows(url, value)) continue;
          violations.push(`${url}: <${tag}> ${value}`);
        }
      }
    }
  });

  const unique = [...new Set(violations)].sort();
  s.failAll(unique);
  s.report(`off-origin subresource references in markup:\n  ${unique.join('\n  ')}`);
});
