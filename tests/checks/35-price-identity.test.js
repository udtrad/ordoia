/**
 * Check 35 — the published path-independence identity.
 *
 * `copy/services.md` `@@ grid.paths`: *"The audit ({audit.price}) plus a later top-up of
 * the remaining four dimensions ({topup.price}) reaches exactly the same place as a
 * baseline taken directly ({baseline.price})."*
 *
 * Three interpolated amounts in one sentence, sold on. It is the only claim on the page a
 * reader can check with a pencil, and a reprice that moves two of the three publishes a
 * false sentence with every other check in this suite green — the prices are data, the
 * grid renders from the same record, and nothing anywhere compared them.
 *
 * ── Where the invariant actually lives ──────────────────────────────────────────────
 *
 * In `eleventy.config.js`, beside `validateRubric()`, because CHECKS.md's house rule puts
 * an invariant in the build when it can fail *at the moment somebody edits the wrong
 * value* — and an amount is exactly that. This file is the drill: `priceIdentityError` is
 * pure and exported, so the guard the build depends on is exercised here rather than
 * trusted, in the manner check 32 exercises the freeze tool and check 26 exercises its own
 * detector.
 *
 * The last arm asserts the build still *calls* it. A validator nothing calls is this
 * repository's most-recorded defect shape, and it is the one failure the arms above
 * cannot see: they would all stay green with the call deleted.
 *
 * ── The denominator, declared although nothing demands it ──────────────────────────
 *
 * Check 16 requires `.report()` only from checks that reach the built site, and this one
 * reads two source files. The population is declared anyway, per BRIEF.md §3 check 16's
 * rule that every check names what it measured: three products, named, so that a fourth
 * product added to the identity — or a renamed key — cannot narrow this check into
 * measuring two, or one, while passing.
 *
 * ── What this check cannot see ──────────────────────────────────────────────────────
 *
 * The `from` flags. `from £3,500` plus `from £3,000` reaching `from £6,500` satisfies the
 * arithmetic while the sentence stops being an identity a reader can close. The guard
 * compares amounts; the claim it defends is wider than the guard. Said out loud here and
 * in the build, rather than left for the next author to discover.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import { IDENTITY, priceIdentityError, renderPrice } from '../../eleventy.config.js';
import products from '../../src/_data/products.json' with { type: 'json' };

const CONFIG = path.join(REPO_ROOT, 'eleventy.config.js');
const SERVICES = path.join(REPO_ROOT, 'src', '_data', 'copy', 'services.md');

/** The fragment carrying the claim, and the whole reason this check exists. */
const FRAGMENT = 'grid.paths';

/**
 * Copy tokens to `products.json` keys.
 *
 * The two spellings differ — the token is `topup.price` and the key is `top-up` — because
 * `{top-up.price}` is not a token shape. `buildTokens()` in eleventy.config.js holds the
 * same mapping. Two spellings of one fact that disagree is a defect this repository has
 * shipped before, so the mapping is written once here and asserted against the sentence.
 */
const TOKEN_TO_KEY = { audit: 'audit', topup: 'top-up', baseline: 'baseline' };

/** One `@@ name` fragment's body, or null. */
function fragment(markdown, name) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.trim() === `@@ ${name}`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^@@\s+\S+\s*$/.test(l.trim()));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

const priceTokens = (text) =>
  [...text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\.price\}/g)].map((m) => m[1]);

test('check 35 — the audit plus a later top-up equals a baseline taken directly', () => {
  const named = [...IDENTITY.addends, IDENTITY.total];
  const s = survey({
    products: `products participating in the published identity (${named.join(', ')})`,
  });

  const byKey = new Map(products.products.map((p) => [p.key, p]));
  for (const key of named) {
    assert.ok(
      byKey.has(key),
      `products.json has no product keyed "${key}". The identity names three products and ` +
        `this check found ${byKey.size} in the file; a renamed key would otherwise retire ` +
        `the guard silently.`
    );
    s.count('products');
  }

  const error = priceIdentityError(products);
  if (error) s.fail(error);

  s.report(
    `the site publishes an arithmetic identity over these three amounts, and the build ` +
      `refuses to render a page where it does not hold:\n\n${error ?? ''}`
  );
});

test('check 35 — the identity sentence still names the products this check compares', () => {
  const s = survey({
    tokens: `price tokens interpolated into copy/services.md @@ ${FRAGMENT}`,
  });

  const body = fragment(readFileSync(SERVICES, 'utf8'), FRAGMENT);
  assert.ok(
    body,
    `copy/services.md has no @@ ${FRAGMENT} fragment. Either the identity sentence moved, ` +
      `in which case this check is now guarding a claim the site no longer makes, or it was ` +
      `deleted — and both are decisions, not silences.`
  );

  const tokens = priceTokens(body);
  s.count('tokens', tokens.length);

  const claimed = tokens.map((t) => TOKEN_TO_KEY[t] ?? `«unmapped token ${t}»`).sort();
  const compared = [...IDENTITY.addends, IDENTITY.total].sort();

  if (JSON.stringify(claimed) !== JSON.stringify(compared)) s.fail(
    `the sentence interpolates ${JSON.stringify(claimed)} and the arithmetic guard ` +
      `compares ${JSON.stringify(compared)}. A published claim over a set the guard does ` +
      `not cover is the shape this check exists to make impossible.`
  );

  s.report(
    `the arithmetic guard covers exactly the prices the published sentence puts in front ` +
      `of a reader`
  );
});

test('check 35 — the identity guard still fails when a value drifts (controls)', () => {
  const record = (audit, topup, baseline) => ({
    products: [
      { key: 'audit', amount: audit },
      { key: 'top-up', amount: topup },
      { key: 'baseline', amount: baseline },
      { key: 'review', amount: 12000 },
    ],
  });

  assert.equal(priceIdentityError(record(3500, 3000, 6500)), null, 'a consistent ladder must pass');
  assert.equal(priceIdentityError(record(2500, 2500, 5000)), null, 'the pre-reprice ladder was consistent too');

  // Each of the three moved alone: the half-done reprice, in all three directions.
  const drifted = [
    ['the audit alone', record(3500, 2500, 5000)],
    ['the top-up alone', record(2500, 3000, 5000)],
    ['the baseline alone', record(2500, 2500, 6500)],
  ];
  for (const [what, r] of drifted) {
    const message = priceIdentityError(r);
    assert.ok(message, `the guard passed with ${what} moved, so it defends nothing`);
    // All three repairs are named, because one equation cannot elect a culprit.
    for (const key of ['audit', 'top-up', 'baseline']) {
      assert.match(
        message,
        new RegExp(`${key} should be \\d+`),
        `the failure message does not say what "${key}" would have to be (${what}):\n${message}`
      );
    }
  }

  // A renamed or retyped record is an error, never a quiet pass over two products.
  assert.match(
    priceIdentityError({ products: [{ key: 'audit', amount: 3500 }] }) ?? '',
    /no product keyed "top-up"/,
    'a missing product must be named, not skipped'
  );
  assert.match(
    priceIdentityError(record('£3,500', 3000, 6500)) ?? '',
    /not a whole number of pounds/,
    'a display string in an amount must be refused rather than concatenated'
  );
  assert.match(
    priceIdentityError(record(3500.5, 3000, 6500)) ?? '',
    /not a whole number of pounds/,
    'a fractional amount must be refused'
  );

  // The renderer the page uses is what a reader compares, so it has to survive the
  // widest amount this ladder now carries.
  assert.equal(
    renderPrice({ key: 'review', amount: 12000, from: true }),
    'from £12,000 + VAT',
    'the price renderer no longer produces the five-digit form the ladder publishes'
  );
});

test('check 35 — the build still calls the guard', () => {
  // Comments stripped first: `// validatePriceIdentity();` beside the declaration also
  // reads as two occurrences of the name, so a commented-out call — the exact deletion this
  // arm exists to catch — would pass. Found by a coverage audit on check 37, which had
  // inherited the same instrument; check 16's own scanner strips for the same reason.
  const source = readFileSync(CONFIG, 'utf8').replace(/\/\/[^\n]*/g, '');
  const s = survey({ calls: 'call sites of the identity guard inside the build config' });

  // Two occurrences when wired: the declaration and the call. Counting the name rather
  // than matching a line, so a reindent or a rename cannot slip past.
  const occurrences = (source.match(/validatePriceIdentity\s*\(/g) ?? []).length;
  s.count('calls', occurrences);

  if (occurrences < 2) s.fail(
    `eleventy.config.js declares validatePriceIdentity but never calls it (${occurrences} ` +
      `occurrence(s) of the name). A guard the build does not run is the defect shape this ` +
      `repository has recorded most often — every other arm in this file stays green with ` +
      `the call deleted.`
  );

  s.report('the identity guard is wired into the build, not merely defined beside it');
});
