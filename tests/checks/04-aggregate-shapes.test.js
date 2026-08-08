/**
 * Check 4 — aggregate shapes.
 *
 * BRIEF.md §2: "No aggregate score, ever. No gauge, percentage, ring, traffic
 * light, weighted average, or radar chart. No component whose output the eye can
 * sum across dimensions."
 *
 * Check 3 stops the site *saying* there is a total. This stops it *drawing* one.
 * The two are separate failures: a radar chart with no caption still teaches a
 * reader that eight ordinal levels can be enclosed as an area, and an area is a
 * total whatever the surrounding prose says.
 *
 * §13 item 5: "A contributor two years from now tries to add a summary score and
 * the build stops them." This is that stop.
 *
 * Its first draft produced three false positives and all three were instructive,
 * so they are pinned as controls below:
 *
 *   "d3"       matched `id="d3"` — the anchor for dimension 3. Library names are
 *              now only recognised in import and src positions, never as bare
 *              tokens in prose or identifiers.
 *   "1 of 8"   is an ordinal position: question 1 of 8, dimension 1 of 8. An
 *              index is not an aggregate. Only denominators that could be a sum
 *              of levels (24 = 8x3, 32) count.
 *   "score OAL 1"  is the verb, followed by a level. A level is the whole point.
 *              A total has to look like a total: a decimal, or a ratio.
 *
 * §3 said this check would produce false positives eventually. It produced them
 * immediately, which is better — it means the controls were written while the
 * reasoning was still visible.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSource, withSite } from '../lib/harness.js';
import { ledgerFor } from '../lib/allowances.js';

/** Markup that can only exist to draw an aggregate. */
const FORBIDDEN_MARKUP = [
  { name: '<canvas>', re: /<canvas[\s>]/i },
  { name: '<progress> or <meter>', re: /<(?:progress|meter)[\s>]/i },
  { name: 'radar/spider chart', re: /\b(?:radar|spider)[-_]?chart\b/i },
  { name: 'gauge', re: /\b(?:gauge|speedometer|dial)[-_]?(?:chart|widget|meter)?\b(?!\w)/i },
  { name: 'progress ring / donut', re: /\b(?:progress[-_]?ring|donut[-_]?chart|doughnut|circular[-_]?progress)\b/i },
  { name: 'traffic light', re: /\b(?:traffic[-_]?light|rag[-_]?status|red[-_]amber[-_]green)\b/i },
  { name: 'weighted average', re: /\bweighted[-_]average\b/i },
];

/**
 * Charting libraries, recognised only where a library can actually arrive:
 * a script src, an ES import, or a require. Never as a bare token, because
 * `id="d3"` is a dimension anchor and `c3` is a cell reference.
 */
const LIB = /\b(?:chart\.?js|highcharts|apexcharts|echarts|plotly|recharts|nivo|amcharts|d3|c3)\b/i;
const IMPORT_POSITIONS = [
  /<script[^>]+src\s*=\s*["']([^"']+)["']/gi,
  /\bimport\s[^;'"]*from\s*["']([^"']+)["']/gi,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gi,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gi,
];

/**
 * A number that reads as a total across the eight dimensions.
 * Ordinal positions ("1 of 8") are excluded by construction: only denominators
 * that could be a sum of levels count.
 */
const TOTAL_SHAPES = [
  /\b\d{1,2}\s*(?:\/|out of|of)\s*(?:24|32)\b/i, // 18 of 24
  /\b\d\.\d\s*(?:\/|out of)\s*3\b/i, // 2.4 / 3
  /\b(?:overall|total|composite|aggregate|mean|average)\s+(?:score|level|rating)\b[^.\n]{0,20}?\b\d/i,
  /\bscore\b[^.\n]{0,12}?\b\d+\.\d+\b/i, // score: 2.4 — a decimal level is a mean
];

test('check 4 — no markup that can draw an aggregate', async () => {
  const ledger = await ledgerFor(4);
  const violations = [];

  await withSource(({ sources }) => {
    for (const { url, html } of sources) {
      for (const { name, re } of FORBIDDEN_MARKUP) {
        const m = html.match(re);
        if (!m || ledger.allows(url, m[0])) continue;
        violations.push(`${url}: ${name} — "${m[0]}"`);
      }
      for (const positionRe of IMPORT_POSITIONS) {
        positionRe.lastIndex = 0;
        for (const m of html.matchAll(positionRe)) {
          if (!LIB.test(m[1])) continue;
          if (ledger.allows(url, m[1])) continue;
          violations.push(`${url}: charting library imported — "${m[1]}"`);
        }
      }
    }
  });

  assert.deepEqual(violations, [], `aggregate-capable markup found:\n  ${violations.join('\n  ')}`);
  assert.deepEqual(ledger.unused().map((a) => a.id), [], 'stale check-4 allowances');
});

test('check 4 — no numeric total across dimensions', async () => {
  const violations = [];

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      const text = await page.evaluate(() => document.body.innerText || '');
      for (const re of TOTAL_SHAPES) {
        for (const m of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) {
          violations.push(`${url}: "${m[0]}"`);
        }
      }
    }
    await page.close();
  });

  assert.deepEqual(
    violations,
    [],
    `a number that reads as a total across dimensions:\n  ${violations.join('\n  ')}`
  );
});

test('check 4 — the detectors still catch a real aggregate (controls)', () => {
  // Without these, the tightening above could have turned check 4 into a no-op.
  const mustCatchMarkup = [
    '<canvas id="scorechart"></canvas>',
    '<div class="radar-chart"></div>',
    '<progress value="18" max="24"></progress>',
    '<span class="traffic-light rag-status"></span>',
    '<div class="progress-ring"></div>',
  ];
  for (const html of mustCatchMarkup) {
    assert.ok(
      FORBIDDEN_MARKUP.some(({ re }) => re.test(html)),
      `markup detector missed an aggregate it must catch: ${html}`
    );
  }

  const mustCatchImports = [
    '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>',
    "import * as d3 from 'd3';",
    "const Highcharts = require('highcharts');",
  ];
  for (const src of mustCatchImports) {
    const hit = IMPORT_POSITIONS.some((re) => {
      re.lastIndex = 0;
      return [...src.matchAll(re)].some((m) => LIB.test(m[1]));
    });
    assert.ok(hit, `import detector missed a charting library: ${src}`);
  }

  const mustCatchTotals = ['Total score: 18 of 24', 'Composite level 2.4 / 3', 'Overall score 71'];
  for (const text of mustCatchTotals) {
    assert.ok(
      TOTAL_SHAPES.some((re) => re.test(text)),
      `total detector missed an aggregate it must catch: ${text}`
    );
  }

  const mustPermit = [
    '<section id="d3">',            // dimension 3's anchor, not D3.js
    'Question 1 of 8',              // an ordinal position
    'systems score OAL 1 across the board', // the verb, then a level
    'dimension 3 of 8',
  ];
  for (const text of mustPermit) {
    const markupHit = FORBIDDEN_MARKUP.some(({ re }) => re.test(text));
    const totalHit = TOTAL_SHAPES.some((re) => re.test(text));
    const importHit = IMPORT_POSITIONS.some((re) => {
      re.lastIndex = 0;
      return [...text.matchAll(re)].some((m) => LIB.test(m[1]));
    });
    assert.ok(
      !markupHit && !totalHit && !importHit,
      `detector flagged a legitimate ordinal or identifier: ${text}`
    );
  }
});

test('check 4 — the measure keeps its fixed, non-data-driven geometry', async () => {
  // RATIONALE.md: the ratio is "fixed and identical on every dimension and every
  // page". A per-dimension curve would be an invented datum; worse, a
  // data-driven width is the first step toward a bar whose length can be summed.
  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    const seen = new Set();
    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      const positions = await page.evaluate(() =>
        [...document.querySelectorAll('.measure')].map((m) =>
          [...m.querySelectorAll('.tick')]
            .map((t) => getComputedStyle(t).getPropertyValue('--p').trim())
            .join('|')
        )
      );
      positions.filter(Boolean).forEach((p) => seen.add(p));
    }
    await page.close();

    assert.ok(
      seen.size <= 1,
      `the measure's tick geometry varies between instances, so it is data-driven ` +
        `rather than fixed: ${[...seen].join('  vs  ')}`
    );
  });
});
