/**
 * Check 17 — page weight.
 *
 * BRIEF.md §4: "no page over 150 KB compressed including fonts."
 *
 * CHECKS.md has carried that as prose since the first build — "one budget miss, measured"
 * — and prose is what §13 item 6 exists to forbid. A recorded miss decays into a fact
 * nobody rechecks; the numbers in it were measured once, by hand, and four of the nine
 * pages were never in the table at all. This makes the budget executable, so the miss is
 * either closed or logged with a date, and either way it is re-derived on every run.
 *
 * ── The three decisions, stated rather than assumed ─────────────────────────────────
 *
 * **gzip level 9 for text, raw bytes for binary.** Cloudflare serves Brotli, which is
 * measurably lighter — 3.4 KB on the rubric pages, where 87% of the weight is
 * already-compressed woff2 and only the HTML and CSS can move. Using gzip is therefore a
 * deliberate over-estimate: this check can go red while the real wire is under budget, and
 * it can never go green while the real wire is over. A budget check that errs the other
 * way is worse than none, because it certifies the thing it failed to measure.
 *
 * **150 KB is read as 150 KiB = 153,600 bytes.** §4 says "KB" and means the binary sense
 * throughout, as the recorded figures show. Declared here rather than left to whoever
 * reads it next.
 *
 * **What a browser actually fetched, not what the page links to.** The request set comes
 * from `page.on('request')` under `networkidle`, the mechanism check 6 already uses. A
 * page that links a font it never loads does not pay for it, and the scorecard PDF —
 * linked from `/scorecard/`, 270 KB — is a download rather than a subresource and would
 * otherwise fail every page that mentions it.
 *
 * ── What this cannot establish ──────────────────────────────────────────────────────
 *
 * Headless Chromium does not request `favicon.svg`. A real browser does, and it costs
 * 285 B gzipped — inside the noise here, but the figures are therefore a floor rather than
 * a total. Stated because the rubric would ask.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { withSite, TARGET, IS_HANDOVER } from '../lib/harness.js';
import { ledgerFor } from '../lib/allowances.js';
import { survey } from '../lib/population.js';

/** §4's budget, in bytes. 150 KiB. */
export const BUDGET_BYTES = 150 * 1024;

/** Extensions whose bytes a host will compress on the way out. */
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.svg', '.xml', '.txt', '.json', '.md']);

/**
 * The transfer size of one asset: gzipped if a host would compress it, raw if not.
 *
 * woff2 and PNG carry their own compression, and gzipping them again makes them very
 * slightly larger — counting the raw bytes is both correct and the conservative direction.
 */
export function transferSize(relPath, bytes) {
  return COMPRESSIBLE.has(path.extname(relPath).toLowerCase())
    ? gzipSync(bytes, { level: 9 }).length
    : bytes.length;
}

test('check 17 — no page is over the 150 KiB budget §4 sets', async (t) => {
  if (IS_HANDOVER) return t.skip('the handover predates the font pipeline the budget is about');

  const ledger = await ledgerFor(17);

  // Three populations, because each catches a different way this check could measure
  // nothing and report a green budget. `assets` and `fonts` are the ones that matter: a
  // page that failed to load fetches its own HTML and nothing else, weighs about 4 KB, and
  // would pass §4 with room to spare.
  const s = survey({
    pages: 'pages loaded',
    assets: 'assets fetched and weighed',
    fonts: 'font files fetched',
  });

  const report = [];

  await withSite(async ({ origin, pages, browser }) => {
    for (const { url } of pages) {
      const page = await browser.newPage();
      const requested = new Set();
      page.on('request', (req) => requested.add(req.url()));

      await page.goto(origin + url, { waitUntil: 'networkidle' });
      // Fonts are fetched lazily once layout decides a face is needed, and that can land
      // after the network has already gone idle once.
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState('networkidle');
      await page.close();

      s.count('pages');

      let total = 0;
      let sawStylesheet = false;
      let sawFont = false;
      const breakdown = [];

      for (const requestUrl of requested) {
        if (!requestUrl.startsWith(origin)) continue; // check 6 owns off-origin; none exist
        const rel = decodeURIComponent(new URL(requestUrl).pathname).replace(/^\/+/, '');
        const candidates = rel.endsWith('/') || rel === '' ? [path.join(rel, 'index.html')] : [rel];

        const found = candidates
          .map((c) => path.join(TARGET, c))
          .find((full) => full.startsWith(TARGET) && existsSync(full));

        if (!found) {
          s.fail(`${url}: fetched ${requestUrl}, which maps to no file under the build`);
          continue;
        }

        const size = transferSize(found, await readFile(found));
        total += size;
        s.count('assets');
        breakdown.push(`${size} B  ${new URL(requestUrl).pathname}`);

        if (found.endsWith('.css')) sawStylesheet = true;
        if (found.endsWith('.woff2')) {
          sawFont = true;
          s.count('fonts');
        }
      }

      // Per-page guards. The survey's populations are site-wide, so they would stay
      // non-empty if a single page silently stopped loading its own stylesheet.
      if (!sawStylesheet) s.fail(`${url}: fetched no stylesheet, so its weight is not the page's weight`);
      if (!sawFont) s.fail(`${url}: fetched no font, and fonts are most of this budget`);

      const kib = (total / 1024).toFixed(1);
      report.push(`${total.toString().padStart(7)} B  ${kib.padStart(6)} KiB  ${url}`);

      if (total > BUDGET_BYTES) {
        const over = total - BUDGET_BYTES;
        const message =
          `${url} is ${kib} KiB (${total} B), over the 150 KiB budget by ${over} B\n` +
          breakdown.sort((a, b) => parseInt(b, 10) - parseInt(a, 10)).map((l) => `      ${l}`).join('\n');
        if (!ledger.allows(url, 'over the 150 KiB budget')) s.fail(message);
      }
    }
  });

  console.log(`\n  page weight, gzip -9 on text and raw bytes on binary:\n${report.sort().map((r) => `    ${r}`).join('\n')}\n`);

  // The dead-entry rule is what makes the allowance below self-liquidating: once the
  // italic is re-subset, this allowance covers nothing and the suite goes red until it is
  // deleted. The existing machinery becomes the reminder to finish the job.
  assert.deepEqual(
    ledger.unused().map((a) => a.id),
    [],
    'a check-17 allowance covered nothing this run — the page it names is now inside the ' +
      'budget, so the allowance is a record of a miss that no longer exists'
  );

  s.report(`§4: "no page over 150 KB compressed including fonts"`);
});
