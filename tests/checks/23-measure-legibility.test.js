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
