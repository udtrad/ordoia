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
const LOCATE = (needles) => {
  const grids = [...document.querySelectorAll('table.grid')];
  const norm = (s) => s.replace(/[\s ]+/g, ' ').trim();
  const out = [];

  for (const [gi, grid] of grids.entries()) {
    const walker = document.createTreeWalker(grid, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = norm(node.nodeValue || '');
      if (!text) continue;
      for (const needle of needles) {
        const at = text.indexOf(norm(needle));
        if (at === -1) continue;
        // Range over just the matched run, so a long cell does not report the rect of
        // its whole sentence.
        const raw = node.nodeValue;
        const start = raw.replace(/[\s ]+/g, ' ').indexOf(norm(needle));
        const range = document.createRange();
        try {
          range.setStart(node, Math.max(0, start));
          range.setEnd(node, Math.min(raw.length, start + needle.length));
        } catch {
          range.selectNodeContents(node);
        }
        const rects = [...range.getClientRects()].filter((r) => r.width && r.height);
        if (!rects.length) continue;
        out.push({
          grid: gi,
          needle,
          left: Math.min(...rects.map((r) => r.left)),
          right: Math.max(...rects.map((r) => r.right)),
          top: Math.min(...rects.map((r) => r.top)),
        });
      }
    }
  }
  return out;
};

/** On screen at rest: inside the viewport horizontally, with nothing scrolled. */
const onScreen = (run, width) => run.left >= -0.5 && run.right <= width + 0.5;

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
        const runs = await page.evaluate(LOCATE, needles);

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
          // both its name and a price on screen together — that is what a reader needs.
          const together = names.some((n) =>
            prices.some((p) => onScreen(n, viewport.width) && onScreen(p, viewport.width))
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

        const runs = await page.evaluate(LOCATE, [...depths, ...coverages]);

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
  const at = (left, right) => ({ left, right });

  assert.equal(onScreen(at(0, 272), 320), true, 'a run inside the viewport was called off-screen');
  assert.equal(onScreen(at(48, 320), 320), true, 'a run ending exactly at the edge was called off-screen');
  assert.equal(onScreen(at(280, 418), 320), false, 'a run running past the right edge was called on-screen');
  assert.equal(onScreen(at(330, 460), 320), false, 'a run entirely off-screen was called on-screen');
  assert.equal(onScreen(at(-12, 40), 320), false, 'a run clipped off the left edge was called on-screen');

  // The population itself has to be real: a typo in a product key would otherwise make
  // this file measure nothing while reporting green.
  assert.ok(EXPECTED.length >= 5, `only ${EXPECTED.length} products found in products.json`);
  for (const p of EXPECTED) {
    assert.ok(p.name && p.name.length > 2, `product ${p.key} has no usable name`);
    assert.match(p.price, /£|from/i, `product ${p.key} rendered no price-shaped string: "${p.price}"`);
  }
});
