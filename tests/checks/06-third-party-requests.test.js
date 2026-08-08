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

test('check 6 — every runtime request stays on our own origin', async () => {
  const ledger = await ledgerFor(6);
  const offOrigin = [];

  await withSite(async ({ origin, pages, browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('request', (req) => {
      const url = req.url();
      if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('about:')) return;
      offOrigin.push({ page: page.url().replace(origin, '') || '/', url, type: req.resourceType() });
    });

    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'networkidle' });
    }
    await context.close();
  });

  const violations = offOrigin
    .filter((r) => !ledger.allows(r.page, r.url))
    .map((r) => `${r.page}: ${r.type} -> ${r.url}`);

  // De-duplicate; the same font CSS on seven pages is one defect, not seven.
  const unique = [...new Set(violations)].sort();

  assert.deepEqual(
    unique,
    [],
    `runtime requests left our origin — the no-consent-banner claim depends on this ` +
      `being empty:\n  ${unique.join('\n  ')}`
  );
  assert.deepEqual(ledger.unused().map((a) => a.id), [], 'stale check-6 allowances');
});

test('check 6 — no off-origin references in the markup either', async () => {
  // A request that never fires because the resource 404s is still a disclosure
  // of intent, and a preconnect fires a DNS lookup and a TLS handshake without
  // ever appearing as a resource request.
  const { withSource } = await import('../lib/harness.js');
  const ledger = await ledgerFor(6);
  const violations = [];

  await withSource(({ sources }) => {
    for (const { url, html } of sources) {
      const attrs = [...html.matchAll(/\b(?:href|src|srcset|action|data-src)\s*=\s*["']([^"']+)["']/gi)];
      for (const m of attrs) {
        const value = m[1].trim();
        if (!/^(https?:)?\/\//i.test(value)) continue;
        // A link a human clicks is not a runtime request.
        const isAnchorHref = new RegExp(`<a\\b[^>]*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(html);
        if (isAnchorHref) continue;
        if (ledger.allows(url, value)) continue;
        violations.push(`${url}: ${value}`);
      }
    }
  });

  const unique = [...new Set(violations)].sort();
  assert.deepEqual(
    unique,
    [],
    `off-origin subresource references in markup:\n  ${unique.join('\n  ')}`
  );
});
