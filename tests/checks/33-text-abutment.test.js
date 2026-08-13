/**
 * Check 33 — the coverage × depth grid's in-cell label reads correctly, to both readers.
 *
 * Reported by the user against the live site on 2026-08-13: the coverage × depth grid on
 * Home and Services rendered `Testednot offered` and `Sustainednot offered`.
 *
 * ── Three assertions about one label, and two of them pull against each other ───────
 *
 * The first repair hid the label above 46rem. The owner then ruled the other way — the
 * depth belongs *inside* the cell, above the price, for clarity — and asked only for the
 * missing space. That reverses the repair, not the finding, so the file now carries:
 *
 *   1. abutment    no two runs print with nothing between them. The space.
 *   2. visible     every body cell prints the depth it belongs to, at every width.
 *   3. announced   a screen reader hears that depth EXACTLY once, at every width.
 *
 * 2 and 3 are in deliberate tension and neither may be relaxed to satisfy the other.
 * Hiding the label satisfies 3 and breaks 2; showing it plainly satisfies 2 and breaks 3,
 * because `<th scope="col">` already announces the depth above 46rem. The markup that
 * satisfies both is two spans — one visible and `aria-hidden`, one the reflow reveals —
 * and it exists because `aria-hidden` is a static attribute while the header's presence
 * is not. A single span cannot be silent at 1280 and spoken at 320.
 *
 * ── What was actually wrong, and why it is worth a check rather than a space ────────
 *
 * `grid.njk` puts a `<span class="depth">` in every cell so §8's sub-46rem reflow can
 * carry the depth axis after `<thead>` is dropped, and its comment states the other half
 * of the contract in so many words: *"`display: none` above 46rem, where the column header
 * carries it and this would be a duplicate in the accessibility tree"*. **That rule was
 * never written.** `.grid .depth` existed only inside `@media (max-width: 46rem)`, so above
 * 736px the span rendered as an ordinary inline box hard against the text node beside it.
 *
 * The two cells the user saw were the visible half. The other half was five cells printing
 * their own column header again, and a screen reader saying "Tested … Tested not offered".
 *
 * ── Why check 31 could not see it ──────────────────────────────────────────────────
 *
 * Check 31 measures this exact table, and it measures it at **320 and 375 only**. Below
 * 736px `.depth` is `display: block`, the label takes its own line, and nothing runs
 * together. The defect existed only at widths no check in this suite ever opened. Nothing
 * about check 31's logic was wrong; its *population* excluded the condition. That is the
 * tenth instance of the shape CHECKS.md keeps recording, and it is the reason `VIEWPORTS`
 * below spans the breakpoint rather than sitting on one side of it — drilled, and the
 * measurement is in CHECKS.md.
 *
 * ── The invariant, deliberately about the reader ───────────────────────────────────
 *
 *   No two separately-rendered runs of text print on the same line with a letter or a
 *   digit on both sides of the junction and no space between them.
 *
 * The scope is the whole site, every page and every text node, rather than `table.grid`.
 * That was a measurement, not a preference: run site-wide against the defect, this reported
 * the two real cells **and fourteen others** — `<strong>finding</strong>. A score…` and
 * `<em>ordo</em>: order, sequence` and twelve more of the same shape across five pages.
 * Every one of them is correct English. Narrowing the *predicate* to a word-to-word
 * junction removed all fourteen and kept both real findings, which is a better trade than
 * narrowing the *population* to one table and calling the rest unmeasured. `abuts` carries
 * the rule and the hole it leaves.
 *
 * Not "`.depth` is hidden above 46rem". That would be the fix restated as its own test —
 * the pathology this repository has now shipped five times, where a guard is built from
 * the same predicate as the thing it guards and is structurally unable to fail. This asks
 * what a reader sees, so it accepts *either* repair: hiding the label, or putting a space
 * in the template. Both were drilled; both go green; the suite has no opinion on which,
 * which is the property that makes it a measurement rather than a restatement.
 *
 * ── What it does not cover ─────────────────────────────────────────────────────────
 *
 * Overlap is not this check's job: `abuts` requires the edges to *touch* (|gap| ≤ 1px) and
 * returns false for a real overlap, so the two predicates meet without a seam. That is a
 * statement about vocabulary, **not** a claim that something else catches every overlap —
 * check 23's population is `.measure__dim, .label, .span, .stamp, .na` inside three
 * containers, so two arbitrary runs overlapping elsewhere on the site are reported by
 * neither check. An earlier draft of this paragraph said check 23 "already reports it with
 * the amount", which overstated its reach.
 *
 * Soft-wrapped fragments are compared only at their true ends (`first` / `last` below). A
 * fragment that continues onto the next line has no right-hand neighbour on its own line
 * to abut, and a fragment that continues *from* the previous one begins its line; treating
 * those interior edges as junctions would compare two halves of one word against each other
 * and report every wrapped paragraph on the site.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSite, IS_HANDOVER, REPO_ROOT } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import { CLIP_ORACLE } from '../lib/visibility.js';
import { abuts, intersection, JOINS, TOLERANCE } from '../lib/overlap.js';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import products from '../../src/_data/products.json' with { type: 'json' };

/**
 * The a11y test compares against the product record, and the frozen designer handover
 * predates `products.json` — its grid is hand-authored and had already drifted by one cell
 * (CHANGES.md row 3). Same reason check 31 skips it. The abutment test above does NOT skip:
 * it reads only the rendering, so it measures the handover honestly, and it finds row 13's
 * `Self-checkIf you deleted the sentence…` there.
 */
const HANDOVER_SKIP =
  'the designer handover renders a hand-authored grid that predates products.json, so its ' +
  'cells cannot be matched against the product record this assertion compares them to';

/**
 * Both sides of §8's 46rem breakpoint, which is the whole point of this check.
 *
 * 320 and 375 are check 31's pair and the widths §8 names. 768 is the first width above
 * `46rem = 736px`, where the table stops reflowing; 1280 is the width the design has been
 * measured at since CHANGES.md row 4. The defect this check was written for existed at the
 * last two and at neither of the first two.
 */
const VIEWPORTS = [
  { width: 320, height: 720 },
  { width: 375, height: 800 },
  { width: 768, height: 900 },
  { width: 1280, height: 900 },
];

const settled = (page) => page.evaluate(() => document.fonts.ready);

/**
 * Which depth column a `<td>` belongs to, or -1 for a cell that owns no depth axis.
 *
 * Page-side source interpolated into `page.evaluate`, in the manner of `CLIP_ORACLE` and
 * for the same reason: a function handed to Playwright loses its module scope. Defines
 * `__depthColumn(td)` in page scope.
 *
 * Shared by the two tests below that walk cells, so the visible arm and the announced arm
 * cannot disagree about which column they are asserting against. Two copies of this
 * derivation is the "two surfaces that can disagree" shape, and it is the one that would
 * silently assert one cell's axis against another cell's header.
 */
const COLUMN_ORACLE = `
function __depthColumn(td, pathRows) {
  const tr = td.closest('tr');
  if (!tr) return -1;

  // The path row is "a note about the two products either side of it, not a fourth cell" —
  // grid.njk and styles.css both say so in as many words. It sits in the Inspected column
  // by table geometry and owns no depth axis, so asserting one against it reported the axis
  // missing on every narrow render.
  //
  // Excluded by its POSITION, taken from products.json, rather than by matching \`.path\`.
  // The class test was \`tr.querySelector('.path')\`, which matches any descendant: the
  // adversarial pass put one \`<span class="path">\` in a coverage row's head and that row's
  // three cells left the population of BOTH cell-walking arms — 48 cells to 24 — after
  // which stripping the depth spans from the \`not offered\` cells held all three CI gates
  // at their committed numbers with the user's original defect back on the page. A row's
  // identity is data; \`.path\` is styling that happens to correlate with it.
  const rows = [...tr.parentElement.children];
  if (pathRows.includes(rows.indexOf(tr))) return -1;

  // The row-head \`th\` occupies slot 0, so a \`td\`'s depth column is its index among the
  // row's children minus that head.
  return [...tr.children].indexOf(td) - 1;
}
`;

/** Row indices in \`tbody\` that carry no depth axis. Data, not markup — see COLUMN_ORACLE. */
const PATH_ROWS = products.grid.rows
  .map((row, i) => (row.type === 'coverage' ? -1 : i))
  .filter((i) => i >= 0);

/**
 * How many depth-owning cells one rendered grid must contain.
 *
 * The population is PINNED rather than counted, because `survey()` only fails at exactly
 * zero and every high-severity finding against this check was a partial loss: a row leaving
 * the population (48 cells -> 24) and a whole page leaving it (48 -> 24) each held all three
 * CI gates at their committed numbers. Half a population is not a smaller measurement, it is
 * a different one, and nothing in the harness can notice the difference.
 */
const CELLS_PER_GRID =
  products.grid.rows.filter((r) => r.type === 'coverage').length * products.grid.columns.length;

/**
 * How many pages render this grid. Home and Services — BRIEF.md §10 and grid.njk's header.
 *
 * A literal, and deliberately not derived from the templates: derive it and deleting
 * `{{ grid(products) }}` from `services.njk` lowers the expectation to match, which is the
 * silence this constant exists to break. It moves in a reviewed diff, the rule
 * `PUBLISHED_SHA256` and the CI baselines already follow.
 */
const GRID_PAGES = 2;

/** The smallest painted height a real label can have, in CSS px. See SHOWS_DEPTH. */
const MIN_INK = 6;

/**
 * Every visible run of text on the page, one entry per rendered line box.
 *
 * Text nodes rather than elements, for the same reason check 31 uses them: an element rect
 * covers all of its children, so two runs inside one span are co-located by construction
 * and the junction between them — which is the thing being measured — disappears.
 *
 * `first` and `last` mark whether a rect is the node's true start and end. A text node that
 * wraps produces one rect per line, and only the outermost two edges are real junctions
 * with other content; see the header.
 */
const COLLECT = `() => {
  ${CLIP_ORACLE}
  const __JOINS = ${JOINS.toString()};
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const raw = node.nodeValue || '';
    // Whitespace-only nodes carry no ink, but they are exactly what separates two runs:
    // dropping them here is what lets the gap between their neighbours be the measurement.
    if (!raw.trim()) continue;
    const el = node.parentElement;
    if (!el) continue;

    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) continue;

    // Resolve each boundary against what was PAINTED, not what was typed. A trailing
    // space at the end of a line box is removed in rendering, so source whitespace is not
    // evidence of a rendered separator: measure whether trimming it moves the edge.
    // Costs one extra range only for nodes that actually carry edge whitespace.
    const head = raw.replace(/^\\s+/, '');
    const tail = raw.replace(/\\s+$/, '');
    const edgeOf = (from, to, side) => {
      const r2 = document.createRange();
      r2.setStart(node, from);
      r2.setEnd(node, to);
      const rr = [...r2.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
      if (!rr.length) return null;
      return side === 'right' ? rr[rr.length - 1].right : rr[0].left;
    };

    // Leading whitespace separates only if dropping it moves the left edge rightwards.
    let startsWord = __JOINS.test(head.slice(0, 1));
    if (startsWord && head.length < raw.length) {
      const trimmedLeft = edgeOf(raw.length - head.length, raw.length, 'left');
      if (trimmedLeft !== null && trimmedLeft > rects[0].left + 0.01) startsWord = false;
    }

    // Trailing whitespace separates only if dropping it moves the right edge leftwards.
    let endsWord = __JOINS.test(tail.slice(-1));
    if (endsWord && tail.length < raw.length) {
      const trimmedRight = edgeOf(0, tail.length, 'right');
      const full = rects[rects.length - 1].right;
      if (trimmedRight !== null && trimmedRight < full - 0.01) endsWord = false;
    }

    for (const [i, r] of rects.entries()) {
      if (!__isVisible(r, node)) continue;
      out.push({
        text: raw,
        first: i === 0,
        last: i === rects.length - 1,
        startsWord,
        endsWord,
        tag: el.tagName.toLowerCase(),
        cls: el.className && typeof el.className === 'string' ? el.className : '',
        rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      });
    }
  }
  return out;
}`;

/**
 * A run, as it should read in a finding.
 *
 * Named `label` rather than `describe`: check 16 rejects a line at statement position
 * matching `describe\s*\(`, and an interpolated call sitting at the start of an indented
 * line would trip its scanner. Fail-closed, so it would break the scan loudly rather than
 * quietly cover less — but a name that cannot collide is cheaper than the diagnosis.
 */
const label = (r) => {
  const where = r.cls ? `${r.tag}.${r.cls.trim().split(/\s+/).join('.')}` : r.tag;
  const text = r.text.trim().replace(/\s+/g, ' ');
  return `<${where}> "${text.length > 40 ? text.slice(0, 40) + '…' : text}"`;
};

test('check 33 — no two runs of text print with no space between them', async () => {
  const s = survey({
    renders: 'page renders measured (pages x viewports)',
    // The denominator has to be the SUBJECT, not the scan. `pairs` counted every run whose
    // left edge fell within a tolerance of another's right edge — 557,065 of them across
    // the site, of which 499 were actually on the same line. Losing every junction on
    // every page moved that number by under a tenth of a percent, so the vacuity guard
    // could not have seen it: lesson 8, in the file whose header cites lesson 8. Counted
    // after the same-line test, this is 499 on a healthy site and 0 the moment COLLECT or
    // the clip oracle stops returning runs.
    junctions: 'same-line adjacent run pairs — the actual subject',
  });

  const findings = [];

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const { url } of pages) {
        await page.goto(origin + url, { waitUntil: 'load' });
        await settled(page);

        const runs = await page.evaluate(`(${COLLECT})()`);
        if (!runs.length) continue;
        s.count('renders');

        // Sorted by left edge, so the only candidates for `b` sit at or just past `a`'s
        // right edge and the scan stops as soon as it passes them. A run that abuts `a`
        // on the right necessarily starts to the right of `a`'s own left edge, so it is
        // always later in this order and never missed by starting at i + 1.
        const sorted = [...runs].sort((x, y) => x.rect.left - y.rect.left);

        for (let i = 0; i < sorted.length; i++) {
          const a = sorted[i];
          if (!a.last) continue;
          for (let j = i + 1; j < sorted.length; j++) {
            const b = sorted[j];
            if (b.rect.left > a.rect.right + TOLERANCE) break;
            if (!b.first) continue;
            if (intersection(a.rect, b.rect).vertical <= TOLERANCE) continue;
            s.count('junctions');
            if (!abuts(a, b)) continue;
            findings.push(
              `${url} at ${viewport.width}px: ${label(a)} and ${label(b)} print as ` +
                `"${a.text.trim().slice(-12)}${b.text.trim().slice(0, 12)}" — ` +
                `${(b.rect.left - a.rect.right).toFixed(2)}px between them and no space on ` +
                `either side`
            );
          }
        }
      }
    }

    await page.close();
  });

  const unique = [...new Set(findings)];
  s.failAll(unique.slice(0, 12));
  s.report(
    `two words are printed with nothing between them:\n  ${unique.join('\n  ')}\n\n` +
      `A reader sees one word where the markup holds two. It is the shape a template that ` +
      `concatenates an inline element with the text beside it produces, and it survives ` +
      `every check that reads the DOM instead of the rendering.`
  );
});

/**
 * Every body cell prints the depth it belongs to, at every width.
 *
 * The owner's ruling, made executable. Without it the grid's clarity rests on a comment —
 * and a comment is exactly what failed last time: `grid.njk` described a `display: none`
 * for five days before anyone noticed nobody had written it. The next person to read that
 * comment re-applies the rule, and every other test in this file stays green.
 *
 * ── Located by TEXT, never by class ────────────────────────────────────────────────
 *
 * Check 31's header states the rule and the reason: "Nothing here selects on a class that
 * the fix also touches: had this check asked for `.grid td .prod`, a reflow that stopped
 * emitting `.prod` would have emptied the population and gone quiet." Asking for `.depth`
 * here would do exactly that — rename the class and this check measures nothing while
 * reporting green. So it searches the cell's own text nodes for the column's depth name
 * and asks whether any of it was painted, which any mechanism can satisfy.
 *
 * Case-insensitive on the SOURCE text, for the reason CHANGES.md row 124 records: §8
 * uppercases the reflowed label with `text-transform`, which changes the rendering and not
 * the node, so a case-sensitive compare is a false finding waiting for a design change.
 *
 * ── What this cannot earn, and what it offers instead ───────────────────────────────
 *
 * It skips the handover, so the handover baseline cannot move for it and it will never
 * carry the evidence check 23 and the abutment test above both carry. Its evidence is
 * elsewhere: run against the previous rendering it reported all six cells on both pages at
 * 768 and 1280 — the exact absence the owner asked to have reversed — and went quiet at
 * 320 and 375, where the label was already there.
 *
 * ── The stated hole ────────────────────────────────────────────────────────────────
 *
 * **Occlusion.** A label painted underneath an opaque sibling is reported visible. Proven
 * by the adversarial pass: `.grid td { position: relative }` with a `::after` overlay in
 * `--ground` covers every label and every `not offered` string, and this check stays green.
 *
 * It is left open deliberately. Catching it needs `elementFromPoint`, which
 * `tests/lib/visibility.js` refuses in its header with a reason that still holds — the
 * answer would depend on scroll position and z-order, and a run below the fold is scrolled
 * past rather than hidden. Buying this one case costs the scroll-independence three checks
 * rely on. Named here rather than papered over, in the manner of `abuts`'s two holes.
 *
 * The neighbouring failure modes ARE covered, and none of them was before 2026-08-13:
 * `clip-path` (the clip oracle now fails closed on it), sub-legible type (`MIN_INK`),
 * `color: transparent` (check 7, not this one), and the label rendering below the price
 * rather than above it.
 */
const SHOWS_DEPTH = `(depths, pathRows, minInk) => {
  ${CLIP_ORACLE}
  ${COLUMN_ORACLE}
  const out = [];

  for (const td of document.querySelectorAll('table.grid tbody td')) {
    const column = __depthColumn(td, pathRows);
    if (column < 0 || column >= depths.length) continue;
    const depth = depths[column];
    const wanted = depth.toLowerCase();

    // Every visible text run in the cell, so the label can be compared to what sits
    // beside it. Collected in one pass because two of the three questions below are
    // about the label's RELATION to the rest of the cell, not about the label alone.
    const runs = [];
    const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const raw = node.nodeValue || '';
      if (!raw.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (!(r.width > 0 && r.height > 0)) continue;
        if (!__isVisible(r, node)) continue;
        runs.push({ text: raw.trim(), top: r.top, height: r.height });
      }
    }

    // A run counts as the label only if the whole text node IS the depth name.
    // Substring matching credited a cell with no label at all from its own price line:
    // the adversarial pass set the Review product's duration to "3 weeks, tested end to
    // end", deleted both depth spans, and eight findings disappeared. A label is its own
    // run; prose that mentions the word is not a label.
    const labels = runs.filter((r) => r.text.toLowerCase() === wanted);

    // Painted, not merely boxed. \`font-size: 0.5px\` renders a 2.47 x 1px speck that
    // satisfies every geometric test in the clip oracle. The smallest type this design
    // uses anywhere is 0.66rem, so anything under \`minInk\` is not a size the site can
    // legitimately produce.
    const inked = labels.filter((r) => r.height >= minInk);

    // Topmost in the cell, which is the ruling: the depth reads ABOVE the price. Same
    // line is fine and is what the \`not offered\` cells do, hence the tolerance.
    const highestOther = runs
      .filter((r) => r.text.toLowerCase() !== wanted)
      .reduce((min, r) => Math.min(min, r.top), Infinity);
    const above = inked.some((r) => r.top <= highestOther + 1);

    out.push({
      column,
      depth,
      count: inked.length,
      above,
      shortest: labels.length ? Math.min(...labels.map((r) => r.height)) : 0,
      text: (td.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 40),
    });
  }

  return out;
}`;

test('check 33 — every grid cell prints the depth it belongs to, at every width', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    renders: 'grid renders measured (pages with a grid x viewports)',
    cells: 'depth-column body cells whose rendering was read',
  });

  const findings = [];
  const depths = products.grid.columns;
  let gridsSeen = 0;

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const { url } of pages) {
        await page.goto(origin + url, { waitUntil: 'load' });
        await settled(page);

        const grids = await page.evaluate(() => document.querySelectorAll('table.grid').length);
        if (!grids) continue;
        gridsSeen += grids;

        const args = [depths, PATH_ROWS, MIN_INK].map((a) => JSON.stringify(a)).join(', ');
        const cells = await page.evaluate(`(${SHOWS_DEPTH})(${args})`);
        s.count('renders');

        // Per RENDER, not in total. A grid that lost a row still contributes cells, and a
        // total only has to be non-zero to satisfy the harness.
        if (cells.length !== CELLS_PER_GRID * grids) {
          findings.push(
            `${url} at ${viewport.width}px: ${cells.length} depth-owning cells found, ` +
              `expected ${CELLS_PER_GRID * grids} (${CELLS_PER_GRID} per grid x ${grids}) — ` +
              `the population changed shape, so whatever this check reports is about a ` +
              `different table than the one products.json describes`
          );
        }

        for (const cell of cells) {
          s.count('cells');
          if (cell.count === 0) {
            findings.push(
              `${url} at ${viewport.width}px: the cell in the "${cell.depth}" column prints ` +
                `no depth label — it reads "${cell.text}", so which depth this price buys ` +
                `is readable only from the column header` +
                (cell.shortest > 0
                  ? ` (a "${cell.depth}" run is present but only ${cell.shortest.toFixed(2)}px tall)`
                  : '')
            );
          } else if (cell.count > 1) {
            findings.push(
              `${url} at ${viewport.width}px: the cell in the "${cell.depth}" column prints ` +
                `that depth ${cell.count} times — it reads "${cell.text}". One span per ` +
                `width is visible by design; both means a display rule stopped swapping them`
            );
          } else if (!cell.above) {
            findings.push(
              `${url} at ${viewport.width}px: the "${cell.depth}" label is printed below ` +
                `something else in its cell — it reads "${cell.text}". The ruling is that ` +
                `the depth reads above the price, not merely somewhere in the cell`
            );
          }
        }
      }
    }

    await page.close();
  });

  // The page list itself. BRIEF.md §10 and grid.njk both say this grid renders on Home AND
  // Services; nothing asserted it, and deleting the Services one took the population from
  // 48 cells to 24 with all three CI gates unmoved.
  assert.equal(
    gridsSeen,
    GRID_PAGES * VIEWPORTS.length,
    `expected ${GRID_PAGES} grids (Home and Services) at each of ${VIEWPORTS.length} ` +
      `viewports, found ${gridsSeen} renders in total — a page that stopped rendering the ` +
      'grid removes itself from every assertion below instead of failing one'
  );

  const unique = [...new Set(findings)];
  s.failAll(unique.slice(0, 12));
  s.report(
    `a grid cell does not say which depth it belongs to, exactly once, above its price:\n  ${unique.join('\n  ')}\n\n` +
      `The owner's ruling: the depth reads inside the cell, above the price, at every ` +
      `width. Below 46rem it is the only carrier, because the reflow drops thead; above it ` +
      `the column header carries the axis too and this is the copy a reader's eye lands on.`
  );
});

/**
 * The second half of the same defect, and the half the test above cannot see.
 *
 * `abuts` measures what a reader *sees*, which is why it accepts either repair — and that
 * is precisely the hole. Drilled: leave the label visible and put a literal space in the
 * template, and the abutment test goes green while a screen reader still hears the depth
 * twice, once from the column header and once from inside the cell. The visible defect
 * would be gone and the announced one would not.
 *
 * Measured rather than reasoned about, at 1280 on the built site:
 *
 *   fixed   td.none accessible subtree -> ["not offered"]
 *   defect  td.none accessible subtree -> ["Tested", "not offered"]
 *           and the row above it gains "Inspected" beside "Audit"
 *
 * So the claim `styles.css` makes in its comment — that an in-cell copy "says it twice to
 * a screen reader" — is a measurement, not an assertion, and this is where it is made.
 *
 * `interestingOnly: false` is required. With the default, a `<td>` carrying no accessible
 * name of its own returns an empty subtree and this check would pass against nothing on
 * every page — lesson 8, one option flag away.
 */
test('check 33 — the depth label is out of the accessibility tree where the header carries it', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    renders: 'grid renders measured (pages with a grid x viewports)',
    cells: 'not-offered cells whose accessible subtree was read',
  });

  const findings = [];
  const notOffered = products.grid.notOffered;
  const depths = products.grid.columns;

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const { url } of pages) {
        await page.goto(origin + url, { waitUntil: 'load' });
        await settled(page);

        /**
         * EVERY body cell of the grid, not just the `not offered` ones.
         *
         * The defect reached seven cells and the first version of this test could see
         * two. The five populated cells each printed their own column header again
         * directly above the product name — and the abutment test above is structurally
         * unable to see those, because `.grid .prod { display: block }` puts the leaked
         * label on its own line, so there is no junction to measure. Scoping this
         * population to `td.none` left the other five covered by nothing at all.
         *
         * Cells are read with their column index, because the question is per-column:
         * is THIS cell's depth already said by ITS header?
         */
        // Both lists come from the SAME selector, so they align index for index. Deriving
        // the column indices from a different query than the handles is how the two drift
        // apart and the check starts asserting one cell's axis against another's header.
        const columnOf = await page.evaluate(`(() => {
          ${COLUMN_ORACLE}
          const pathRows = ${JSON.stringify(PATH_ROWS)};
          return [...document.querySelectorAll('table.grid tbody td')]
            .map((td) => __depthColumn(td, pathRows));
        })()`);
        const handles = await page.$$('table.grid tbody td');
        if (!handles.length) continue;
        s.count('renders');

        /**
         * Which arm applies is read from the RENDERING, not from a pixel constant.
         *
         * The first version branched on `viewport.width > 736` — 46rem hardcoded, in a
         * second file, with nothing making it agree with the stylesheet. Move the
         * breakpoint in `styles.css` and this check goes on asserting the wrong arm at
         * the widths either side of it, silently and in both directions. That is the
         * "two surfaces that can disagree" shape the whole freeze-chrome-split branch
         * exists to remove, reintroduced in a test.
         *
         * The second version asked whether `thead` was *rendered*, which was still not
         * the question. The adversarial pass emptied every `<th scope="col">` — the depth
         * axis gone from the page entirely above 46rem — and the whole 128-test suite
         * stayed **118 pass / 0 fail**, because a rendered-but-empty header satisfied
         * "something else already says it" and this arm only ever asserted *at most*
         * once. Its own failure message said *exactly* once.
         *
         * So the header is read for its TEXT, per column. `headerSays[i]` is true only
         * when the i-th column header actually renders that column's depth name, which
         * is the question both arms need: is this depth reachable somewhere other than
         * this cell?
         */
        const headerSays = await page.evaluate(
          ([wanted]) => {
            const ths = [...document.querySelectorAll('table.grid thead th')];
            return wanted.map((depth, i) => {
              // Column i of the body is header i + 1: the first `th` is the row-head
              // slot, which carries the visually-hidden "Coverage" heading.
              const th = ths[i + 1];
              if (!th) return false;
              // Boxes, not computed style. §8's reflow hides `thead` while setting
              // `.grid th { display: block }`, so the `th`'s OWN computed display is
              // `block` at 320px even though nothing paints — and `innerText` on an
              // unrendered element falls back to `textContent`, so it cheerfully
              // returns "Tested" for a header no one can see. Both read the DOM
              // instead of the rendering, which is the mistake this check exists for.
              if (!th.getClientRects().length) return false;
              return (th.innerText || '').toLowerCase().includes(depth.toLowerCase());
            });
          },
          [depths]
        );

        for (const [n, handle] of handles.entries()) {
          const column = columnOf[n];
          // The path row's note cell spans no depth column and has no axis to carry.
          if (column === undefined || column < 0 || column >= depths.length) continue;

          const snap = await page.accessibility.snapshot({
            root: handle,
            interestingOnly: false,
          });
          const names = new Set();
          (function walk(node) {
            if (!node) return;
            if (node.name) names.add(node.name.trim());
            for (const child of node.children ?? []) walk(child);
          })(snap);
          if (!names.size) continue; // an empty cell announces nothing and owns no axis
          s.count('cells');

          // Case-INSENSITIVE, and that is a measurement rather than defensiveness.
          // Chromium reports the *rendered* text in the accessibility tree, so §8's
          // `text-transform: uppercase` on the reflowed label makes the node read
          // "TESTED" while products.json says "Tested". A case-sensitive compare found
          // nothing below 46rem and reported the axis missing on every narrow render.
          // Above 46rem there is no transform, so that arm matched by luck — the day the
          // design uppercased the column header it would have gone silently blind.
          const depth = depths[column];
          const spoken = [...names].map((x) => x.toLowerCase());
          const inCell = spoken.some((x) => x.includes(depth.toLowerCase()));

          // Exactly once. The header saying it means the cell must not, and the header
          // NOT saying it means the cell must — an axis reachable twice is a duplicate
          // and an axis reachable nowhere is a lost axis. Both directions are asserted,
          // which is what the previous version's message claimed and its code did not.
          // `n` identifies WHICH cell. Without it two cells in the same column on the same
          // page at the same width produce byte-identical messages and `new Set` collapses
          // them: stripping the label from four populated cells reported 12 findings where
          // 16 were true. No pass/fail consequence — it costs the reader the row.
          const where = `${url} at ${viewport.width}px, body cell ${n + 1}`;
          if (headerSays[column] && inCell) {
            findings.push(
              `${where}: it announces "${depth}" and its rendered column header already ` +
                `says it — a screen reader hears the depth twice`
            );
          } else if (!headerSays[column] && !inCell) {
            findings.push(
              `${where}: neither the "${depth}" column header nor this cell announces that ` +
                `depth — the axis is unreachable at this width`
            );
          }
        }
      }
    }

    await page.close();
  });

  const unique = [...new Set(findings)];
  s.failAll(unique.slice(0, 12));
  s.report(
    `the depth axis reaches a screen reader the wrong number of times:\n  ${unique.join('\n  ')}\n\n` +
      `Exactly once at every width. Above 46rem that is the column header; below it, where ` +
      `the reflow drops thead, it is the in-cell label. Twice is a duplicate and none is a ` +
      `lost axis, and the visible-rendering check above can see neither.`
  );
});

/**
 * The viewport list is load-bearing, so it is pinned rather than trusted.
 *
 * Drilled by the adversarial pass: restore the defect AND narrow `VIEWPORTS` back to check
 * 31's 320/375 pair, and **every gate in `ci.yml` passes at its committed number** —
 * `npm test` 118/0, handover 10, empty 64 — with `Testednot offered` back on both pages.
 * The handover baseline cannot move, because the handover's abutment findings fire at all
 * four viewports (8 per viewport, from row 13's `.selfcheck` defect), so dropping the two
 * wide ones costs it nothing. A failure COUNT cannot defend a population.
 *
 * The breakpoint is parsed out of `styles.css` rather than written here as 736. That number
 * appearing in a second file with nothing reconciling it is the "two surfaces that can
 * disagree" shape twice over, and this check has already been caught doing it once.
 */
test('check 33 — the viewport list still spans every declared breakpoint (controls)', async () => {
  // Pinned BY VALUE first, and that is the 2026-08-13 hardening. The previous version
  // asserted only that SOME viewport sat above the widest max-width breakpoint and SOME at
  // or below — two bits, against a four-entry list. The adversarial pass cut `VIEWPORTS` to
  // [320, 768], added an ordinary `@media (min-width: 60rem)` rule hiding the depth label,
  // and every gate held at its committed number with no label on any desktop width while
  // THIS control stayed green. A list whose contents are load-bearing has to be pinned, not
  // characterised. 1280 in particular is the width the design has been measured at since
  // CHANGES.md row 4; 375 is the common phone §8 names.
  assert.deepEqual(
    VIEWPORTS.map((v) => v.width),
    [320, 375, 768, 1280],
    'the viewport list changed. It is load-bearing in both directions — the original defect ' +
      'existed only above 736px and the reflow arm only runs below it — so it is pinned here ' +
      'and moves in a reviewed diff rather than by edit'
  );

  const css = await readFile(path.join(REPO_ROOT, 'src/styles.css'), 'utf8');

  // BOTH directions. Reading only `max-width` left every `min-width` rule unbracketed, and
  // a desktop-only rule is exactly how the label was removed above while this passed.
  const declared = [
    ...css.matchAll(/@media\s*\(\s*(max|min)-width:\s*([\d.]+)rem\s*\)/g),
  ].map((m) => ({ kind: m[1], px: Number(m[2]) * 16 }));

  assert.ok(
    declared.length > 0,
    'no `@media (max-width: Nrem)` or `(min-width: Nrem)` found in styles.css — the ' +
      'breakpoints this check brackets could not be read, so the viewport list cannot be ' +
      'shown to bracket them'
  );

  // Every breakpoint the stylesheet declares must have a viewport on each side of it, or
  // the arm that only exists on one side of it never runs.
  for (const { kind, px } of declared) {
    const boundary = kind === 'max' ? px : px - 1;
    assert.ok(
      VIEWPORTS.some((v) => v.width > boundary),
      `no viewport above the ${boundary}px ${kind}-width breakpoint — a rule that applies ` +
        'only above it is never rendered by this check'
    );
    assert.ok(
      VIEWPORTS.some((v) => v.width <= boundary),
      `no viewport at or below the ${boundary}px ${kind}-width breakpoint — a rule that ` +
        'applies only at or below it is never rendered by this check'
    );
  }
});

test('check 33 — the detector still tells a separator from a junction (controls)', () => {
  // Divergent values throughout, never the current ones. Two drills accepted on this repo
  // planted the value already in the page and could not have failed (check 31, and
  // CHANGES.md row 118); a control that cannot go red is decoration.
  // `startsWord` / `endsWord` default to the boundary the SOURCE implies, which is what
  // the page resolves them to whenever the edge whitespace actually renders. The
  // collapsed-space control below overrides them, because that is the case where the
  // source and the rendering disagree and the old text-parsing predicate was blind.
  const run = (text, left, right, top = 10, bottom = 30, ends = {}) => ({
    text,
    first: ends.first !== false,
    last: ends.last !== false,
    startsWord: ends.startsWord ?? JOINS.test(text.slice(0, 1)),
    endsWord: ends.endsWord ?? JOINS.test(text.slice(-1)),
    rect: { left, right, top, bottom },
  });

  // The defect this check was written for: an inline span's text against the text node
  // that follows it, both tight, on one line.
  assert.equal(
    abuts(run('Tested', 100, 145), run('not offered', 145, 210)),
    true,
    'two touching runs with no whitespace on either side were not called an abutment'
  );

  // Either repair. The check must accept both, or it is the fix restated.
  assert.equal(
    abuts(run('Tested ', 100, 149), run('not offered', 149, 214)),
    false,
    'a trailing space on the left run must count as a separator'
  );

  // The collapsed-space case, which the adversarial pass proved this file previously
  // asserted the WRONG way round. Source text ends in a space; the space is at the end of
  // a line box so it painted nothing; the reader sees "Auditnot offered". Verified in
  // Chromium with `<p style="display:inline-block"><span>Audit </span><span>not
  // offered</span></p>`, whose innerText is exactly that. The old predicate read
  // `text.slice(-1)`, saw the space, and answered "separated" — and the control that was
  // meant to protect this planted touching rects with a source-trailing space and asserted
  // `false`, which is this same geometry. It guaranteed the detector could not fire.
  assert.equal(
    abuts(run('Audit ', 100, 145, 10, 30, { endsWord: true }), run('not offered', 145, 210)),
    true,
    'a trailing space that collapsed at a line box edge was treated as a rendered separator'
  );
  assert.equal(
    abuts(run('Tested', 100, 145), run(' not offered', 145, 214)),
    false,
    'a leading space on the right run must count as a separator'
  );

  // Punctuation against an inline element. These are correct English, they print with
  // nothing between the two runs, and the first version of this check reported fourteen
  // of them across five pages. Pinned here so the narrowing cannot be undone by accident.
  assert.equal(
    abuts(run('assessment', 100, 180), run('. A finding is what we saw', 180, 320)),
    false,
    'a full stop after an inline element was reported as a missing space'
  );
  assert.equal(
    abuts(run('ordo', 100, 130), run(': order, sequence, rank.', 130, 260)),
    false,
    'a colon after an inline element was reported as a missing space'
  );
  assert.equal(
    abuts(run('markdown', 100, 160), run(', both ungated', 160, 250)),
    false,
    'a comma after a link was reported as a missing space'
  );
  assert.equal(
    abuts(run('(', 100, 104), run('not offered', 104, 170)),
    false,
    'an opening bracket was treated as a word character'
  );

  // The NBSP-joined price runs. `&nbsp;` is its own whitespace-only text node, dropped by
  // COLLECT, so its neighbours are separated by real rendered width and nothing else.
  assert.equal(
    abuts(run('£2,500 + VAT', 24, 118), run('·', 126, 131)),
    false,
    'runs separated by the width of an nbsp were called an abutment'
  );

  // Stacked, not adjacent. `.prod` and `.scope` are both display:block and share their
  // whole horizontal extent, which is the case that makes a one-axis test useless.
  assert.equal(
    abuts(run('Audit', 24, 70, 10, 30), run('£2,500 + VAT · 1 week', 24, 150, 34, 52)),
    false,
    'two runs on different lines were called an abutment'
  );

  // Overlap is check 23's finding, reported there with the amount. Disjoint on purpose.
  assert.equal(
    abuts(run('Self-check', 100, 180), run('Is authorisation…', 140, 300)),
    false,
    'an overlap was reported as an abutment instead of being left to check 23'
  );

  // Sub-pixel contact is contact. Shared edges land fractionally inside both boxes.
  assert.equal(
    abuts(run('Sustained', 100, 168.4), run('not offered', 168.0, 233)),
    true,
    'a shared edge rounded a fraction of a pixel the wrong way was let through'
  );
  assert.equal(
    abuts(run('one', 100, 130), run('two', 134, 164)),
    false,
    'a 4px gap — a rendered space — was called an abutment'
  );

  // Interior edges of a soft-wrapped node are not junctions. Without this every wrapped
  // paragraph on the site reports its own line breaks as missing spaces.
  assert.equal(
    abuts(run('a long wrapped sentence', 100, 400, 10, 30, { last: false }), run('x', 400, 420)),
    false,
    "a soft-wrap edge was treated as the run's true end"
  );
  assert.equal(
    abuts(run('x', 100, 120), run('continued here', 120, 300, 10, 30, { first: false })),
    false,
    "a soft-wrap edge was treated as the run's true start"
  );
});
