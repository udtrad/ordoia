/**
 * Check 23 — nothing in the measure is printed over anything else.
 *
 * The measure is the instrument. It is the one graphic on the site that carries an
 * argument rather than decorating one, and §7 says the question inside the untravelled
 * span "is not optional at any breakpoint".
 *
 * **Check 13 already tests that, and it passed for the entire life of the site while the
 * question sat under 55 pixels of another paragraph.** That is the finding worth keeping:
 * check 13 asks whether the question is *present* — not hidden, not collapsed, not empty —
 * and every one of those answers was yes. Presence is not legibility. Text that is
 * rendered, visible, non-empty and printed on top of other text passes every assertion
 * check 13 makes and cannot be read by anyone.
 *
 * ── The defect this was written against ─────────────────────────────────────────────
 *
 * `.span` was `position: absolute` inside a `.measure__rule` of `height: 1px`, so it hung
 * out of flow. `.stamp` followed the rule in normal flow. `.measure--q`'s `padding-bottom`
 * reserved the span's height at the *figure's* bottom edge — past the stamp, not between
 * them — so the reservation never separated the two things that collided. Measured at
 * 36.5–55.4px of overlap on all three `size: "q"` measures, at every width from 760px up.
 *
 * It arrived in the design handover (root `styles.css`) and survived a design pass, a
 * brand review, twenty-two checks and a launch, because nothing had ever compared two
 * rendered boxes to each other.
 *
 * ── Why 800px is in the viewport list ───────────────────────────────────────────────
 *
 * Check 13 samples 1280, 640 and 320. Two of those are below the 46rem breakpoint, where
 * the measure rotates and the defect does not exist. So the *shape* of check 13's viewport
 * list already concentrated its evidence on one desktop width. 800px is a second desktop
 * sample inside the band where the layout is widest-but-not-wide, which is where a
 * fixed-height reservation of the kind this defect had breaks first.
 *
 * ── Scope, and why it is the measure rather than the page ───────────────────────────
 *
 * A site-wide "no text overlaps text" detector is the tempting generalisation and it is a
 * false-positive machine: knocked-out backgrounds, deliberate overlays and visually-hidden
 * content all read as collisions. The measure is scoped tightly enough to be exact — five
 * named text-bearing parts — and it is where the site's one load-bearing graphic lives.
 * `.vh` is excluded by construction: it is the screen-reader table, positioned off-canvas.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSite } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import { collides, collisions, intersection, TOLERANCE } from '../lib/overlap.js';

/**
 * Desktop twice, then the two check 13 already samples.
 *
 * 1280 and 800 are both above the 46rem breakpoint and both carry the horizontal measure;
 * 640 and 320 are below it and carry the rotated one. Sampling both sides is the point —
 * the fix changes the layout on one side of that line and must not disturb the other.
 */
const VIEWPORTS = [
  { width: 1280, height: 900 },
  { width: 800, height: 900 },
  { width: 640, height: 800 },
  { width: 320, height: 720 },
];

/**
 * The text-bearing parts of a measure.
 *
 * Ticks, marks, the fill and the floor mark are omitted deliberately: they carry no text,
 * and the ticks *are* drawn through the labels' bounding boxes by design. Including them
 * would make the check red on a correct page, which is the fastest way to get a check
 * deleted.
 */
const PARTS = '.measure__dim, .label, .span, .stamp, .na';

/** Read every measure on the page as plain rectangles. Geometry happens in node. */
const readMeasures = (page) =>
  page.evaluate((selector) => {
    return [...document.querySelectorAll('figure.measure')].map((fig, index) => ({
      index,
      caption: (fig.querySelector('.measure__dim')?.textContent || '').trim().slice(0, 48),
      parts: [...fig.querySelectorAll(selector)].map((el) => {
        const r = el.getBoundingClientRect();
        return {
          label: `.${(typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean).join('.')}`,
          text: (el.textContent || '').trim().slice(0, 40),
          rect: {
            top: r.top,
            right: r.right,
            bottom: r.bottom,
            left: r.left,
            width: r.width,
            height: r.height,
          },
        };
      }),
    }));
  }, PARTS);

/**
 * Wait for the fonts before measuring.
 *
 * Not optional here, and checks 17 and 18 already do it. `font-display` is `optional` and
 * `swap` in this stylesheet, so a page measured before the faces land is measured in
 * fallback metrics — and fallback line boxes differ from the real ones by far more than
 * the 1px tolerance. Without this the check's answer depends on a font-load race, which
 * is the one way a legibility check turns into an intermittent red nobody trusts.
 */
const settled = async (page) => {
  await page.evaluate(() => document.fonts.ready);
};

test('check 23 — no two text-bearing parts of a measure are printed over each other', async () => {
  const clashes = [];
  // `pairs` is the population that matters. A selector that stopped matching would leave
  // measures found and zero pairs compared, and "no collisions" would then be a statement
  // about nothing. This is the population rule applied to a comparison rather than a list.
  const s = survey({
    renders: 'page renders measured (pages x viewports)',
    measures: 'figure.measure elements inspected',
    pairs: 'pairs of text-bearing parts compared',
  });

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const { url } of pages) {
        await page.goto(origin + url, { waitUntil: 'load' });
        await settled(page);
        s.count('renders');

        for (const measure of await readMeasures(page)) {
          s.count('measures');
          const { findings, compared } = collisions(measure.parts, (p) => p.label);
          s.count('pairs', compared);
          for (const f of findings) {
            clashes.push(`${url} at ${viewport.width}px, measure "${measure.caption}": ${f}`);
          }
        }
      }
    }

    await page.close();
  });

  s.failAll(clashes);
  s.report(
    `text printed over text inside a measure:\n  ${clashes.join('\n  ')}\n\n` +
      'The measure carries the argument. A question nobody can read is the same defect ' +
      'as a question that is not there, and check 13 cannot tell the two apart.'
  );
});

test('check 23 — the detector still tells contact from collision (controls)', () => {
  const box = (top, left, height, width) => ({
    top,
    left,
    bottom: top + height,
    right: left + width,
    width,
    height,
  });

  // Stacked in normal flow: full horizontal overlap, touching edges. Not a collision, and
  // this is the case a naive one-axis detector reports as one on every page it visits.
  assert.equal(collides(box(0, 0, 20, 100), box(20, 0, 20, 100)), false);

  // Side by side, sharing a vertical band. Also not a collision.
  assert.equal(collides(box(0, 0, 20, 100), box(0, 100, 20, 100)), false);

  // The defect: a box hanging into the one below it on both axes.
  assert.equal(collides(box(0, 0, 60, 100), box(20, 10, 40, 50)), true);

  // Sub-pixel contact is contact. Fractional layout puts shared edges here constantly.
  assert.equal(collides(box(0, 0, 20, 100), box(19.4, 0, 20, 100)), false);
  assert.ok(TOLERANCE >= 1, 'the tolerance has to absorb a fractional shared edge');

  // The threshold itself, from both sides. Without these, changing `>` to `>=` or nudging
  // TOLERANCE to absorb a flake would move the detection floor with every control still
  // green — and the floor is the only thing separating "contact" from "unreadable".
  const overlapBy = (d) => collides(box(0, 0, 20, 100), box(20 - d, 0, 20, 100));
  assert.equal(overlapBy(TOLERANCE), false, 'exactly TOLERANCE is contact, not collision');
  assert.equal(overlapBy(TOLERANCE + 0.1), true, 'just past TOLERANCE is a collision');

  // Clearance is reported as a negative, which is what makes a finding say how far.
  assert.equal(intersection(box(0, 0, 20, 100), box(30, 0, 20, 100)).vertical, -10);

  // Zero-area boxes are dropped before comparison, not counted as clear.
  const { compared } = collisions([
    { label: '.a', rect: box(0, 0, 0, 0) },
    { label: '.b', rect: box(0, 0, 20, 100) },
  ]);
  assert.equal(compared, 0, 'a box with no area is not a comparand');

  // And the pair count is the evidence the survey declares. Three parts, three pairs.
  const three = collisions([
    { label: '.a', rect: box(0, 0, 10, 10) },
    { label: '.b', rect: box(50, 0, 10, 10) },
    { label: '.c', rect: box(100, 0, 10, 10) },
  ]);
  assert.equal(three.compared, 3);
  assert.deepEqual(three.findings, []);

  // n = 0 and n = 1 pin the `j = i + 1` loop against an off-by-one that would compare an
  // element with itself and report every measure as colliding with nothing.
  assert.deepEqual(collisions([]), { findings: [], compared: 0 });
  assert.deepEqual(collisions([{ label: '.only', rect: box(0, 0, 10, 10) }]), {
    findings: [],
    compared: 0,
  });
});

test('check 23 — restoring the pre-fix layout turns this check red (control)', async () => {
  /**
   * The control that matters, and the reason this check is worth its runtime.
   *
   * Everything above proves the arithmetic. This proves the *check* — that the selectors
   * still reach the real elements, and that the specific CSS which shipped the defect is
   * still caught by it. A detector that goes green on a fixed page has shown nothing; a
   * detector that goes red when the defect is put back has shown exactly one thing, which
   * is the thing it was written to show.
   *
   * The declarations below are the ones this session replaced, quoted from the build that
   * shipped on 2026-08-10. If a future refactor makes them stop reproducing the collision,
   * this control goes green-when-it-should-be-red and fails loudly on the assertion below
   * rather than quietly passing.
   */
  const PRE_FIX_CSS = `
    .measure__rule { height: 1px; background: var(--track); }
    .measure__rule::before { content: none; }
    .span {
      position: absolute;
      display: block;
      top: 1.05rem;
      left: var(--from);
      margin: 0;
      width: calc(var(--to) - var(--from));
    }
    .measure--q { padding-bottom: 6.5rem; }
  `;

  const s = survey({
    renders: 'page renders measured with the pre-fix stylesheet restored',
    reproduced: 'measures in which the original collision reappeared',
  });

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });

    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      await page.addStyleTag({ content: PRE_FIX_CSS });
      await settled(page);
      s.count('renders');

      for (const measure of await readMeasures(page)) {
        const { findings } = collisions(measure.parts, (p) => p.label);
        if (findings.length > 0) s.count('reproduced');
      }
    }

    await page.close();
  });

  // No findings are expected here — the collisions are the *point* of this test, so they
  // are counted rather than failed. What must hold is that putting the defect back puts
  // the collision back.
  assert.ok(
    s.size('reproduced') > 0,
    'restoring the pre-fix CSS produced no collision, so this check can no longer be ' +
      'shown to detect the defect it was written for. Either the selectors have drifted ' +
      'away from the real elements, or the quoted declarations no longer describe what ' +
      'shipped — and in both cases the green above means nothing.'
  );

  s.report('the pre-fix stylesheet reproduces the collision this check exists to catch');
});

/* ================================================================================== *
 * The priced surfaces.
 *
 * Draft 5 §5 says to "re-run check 23 at every breakpoint after the card headers grow —
 * it is the only check that can see a header running under an adjacent element". That
 * instruction could not be carried out as written, and the reason is worth recording:
 *
 *   **`/services/` contains no `figure.measure` at all.** Measured, not assumed — Home
 *   has one, `/oal/` and `/oal/v1.0/` two each, `/scorecard/` eight, Services **zero**.
 *   Everything above this line selects inside `figure.measure`, so re-running it after
 *   the card headers grew would have rendered Services four more times and inspected
 *   nothing on it. The check was green on that page for the same reason it would have
 *   stayed green if every header had collapsed into the next: it was never looking.
 *
 * That is check 13's lesson arriving one layer up. Check 13 asked whether the question
 * was *present* and never whether it was *readable*; this asks whether the collision
 * detector *ran* and not merely whether it passed.
 *
 * So the detector's reach is extended to the surfaces that carry a price — the three
 * card headers on Services and every cell of the coverage x depth grid on both pages
 * that render it. The arithmetic is unchanged; only what it is pointed at is new.
 * ================================================================================== */

/** Text-bearing parts of a priced surface, within one section or one grid cell. */
const PRICED_PARTS = 'h2, .note, .prod, .scope .v, .rowhead, .path';

/**
 * Every priced surface on the page, as plain rectangles.
 *
 * A "surface" is one card section or one grid cell — the unit inside which two pieces of
 * text printing over each other would be the defect. Comparing across surfaces would
 * report every adjacent card as a collision.
 *
 * ── Two corrections this needed, both found by running it ─────────────────────────
 *
 * The first draft of this reported eleven collisions on a correct page, and neither
 * cause was a defect. Both are recorded because both are ways a rectangle-based
 * detector lies, and the existing measure arm never met either — its parts are
 * block-level siblings, so it had no occasion to.
 *
 *   1. **A container always "overlaps" its own descendant.** `.path` lives inside
 *      `.rowhead`, so comparing both reported 53.9px x 125.7px of overlap on every
 *      render. Fixed by taking only the innermost matching element, the same filter
 *      check 12 applies to prose blocks and for the same reason.
 *
 *   2. **`getBoundingClientRect()` on an inline element spanning two lines returns the
 *      union of its line boxes**, which covers horizontal space the element never
 *      paints on. `from £3,000/month + VAT` wraps after "from" inside a grid cell, so
 *      its rect swallowed the line below it and reported a 17px x 119.8px collision
 *      with a sibling that is simply on the next line. Fixed with `getClientRects()`,
 *      which returns one rect per line box: a wrapped element becomes several parts,
 *      each compared where it is actually drawn.
 *
 * Neither is a weakening. A real overlap is still a real overlap on the line where it
 * happens, and the control below proves the detector still catches one.
 */
const readPricedSurfaces = (page) =>
  page.evaluate((selector) => {
    const surfaces = [
      ...[...document.querySelectorAll('main section.block')].map((el) => ({ el, kind: 'section' })),
      ...[...document.querySelectorAll('table.grid td, table.grid th')].map((el) => ({ el, kind: 'cell' })),
    ];
    return surfaces
      .map(({ el: root, kind }) => ({
        kind,
        label: (root.querySelector('h2, .prod, .rowhead')?.textContent || root.textContent || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 44),
        parts: [...root.querySelectorAll(selector)]
          .filter((el) => (el.textContent || '').trim().length > 0)
          // Innermost only: a container and its own descendant are not two things.
          .filter((el) => !el.querySelector(selector))
          // A section.block encloses the grid, so without this every cell's parts were
          // compared again inside the section — 210 extra cross-cell pairs per render on
          // Home, every one of them the cross-surface comparison this function's own
          // comment rules out. Harmless only because table cells never overlap.
          .filter((el) => kind === 'cell' || !el.closest('table.grid'))
          .flatMap((el) => {
            const name =
              `.${(typeof el.className === 'string' ? el.className : '')
                .split(/\s+/)
                .filter(Boolean)
                .join('.')}`.replace(/^\.$/, el.tagName.toLowerCase());
            const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
            // One rect per line box, so a wrapped inline element is compared where it
            // is drawn rather than across the union of the lines it touches.
            return [...el.getClientRects()].map((r, line, all) => ({
              label: all.length > 1 ? `${name}[line ${line + 1}]` : name,
              text,
              rect: {
                top: r.top,
                right: r.right,
                bottom: r.bottom,
                left: r.left,
                width: r.width,
                height: r.height,
              },
            }));
          }),
      }))
      .filter((s) => s.parts.length > 1);
  }, PRICED_PARTS);

test('check 23 — no two text-bearing parts of a priced surface are printed over each other', async () => {
  const clashes = [];
  const s = survey({
    renders: 'page renders measured (pages x viewports)',
    surfaces: 'priced surfaces inspected — card sections and grid cells',
    pairs: 'pairs of text-bearing parts compared',
  });

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const { url } of pages) {
        await page.goto(origin + url, { waitUntil: 'load' });
        await settled(page);
        s.count('renders');

        for (const surface of await readPricedSurfaces(page)) {
          s.count('surfaces');
          const { findings, compared } = collisions(surface.parts, (p) => p.label);
          s.count('pairs', compared);
          for (const f of findings) {
            clashes.push(`${url} at ${viewport.width}px, "${surface.label}": ${f}`);
          }
        }
      }
    }

    await page.close();
  });

  s.failAll(clashes);
  s.report(
    `text printed over text on a surface that carries a price:\n  ${clashes.join('\n  ')}\n\n` +
      'A price a reader cannot read is worse than a price that is missing, because the ' +
      'page looks finished. This is the same arithmetic the measure is held to, pointed ' +
      'at the card headers and the grid — which nothing was looking at until 2026-08-11, ' +
      'because the only collision detector in the suite selected inside figure.measure ' +
      'and Services has none.'
  );
});

test('check 23 — the priced-surface detector catches a header run under (control)', async () => {
  /**
   * The control that makes the test above worth its runtime.
   *
   * Card headers sit in normal flow, so today they cannot overlap — which means a green
   * result proves nothing on its own, and a selector that silently stopped matching
   * would look exactly the same. This plants the failure the extension exists to catch:
   * one absolutely-positioned header pulled up over the paragraph beneath it, which is
   * precisely the shape of the defect that survived a design pass, a brand review and a
   * launch on the measure.
   *
   * `addStyleTag` mutates only the loaded page and never the working tree.
   */
  /**
   * The plant is co-location, not a nudge, and that is a 2026-08-13 correction.
   *
   * It used to pull the heading down a fixed `2.2rem` and hope that landed on the
   * paragraph beneath. Whether it did depended on the rendered heights above it, which
   * depend on which fonts the environment actually has — so the control passed on macOS
   * and **failed on Linux**, where the designer handover's off-origin webfonts do not
   * load and everything renders in fallback metrics. Found the first time this suite ran
   * in CI: 11 movable sections, 0 collisions reproduced, and the failure was the plant
   * missing rather than the detector being blind.
   *
   * Pinning the heading and its next sibling to the same origin makes the overlap true by
   * construction: two text runs at the same top, in the same box, at any font size in any
   * environment. A control whose reproduction depends on metrics is a control that tells
   * you about the runner.
   */
  const RUN_UNDER_CSS = `
    section.block { position: relative; }
    section.block > h2 { position: absolute; top: 0; left: 0; right: 0; margin: 0; }
    section.block > h2 + * { position: absolute; top: 0; left: 0; right: 0; margin: 0; }
    table.grid td { position: relative; }
    table.grid td .prod { position: absolute; top: 0; left: 0; right: 0; }
    table.grid td .prod + * { position: absolute; top: 0; left: 0; right: 0; }
  `;

  const s = survey({
    renders: 'page renders measured with a header pulled out of flow',
    sections: 'card sections carrying a heading the planted CSS can move',
    cells: 'grid cells carrying a product name the planted CSS can move',
  });
  let reproducedSection = 0;
  let reproducedCell = 0;

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });

    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      await page.addStyleTag({ content: RUN_UNDER_CSS });
      await settled(page);
      s.count('renders');

      for (const surface of await readPricedSurfaces(page)) {
        // Count only surfaces the planted CSS can actually perturb. The handover has two
        // `table.grid` cells, but they carry no `.prod` — so a population of "cells that
        // exist" asserted that a frozen 2026 artifact contains markup it never had, and
        // turned the handover baseline 9 -> 10 for a reason that was about the fixture
        // rather than the detector. The population has to be the thing the control moves.
        const movable =
          surface.kind === 'cell'
            ? surface.parts.some((part) => part.label.includes('prod'))
            : surface.parts.some((part) => part.label === 'h2' || part.label.includes('h2'));
        if (movable) s.count(surface.kind === 'cell' ? 'cells' : 'sections');
        const { findings } = collisions(surface.parts, (p) => p.label);
        if (findings.length === 0) continue;
        if (surface.kind === 'cell') reproducedCell += 1;
        else reproducedSection += 1;
      }
    }

    await page.close();
  });

  // The collisions are the point here, so they are counted rather than failed.
  //
  // Each arm is asserted SEPARATELY and only where that surface exists. Both halves of
  // that matter. Asserting only the section arm — the first version of this control —
  // let `table.grid td`, `.prod` or `.scope .v` all stop matching with the main test's
  // population still healthy and this control still green, and the grid is exactly half
  // of what the extension was written to reach. But asserting the grid arm
  // *unconditionally* fails on the designer handover, which has no `table.grid` with
  // these classes and never did: that would be this control asserting a fact about a
  // frozen 2026 artifact rather than about the detector. Conditioning on the surface
  // population is the honest form — where the structure exists, perturbing it must
  // reproduce a collision; where it does not, there is nothing to prove.
  // A target legitimately without one of these structures is not a target that measured
  // nothing — it is a target the planted CSS has no purchase on. `mayBeEmpty` is the
  // harness's own way of saying so out loud, the same way check 21 says it about an
  // unpublished version, rather than letting an empty population read as a silent pass.
  if (s.size('sections') === 0) {
    s.mayBeEmpty(
      'sections',
      'this target renders no section.block carrying an h2, so there is no heading for ' +
        'the planted CSS to pull out of flow and nothing about the detector to prove here'
    );
  }
  if (s.size('cells') === 0) {
    s.mayBeEmpty(
      'cells',
      'this target renders no grid cell carrying a .prod product name — the designer ' +
        'handover has table cells but never had that markup — so the grid arm of the ' +
        'planted CSS has nothing to move and proves nothing on this target'
    );
  }

  if (s.size('sections') > 0) {
    assert.ok(
      reproducedSection > 0,
      `${s.size('sections')} card sections carrying a movable heading were found, but ` +
        'pulling a section heading out ' +
        'of flow produced no collision in any of them — so this detector cannot be shown ' +
        'to see a header running under an adjacent element, which is the only thing §5 ' +
        'asked it for. Either PRICED_PARTS no longer matches the real elements or the ' +
        'surfaces list has drifted, and either way the green above means nothing.'
    );
  }
  if (s.size('cells') > 0) {
    assert.ok(
      reproducedCell > 0,
      `${s.size('cells')} grid cells carrying a product name were found, but pulling it ` +
        'out of flow ' +
        'produced no collision in any of them, so the grid half of this detector is ' +
        'unproven. The grid is where every price on the site is rendered; a selector that ' +
        'silently stopped matching there would leave the main test green over an ' +
        'unreadable price.'
    );
  }

  s.report('a header and a product name pulled out of flow reproduce the collisions this extension exists to catch');
});
