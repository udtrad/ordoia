/**
 * Check 1 — the colour rule.
 *
 * RATIONALE.md: `--floor` #8A4A05 appears in exactly two situations — the
 * *lowest level assessed* field on a scorecard, and a changelog entry classified
 * *breaking*. Not on links, not on buttons, not on the wordmark, not on hover,
 * not on focus, not on error states.
 *
 * The rule exists to foreclose the traffic light structurally. One colour that
 * does not mean "bad" cannot be read as the red end of a scale, and a scorecard
 * photocopied in greyscale loses nothing that matters. Every element the colour
 * reaches beyond those two is a step back toward a gauge.
 *
 * This is checked on *computed* styles rather than on the stylesheet, because a
 * rule that never matches anything is not a violation and a colour inherited
 * onto an unexpected element is.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSite, TARGET } from '../lib/harness.js';
import { ledgerFor } from '../lib/allowances.js';
import { parseColour } from '../lib/contrast.js';

const FLOOR = '#8a4a05';

/** The two situations, and nothing else. */
const PERMITTED = ['.legend .floor-line', '.floor-mark', '.class--breaking'];

function isFloor(cssColour) {
  const c = parseColour(cssColour);
  if (!c) return false;
  const [r, g, b, a] = c;
  const [fr, fg, fb] = parseColour(FLOOR);
  return a > 0 && r === fr && g === fg && b === fb;
}

test('check 1 — --floor resolves only on the lowest-level field and a breaking changelog entry', async () => {
  const ledger = await ledgerFor(1);
  const violations = [];

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    for (const { url } of pages) {
      const response = await page.goto(origin + url, { waitUntil: 'load' });
      assert.ok(response?.ok(), `${url} did not load from ${TARGET}`);

      const found = await page.evaluate((permitted) => {
        const floorRgb = 'rgb(138, 74, 5)';
        const out = [];
        for (const el of document.querySelectorAll('*')) {
          const s = getComputedStyle(el);
          // Every property that can put the colour in front of a reader.
          const props = {
            color: s.color,
            'background-color': s.backgroundColor,
            'border-top-color': s.borderTopColor,
            'border-right-color': s.borderRightColor,
            'border-bottom-color': s.borderBottomColor,
            'border-left-color': s.borderLeftColor,
            'outline-color': s.outlineColor,
            'text-decoration-color': s.textDecorationColor,
            fill: s.fill,
            stroke: s.stroke,
          };
          for (const [prop, value] of Object.entries(props)) {
            if (value !== floorRgb) continue;
            // A transparent border still reports its colour; ignore invisible ones.
            if (prop.startsWith('border')) {
              const side = prop.split('-')[1];
              const w = parseFloat(s.getPropertyValue(`border-${side}-width`));
              const style = s.getPropertyValue(`border-${side}-style`);
              if (!w || style === 'none' || style === 'hidden') continue;
            }
            if (prop === 'background-color' && s.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
            if (permitted.some((sel) => el.closest(sel))) continue;
            out.push({
              prop,
              tag: el.tagName.toLowerCase(),
              cls: el.className?.toString?.().slice(0, 60) || '',
              text: (el.textContent || '').trim().slice(0, 50),
            });
          }
        }
        return out;
      }, PERMITTED);

      for (const f of found) {
        if (ledger.allows(url, `${f.prop} ${f.tag} ${f.cls}`)) continue;
        violations.push(`${url}: ${f.prop} on <${f.tag} class="${f.cls}"> — "${f.text}"`);
      }
    }
    await page.close();
  });

  assert.deepEqual(
    violations,
    [],
    `--floor escaped its two situations:\n  ${violations.join('\n  ')}`
  );

  const stale = ledger.unused();
  assert.deepEqual(
    stale.map((a) => a.id),
    [],
    'allowances that no longer match anything — remove them rather than let the deviation log rot'
  );
});

test('check 1 — the colour is present where it is supposed to be', async () => {
  // The inverse assertion. A rule that passes because the colour vanished
  // entirely would be a silent regression, not compliance: the two situations
  // are load-bearing, and "lowest level assessed" set in ink reads as ordinary
  // prose rather than as the field you must not average away.
  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    const sightings = [];
    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      const hits = await page.evaluate((permitted) =>
        permitted.filter((sel) =>
          [...document.querySelectorAll(sel)].some(
            (el) => getComputedStyle(el).color === 'rgb(138, 74, 5)'
          )
        ), PERMITTED);
      sightings.push(...hits.map((sel) => `${url} ${sel}`));
    }
    await page.close();

    assert.ok(
      sightings.some((s) => s.includes('.floor-line')),
      'no scorecard renders --floor on "lowest level assessed" — the colour rule has been ' +
        'satisfied by deleting the colour, which is not the same thing'
    );
  });
});
