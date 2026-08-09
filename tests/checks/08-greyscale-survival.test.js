/**
 * Check 8 — greyscale survival.
 *
 * BRIEF.md §3 check 8: "Rendered page desaturated: any information conveyed only
 * by hue."
 * §13 item 2: "A risk committee member reads the printed scorecard cold, in
 * greyscale, and understands exactly what was and was not established."
 *
 * The site has exactly one colour beyond its greys, and RATIONALE.md is explicit
 * that "a scorecard photocopied in greyscale loses nothing that matters". This
 * check is what makes that sentence true rather than hopeful.
 *
 * The test is not "does the page look the same desaturated" — it will not, and
 * that is fine. It is: for each of the two places `--floor` appears, is the same
 * information also carried by words? A photocopier is a lossy channel and the
 * only thing that survives it reliably is text.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSite } from '../lib/harness.js';
import { contrastRatio } from '../lib/contrast.js';
import { survey } from '../lib/population.js';

const FLOOR = 'rgb(138, 74, 5)';

test('check 8 — nothing --floor says is said by hue alone', async () => {
  const problems = [];
  const s = survey({ pages: 'pages loaded', floor: 'outermost elements rendering --floor text' });

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      s.count('pages');

      // Only the OUTERMOST coloured element is judged. Colour inherits, so a
      // `<span class="mono">OAL ——</span>` inside `<p class="floor-line">Lowest
      // level assessed: …</p>` reports the same computed colour as its parent —
      // and on its own it looks like an unlabelled swatch, when in fact the
      // label is right there in the block it belongs to. Judging descendants
      // separately measures the DOM, not what a reader sees.
      const coloured = await page.evaluate((floor) =>
        [...document.querySelectorAll('*')]
          .filter((el) => getComputedStyle(el).color === floor)
          .filter((el) => (el.textContent || '').trim().length > 0)
          .filter((el) => {
            for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
              if (getComputedStyle(p).color === floor) return false;
            }
            return true;
          })
          .map((el) => ({
            text: (el.textContent || '').trim().slice(0, 160),
            cls: typeof el.className === 'string' ? el.className : '',
          })), FLOOR);

      s.count('floor', coloured.length);

      for (const el of coloured) {
        // Each of the two situations must name itself in words.
        const namesItself =
          /lowest level assessed/i.test(el.text) || /\bbreaking\b|\bclarifying\b/i.test(el.text);
        if (!namesItself) {
          problems.push(
            `${url}: --floor on "${el.text.slice(0, 80)}" (class="${el.cls}") carries no word ` +
              `saying what the colour means, so a greyscale reader loses it`
          );
        }
      }
    }
    await page.close();
  });

  s.failAll(problems);
  s.report(`information conveyed by hue alone:\n  ${problems.join('\n  ')}`);
});

test('check 8 — the page still meets contrast once desaturated', async () => {
  // Luminance is what survives a photocopier, so the contrast contract has to
  // hold on luminance alone. For greys this is a no-op; for --floor it is the
  // real test, because a mid-brown against a light grey can pass in colour and
  // collapse in greyscale.
  const failures = [];
  const s = survey({ pages: 'pages loaded', floor: '--floor text runs measured' });

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      s.count('pages');
      const items = await page.evaluate((floor) =>
        [...document.querySelectorAll('*')]
          .filter((el) => getComputedStyle(el).color === floor && (el.textContent || '').trim())
          .map((el) => {
            let bg = 'rgb(255, 255, 255)';
            for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
              const c = getComputedStyle(n).backgroundColor;
              if (c && c !== 'rgba(0, 0, 0, 0)') { bg = c; break; }
            }
            const s = getComputedStyle(el);
            return { bg, size: s.fontSize, weight: s.fontWeight, text: (el.textContent || '').trim().slice(0, 50) };
          }), FLOOR);

      s.count('floor', items.length);

      for (const item of items) {
        // Desaturate both sides to their luminance-equivalent grey, then compare.
        const ratio = contrastRatio(FLOOR, item.bg);
        if (ratio < 4.5) {
          failures.push(`${url}: --floor on ${item.bg} is ${ratio.toFixed(2)}:1 — "${item.text}"`);
        }
      }
    }
    await page.close();
  });

  s.failAll(failures);
  s.report(`--floor text fails AA:\n  ${failures.join('\n  ')}`);
});

test('check 8 — --floor is actually rendered somewhere on the site', async () => {
  // This was "a desaturated render still differs from a blank page", and it asserted
  // `screenshot.length > 5000` on a PNG of the home page. Its comment said it was a guard
  // against the checks above passing because the page rendered nothing — but a PNG's byte
  // length measures image entropy, not whether `--floor` reached the page, and a blank
  // 1100x800 render compresses to well under the threshold anyway. The stated intent and
  // the actual assertion had drifted apart.
  //
  // Rewritten as the thing it meant. Both checks above are conditional on `--floor` being
  // found; this asserts, once and directly, that it is there to find. The screenshot is
  // gone: it was slower than the thing it guarded and proved less.
  const s = survey({ pages: 'pages loaded', floor: 'elements rendering --floor anywhere' });

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      s.count('pages');
      const n = await page.evaluate(
        (floor) =>
          [...document.querySelectorAll('*')].filter(
            (el) => getComputedStyle(el).color === floor && (el.textContent || '').trim()
          ).length,
        FLOOR
      );
      s.count('floor', n);
    }
    await page.close();
  });

  s.report('--floor must be on the page for the two greyscale checks above to mean anything');
});
