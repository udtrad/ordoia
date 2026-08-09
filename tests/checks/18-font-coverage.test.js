/**
 * Check 18 — the site renders nothing the font subsets do not carry.
 *
 * The Source Serif italic used to ship the full printable ASCII range, 110 codepoints for
 * the 31 the site actually sets in it. Narrowing that to 34 took 12,576 bytes off the two
 * rubric pages and is what closed §4's budget miss — but it also converted a comfortable
 * margin into a real constraint, and constraints that live only in a comment get edited
 * away by someone who never read it.
 *
 * The fragility objection to a tight subset is legitimate: new italic copy could use a
 * glyph that is no longer there, the browser would synthesise an oblique from the roman
 * mid-paragraph, and the page would still look approximately right to whoever shipped it.
 * A silent visual regression is the worst shape a defect can take here.
 *
 * The answer is the one this repo uses everywhere else — make it executable. A character
 * outside the declared set is a red build at the moment the copy changes, which is the
 * only moment the fix is cheap.
 *
 * ── Which text counts ───────────────────────────────────────────────────────────────
 *
 * Only text that resolves to a *real* italic face. Measured across all nine pages, the
 * `<em>` runs in `.note` paragraphs compute to Archivo — a roman-only family — so the
 * browser shears the roman and fetches no italic file at all. Those runs are out of scope
 * here and correctly so; FONTS.md said they resolved to Source Serif, and that was wrong.
 *
 * ── Stated limit, in the manner of checks 12, 14 and 15 ─────────────────────────────
 *
 * This proves the **declared** set covers the copy. It does not decode the woff2 to prove
 * the shipped binary contains those glyphs. Closing that gap means a woff2 decoder in
 * Node — real work for a failure that requires someone to edit tools/font-subsets.json
 * without re-running tools/build-fonts.sh, which writes both from the same string.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { withSite, REPO_ROOT, IS_HANDOVER } from '../lib/harness.js';
import { survey } from '../lib/population.js';

const SUBSETS = path.join(REPO_ROOT, 'tools', 'font-subsets.json');

/**
 * Expand pyftsubset's `--unicodes` syntax into the codepoints it names.
 *
 * `U+0020,U+002C,U+0061-007A` — single codepoints and inclusive ranges, comma separated.
 * Throws on anything else rather than skipping it: a token this cannot read is a
 * character the check would then silently stop covering.
 */
export function parseUnicodeRanges(spec) {
  const out = new Set();
  for (const raw of String(spec).split(',')) {
    const token = raw.trim();
    if (!token) continue;
    const m = /^U\+([0-9A-Fa-f]{1,6})(?:-([0-9A-Fa-f]{1,6}))?$/.exec(token);
    assert.ok(m, `unreadable unicode range "${token}" in tools/font-subsets.json`);
    const from = parseInt(m[1], 16);
    const to = m[2] === undefined ? from : parseInt(m[2], 16);
    assert.ok(to >= from, `inverted unicode range "${token}"`);
    for (let cp = from; cp <= to; cp += 1) out.add(cp);
  }
  return out;
}

const show = (cp) =>
  `U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${cp === 0x20 ? '(space)' : `"${String.fromCodePoint(cp)}"`}`;

test('check 18 — every character set in italic is in the declared italic subset', async (t) => {
  if (IS_HANDOVER) return t.skip('the handover predates the vendored font pipeline entirely');

  const declared = parseUnicodeRanges(JSON.parse(await readFile(SUBSETS, 'utf8')).italic.unicodes);

  const s = survey({
    pages: 'pages loaded',
    italicRuns: 'text runs resolving to a real italic face',
    codepoints: 'distinct characters rendered in italic',
  });

  const rendered = new Set();

  await withSite(async ({ origin, pages, browser }) => {
    for (const { url } of pages) {
      const page = await browser.newPage();
      await page.goto(origin + url, { waitUntil: 'load' });
      // Nothing is measurable until the browser has decided which faces it needs.
      await page.evaluate(() => document.fonts.ready);
      s.count('pages');

      const found = await page.evaluate(() => {
        const runs = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const el = node.parentElement;
          if (!el || !node.nodeValue.trim()) continue;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          if (!/^(italic|oblique)/.test(style.fontStyle)) continue;
          // A synthesised oblique of a roman-only family fetches no italic file, so it is
          // not constrained by the italic subset. Only a real italic face is.
          if (!/source serif/i.test(style.fontFamily)) continue;
          runs.push(node.nodeValue);
        }
        return runs;
      });

      await page.close();

      for (const text of found) {
        s.count('italicRuns');
        for (const ch of text) rendered.add(ch.codePointAt(0));
      }
    }
  });

  s.count('codepoints', rendered.size);

  const missing = [...rendered].filter((cp) => !declared.has(cp)).sort((a, b) => a - b);
  s.failAll(
    missing.map(
      (cp) =>
        `${show(cp)} is set in italic but is not in the declared italic subset. Add it to ` +
        `tools/font-subsets.json and re-run tools/build-fonts.sh, or the browser will ` +
        `synthesise it from the roman and the fallback will not be obvious on the page.`
    )
  );

  // Headroom is a cost, so it is printed rather than left to be rediscovered by whoever
  // next wonders why the italic weighs what it does.
  const unused = [...declared].filter((cp) => !rendered.has(cp)).sort((a, b) => a - b);
  console.log(
    `\n  italic subset: ${declared.size} codepoints declared, ${rendered.size} rendered, ` +
      `${unused.length} carried as headroom\n` +
      `    headroom: ${unused.map((cp) => String.fromCodePoint(cp)).join(' ')}\n`
  );

  s.report(
    'a character is set in italic that the shipped italic subset does not declare, so the ' +
      'browser falls back to a synthesised oblique for it — mid-paragraph, and silently'
  );
});

test('check 18 — the range parser still reads what pyftsubset reads (controls)', () => {
  // The parser is the join between the build script and this check. If it silently
  // mis-read a range, the check would go on passing while covering fewer characters —
  // which is the shape of lesson 8, one level down.
  assert.deepEqual([...parseUnicodeRanges('U+0041')], [0x41]);
  assert.deepEqual([...parseUnicodeRanges('U+0041-0043')], [0x41, 0x42, 0x43]);
  assert.deepEqual([...parseUnicodeRanges('U+0020,U+2014')], [0x20, 0x2014]);
  assert.deepEqual([...parseUnicodeRanges(' U+0041 , U+0042 ')], [0x41, 0x42]);
  assert.equal(parseUnicodeRanges('U+0061-007A').size, 26);

  // A shape it cannot read must throw rather than be skipped.
  assert.throws(() => parseUnicodeRanges('0041'), /unreadable unicode range/);
  assert.throws(() => parseUnicodeRanges('U+00ZZ'), /unreadable unicode range/);
  assert.throws(() => parseUnicodeRanges('U+0041-0039'), /inverted unicode range/);

  // And the two sets this repo actually ships must both parse.
  assert.ok(parseUnicodeRanges('U+0020-007E,U+00A0,U+2013,U+2014').size > 90);
});
