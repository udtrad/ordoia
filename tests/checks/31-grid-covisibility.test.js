/**
 * Check 31 — every product's name and price are on screen together.
 *
 * Draft 6 §8, and it exists because the scroller changed this defect's shape rather than
 * removing it. `CHANGES.md` row 14 wrapped the coverage × depth grid in `overflow-x: auto`
 * so the table scrolled instead of the page, reading WCAG 1.4.10's data-table exemption.
 * That fixed the page and left the reader worse off: at 320px the scroller is 272px and the
 * table 418px, so the **Sustained** column — the retainer, the top of the ladder — sat
 * entirely outside the box at rest. A price reachable only by scrolling, with the product
 * and its price never on screen together, **looks fine to every check and to a glancing
 * reader**. Row G recorded it as measured, pre-existing since launch, and not fixable
 * without a design decision. §8 is that decision.
 *
 * ── What "co-visible" means here, and why it is not "no overflow" ─────────────────
 *
 * Check 13 already asserts the page does not push sideways, and it passed throughout the
 * period this defect was live — because the page genuinely did not overflow. The scroller
 * absorbed it. So the invariant has to be about the **reader**, not the layout: at rest,
 * with nothing scrolled, can you see a product's name and its price at the same time?
 *
 * Both runs are located by **searching the rendered text for the product's own name and
 * its own rendered price**, taken from `products.json` through the same `renderPrice` the
 * templates use. Nothing here selects on a class that the fix also touches: had this check
 * asked for `.grid td .prod`, a reflow that stopped emitting `.prod` would have emptied
 * the population and gone quiet. The denominator is the product count, per check 16, so
 * the day a sixth product is added and lands off-screen this goes red without an edit.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSite, IS_HANDOVER } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import { CLIP_ORACLE } from '../lib/visibility.js';
import { renderPrice } from '../../eleventy.config.js';
import products from '../../src/_data/products.json' with { type: 'json' };

/** §8 names these two. 320 is the floor the site supports; 375 is the common phone. */
const VIEWPORTS = [
  { width: 320, height: 720 },
  { width: 375, height: 800 },
];

const HANDOVER_SKIP =
  'the designer handover renders a hand-authored grid that had already drifted by one cell ' +
  '(CHANGES.md row 3) and predates products.json, so its cells cannot be matched against the ' +
  'product record this check measures';

const settled = (page) => page.evaluate(() => document.fonts.ready);

/** Every product, with the exact strings the page should be showing for it. */
const EXPECTED = products.products.map((p) => ({
  key: p.key,
  name: p.name,
  price: renderPrice(p),
}));

/**
 * Find a literal string in the grid and return the client rects of the runs that render it.
 *
 * Text nodes, not elements: the path row prints its product as `↓ Baseline top-up · £2,500
 * + VAT · ~1 week` inside a single span, so an element rect covers name and price together
 * and would report them co-visible by construction — which is the assertion this check
 * exists to make, granted for free.
 *
 * Whitespace is normalised on both sides because the templates emit `&nbsp;` between a
 * price and its separator, and a reader does not distinguish the two.
 */
const LOCATE = `(needles) => {
  ${CLIP_ORACLE}
  const grids = [...document.querySelectorAll('table.grid')];
  const out = [];

  for (const [gi, grid] of grids.entries()) {
    const rows = [...grid.querySelectorAll('tr')];
    const walker = document.createTreeWalker(grid, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const raw = node.nodeValue || '';
      if (!raw.trim()) continue;
      for (const needle of needles) {
        // Offsets are computed on the RAW string, never on a normalised copy. The old
        // code searched a whitespace-COLLAPSED copy and applied that index to the raw
        // node — correct only while every text node happens to be tight. One template
        // reindent and it selected the wrong substring and measured it as the price.
        // Its try/catch could not rescue that: collapsing only ever shortens, so
        // setStart never threw and the arm was dead by construction.
        let idx = raw.indexOf(needle);
        let len = needle.length;
        if (idx === -1) {
          // Whitespace-tolerant fallback, so an &nbsp; or a line break inside the needle
          // still matches — the reason normalisation was introduced in the first place.
          const parts = needle.split(/[\\s\\u00a0]+/).filter(Boolean)
            .map((x) => x.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'));
          const m = new RegExp(parts.join('[\\\\s\\\\u00a0]+')).exec(raw);
          if (!m) continue;
          idx = m.index;
          len = m[0].length;
        }
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + len);
        const rects = [...range.getClientRects()].filter((r) => r.width && r.height);
        if (!rects.length) continue;
        const el = node.parentElement;
        const tr = el && el.closest ? el.closest('tr') : null;
        out.push({
          grid: gi,
          row: tr ? rows.indexOf(tr) : -1,
          needle,
          left: Math.min(...rects.map((r) => r.left)),
          right: Math.max(...rects.map((r) => r.right)),
          top: Math.min(...rects.map((r) => r.top)),
          bottom: Math.max(...rects.map((r) => r.bottom)),
          seen: rects.some((r) => __isVisible(r, node)),
        });
      }
    }
  }
  return out;
}`;

/**
 * On screen at rest: inside the viewport on BOTH axes, and not clipped by an ancestor.
 *
 * It tested the horizontal axis ONLY until 2026-08-13. `LOCATE` captured each run's `top`
 * and nothing ever read it, so "can you see the name and the price at the same time?" was
 * never asked in the direction that matters for a stacked layout. Drilled by the red team:
 * giving the reflowed grid a `max-height` with `overflow-y: hidden` put four of the five
 * products off the page — no scrollbar, unreachable — and this check stayed 3/3 while the
 * whole 124-check suite stayed byte-identical to green.
 */
const onScreen = (run, width) =>
  run.seen && run.left >= -0.5 && run.right <= width + 0.5;

/**
 * Two runs a reader can hold on screen at the same time.
 *
 * Deliberately NOT "both inside the initial viewport". A page scrolls, and content below
 * the fold is further down rather than hidden — requiring both runs to be above the fold
 * would fail this check on every page where the grid is simply not the first thing. The
 * question §8 asks is whether a reader can see the product and its price **together**, so
 * the test is whether their combined vertical extent fits one screen.
 *
 * The unreachable case — content a container clips away with no scrollbar, which is what
 * the red team's drill produced — is handled by `run.seen` in `onScreen`, not here.
 */
const coVisible = (a, b, height) =>
  Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top) <= height + 0.5;

test('check 31 — every product name and its price are on screen together at 320 and 375', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    renders: 'grid renders measured (pages with a grid x viewports)',
    products: 'product name/price pairs located in a rendered grid',
  });

  const findings = [];

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const { url } of pages) {
        await page.goto(origin + url, { waitUntil: 'load' });
        await settled(page);

        const hasGrid = await page.evaluate(() => document.querySelectorAll('table.grid').length);
        if (!hasGrid) continue;
        s.count('renders');

        const needles = EXPECTED.flatMap((p) => [p.name, p.price]);
        const runs = await page.evaluate(`(${LOCATE})(${JSON.stringify(needles)})`);

        for (const product of EXPECTED) {
          const names = runs.filter((r) => r.needle === product.name);
          const prices = runs.filter((r) => r.needle === product.price);
          if (!names.length || !prices.length) {
            findings.push(
              `${url} at ${viewport.width}px: ${product.key} — found ${names.length} name run(s) ` +
                `and ${prices.length} price run(s) in the grid; expected at least one of each`
            );
            continue;
          }
          s.count('products');

          // A product may appear more than once. It passes if ANY single rendering has
          // both its name and its price on screen together — that is what a reader needs.
          //
          // CO-LOCATED, not merely co-existent, and that is the 2026-08-13 fix. This
          // paired any name-run with any price-run anywhere in any grid, and `LOCATE`
          // computed a `grid` index for exactly this purpose that nothing ever read.
          // The aliasing is live rather than theoretical: `renderPrice` returns the
          // identical "£2,500 + VAT" for BOTH `audit` and `top-up`, so a product could be
          // credited co-visible using a different product's price from another row.
          const together = names.some((n) =>
            prices.some(
              (p) =>
                n.grid === p.grid &&
                n.row === p.row &&
                onScreen(n, viewport.width) &&
                onScreen(p, viewport.width) &&
                coVisible(n, p, viewport.height)
            )
          );
          if (together) continue;

          const worst = names[0];
          const worstPrice = prices[0];
          findings.push(
            `${url} at ${viewport.width}px: ${product.key} — "${product.name}" spans ` +
              `${worst.left.toFixed(0)}..${worst.right.toFixed(0)}px and "${product.price}" spans ` +
              `${worstPrice.left.toFixed(0)}..${worstPrice.right.toFixed(0)}px, against a ` +
              `${viewport.width}px viewport`
          );
        }
      }
    }

    await page.close();
  });

  const unique = [...new Set(findings)];
  s.failAll(unique.slice(0, 12));
  s.report(
    `a product's name and price are not on screen together:\n  ${unique.join('\n  ')}\n\n` +
      `§8: at 320 and 375 every product name and its price are co-visible. A price reachable ` +
      `only by scrolling is worse than one that overflows, because it looks correct to a ` +
      `glancing reader and to every check that measures the page rather than the reader.`
  );
});

test('check 31 — the grid still shows both of its axes after the reflow', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  // The reflow's real risk. Stacking a coverage x depth table into one column per cell is
  // easy; doing it while a reader can still tell WHICH coverage and WHICH depth a price
  // belongs to is the part that can be silently lost, and losing it would gut the
  // instrument the practice's pricing rests on while every co-visibility assertion above
  // went green.
  const s = survey({
    renders: 'grid renders measured (pages with a grid x viewports)',
    labels: 'axis labels found on screen',
  });

  const findings = [];
  const depths = products.grid.columns;
  const coverages = products.grid.rows.filter((r) => r.type === 'coverage').map((r) => r.head);

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const { url } of pages) {
        await page.goto(origin + url, { waitUntil: 'load' });
        await settled(page);

        const hasGrid = await page.evaluate(() => document.querySelectorAll('table.grid').length);
        if (!hasGrid) continue;
        s.count('renders');

        const runs = await page.evaluate(`(${LOCATE})(${JSON.stringify([...depths, ...coverages])})`);

        for (const label of [...depths, ...coverages]) {
          const shown = runs.filter((r) => r.needle === label && onScreen(r, viewport.width));
          if (shown.length) {
            s.count('labels');
            continue;
          }
          findings.push(
            `${url} at ${viewport.width}px: the axis label "${label}" is not on screen anywhere ` +
              `in the grid`
          );
        }
      }
    }

    await page.close();
  });

  const unique = [...new Set(findings)];
  s.failAll(unique.slice(0, 12));
  s.report(
    `the grid lost an axis in the reflow:\n  ${unique.join('\n  ')}\n\n` +
      `Coverage and depth are the two things this table is for. A stacked layout that drops ` +
      `either one is a list of prices, and the ladder stops being readable as a ladder.`
  );
});

test('check 31 — the locator still tells an off-screen run from an on-screen one (controls)', () => {
  // The judgement above is one comparison, so it is pinned here rather than trusted.
  // Both drills that were accepted on this branch planted the correct current value and
  // could not have failed; these plant divergent ones.
  const at = (left, right) => ({ left, right, top: 10, bottom: 30, seen: true });

  assert.equal(onScreen(at(0, 272), 320, 720), true, 'a run inside the viewport was called off-screen');
  assert.equal(onScreen(at(48, 320), 320, 720), true, 'a run ending exactly at the edge was called off-screen');
  assert.equal(onScreen(at(280, 418), 320, 720), false, 'a run running past the right edge was called on-screen');
  assert.equal(onScreen(at(330, 460), 320, 720), false, 'a run entirely off-screen was called on-screen');
  assert.equal(onScreen(at(-12, 40), 320, 720), false, 'a run clipped off the left edge was called on-screen');

  // The clip flag — what the red team's vertical drill actually exploited. A run can sit
  // squarely inside the viewport on both axes and still be clipped away by an ancestor
  // with no scrollbar, which is unreachable rather than merely further down.
  assert.equal(onScreen({ ...at(0, 200), seen: false }, 320), false,
    'a run clipped away by an ancestor was called on-screen');

  // Co-visibility is a property of a PAIR, and was not tested at all until 2026-08-13:
  // `top` was captured and never read. Both cases below pass the horizontal test, so the
  // old one-axis predicate would have called each of them co-visible.
  const run = (top, bottom) => ({ ...at(0, 200), top, bottom });
  assert.equal(coVisible(run(0, 20), run(24, 44), 720), true,
    'a name and price stacked 24px apart were called not-co-visible');
  assert.equal(coVisible(run(0, 20), run(900, 920), 720), false,
    'a name and a price 900px apart were called co-visible on a 720px screen');
  assert.equal(coVisible(run(0, 20), run(700, 720), 720), true,
    'a pair spanning exactly one screen height was called not-co-visible');

  // The population itself has to be real: a typo in a product key would otherwise make
  // this file measure nothing while reporting green.
  assert.ok(EXPECTED.length >= 5, `only ${EXPECTED.length} products found in products.json`);
  for (const p of EXPECTED) {
    assert.ok(p.name && p.name.length > 2, `product ${p.key} has no usable name`);
    assert.match(p.price, /£|from/i, `product ${p.key} rendered no price-shaped string: "${p.price}"`);
  }
});
