/**
 * Check 2 — score completeness.
 *
 * BRIEF.md §2: "Every score shown carries system, version, date and depth.
 * Dropping any of the four makes it something else — including in a decorative
 * mock or a test fixture." RATIONALE.md states it as a property of the measure
 * component: the *score* variant does not render without its four values.
 *
 * Today that is a convention. §3 asks for it to be a build failure. This check
 * is the enforcement half; `src/_includes/measure.njk` throws at build time,
 * which is the other half. Both exist because the macro can only defend the
 * pages that use it, and a hand-written `.measure` would slip past.
 *
 * THE READER'S MARK IS EXEMPT, BY CONSTRUCTION AND NOT BY ALLOWANCE.
 * `.mark--reader` on the home and rubric pages is the reader placing themselves
 * on the scale — "the open mark is where you place yourself, not a score we have
 * issued". It is not an assessment, there is no system, depth or working paper
 * behind it, and demanding a four-value stamp there would force the site to
 * fabricate exactly the thing the invariant exists to prevent. The exemption is
 * written into the check so it is reviewable, rather than into a dated
 * allowance, because it is a permanent property of the design and not a
 * judgement that expires.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSite } from '../lib/harness.js';

/** The four qualifiers a stamp must carry, and how each is recognised. */
const QUALIFIERS = {
  level: /\bOAL\s*[0-3]\b|\bLevel\b/i,
  depth: /\b(inspected|tested|sustained)\b/i,
  version: /\bv\d+\.\d+\b/i,
  'working paper': /\bworking paper\b|\bWP[—\-–—]/i,
};

test('check 2 — a measure showing a score carries level, depth, version and working paper', async () => {
  const violations = [];

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });

      const measures = await page.evaluate(() =>
        [...document.querySelectorAll('.measure')].map((m, i) => ({
          index: i,
          label: m.getAttribute('aria-label') || m.querySelector('.measure__dim')?.textContent?.trim() || `measure ${i}`,
          // A mark or fill is the claim that a level has been awarded...
          hasMark: Boolean(m.querySelector('.mark')),
          // ...unless it is the reader's own open mark.
          readerOnly:
            m.querySelectorAll('.mark').length > 0 &&
            m.querySelectorAll('.mark').length === m.querySelectorAll('.mark--reader').length,
          hasFill: Boolean(m.querySelector('.fill')),
          stamp: m.querySelector('.stamp')?.textContent?.trim() || null,
        }))
      );

      for (const m of measures) {
        const claimsALevel = (m.hasMark && !m.readerOnly) || m.hasFill;
        if (!claimsALevel) continue;

        if (!m.stamp) {
          violations.push(`${url}: "${m.label}" shows a score with no stamp at all`);
          continue;
        }
        const missing = Object.entries(QUALIFIERS)
          .filter(([, re]) => !re.test(m.stamp))
          .map(([name]) => name);
        if (missing.length) {
          violations.push(`${url}: "${m.label}" stamp is missing ${missing.join(', ')} — "${m.stamp.slice(0, 90)}"`);
        }
      }
    }
    await page.close();
  });

  assert.deepEqual(
    violations,
    [],
    `a level is being shown without all four qualifiers:\n  ${violations.join('\n  ')}`
  );
});

test('check 2 — the reader mark stays a reader mark', async () => {
  // The exemption above is only safe while `.mark--reader` is visually distinct
  // from an issued score. If it ever loses its outline treatment and renders as
  // a solid ink mark, the exemption starts hiding real scores.
  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    const readerMarks = [];
    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      const marks = await page.evaluate(() =>
        [...document.querySelectorAll('.mark--reader')].map((el) => {
          const s = getComputedStyle(el);
          return { bg: s.backgroundColor, borderWidth: s.borderTopWidth, borderColor: s.borderTopColor };
        })
      );
      readerMarks.push(...marks.map((m) => ({ url, ...m })));
    }
    await page.close();

    for (const m of readerMarks) {
      assert.notEqual(
        m.bg,
        'rgb(23, 26, 26)',
        `${m.url}: .mark--reader is filled with --ink, making it indistinguishable from an issued score`
      );
      assert.ok(
        parseFloat(m.borderWidth) > 0,
        `${m.url}: .mark--reader has lost its outline, which is the only thing separating it from a score`
      );
    }
  });
});
