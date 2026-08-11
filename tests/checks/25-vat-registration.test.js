/**
 * Check 25 — the VAT registration is read, never typed.
 *
 * Draft 5 §4.4. Two halves, and the second is the load-bearing one.
 *
 *   1. The VAT string in the rendered footer is byte-equal to
 *      `site.json` `legalEntity.vatNumber`.
 *   2. No VAT-shaped literal appears in any template or copy fragment.
 *
 * ── Why the second half is the one that matters ───────────────────────────────────
 *
 * No check can know the number is *wrong*. Only HMRC knows that, and a check that
 * claimed to would be asserting something it cannot see — the failure mode this suite
 * exists to refuse. But every check can know the number was not supposed to be
 * **typed**, and that is a property of the repository, fully visible from inside it.
 *
 * The reason it is worth enforcing is that the registration belongs to the **current
 * legal person** and does not survive incorporation — VAT68 is open. A literal in a
 * template is therefore a claim with a known expiry, and this repository has already
 * shipped two of those: `CHANGES.md` claimed the repo was public when there was no
 * remote at all (withdrawn 2026-08-09), and `site.json` called the publication date
 * unsettled after it had been settled (row 28). Both were single values, stated in one
 * place and then restated somewhere nobody re-read.
 *
 * `site.json` is the one file allowed to contain the number. Everything else reads it
 * through the `{vatNumber}` token, so changing the entity is one edit and cannot leave a
 * copy behind.
 *
 * ── What is deliberately NOT here ─────────────────────────────────────────────────
 *
 * There is no date-expiry, no "review by" and no warning when the number gets old.
 * A check that goes red on correct content is switched off inside a month — that is the
 * check-12 lesson, where a twelve-word-window rule would have failed on faithful copy
 * and been disabled — and it applies exactly here. This check goes red only when
 * something is genuinely wrong.
 *
 * ── Why frozen version directories are excluded ───────────────────────────────────
 *
 * `/oal/v1.0/` was published before the entity existed, and since row 50 its
 * `index.html` is served from stored bytes, so its footer is frozen at what it said on
 * publication day — with no VAT field. That is not a defect; it is what freezing means,
 * and row 50 recorded it as the price of the pin. Asserting a VAT footer there would be
 * asserting that a published document should have changed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { TARGET, IS_HANDOVER, REPO_ROOT, htmlFiles, urlFor } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import site from '../../src/_data/site.json' with { type: 'json' };
import oal from '../../src/_data/oal.json' with { type: 'json' };

const SRC = path.join(REPO_ROOT, 'src');
const CONFIGURED = String(site.legalEntity?.vatNumber ?? '');

/** The one file the number is allowed to live in. */
const HOME_OF_THE_NUMBER = path.join('src', '_data', 'site.json');

const HANDOVER_SKIP =
  'the designer handover predates the legal entity, so it has no VAT footer to compare — ' +
  'its absence there is the artifact being old, not a defect, and the second half of this ' +
  'check reads src/ and runs against every target regardless';

/**
 * A UK VAT registration as a human would type one.
 *
 * Two shapes, both anchored on something distinctive so an ordinary nine-digit run is
 * not swept up: the `GB` prefix, or the 3-4-2 grouping that only a VAT number uses.
 * A bare `524820992` is not matched, and that is a deliberate floor rather than an
 * oversight — the exact-value arm below catches the configured number in any form, so
 * the only thing this shape arm has to catch is somebody typing a *different* one.
 */
const VAT_SHAPED = /\bGB[  ]?\d{9}\b|\b(?:GB[  ]?)?\d{3}[  ]\d{4}[  ]\d{2}\b/gi;

/** Every file that must not contain the number, as repo-relative paths, sorted. */
async function scannedFiles() {
  const entries = await readdir(SRC, { recursive: true });
  return entries
    .filter((rel) => /\.(njk|md|json)$/.test(rel))
    .map((rel) => path.join('src', rel))
    .filter((rel) => rel !== HOME_OF_THE_NUMBER)
    .sort();
}

/** Frozen snapshot URLs, which carry the footer they were published with. */
const isFrozenSnapshot = (url) =>
  oal.versions.some((v) => url.startsWith(`/oal/v${v.version}/`));

test('check 25 — the rendered footer states the configured VAT registration', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  assert.ok(
    CONFIGURED.trim().length > 0,
    'site.json has no legalEntity.vatNumber. The footer renders it, so an empty value ' +
      'publishes a VAT label with nothing after it.'
  );

  const s = survey({
    pages: 'built pages whose footer was read',
    footers: 'footers carrying a VAT field',
  });

  const findings = [];

  for (const file of await htmlFiles()) {
    const url = urlFor(file);
    if (isFrozenSnapshot(url)) continue;
    s.count('pages');

    const html = await readFile(path.join(TARGET, file), 'utf8');
    const footer = /<footer[\s\S]*?<\/footer>/i.exec(html)?.[0] ?? '';
    const text = footer.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    if (!/VAT/i.test(text)) {
      findings.push(`${url}: the footer states no VAT registration at all`);
      continue;
    }
    s.count('footers');

    if (!text.includes(CONFIGURED)) {
      const shown = text.match(VAT_SHAPED)?.join(', ') ?? '(no number at all)';
      findings.push(
        `${url}: footer states ${shown}, site.json says ${CONFIGURED}`
      );
    }
  }

  s.failAll(findings);
  s.report(
    `the rendered footer disagrees with site.json about the VAT registration:\n  ` +
      `${findings.join('\n  ')}\n\n` +
      `The footer reads \`legalEntity.vatNumber\` through the {vatNumber} token, so a ` +
      `disagreement means either the token stopped resolving or a number was written ` +
      `into the page some other way.`
  );
});

test('check 25 — no VAT registration is typed into a template or a copy fragment', async () => {
  const s = survey({
    files: 'templates, fragments and data files scanned for a typed VAT registration',
  });

  const findings = [];

  for (const rel of await scannedFiles()) {
    s.count('files');
    const text = await readFile(path.join(REPO_ROOT, rel), 'utf8');
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i += 1) {
      // The configured number, in any spelling, anywhere but its one home.
      if (CONFIGURED && lines[i].includes(CONFIGURED)) {
        findings.push(`${rel}:${i + 1} — the configured VAT number is typed out here`);
        continue;
      }
      for (const m of lines[i].matchAll(VAT_SHAPED)) {
        findings.push(`${rel}:${i + 1} — a VAT-shaped literal "${m[0]}"`);
      }
    }
  }

  s.failAll(findings);
  s.report(
    `a VAT registration is typed where it cannot be updated from one place:\n  ` +
      `${findings.join('\n  ')}\n\n` +
      `The registration belongs to the current legal person and does not survive ` +
      `incorporation, so a literal is a claim with a known expiry. It lives in ` +
      `${HOME_OF_THE_NUMBER} as part of the legalEntity record — with the entity's name ` +
      `beside it, so that changing the entity cannot happen without walking past the ` +
      `number — and reaches the page as {vatNumber}.`
  );
});

test('check 25 — the detector still tells a registration from an ordinary number (controls)', async () => {
  // Both halves above are permissive in one direction and strict in the other, so the
  // judgement is pinned here against synthetic input. Without this a broken pattern
  // reports green over a page full of typed numbers.
  const catches = (text) => (String(text).match(VAT_SHAPED) ?? []).length > 0;

  const mustCatch = [
    ['the spaced UK grouping', 'VAT registration no. 524 8209 92'],
    ['a GB prefix, spaced', 'GB 524 8209 92'],
    ['a GB prefix, unspaced', 'VAT no. GB524820992'],
    ['a different registration entirely', 'registered under 123 4567 89'],
    ['non-breaking spaces in the grouping', 'VAT registration no. 524 8209 92'],
  ];
  for (const [what, text] of mustCatch) {
    assert.ok(catches(text), `the detector missed a VAT registration (${what}): "${text}"`);
  }

  const mustPermit = [
    ['the token, which is the correct form', 'VAT registration no. {vatNumber}'],
    ['a date', 'Version 1.0, published 2026-09-19'],
    ['a price', 'from £9,000 + VAT, fixed before we start'],
    ['the word VAT with no number', 'VAT is added at the prevailing UK rate where applicable'],
    ['a commit hash', 'commit 37e464f0289c300dd07280815e09595d21794e0'],
    ['a rate', 'currently 20%'],
  ];
  for (const [what, text] of mustPermit) {
    assert.ok(
      !catches(text),
      `the detector flagged something that is not a VAT registration (${what}): "${text}"`
    );
  }

  // The number has to be somewhere, or the first test is comparing against nothing.
  assert.match(
    CONFIGURED,
    VAT_SHAPED,
    `site.json's legalEntity.vatNumber ("${CONFIGURED}") is not VAT-shaped, so either the ` +
      `value is wrong or this detector would not recognise the real one if it were typed.`
  );

  const files = await scannedFiles();
  assert.ok(
    files.length > 20,
    `only ${files.length} files matched the scan, and a glob that stops matching is how ` +
      `a check goes quiet instead of red.`
  );
});
