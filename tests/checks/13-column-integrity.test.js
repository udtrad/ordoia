/**
 * Check 13 — column integrity.
 *
 * BRIEF.md §3 invites additions: "At minimum, and add to it." This is the addition,
 * and it exists because of what the build found.
 *
 * The handover's rubric page ships two `.sheet` blocks with no `<aside class="rail">`.
 * `.sheet` is a two-column grid — rail, then content — and `.body` carried no explicit
 * column, so it auto-placed into the rail's. The entire rubric — the four levels, the
 * eight dimensions, the depth grid, the limits — rendered **152px wide** on a 1280px
 * desktop. Every other page carries an empty rail and was unaffected, which is why it
 * survived a careful design pass and eleven files of review.
 *
 * Nothing in checks 1-12 could see it. Contrast passed, print passed (the print
 * stylesheet sets the column explicitly), links passed, the copy was all present. The
 * page was correct in every respect except being readable.
 *
 * §7 also asks for 200% zoom and 320px width to be tested, and for the question inside
 * the untravelled span to be present "at any breakpoint". Those were verified by hand
 * once. This is what makes them true on every commit instead.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSite } from '../lib/harness.js';
import { survey } from '../lib/population.js';

/** Desktop, mobile, and 1280px seen at 200% browser zoom. */
const DESKTOP = { width: 1280, height: 900 };
const NARROW = { width: 320, height: 720 };
const ZOOMED = { width: 640, height: 800 };

test('check 13 — the content column is the content column, not the rail', async () => {
  const narrow = [];
  // This check exists because the rubric once rendered at 152px inside the rail's column.
  // `main .body, main .paper` is the selector that found it, and if it stops matching the
  // check reports that no content is in the rail — having looked at no content.
  const s = survey({
    pages: 'pages loaded',
    blocks: 'main .body / main .paper blocks measured',
  });

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    await page.setViewportSize(DESKTOP);

    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      s.count('pages');
      s.count(
        'blocks',
        await page.evaluate(() => document.querySelectorAll('main .body, main .paper').length)
      );
      const found = await page.evaluate(() => {
        const rail = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rail')) || 0;
        // --rail is in rem; resolve against the root font size.
        const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const railPx = rail * rootPx;
        const out = [];
        for (const el of document.querySelectorAll('main .body, main .paper')) {
          const width = el.getBoundingClientRect().width;
          if (width <= railPx + 1) {
            out.push({
              cls: typeof el.className === 'string' ? el.className : '',
              width: Math.round(width),
              rail: Math.round(railPx),
              text: (el.textContent || '').trim().slice(0, 40),
            });
          }
        }
        return out;
      });

      for (const f of found) {
        narrow.push(
          `${url}: .${f.cls.split(/\s+/).join('.')} is ${f.width}px wide — no wider than the ` +
            `${f.rail}px rail, so it has been placed in the rail's column — "${f.text}…"`
        );
      }
    }
    await page.close();
  });

  s.failAll(narrow);
  s.report(`content rendering in the rail's column:\n  ${narrow.join('\n  ')}`);
});

test('check 13 — nothing overflows sideways at 320px or at 200% zoom', async () => {
  // §7: "Test at 200% zoom and 320px width." A page the reader has to scroll
  // horizontally to finish a sentence on is a page they stop reading, and the
  // scorecard is the artifact most likely to be opened on a phone in a meeting.
  const overflows = [];
  const s = survey({ renders: 'page renders measured (pages x viewports)' });

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();

    for (const size of [NARROW, ZOOMED]) {
      await page.setViewportSize(size);
      for (const { url } of pages) {
        await page.goto(origin + url, { waitUntil: 'load' });
        s.count('renders');
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        if (over > 1) overflows.push(`${url} at ${size.width}px: ${over}px of horizontal overflow`);
      }
    }
    await page.close();
  });

  s.failAll(overflows);
  s.report(`horizontal overflow:\n  ${overflows.join('\n  ')}`);
});

test('check 13 — the untravelled span keeps its question at every breakpoint', async () => {
  // §7: "the question inside the untravelled span is not optional at any breakpoint."
  // It is the one piece of the measure that turns a graphic into an instrument, and
  // it is exactly the element a responsive tidy-up removes first.
  const lost = [];
  // The span is the element a responsive tidy-up removes first — so "no span found" is the
  // most likely way this check would stop meaning anything, and it must not read as a pass.
  const s = survey({
    renders: 'page renders measured (pages x viewports)',
    spans: '.measure .span elements inspected',
  });

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();

    for (const size of [DESKTOP, ZOOMED, NARROW]) {
      await page.setViewportSize(size);
      for (const { url } of pages) {
        await page.goto(origin + url, { waitUntil: 'load' });
        s.count('renders');
        s.count(
          'spans',
          await page.evaluate(() => document.querySelectorAll('.measure .span').length)
        );
        const problems = await page.evaluate(() =>
          [...document.querySelectorAll('.measure .span')].map((span) => {
            const q = span.querySelector('.span__q');
            const s = q && getComputedStyle(q);
            const r = q && q.getBoundingClientRect();
            if (!q) return 'the span carries no question';
            if (s.display === 'none' || s.visibility === 'hidden') return 'the question is hidden';
            if (r.width === 0 || r.height === 0) return 'the question has collapsed to nothing';
            if (!(q.textContent || '').trim()) return 'the question is empty';
            return null;
          }).filter(Boolean)
        );
        for (const p of problems) lost.push(`${url} at ${size.width}px: ${p}`);
      }
    }
    await page.close();
  });

  s.failAll(lost);
  s.report(`the span lost its question:\n  ${lost.join('\n  ')}`);
});
