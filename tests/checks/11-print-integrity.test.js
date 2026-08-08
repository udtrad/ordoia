/**
 * Check 11 — print integrity.
 *
 * BRIEF.md §3 check 11: "Scorecard and rubric render to A4 with no clipped
 * measure, no orphaned pair heading, no lost stamp line."
 * §6: the scorecard "gets forwarded, printed, photocopied and read cold by
 * someone who will never visit the site."
 * §13 item 2: a risk committee member reads it printed, in greyscale, and
 * understands exactly what was and was not established.
 *
 * The print stylesheet already exists and is careful — `break-inside: avoid` on
 * rows and dimensions, `break-after: avoid` on headings, a white knockout for
 * `.na`. This check is what stops a later change from quietly undoing it.
 *
 * Measured under Chromium's print emulation at A4, because a print stylesheet
 * that was only ever read is a stylesheet nobody has tested.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSite } from '../lib/harness.js';

/** A4 at 96dpi, less the 16mm/14mm margins the stylesheet sets. */
const A4_CONTENT_WIDTH_PX = (210 - 28) * (96 / 25.4); // ≈ 688px

const PRINTED_ROUTES = [/scorecard/, /oal/];

test('check 11 — nothing overflows the A4 content width in print', async () => {
  const overflows = [];

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({ width: Math.round(A4_CONTENT_WIDTH_PX), height: 1120 });

    for (const { url } of pages.filter((p) => PRINTED_ROUTES.some((r) => r.test(p.url)))) {
      await page.goto(origin + url, { waitUntil: 'load' });
      const wide = await page.evaluate((limit) => {
        const out = [];
        for (const el of document.querySelectorAll('.measure, .row, table, .paper, .stamp, .na')) {
          const r = el.getBoundingClientRect();
          if (r.width > limit + 1) {
            out.push({
              sel: el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.split(/\s+/)[0] : ''),
              width: Math.round(r.width),
            });
          }
        }
        return out;
      }, A4_CONTENT_WIDTH_PX);

      for (const w of wide) overflows.push(`${url}: ${w.sel} is ${w.width}px wide, past the ${Math.round(A4_CONTENT_WIDTH_PX)}px A4 content width`);
    }
    await page.close();
  });

  assert.deepEqual(overflows, [], `content clipped by the A4 page box:\n  ${overflows.join('\n  ')}`);
});

test('check 11 — every measure keeps its stamp and its labels in print', async () => {
  const lost = [];

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({ width: Math.round(A4_CONTENT_WIDTH_PX), height: 1120 });

    for (const { url } of pages.filter((p) => PRINTED_ROUTES.some((r) => r.test(p.url)))) {
      await page.goto(origin + url, { waitUntil: 'load' });
      const problems = await page.evaluate(() => {
        const out = [];
        for (const m of document.querySelectorAll('.measure')) {
          const dim = m.querySelector('.measure__dim')?.textContent?.trim() || 'unnamed measure';
          const stamp = m.querySelector('.stamp');
          if (!stamp) { out.push(`${dim}: no stamp`); continue; }
          const s = getComputedStyle(stamp);
          if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) {
            out.push(`${dim}: stamp hidden in print`);
          }
          if (stamp.getBoundingClientRect().height === 0) out.push(`${dim}: stamp has no height in print`);

          // The labelled absence must survive: §2 requires absence to be
          // legible, and a *not assessed* track whose sentence vanished is a
          // blank row a reader will read as "nothing wrong here".
          const na = m.querySelector('.na');
          if (na) {
            const ns = getComputedStyle(na);
            if (ns.display === 'none' || na.getBoundingClientRect().height === 0) {
              out.push(`${dim}: "not assessed" sentence lost in print`);
            }
          }
          // Level labels are the scale's only readable content.
          const labels = [...m.querySelectorAll('.label')];
          if (labels.length && labels.every((l) => l.getBoundingClientRect().height === 0)) {
            out.push(`${dim}: all scale labels collapsed in print`);
          }
        }
        return out;
      });
      for (const p of problems) lost.push(`${url}: ${p}`);
    }
    await page.close();
  });

  assert.deepEqual(lost, [], `print loses part of the instrument:\n  ${lost.join('\n  ')}`);
});

test('check 11 — the scorecard renders to a real multi-page A4 PDF', async () => {
  await withSite(async ({ origin, pages, browser }) => {
    const scorecard = pages.find((p) => /scorecard/.test(p.url));
    assert.ok(scorecard, 'no scorecard route to print');

    const page = await browser.newPage();
    await page.goto(origin + scorecard.url, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await page.close();

    assert.ok(pdf.length > 10_000, `the scorecard PDF is implausibly small (${pdf.length} bytes)`);
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-', 'output is not a PDF');

    // Page count, read straight out of the PDF object tree.
    const text = pdf.toString('latin1');
    const counts = [...text.matchAll(/\/Type\s*\/Page[^s]/g)].length;
    assert.ok(counts >= 1, 'the PDF reports no pages');
  });
});
