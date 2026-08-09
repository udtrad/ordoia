/**
 * Check 3 — banned lexicon.
 *
 * BRIEF.md §2, honesty constraints. The practice is pre-entity, pre-insurance
 * and pre-first-client, so a set of claims are not available to it: independent,
 * certified, accredited, attested, trusted by, an overall score, an average, or
 * a percentage attached to a level.
 *
 * Detection lives in tests/lib/lexicon.js and is claim-shaped rather than
 * spelling-shaped — see the note at the top of that file for why, and
 * 00-lexicon-detector.test.js for the controls that keep it honest.
 *
 * Checked in *rendered text*, not source, so a word arriving through a data file
 * or a template is caught the same as one typed into a page.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSite } from '../lib/harness.js';
import { ledgerFor } from '../lib/allowances.js';
import { survey } from '../lib/population.js';
import { findBannedLexicon } from '../lib/lexicon.js';

/**
 * The masthead, footer and title are the site's own wayfinding. "Independence"
 * there is the name of a page, not a claim about the practice, and excluding
 * the chrome is narrower and more honest than writing seven allowances for the
 * same nav link.
 */
const CHROME = 'header.masthead, footer, .skip, title';

test('check 3 — no banned lexicon in rendered text', async () => {
  const ledger = await ledgerFor(3);
  const violations = [];
  // Prose is the denominator. The detector is deliberately permissive — a banned term
  // counts only in a sentence carrying no negation — so a page that renders no text at all
  // produces no violations for exactly the wrong reason.
  const s = survey({ pages: 'pages loaded', prose: 'characters of rendered prose scanned' });

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      s.count('pages');

      const text = await page.evaluate((chromeSel) => {
        const doc = document.cloneNode(true);
        doc.querySelectorAll(chromeSel).forEach((el) => el.remove());
        doc.querySelectorAll('a').forEach((a) => {
          if (/^independence$/i.test((a.textContent || '').trim())) a.remove();
        });
        return doc.body?.innerText || doc.body?.textContent || '';
      }, CHROME);

      s.count('prose', text.trim().length);

      for (const f of findBannedLexicon(text)) {
        if (ledger.allows(url, f.match)) continue;
        violations.push(`${url}: "${f.match}" (${f.why}) — "${f.sentence.slice(0, 120)}"`);
      }
    }
    await page.close();
  });

  s.failAll(violations);
  s.report(`banned lexicon claimed rather than disclaimed:\n  ${violations.join('\n  ')}`);

  const stale = ledger.unused();
  assert.deepEqual(
    stale.map((a) => a.id),
    [],
    'allowances that matched nothing — the copy changed, so the deviation should be withdrawn ' +
      'rather than left to rot in the log'
  );
});
