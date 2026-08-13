/**
 * Check 33 — two words never print with nothing between them.
 *
 * Reported by the user against the live site on 2026-08-13: the coverage × depth grid on
 * Home and Services rendered `Testednot offered` and `Sustainednot offered`.
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
 * Overlap is check 23's job, and the two are kept disjoint on purpose: `abuts` requires the
 * edges to *touch* (|gap| ≤ 1px) and returns false for a real overlap, which check 23
 * already reports with the amount. A pair that overlaps is a collision, not an abutment,
 * and reporting it twice in two vocabularies would make both findings harder to read.
 *
 * Soft-wrapped fragments are compared only at their true ends (`first` / `last` below). A
 * fragment that continues onto the next line has no right-hand neighbour on its own line
 * to abut, and a fragment that continues *from* the previous one begins its line; treating
 * those interior edges as junctions would compare two halves of one word against each other
 * and report every wrapped paragraph on the site.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSite } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import { CLIP_ORACLE } from '../lib/visibility.js';
import { abuts, TOLERANCE } from '../lib/overlap.js';

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

    for (const [i, r] of rects.entries()) {
      if (!__isVisible(r, node)) continue;
      out.push({
        text: raw,
        first: i === 0,
        last: i === rects.length - 1,
        tag: el.tagName.toLowerCase(),
        cls: el.className && typeof el.className === 'string' ? el.className : '',
        rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      });
    }
  }
  return out;
}`;

/** A run, as it should read in a finding. */
const describe_ = (r) => {
  const where = r.cls ? `${r.tag}.${r.cls.trim().split(/\s+/).join('.')}` : r.tag;
  const text = r.text.trim().replace(/\s+/g, ' ');
  return `<${where}> "${text.length > 40 ? text.slice(0, 40) + '…' : text}"`;
};

test('check 33 — no two runs of text print with no space between them', async () => {
  const s = survey({
    renders: 'page renders measured (pages x viewports)',
    pairs: 'horizontally adjacent run pairs compared',
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
            s.count('pairs');
            if (!abuts(a, b)) continue;
            findings.push(
              `${url} at ${viewport.width}px: ${describe_(a)} and ${describe_(b)} print as ` +
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

test('check 33 — the detector still tells a separator from a junction (controls)', () => {
  // Divergent values throughout, never the current ones. Two drills accepted on this repo
  // planted the value already in the page and could not have failed (check 31, and
  // CHANGES.md row 118); a control that cannot go red is decoration.
  const run = (text, left, right, top = 10, bottom = 30, ends = {}) => ({
    text,
    first: ends.first !== false,
    last: ends.last !== false,
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
