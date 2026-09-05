/**
 * Check 36 — a published rate reaches the page as one unbreakable run.
 *
 * `renderPrice()` joins `from` and `+ VAT` with U+00A0 so a price cannot come apart at a
 * space. The rate suffix was never joined at all: `${figure}${period}` produced
 * `£3,000/month`, and whether that is one run or two is a decision the *browser* makes.
 *
 * ── The measurement this check was written from ─────────────────────────────────────
 *
 * The string was rendered in all three engines Playwright ships, in a 20px container, and
 * the characters walked to see which line each landed on:
 *
 *   chromium   £3,000/month   1 line
 *   webkit     £3,000/month   1 line
 *   firefox    £3,000/month   2 lines — ["£3,000/", "month"]
 *
 * Firefox takes the break opportunity UAX #14 allows after SOLIDUS (class SY: rule LB13
 * forbids a break *before* it, nothing forbids one after). Chromium and WebKit decline it.
 * That is why an earlier pass, measured in Chromium alone, recorded the run as whole and
 * the defect as latent: it was neither. `£3,000/` at a line end with `month` orphaned
 * below, in the stacked reflow, beside a top-up that genuinely is £3,000 — the retainer
 * and the top-up are told apart by `/month` and nothing else.
 *
 * With U+2060 WORD JOINER after the solidus all three engines render one line.
 *
 * ── Why a word joiner and not a non-breaking space ──────────────────────────────────
 *
 * The obvious symmetry with `+ VAT` is to reach for U+00A0, and it is wrong: a NBSP is a
 * *space*, so it would publish `£3,000 /month`. U+2060 is the zero-width member of the
 * same family — LB11 forbids a break on either side of it, and it prints nothing. It
 * survives both routes a price takes onto the page for exactly the reason U+00A0 does
 * (see the essay above `renderPrice`): markdown-it runs with `html: false` and the card
 * headers are auto-escaped, so markup dies on both and a literal character does not.
 *
 * ── Why the guard is inside renderPrice and this file has no "is it wired" arm ───────
 *
 * Check 35's fourth arm exists because `priceIdentityError` is a separate validator the
 * build has to remember to call. This invariant is asserted on the only path a price can
 * reach the page by, inside the function that composes it, so there is no second place for
 * the call to go missing from — the renderer-controls arm below calls `renderPrice` and
 * asserts it *throws*, so the guard is certified by behaviour rather than by its name.
 *
 * Measured, so the claim is the right size: deleting the joiner turns every arm here red
 * (the module throws at import); deleting only the `throw` while keeping the joiner turns
 * exactly the renderer-controls arm red, because the live data stays clean and arm 1 has
 * nothing to find. That is that arm's whole job.
 *
 * ── What this check cannot see ──────────────────────────────────────────────────────
 *
 * Whether a *permitted* character is safe. The predicate does not reimplement UAX #14; it
 * closes the alphabet, so a character outside `RATE_ALPHABET` is a build failure asking the
 * author to decide, and a character inside it is one somebody already decided about.
 *
 * An earlier draft enumerated the two known-bad characters instead, and a coverage audit
 * walked past it three ways in one pass — a second solidus (`indexOf` sees only the first),
 * a tab, and a hyphen, which is class HY and breaks after just as SOLIDUS does. All three
 * are permanent controls below.
 *
 * It is also blind to what happens after CSS: `word-break: break-all` anywhere near a price
 * would break inside the digits and no character can stop that.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { priceBreakFault, renderPrice } from '../../eleventy.config.js';
import products from '../../src/_data/products.json' with { type: 'json' };
import { survey } from '../lib/population.js';

const NBSP = ' ';
const WJ = '⁠';

test('check 36 — no published rate carries a line-break opportunity', () => {
  const s = survey({
    rates: 'published rates, rendered from products.json through the site\'s own filter',
  });

  for (const product of products.products) {
    const rendered = renderPrice(product);
    s.count('rates');
    const fault = priceBreakFault(rendered);
    if (fault) s.fail(`"${product.key}" renders ${JSON.stringify(rendered)}, which ${fault}`);
  }

  s.report(
    'every price on the site is one run no browser can split, so the retainer cannot ' +
      'shed its /month and read as the top-up'
  );
});

test('check 36 — the renderer emits the joiners, not merely the predicate (controls)', () => {
  // The rate suffix, which is what this check was added for.
  assert.equal(
    renderPrice({ key: 'retainer', amount: 3000, from: true, period: 'month' }),
    `from${NBSP}£3,000/${WJ}month${NBSP}+${NBSP}VAT`,
    'the rate suffix is no longer joined to its amount, so Firefox will break after the solidus'
  );
  // The two joins that were already there, so a rewrite of this function cannot trade one
  // guarantee for the other.
  assert.equal(
    renderPrice({ key: 'audit', amount: 3500 }),
    `£3,500${NBSP}+${NBSP}VAT`,
    'the VAT suffix is no longer joined to its amount'
  );
  assert.equal(
    renderPrice({ key: 'review', amount: 12000, from: true }),
    `from${NBSP}£12,000${NBSP}+${NBSP}VAT`,
    'the floor word is no longer joined to the figure it modifies'
  );

  // A renderer whose guard is deleted must not be able to return: the throw is the guard,
  // and a price that reaches the page breakable is the failure this check prevents.
  // Pence. `toLocaleString` emits ONE decimal place, so `12000.50` renders "£12,000.5" —
  // and the closed alphabet admits "." with no decimal rule, so the break predicate passes
  // it. `priceIdentityError` refuses a fractional amount but only over the three products
  // in the identity, so the review and the retainer had no guard at all. Now renderPrice
  // does, on the path all five take.
  for (const [what, amount] of [
    ['pence on a product outside the identity', 12000.5],
    ['a fraction of a penny', 3000.004],
    ['zero', 0],
    ['a negative amount', -500],
  ]) {
    assert.throws(
      () => renderPrice({ key: 'review', amount, from: true }),
      /whole positive numbers of pounds/,
      `${what} must fail the build rather than publish a malformed rate`
    );
  }

  // All four of these published a breakable price with the build green at some point today.
  for (const [what, period, shape] of [
    ['an ordinary space', 'calendar month', /ordinary space/],
    ['a second solidus', 'per/annum', /bare solidus/],
    ['a tab', 'per\tmonth', /U\+0009/],
    ['a hyphen, UAX #14 class HY, which also breaks after', 'half-month', /U\+002D/],
  ]) {
    assert.throws(
      () => renderPrice({ key: 'planted', amount: 3000, period }),
      shape,
      `a period containing ${what} renders a breakable price and must fail the build`
    );
  }
});

test('check 36 — the fault predicate still tells a joined run from a breakable one (controls)', () => {
  const clean = [
    `£3,500${NBSP}+${NBSP}VAT`,
    `from${NBSP}£12,000${NBSP}+${NBSP}VAT`,
    `from${NBSP}£3,000/${WJ}month${NBSP}+${NBSP}VAT`,
    `From${NBSP}£3,000/${WJ}month${NBSP}+${NBSP}VAT`,
  ];
  for (const rendered of clean) {
    assert.equal(
      priceBreakFault(rendered),
      null,
      `the predicate rejects a correctly joined rate: ${JSON.stringify(rendered)}`
    );
  }

  const breakable = [
    ['an ordinary space before the suffix', `£3,500 +${NBSP}VAT`, /ordinary space/],
    ['an ordinary space after the floor', `from £3,500${NBSP}+${NBSP}VAT`, /ordinary space/],
    ['a bare solidus', `from${NBSP}£3,000/month${NBSP}+${NBSP}VAT`, /solidus/],
    ['a solidus joined on the wrong side', `from${NBSP}£3,000${WJ}/month${NBSP}+${NBSP}VAT`, /solidus/],
    ['a SECOND solidus, the first correctly joined', `£3,000/${WJ}per/annum${NBSP}+${NBSP}VAT`, /solidus/],
    ['a tab, UAX #14 class BA', `£3,000/${WJ}per\tmonth${NBSP}+${NBSP}VAT`, /U\+0009/],
    ['a hyphen, class HY', `£3,000/${WJ}half-month${NBSP}+${NBSP}VAT`, /U\+002D/],
  ];
  for (const [what, rendered, shape] of breakable) {
    const fault = priceBreakFault(rendered);
    assert.ok(fault, `the predicate passed a rate with ${what}, so it defends nothing`);
    assert.match(fault, shape, `the message does not say what is wrong (${what}): ${fault}`);
    // The repair has to be nameable by whoever reads the failure, not inferable.
    assert.match(
      fault,
      /U\+00A0|U\+2060|RATE_ALPHABET/,
      `the message does not name the character that repairs it, or the rule to extend ` +
        `(${what}): ${fault}`
    );
  }
});
