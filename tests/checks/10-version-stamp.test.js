/**
 * Check 10 — version stamp.
 *
 * BRIEF.md §3 check 10: "Any page rendering a level, threshold or dimension name
 * without the OAL version identifier in scope."
 *
 * oal.html states the reason in its own words: "A score is a statement about a
 * named system, under a named rubric version, on a date, at a named depth.
 * Dropping any of the four makes it something else." changelog.html adds: "A
 * level means nothing without one."
 *
 * So a page that names OAL 2, or names a dimension, or names a readiness
 * threshold, and does not say which version of the rubric it means, is making a
 * statement that cannot be checked against anything. This is the cheapest of the
 * twelve checks and it defends the most expensive claim on the site: that a
 * scorecard issued in 2026 can still be read in 2032 against the criteria it was
 * awarded under.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSite } from '../lib/harness.js';
import { ledgerFor } from '../lib/allowances.js';
import { survey } from '../lib/population.js';

/** Anything that constitutes a rubric claim needing a version behind it. */
const CLAIM_PATTERNS = [
  { name: 'a level', re: /\bOAL\s*[0-3]\b/ },
  { name: 'a depth', re: /\b(?:inspected|tested|sustained)\s+depth\b/i },
  { name: 'a readiness threshold', re: /\b(?:client-facing|auditor-|regulator-facing|internal use)\b/i },
  {
    name: 'a dimension name',
    re: /\b(?:grounding and entailment|tool-use integrity|authorisation and data boundary|refusal and instruction-boundary robustness|evaluation discipline|model and upgrade control|observability and failure detection|execution bounds and cost attribution)\b/i,
  },
];

/** The version identifier, in any of the forms the copy uses. */
const VERSION = /\bOAL\s*v\d+\.\d+\b|\bv\d+\.\d+\b|\/oal\/v\d+\.\d+/i;

test('check 10 — no page states a level, depth, threshold or dimension without a version in scope', async () => {
  const ledger = await ledgerFor(10);
  const violations = [];
  const s = survey({
    pages: 'pages loaded',
    claiming: 'pages stating a level, depth, threshold or dimension',
  });

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      s.count('pages');
      const text = await page.evaluate(() => document.body.innerText || '');

      const claims = CLAIM_PATTERNS.filter(({ re }) => re.test(text));
      if (claims.length === 0) continue;
      s.count('claiming');

      if (!VERSION.test(text)) {
        if (ledger.allows(url, 'missing-version')) continue;
        violations.push(
          `${url}: states ${claims.map((c) => c.name).join(', ')} but carries no OAL version identifier anywhere`
        );
      }
    }
    await page.close();
  });

  s.failAll(violations);
  s.report(`a rubric claim with no version behind it:\n  ${violations.join('\n  ')}`);
  assert.deepEqual(ledger.unused().map((a) => a.id), [], 'stale check-10 allowances');
});

test('check 10 — every scorecard stamp names its version inline, not just on the page', async () => {
  // Page-level scope is enough for prose. It is not enough for a scorecard row:
  // the artifact gets photographed, cropped, and pasted into a slide, and a
  // stamp that relies on a version printed two feet up the page does not
  // survive that. RATIONALE.md makes the stamp carry the version for exactly
  // this reason.
  const violations = [];
  const s = survey({ pages: 'pages loaded', stamps: 'scorecard stamps found' });

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      s.count('pages');
      const stamps = await page.evaluate(() =>
        [...document.querySelectorAll('.paper .stamp, .sheetpaper .stamp')].map((s) => (s.textContent || '').trim())
      );
      s.count('stamps', stamps.length);
      for (const stamp of stamps) {
        // A row that was not assessed has no level, so it needs no version.
        if (/^no level\b/i.test(stamp)) continue;
        if (!VERSION.test(stamp)) {
          violations.push(`${url}: scorecard stamp without a version — "${stamp.slice(0, 100)}"`);
        }
      }
    }
    await page.close();
  });

  s.failAll(violations);
  s.report(`scorecard stamps missing their version:\n  ${violations.join('\n  ')}`);
});

test('check 10 — the version identifier is one value, not several', async () => {
  // A site that says v1.0 in one place and v1.1 in another has no version at
  // all. This catches a half-applied bump, which §10 says must be additive:
  // "publishing v1.1 adds a snapshot, a changelog entry and a current-pointer
  // move, and touches nothing else."
  //
  // This test is the specification the rest of the suite was fixed against: it guards its
  // Set with `size > 0` *before* asserting `size === 1`. Check 4's geometry test made the
  // same assertion as `size <= 1` and had no guard, so zero satisfied it.
  const versions = new Set();
  const s = survey({ pages: 'live pages loaded', versions: 'distinct OAL versions named' });

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    for (const { url } of pages) {
      // Frozen snapshots legitimately carry their own older version.
      if (/\/oal\/v\d+\.\d+/.test(url)) continue;
      await page.goto(origin + url, { waitUntil: 'load' });
      s.count('pages');
      const text = await page.evaluate(() => document.body.innerText || '');
      for (const m of text.matchAll(/\bOAL\s*v(\d+\.\d+)\b/gi)) versions.add(m[1]);
    }
    await page.close();
  });

  s.count('versions', versions.size);
  if (versions.size > 1) {
    s.fail(`the live pages disagree about which rubric version is current: v${[...versions].join(', v')}`);
  }
  s.report('the live pages must name exactly one current rubric version');
});
