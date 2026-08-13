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
  return page.evaluate(() => {
    const ul = document.querySelector('footer ul.legal');
    if (!ul) return { found: false, runs: [], clip: null };

    // The list clips its own overflow, so having a client rect is not the same as being
    // on the page: a separator belonging to a field that begins a row is drawn past this
    // edge and renders nowhere. The rule is about what a reader sees, so the clip box has
    // to come back with the runs. Taken from the element rather than from the stylesheet
    // — reading `overflow` and inferring would be the guard consulting the mechanism.
    const box = ul.getBoundingClientRect();
    const clipped = getComputedStyle(ul).overflow !== 'visible';
    const clip = clipped
      ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
      : null;

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
        });
      }
    }
    return { found: true, runs, clip };
  });
}

/**
 * The runs a reader can actually see.
 *
 * A hair of tolerance either side, so a glyph sitting exactly on the clip edge counts as
 * hidden rather than as a sub-pixel sliver. Note what this does NOT relax: a run inside
 * the box is always kept, so the end-of-row case — the one that has to be caught — is
 * untouched by this filter. It can only ever discard something drawn outside the list.
 */
const visible = (runs, clip) =>
  clip === null ? runs : runs.filter((r) => r.right > clip.left + 0.5 && r.left < clip.right - 0.5);

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
    const row = out.find((r) => run.top < r.bottom - 1 && run.bottom > r.top + 1);
    if (row) {
      row.runs.push(run);
      row.top = Math.min(row.top, run.top);
      row.bottom = Math.max(row.bottom, run.bottom);
    } else {
      out.push({ top: run.top, bottom: run.bottom, runs: [run] });
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

        const { found, runs, clip } = await strip(page);
        assert.ok(found, `${url}: no footer ul.legal at all, so there is no strip to measure`);
        s.count('renders');

        const shown = visible(runs, clip);
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
  assert.equal(lines(uneven).length, 1, 'three overlapping runs are one line');
});
