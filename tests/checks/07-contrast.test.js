/**
 * Check 7 — contrast.
 *
 * BRIEF.md §7: "WCAG AA minimum on all text, including the level scale, the
 * stamp lines and the labelled absences."
 * §3 check 7: "Computed contrast on every text token pair below 4.5:1 —
 * including `slate` on `raised`, and the *not offered* cells that already failed
 * once at 1.4:1."
 *
 * Two halves, because the brief asks for both and they have different thresholds:
 *
 *   TEXT (1.4.3)     4.5:1, or 3:1 at large size — measured from computed font
 *                    size and weight rather than guessed from a class name.
 *   GRAPHICS (1.4.11) 3:1, for the parts of the measure that carry information.
 *                    The measure is the site's instrument; a scale line nobody
 *                    can see is not a scale.
 *
 * MEASURED STATE OF THE HANDOVER, before any build code was written:
 *
 *   ink   on ground  14.42:1   pass   (RATIONALE.md says 14.7 — see below)
 *   ink   on raised  15.84:1   pass
 *   slate on ground   6.21:1   pass
 *   slate on raised   6.83:1   pass
 *   floor on ground   5.65:1   pass
 *   floor on raised   6.20:1   pass
 *   untravelled on ground  1.37:1  FAIL
 *
 * RATIONALE.md's contrast section is accurate on the three pairs it names except
 * for one rounding: it claims `ink` on `ground` is 14.7:1 and the sRGB
 * computation gives 14.42:1. Both pass AA by a mile, so nothing shipped is
 * wrong; the number in the document is. Flagged in CHANGES.md rather than
 * silently corrected.
 *
 * The real finding is `--untravelled`. RATIONALE.md's fix moved *text* off it —
 * `.grid .none` is set in `--slate`, and that is genuinely fixed — but the token
 * still draws `.measure__rule` and the minor `.tick`s, at 1.37:1. Those are not
 * decoration: they are the instrument the whole brand argument rests on.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSite } from '../lib/harness.js';
import { ledgerFor } from '../lib/allowances.js';
import { contrastRatio, requiredRatio, AA_NON_TEXT } from '../lib/contrast.js';

/**
 * Elements whose visible line carries information rather than decoration.
 * A table's bottom border encodes a row and is decoration in the 1.4.11 sense;
 * the measure's rule and ticks are the scale itself.
 */
const LOAD_BEARING_GRAPHICS = ['.measure__rule', '.measure__rule .tick'];

/** Collect every text node's colour against its effective background. */
function collectText() {
  const effectiveBg = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
      node = node.parentElement;
    }
    return getComputedStyle(document.documentElement).backgroundColor || 'rgb(255, 255, 255)';
  };

  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim())
      .join(' ');
    if (!own) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cls = typeof el.className === 'string' ? el.className.trim() : '';
    out.push({
      text: own.slice(0, 60),
      colour: s.color,
      bg: effectiveBg(el),
      size: s.fontSize,
      weight: s.fontWeight,
      sel: el.tagName.toLowerCase() + (cls ? '.' + cls.split(/\s+/).join('.') : ''),
    });
  }
  return out;
}

function collectGraphics(selectors) {
  const effectiveBg = (el) => {
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
      node = node.parentElement;
    }
    return getComputedStyle(document.documentElement).backgroundColor || 'rgb(255, 255, 255)';
  };

  const out = [];
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // These are 1px elements: the visible line IS the background colour.
      const ink = s.backgroundColor;
      if (!ink || ink === 'rgba(0, 0, 0, 0)') continue;
      out.push({ sel, ink, bg: effectiveBg(el) });
    }
  }
  return out;
}

test('check 7 — every text pair meets WCAG AA', async () => {
  const ledger = await ledgerFor(7);
  const failures = new Map();

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      for (const item of await page.evaluate(collectText)) {
        const ratio = contrastRatio(item.colour, item.bg);
        if (ratio === null) continue;
        const required = requiredRatio(item.size, item.weight);
        if (ratio >= required) continue;
        if (ledger.allows(url, item.sel)) continue;
        const key = `${item.colour} on ${item.bg} @ ${item.size}/${item.weight}`;
        if (!failures.has(key)) {
          failures.set(
            key,
            `${ratio.toFixed(2)}:1 (needs ${required}:1) — ${item.colour} on ${item.bg} — ` +
              `${url} ${item.sel} — "${item.text}"`
          );
        }
      }
    }
    await page.close();
  });

  const list = [...failures.values()].sort();
  assert.deepEqual(list, [], `text below WCAG AA:\n  ${list.join('\n  ')}`);
  assert.deepEqual(ledger.unused().map((a) => a.id), [], 'stale check-7 allowances');
});

test('check 7 — the measure itself meets 3:1 as a load-bearing graphic', async () => {
  const ledger = await ledgerFor(7);
  const failures = new Map();

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      for (const g of await page.evaluate(collectGraphics, LOAD_BEARING_GRAPHICS)) {
        const ratio = contrastRatio(g.ink, g.bg);
        if (ratio === null || ratio >= AA_NON_TEXT) continue;
        if (ledger.allows(url, g.sel)) continue;
        const key = `${g.sel}: ${g.ink} on ${g.bg}`;
        if (!failures.has(key)) {
          failures.set(key, `${ratio.toFixed(2)}:1 (needs ${AA_NON_TEXT}:1) — ${g.sel} — ${g.ink} on ${g.bg} — ${url}`);
        }
      }
    }
    await page.close();
  });

  const list = [...failures.values()].sort();
  assert.deepEqual(
    list,
    [],
    `the measure's own line is below 3:1. It is not decoration — it is the instrument ` +
      `every claim on this site is drawn against:\n  ${list.join('\n  ')}`
  );
});

test('check 7 — the contrast arithmetic itself is right', () => {
  // The only check whose verdict is a number, so the number is asserted against
  // hand-computed values before it is trusted to fail anything.
  const g = '#E6EAE7';
  assert.equal(contrastRatio('#171A1A', g).toFixed(2), '14.42');
  assert.equal(contrastRatio('#4E5654', g).toFixed(2), '6.21');
  assert.equal(contrastRatio('#8A4A05', g).toFixed(2), '5.65');
  assert.equal(contrastRatio('#C3CAC6', g).toFixed(2), '1.37');
  assert.equal(contrastRatio('#000', '#fff').toFixed(0), '21');
  assert.equal(contrastRatio('#fff', '#fff').toFixed(0), '1');
  // Large-text threshold comes from computed values, not a class name.
  assert.equal(requiredRatio('24px', '400'), 3);
  assert.equal(requiredRatio('19px', '700'), 3);
  assert.equal(requiredRatio('19px', '400'), 4.5);
});
