/**
 * Check 30 — the footer field strip.
 *
 * Draft 6 §5.4. The footer is a field list, and until this file existed **nothing
 * measured it at all**: check 12's `PROSE` is `main`-scoped, check 23's selector lives
 * inside `figure.measure`, and check 7 reads `getComputedStyle` with no pseudo-element
 * argument. That last one is why the separator matters here rather than in check 7 —
 * a separator drawn with `content:` is not a DOM text node, so the contrast suite
 * cannot see it, and this project has already shipped one at 1.37:1 that way
 * (CHANGES.md row 49).
 *
 * ── Why this check reads the rendered DOM and not the template ────────────────────
 *
 * Every guard on this branch that consulted the same predicate as the thing it was
 * guarding turned out to be structurally unable to fail: check 27 filtered its
 * expectations through `isChromeSelector`, so a selector the derivation could not keep
 * was a selector the guard never asked for. The population here is therefore taken from
 * text-node client rects — whatever the markup happens to be, a middot that renders is
 * a middot this check sees, and a separator form nobody has thought of is covered by
 * construction.
 *
 * ── What it holds ─────────────────────────────────────────────────────────────────
 *
 *   1. Every separator is a real text node. No generated content anywhere in the strip.
 *   2. No visual line of the strip begins or ends with a separator, at any width.
 *   3. The strip's text — separators included — meets 4.5:1. A separator is text.
 *   4. The email field is a link, underlined at rest, and a 44px target on mobile.
 *   5. `footerLine()` drops a field whose value is empty, so a label can never survive
 *      its value and an empty anchor can never render.
 *
 * Test 2 is the one that was hard. See the note above `lines()`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSite, IS_HANDOVER } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import { CLIP_ORACLE } from '../lib/visibility.js';
import { contrastRatio } from '../lib/contrast.js';
import { footerLine } from '../../eleventy.config.js';

const VIEWPORTS = [
  { width: 1280, height: 900 },
  { width: 768, height: 900 },
  { width: 375, height: 800 },
  { width: 320, height: 720 },
];

/** The separator this design uses between fields. */
const SEPARATOR = '·';

/** WCAG 1.4.3 for body text. A separator is text, so it is held to the text ratio. */
const AA_TEXT = 4.5;

/** The touch target §5.4 requires on mobile. */
const TARGET_PX = 44;

/** Fonts settled: fallback metrics wrap differently, and this check is about wrapping. */
const settled = (page) => page.evaluate(() => document.fonts.ready);

/**
 * The designer handover has no field strip to measure, and that is the artifact being
 * old rather than a defect.
 *
 * Measured, not assumed: its footer is a **sentence** — `Ordoia · third-party assurance
 * for LLM and agent systems · United Kingdom` in a `<p>` — with no `ul.legal`, no field
 * list and no address. The list replaced that sentence afterwards (`site.json`'s footer
 * comment records `country`'s only consumer disappearing with it). Asserting a field strip
 * against the handover would be asserting that a frozen artifact should have changed,
 * which is check 25's reasoning about the same footer on the same target.
 *
 * The two tests that do NOT take this skip are the ones that read no target at all: the
 * filter's unit test and the line detector's controls run everywhere, because a pure
 * function is as true against the handover as against the build.
 */
const HANDOVER_SKIP =
  'the designer handover predates the footer field list — its footer is a sentence in a <p> ' +
  'with no ul.legal, no fields and no address, so there is no strip to measure and asserting ' +
  'one would assert that a frozen artifact should have changed';

/**
 * Every rendered run of text in the strip, as client rects.
 *
 * Ranges over text nodes rather than element boxes, for one reason that decides the whole
 * check: the separator lives *inside* the `<li>` of the field it follows, so an element
 * rect covers the field and its separator together and cannot say which of them is at the
 * edge of a line. A `Range` over the text node gives the middot its own box.
 *
 * `getClientRects()` and not `getBoundingClientRect()`: a text node broken across two
 * lines has two boxes, and the bounding box of the pair spans both lines — a run that
 * appears to start at the left edge of line 1 and end at the right edge of line 2.
 */
async function strip(page) {
  return page.evaluate(`(() => {
    ${CLIP_ORACLE}
    const ul = document.querySelector('footer ul.legal');
    if (!ul) return { found: false, runs: [] };

    const runs = [];
    const walker = document.createTreeWalker(ul, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.nodeValue || '').trim();
      if (!text) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width === 0 || rect.height === 0) continue;
        runs.push({
          text,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          // Decided HERE, against every clipping ancestor's real clip region, not
          // inferred later from the list's border box. See tests/lib/visibility.js.
          seen: __isVisible(rect, node),
        });
      }
    }
    return { found: true, runs };
  })()`);
}

/**
 * The runs a reader can actually see.
 *
 * Was a border-box comparison until 2026-08-13, and the red team drilled it dead: the
 * list clips with `overflow: hidden` today, but `overflow: clip` with an
 * `overflow-clip-margin` paints OUTSIDE the border box by design. With a 12px margin
 * every row-leading separator rendered, was hit-testable, and this filter still threw it
 * away as "outside the list" — so the guard written to catch a dangling separator could
 * not see one. **A geometric proxy for the clip is not the clip.**
 *
 * Visibility is now decided in-page against every clipping ancestor's actual region,
 * clip-margin included. What this filter does NOT relax is unchanged and load-bearing: a
 * run inside the region is always kept, so the end-of-row case is untouched.
 */
const visible = (runs) => runs.filter((r) => r.seen);

/**
 * Group rendered runs into visual lines.
 *
 * Grouped by vertical overlap rather than by an equal `top`, because the email link is a
 * taller box than the plain fields on mobile (it carries the 44px target) and its runs
 * therefore do not share a `top` with the text beside them. Two runs are on the same line
 * when their vertical extents overlap at all — which is what "the same line" means to a
 * reader, and does not depend on every field having the same height.
 */
function lines(runs) {
  const out = [];
  for (const run of [...runs].sort((a, b) => a.top - b.top || a.left - b.left)) {
    // Matched against the row's SEED extent, which never widens. Widening it made this
    // single-linkage clustering: one run overlapping both sides of a gap chained two
    // genuinely non-overlapping rows into one, and a dangling separator on the first of
    // them stopped being at the end of anything. Drilled by the red team 2026-08-13 —
    // a bridging run needs only a taller line box than its neighbours, which is the exact
    // condition (the 44px email link) this grouping was written to tolerate.
    const row = out.find((r) => run.top < r.seedBottom - 1 && run.bottom > r.seedTop + 1);
    if (row) {
      row.runs.push(run);
      row.top = Math.min(row.top, run.top);
      row.bottom = Math.max(row.bottom, run.bottom);
    } else {
      out.push({ top: run.top, bottom: run.bottom, seedTop: run.top, seedBottom: run.bottom, runs: [run] });
    }
  }
  for (const row of out) row.runs.sort((a, b) => a.left - b.left);
  return out;
}

/** Where a line opens or closes on a separator. Returns the offending edges, if any. */
function danglers(row) {
  const found = [];
  const first = row.runs[0];
  const last = row.runs[row.runs.length - 1];
  if (first && first.text === SEPARATOR) found.push('begins');
  if (last && last.text === SEPARATOR) found.push('ends');
  return found;
}

test('check 30 — every separator in the footer strip is a real text node', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    pages: 'pages whose footer strip was read',
    items: 'field items inspected for generated content',
  });

  const findings = [];

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });

    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      await settled(page);
      s.count('pages');

      const generated = await page.evaluate(() => {
        const items = [...document.querySelectorAll('footer ul.legal li')];
        const bad = [];
        for (const li of items) {
          for (const pseudo of ['::before', '::after']) {
            const content = getComputedStyle(li, pseudo).content;
            if (content && content !== 'none' && content !== 'normal') {
              bad.push(`li ${pseudo} draws ${content}`);
            }
          }
        }
        return { count: items.length, bad };
      });

      s.count('items', generated.count);
      for (const bad of generated.bad) findings.push(`${url}: ${bad}`);
    }

    await page.close();
  });

  const unique = [...new Set(findings)];
  s.failAll(unique.slice(0, 8));
  s.report(
    `the footer strip draws a separator with generated content:\n  ${unique.join('\n  ')}\n\n` +
      `§5.4 requires a template-emitted text node. Generated content is not in the DOM, so ` +
      `check 7 cannot measure its contrast — which is how a separator shipped at 1.37:1 on ` +
      `this project (CHANGES.md row 49) with the whole suite green over it.`
  );
});

test('check 30 — no line of the footer strip begins or ends with a separator', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    renders: 'strip renders measured (pages x viewports)',
    lines: 'visual lines of the strip inspected',
    separators: 'separator runs measured',
  });

  const findings = [];

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const { url } of pages) {
        await page.goto(origin + url, { waitUntil: 'load' });
        await settled(page);

        const { found, runs } = await strip(page);
        assert.ok(found, `${url}: no footer ul.legal at all, so there is no strip to measure`);
        s.count('renders');

        const shown = visible(runs);
        s.count('separators', shown.filter((r) => r.text === SEPARATOR).length);

        for (const row of lines(shown)) {
          s.count('lines');
          for (const edge of danglers(row)) {
            const text = row.runs.map((r) => r.text).join(' ');
            findings.push(`${url} at ${viewport.width}px: a line ${edge} on "${SEPARATOR}" — "${text}"`);
          }
        }
      }
    }

    await page.close();
  });

  const unique = [...new Set(findings)];
  s.failAll(unique.slice(0, 10));
  s.report(
    `the footer strip opens or closes a visual line on a separator:\n  ${unique.join('\n  ')}\n\n` +
      `§5.4: no line may begin or end with "${SEPARATOR}" at any width. A separator that ` +
      `survives a wrap reads as a typo at the start of a line and as a truncation at the end ` +
      `of one.`
  );
});

test('check 30 — the footer strip meets 4.5:1, separators included', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    pages: 'pages whose footer strip was measured for contrast',
    runs: 'text runs whose colour was read',
  });

  const findings = [];

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });

    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      await settled(page);
      s.count('pages');

      const measured = await page.evaluate(() => {
        // The painted background behind the strip, found by walking up until something
        // is not transparent. Reading the element's own `background-color` gives
        // `rgba(0,0,0,0)` and a contrast of "against nothing".
        const backdrop = (el) => {
          for (let n = el; n; n = n.parentElement) {
            const bg = getComputedStyle(n).backgroundColor;
            if (bg && !/rgba?\([^)]*,\s*0\)$/.test(bg) && bg !== 'transparent') return bg;
          }
          return getComputedStyle(document.body).backgroundColor;
        };

        const out = [];
        for (const el of document.querySelectorAll('footer ul.legal li, footer ul.legal li *')) {
          const text = (el.textContent || '').trim();
          if (!text) continue;
          // Only the innermost box that carries the text, so a colour is not counted
          // twice under a wrapper that sets none of its own.
          if (el.querySelector('*')) continue;
          const cs = getComputedStyle(el);
          out.push({
            text,
            colour: cs.color,
            background: backdrop(el),
            decoration: cs.textDecorationLine,
            tag: el.tagName.toLowerCase(),
          });
        }
        return out;
      });

      s.count('runs', measured.length);

      for (const run of measured) {
        const ratio = contrastRatio(run.colour, run.background);
        if (ratio === null) {
          findings.push(`${url}: "${run.text}" — ${run.colour} on ${run.background} is unparseable`);
        } else if (ratio < AA_TEXT) {
          findings.push(
            `${url}: "${run.text}" is ${ratio.toFixed(2)}:1 (${run.colour} on ${run.background})`
          );
        }
      }
    }

    await page.close();
  });

  const unique = [...new Set(findings)];
  s.failAll(unique.slice(0, 10));
  s.report(
    `footer strip text below ${AA_TEXT}:1:\n  ${unique.join('\n  ')}\n\n` +
      `A separator is text and is held to the text ratio, not the 3:1 non-text one. ` +
      `§5.4: "A separator is text: 4.5:1, measured."`
  );
});

test('check 30 — the email field is a link, underlined, and a 44px target on mobile', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    renders: 'mobile renders measured (pages x mobile viewports)',
    links: 'email links measured',
  });

  const findings = [];
  const mobile = VIEWPORTS.filter((v) => v.width <= 375);

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();

    for (const viewport of mobile) {
      await page.setViewportSize(viewport);
      for (const { url } of pages) {
        await page.goto(origin + url, { waitUntil: 'load' });
        await settled(page);
        s.count('renders');

        const links = await page.evaluate(() => {
          const found = [];
          for (const a of document.querySelectorAll('footer ul.legal a[href^="mailto:"]')) {
            const rect = a.getBoundingClientRect();
            const cs = getComputedStyle(a);
            found.push({
              href: a.getAttribute('href'),
              text: (a.textContent || '').trim(),
              height: rect.height,
              width: rect.width,
              decoration: cs.textDecorationLine,
              colour: cs.color,
            });
          }
          return found;
        });

        s.count('links', links.length);

        for (const link of links) {
          if (link.height < TARGET_PX) {
            findings.push(
              `${url} at ${viewport.width}px: the email link is ${link.height.toFixed(1)}px tall, ` +
                `below the ${TARGET_PX}px target`
            );
          }
          if (!/underline/.test(link.decoration)) {
            findings.push(
              `${url} at ${viewport.width}px: the email link is not underlined at rest ` +
                `(text-decoration-line: ${link.decoration})`
            );
          }
          // The accent is reserved for the lowest level assessed and for breaking
          // changelog entries. It is never a link colour.
          if (/138,\s*74,\s*5/.test(link.colour)) {
            findings.push(`${url} at ${viewport.width}px: the email link uses the reserved accent`);
          }
          if (link.text.includes('@') === false) {
            findings.push(`${url}: the mailto link reads "${link.text}", which is not an address`);
          }
        }
      }
    }

    await page.close();
  });

  const unique = [...new Set(findings)];
  s.failAll(unique.slice(0, 10));
  s.report(
    `the footer email link fails §5.4:\n  ${unique.join('\n  ')}\n\n` +
      `A procurement reader pastes this address into a form, so it is plain selectable text ` +
      `with a real mailto and a target a thumb can hit.`
  );
});

test('check 30 — the clip clears a row-leading separator and never the focus ring', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  // This test exists because styles.css claimed it already did. The comment above
  // `footer ul.legal` asserted "Both are measured by check 30 rather than trusted" and
  // named a 4px clip clearance; the real figure was 8px, and this file contained zero
  // references to outline, focus, padding-left, column-gap or margin-right. It measured
  // NEITHER number. Found by the red team 2026-08-13.
  //
  // The two clearances are one system pulling in opposite directions, which is why they
  // belong in one test: the separator must sit far enough left of its field to be clipped,
  // and the focus ring must not reach that far. Shrink the list's padding and the ring
  // overhangs; grow the separator's offset past the gap and it collides with the previous
  // field. Both are asserted as SIGNS, so the failure names which way the system broke.
  const s = survey({
    renders: 'renders measured (viewports)',
    leading: 'row-leading separators whose clip clearance was measured',
    rings: 'focus rings measured against the clip edge',
  });

  const findings = [];

  await withSite(async ({ origin, browser }) => {
    const page = await browser.newPage();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto(origin + '/', { waitUntil: 'load' });
      await settled(page);
      s.count('renders');

      const m = await page.evaluate(() => {
        const ul = document.querySelector('footer ul.legal');
        const b = ul.getBoundingClientRect();
        const cs = getComputedStyle(ul);
        const clipLeft = b.left + (parseFloat(cs.borderLeftWidth) || 0);

        const items = [...ul.querySelectorAll('li')];
        const leading = [];
        for (let i = 1; i < items.length; i += 1) {
          const sep = items[i].querySelector('.sep');
          if (!sep) continue;
          const prev = items[i - 1].getBoundingClientRect();
          const cur = items[i].getBoundingClientRect();
          // Same visual row? Overlap, not equal top — the email link is taller.
          if (prev.top < cur.bottom - 1 && prev.bottom > cur.top + 1) continue;
          const r = sep.getBoundingClientRect();
          leading.push({ clearance: +(clipLeft - r.right).toFixed(2) });
        }

        // The ring at its worst case: whichever link begins its row.
        const rings = [];
        for (const a of ul.querySelectorAll('a')) {
          a.focus();
          const acs = getComputedStyle(a);
          const ab = a.getBoundingClientRect();
          const reach = ab.left - (parseFloat(acs.outlineOffset) || 0) - (parseFloat(acs.outlineWidth) || 0);
          rings.push({ clearance: +(reach - clipLeft).toFixed(2), startsRow: Math.abs(ab.left - clipLeft) < 12 });
          a.blur();
        }
        return { leading, rings };
      });

      for (const l of m.leading) {
        s.count('leading');
        if (l.clearance <= 0) {
          findings.push(
            `${viewport.width}px: a row-leading separator is only ${l.clearance}px past the clip ` +
              `edge, so it renders where a reader sees it`
          );
        }
      }
      for (const r of m.rings) {
        s.count('rings');
        if (r.clearance < 0) {
          findings.push(
            `${viewport.width}px: a focus ring overhangs the clip edge by ${-r.clearance}px and ` +
              `is cut off (WCAG 2.4.11 — focus must not be obscured)`
          );
        }
      }
    }

    await page.close();
  });

  const unique = [...new Set(findings)];
  s.failAll(unique.slice(0, 10));
  s.report(
    `the footer clip system is out of balance:\n  ${unique.join('\n  ')}\n\n` +
      `The separator's offset, the column gap and the list's padding are one system. The ` +
      `separator must be clipped; the focus ring must not be.`
  );
});

test('check 30 — a field whose value is empty takes its label with it', () => {
  // A unit test, deliberately: the rendered page can only show what today's data
  // produces, and today `vatNumber` is populated. The rule that matters is what happens
  // when it is NOT — and the VAT registration does not survive incorporation, so that
  // state is scheduled rather than hypothetical.
  const label = 'VAT registration no. {vatNumber}';

  const withValue = footerLine([{ text: label }], { vatNumber: '524 8209 92' });
  assert.deepEqual(
    withValue.map((f) => f.text),
    ['VAT registration no. 524 8209 92'],
    'a populated value must render its field'
  );

  for (const empty of ['', '   ', null, undefined]) {
    const gone = footerLine([{ text: label }], { vatNumber: empty });
    assert.deepEqual(
      gone,
      [],
      `with vatNumber ${JSON.stringify(empty)} the label survived its value, publishing ` +
        `"VAT registration no." with nothing after it`
    );
  }

  // The known empty-anchor defect: a field with an href and no text rendered <a></a> and
  // the build succeeded. It stops being cosmetic now that the array contains a link.
  assert.deepEqual(
    footerLine([{ text: '{email}', href: 'mailto:{email}' }], { email: '' }),
    [],
    'an empty value with an href rendered an empty anchor'
  );

  assert.deepEqual(
    footerLine([{ text: '{email}', href: 'mailto:{email}' }], { email: 'hello@ordoia.com' }),
    [{ text: 'hello@ordoia.com', href: 'mailto:hello@ordoia.com' }],
    'a populated link field must render as a link'
  );

  // Order is the contract §5.4 states: the email is the only actionable item in the line
  // and sits at position 2, not among the registration facts at position 5.
  const line = footerLine(
    [{ text: 'Ordoia' }, { text: '{email}', href: 'mailto:{email}' }, { text: 'UK-based' }],
    { email: 'hello@ordoia.com' }
  );
  assert.equal(line[1].href, 'mailto:hello@ordoia.com', 'the email must hold position 2');
});

test('check 30 — the filter drops every shape of empty field, not only an empty token', () => {
  // §5.4 says "fields with absent or empty `text` are dropped". The ABSENT case had no
  // assertion at all until now, and absent is the one a hand-edit to site.json actually
  // produces — `{ "href": "..." }` with the text forgotten renders the empty anchor this
  // filter exists to prevent. The token-resolves-empty case above is the scheduled one;
  // these are the fat-fingered ones.
  const shapes = [
    ['no text key at all', {}],
    ['text explicitly undefined', { text: undefined }],
    ['text explicitly null', { text: null }],
    ['text empty string', { text: '' }],
    ['text whitespace only', { text: '   ' }],
    ['no text, but an href', { href: 'mailto:x@y.z' }],
    ['text present, href empty', { text: 'Ordoia', href: '' }],
  ];
  for (const [what, field] of shapes) {
    assert.deepEqual(
      footerLine([field]),
      [],
      `a field with ${what} survived the filter and would render into the strip`
    );
  }

  // A missing array is not an empty strip, it is a mistake — but it must not throw during
  // a build. Nunjucks passes `undefined` when the key is absent from site.json.
  assert.deepEqual(footerLine(undefined), [], 'an absent field list threw instead of rendering nothing');
  assert.deepEqual(footerLine(null), [], 'a null field list threw instead of rendering nothing');
  assert.deepEqual(footerLine([]), [], 'an empty field list should render nothing');

  // And the control: a good field still survives all of the above.
  assert.deepEqual(
    footerLine([{ text: 'UK-based' }]),
    [{ text: 'UK-based' }],
    'the filter rejected a perfectly good field'
  );
});

test('check 30 — an unknown token in a footer field still fails the build (controls)', () => {
  // This guards a behaviour NOT changed by this commit, next to one that WAS. The
  // `?? ''` coercion added on 2026-08-13 sits two lines from the vocabulary check, and
  // that check had no test anywhere in the suite. The two cases are deliberately
  // different and both have to keep working:
  //
  //   a KNOWN token holding null/undefined -> resolves to nothing, field drops (above)
  //   an UNKNOWN token                     -> throws, build fails, nobody ships a typo
  //
  // Collapsing them — making an unknown token resolve to '' — would publish a footer
  // silently missing a field, which is the failure the vocabulary exists to prevent.
  assert.throws(
    () => footerLine([{ text: 'VAT no. {vatNumbr}' }]),
    /unknown copy token/i,
    'a typo in a footer field resolved to nothing instead of failing the build'
  );
  assert.throws(
    () => footerLine([{ text: 'ok', href: 'mailto:{emial}' }]),
    /unknown copy token/i,
    'a typo in a footer href resolved to nothing instead of failing the build'
  );
});

test('check 30 — the line detector still finds a separator it should (controls)', () => {
  // Without this the grouping above is a function nobody has watched fail. Both drills
  // that were accepted on this branch planted the CORRECT current value and could not
  // have failed either way; these plant divergent ones.
  const row = (top, ...texts) =>
    texts.map((text, i) => ({ text, top, bottom: top + 10, left: i * 20, right: i * 20 + 15 }));

  const clean = [...row(0, 'Ordoia', SEPARATOR, 'hello@ordoia.com'), ...row(20, 'UK-based')];
  assert.deepEqual(
    lines(clean).flatMap(danglers),
    [],
    'the detector flagged a strip that wraps cleanly'
  );

  const trailing = [...row(0, 'Ordoia', SEPARATOR), ...row(20, 'UK-based')];
  assert.deepEqual(
    lines(trailing).flatMap(danglers),
    ['ends'],
    'the detector missed a separator left dangling at the end of a wrapped line'
  );

  const leading = [...row(0, 'Ordoia'), ...row(20, SEPARATOR, 'UK-based')];
  assert.deepEqual(
    lines(leading).flatMap(danglers),
    ['begins'],
    'the detector missed a separator hanging in the left margin of a wrapped line'
  );

  // Two runs of different heights on the same visual line — the email link is taller than
  // its neighbours on mobile. Grouping by an equal `top` would split this into two lines
  // and then report a dangling separator on a strip that has none.
  const uneven = [
    { text: 'Ordoia', top: 0, bottom: 12, left: 0, right: 40 },
    { text: SEPARATOR, top: 2, bottom: 14, left: 45, right: 50 },
    { text: 'hello@ordoia.com', top: -8, bottom: 36, left: 55, right: 160 },
  ];
  assert.deepEqual(
    lines(uneven).flatMap(danglers),
    [],
    'grouping split one visual line into several because the runs had different heights'
  );

  // The case that could not fail before 2026-08-13. The control above pins MERGING as
  // correct; nothing pinned merging as WRONG, which is the same non-discriminating shape
  // as the five guards this branch has already had to rewrite. Here a bridging run
  // overlaps both a row that ends on a separator and the row below it. Under the old
  // widening grouping the three chained into one row, the separator stopped being last,
  // and a real defect vanished.
  // Placement matters and is chosen, not incidental: the bridge sits to the LEFT and the
  // next row's field to the RIGHT of the separator. Under the widening grouping all four
  // chain into one row and `UK-based` becomes its last run, so the separator stops being
  // at the end of anything and the dangler disappears. Verified both ways before this was
  // written — widening: 1 row, danglers []; seeded: 2 rows, danglers ["ends"].
  const bridged = [
    { text: 'BRIDGE', top: 15, bottom: 30, left: 0, right: 6 },
    { text: 'Ordoia', top: 0, bottom: 20, left: 10, right: 60 },
    { text: SEPARATOR, top: 0, bottom: 20, left: 70, right: 76 },
    { text: 'UK-based', top: 26, bottom: 40, left: 90, right: 150 },
  ];
  assert.equal(
    lines(bridged).length,
    2,
    'a run overlapping both sides of a gap chained two non-overlapping rows into one'
  );
  assert.deepEqual(
    lines(bridged).flatMap(danglers),
    ['ends'],
    'the trailing separator on the first row was lost when a bridging run merged the rows'
  );
  assert.equal(lines(uneven).length, 1, 'three overlapping runs are one line');
});
