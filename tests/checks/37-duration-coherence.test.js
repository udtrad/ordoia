/**
 * Check 37 — a product's duration is one integer, however many surfaces spell it.
 *
 * The grid cell, the path row and both CTA strips render `p.duration` straight out of
 * `products.json`, so they cannot drift. The three card headers on Services are prose:
 * *One week*, *Four weeks*, *six-month minimum*, typed by a person, in a different file,
 * and until 2026-09-05 nothing anywhere compared them to the record they describe.
 *
 * That is the same shape as the defect check 35 closed one field over, and
 * `priceIdentityError`'s own docblock names it: *"it is also blind to durations, which are
 * their own strings on the same records."* The 2026-09 reprice moved the review from three
 * weeks to four and had to edit both halves by hand to stay true — which is a coupling
 * held by an author's memory, not by the build.
 *
 * ── The numeral/word split is deliberate and stays ──────────────────────────────────
 *
 * `4 weeks` in the grid against *Four weeks* in the header is a design ruling: the grid is
 * scanned and compared, a header is read once. This check reconciles the two spellings
 * instead of harmonising them, so the ruling survives and the drift does not.
 *
 * ── Why the guard is in the build and this file drills it ───────────────────────────
 *
 * CHECKS.md's house rule: an invariant belongs in `eleventy.config.js` when it can fail at
 * the moment somebody edits the wrong value. A duration is edited in two files, so that
 * moment is two moments. Proven red first in all three directions before it was made to
 * pass — the record moved, the header moved, and the header's duration field deleted —
 * each failing `npm run build` with exit 1 and naming the disagreeing surface.
 *
 * The last two arms are the wiring, and they are two because one was not enough. A
 * coverage audit rewrote the validator to swallow its error and the whole suite stayed
 * green — the name was still there, so a name-counting arm cannot tell a guard from a
 * decoration. So one arm certifies the THROW by calling the validator with a planted
 * record, and the other counts the call site with comments stripped, because
 * `// validateDurationCoherence();` also reads as an occurrence of the name.
 *
 * ── What this check cannot see ──────────────────────────────────────────────────────
 *
 * A product with only one duration surface. The top-up and the baseline have no card
 * header, so there is no second spelling to disagree and this check is silent about them —
 * their `duration` is as unverified as any single-source string. It also constrains only
 * the *duration*: the wording around it is free, which is what leaves the deferred
 * elapsed-time rewrite (*within four weeks*) land AGAINST it, not on top of it: the whole
 * `·` field is normalised, so `within four weeks` disagrees with `4 weeks` until
 * `products.json` says `within 4 weeks` too. Measured — an earlier draft of this docblock
 * claimed the opposite. It is the guard working, and it makes that rewrite a two-file edit.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import {
  durationCoherenceError,
  SERVICES_FRAGMENTS,
  SERVICES_TERMS,
  validateDurationCoherence,
} from '../../eleventy.config.js';
import products from '../../src/_data/products.json' with { type: 'json' };

const CONFIG = path.join(REPO_ROOT, 'eleventy.config.js');

/** A record shaped like products.json, for the planted cases. */
const record = (...entries) => ({
  products: entries.map(([key, duration]) => ({ key, amount: 1000, duration })),
});

test('check 37 — every hand-typed duration agrees with the record it describes', () => {
  const fragments = SERVICES_FRAGMENTS();
  const terms = SERVICES_TERMS();
  const s = survey({
    headers: 'frag("<product>.terms") calls rendered by src/services.njk',
  });

  s.count('headers', terms.length);

  const error = durationCoherenceError(products, fragments, terms);
  if (error) s.fail(error);

  s.report(
    `a reader comparing the grid against the card header beside it sees one duration, ` +
      `not two spellings of two: ${terms.join(', ')}`
  );
});

test('check 37 — the population comes from the template, so a rename cannot shrink it', () => {
  // Measured wrong first: scanning copy/services.md for `.terms` keys, renaming
  // `@@ review.terms` to `@@ review.card` returned green with the renamed strip openly
  // disagreeing — the fragment simply left the denominator. Check 34's recorded defect one
  // guard over. The population is now the template's own frag() calls.
  assert.match(
    durationCoherenceError(
      record(['review', '4 weeks']),
      { 'review.card': 'Nine weeks · eight dimensions' },
      ['review.terms']
    ) ?? '',
    /copy\/services\.md has no such fragment/,
    'a terms strip renamed out from under the template must be named, not dropped'
  );

  // And the list really is read out of the template, not restated here.
  assert.deepEqual(
    SERVICES_TERMS(),
    ['audit.terms', 'review.terms', 'retainer.terms'],
    'src/services.njk no longer renders the three card headers this guard was measuring'
  );
});

test('check 37 — the guard reconciles the deliberate spellings and only those (controls)', () => {
  const terms = (body) => ({ 'audit.terms': body });

  // The numeral/word split the design ruling protects: these must PASS.
  for (const [duration, header] of [
    ['1 week', 'One week · £3,500 + VAT fixed · four dimensions · inspected depth'],
    ['4 weeks', 'Four weeks · eight dimensions · tested depth'],
    ['6-month minimum', '{audit.price} · six-month minimum · eight dimensions'],
    ['2 weeks', '2 weeks · eight dimensions'],
    // The /i flag on TIME_UNIT: without it a capitalised unit is not a duration field at all.
    ['4 weeks', 'Four Weeks · eight dimensions'],
    // The other two units the pattern names, neither of which the site uses yet.
    ['3 days', 'Three days · four dimensions'],
    ['1 year', 'One year · sustained depth'],
  ]) {
    assert.equal(
      durationCoherenceError(record(['audit', duration]), terms(header), ['audit.terms']),
      null,
      `the guard rejects a correct pairing: ${JSON.stringify(duration)} / ${JSON.stringify(header)}`
    );
  }

  // And the normaliser must not collapse durations that genuinely differ.
  for (const [what, duration, header] of [
    ['a different number', '4 weeks', 'Three weeks · eight dimensions'],
    ['a different unit', '4 weeks', 'Four months · eight dimensions'],
    ['a dropped qualifier', '6-month minimum', 'six months · eight dimensions'],
    ['a word for a number it is not', '1 week', 'Two weeks · four dimensions'],
  ]) {
    const error = durationCoherenceError(record(['audit', duration]), terms(header), ['audit.terms']);
    assert.ok(error, `the guard passed ${what}, so it defends nothing`);
    assert.match(error, /audit/, `the message does not name the product (${what}):\n${error}`);
    assert.match(
      error,
      new RegExp(`${duration.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      `the message does not quote the record's value (${what}):\n${error}`
    );
  }

  // Two disagreements are two findings. Reporting only the first sends the next author
  // back for a second build to discover the second.
  const both = durationCoherenceError(
    record(['audit', '1 week'], ['review', '4 weeks']),
    { 'audit.terms': 'Two weeks · x', 'review.terms': 'Nine weeks · x' },
    ['audit.terms', 'review.terms']
  );
  assert.match(both, /audit/, 'the first of two disagreements is missing from the message');
  assert.match(both, /review/, 'the second of two disagreements is missing from the message');

  // Above twelve is not a disagreement, and the message has to say which table to extend
  // rather than leaving "Thirteen weeks" vs "13 weeks" reading as drift.
  assert.match(
    durationCoherenceError(record(['audit', '13 weeks']), { 'audit.terms': 'Thirteen weeks · x' }, ['audit.terms']) ?? '',
    /NUMBER_WORDS in eleventy\.config\.js, which stops at\s+twelve/,
    'the message does not name the table an author has to extend'
  );

  // `Object.hasOwn`, not `word in NUMBER_WORDS`. `constructor` survives lowercasing and is
  // on Object.prototype, so `in` splices a function body into the normalised value — and
  // the word has to be INSIDE the duration field to reach the normaliser at all, which is
  // where the first version of this control was wrong. Positive assertion first: the
  // message must quote the value normalised correctly.
  const proto = durationCoherenceError(
    record(['audit', '1 week constructor']),
    { 'audit.terms': 'Two weeks constructor · eight dimensions' },
    ['audit.terms']
  );
  assert.match(
    proto,
    /"1 week constructor" against "2 weeks constructor"/,
    `a prototype-named word did not normalise to itself:\n${proto}`
  );
  assert.doesNotMatch(proto, /native code/, 'a prototype member leaked into the comparison');

  // A record the grid would render as an empty cell is an error, not a comparison against
  // the word "undefined".
  assert.match(
    durationCoherenceError({ products: [{ key: 'audit' }] }, { 'audit.terms': 'One week · x' }, Object.keys({ 'audit.terms': 'One week · x' })) ?? '',
    /no usable `duration`/,
    'a product with no duration must be named rather than stringified into the message'
  );
});

test('check 37 — an unreadable population is an error, never a quiet pass (controls)', () => {
  // A header that stopped naming a duration. The pairing is gone, not satisfied.
  assert.match(
    durationCoherenceError(record(['audit', '1 week']), { 'audit.terms': '{audit.price} · four dimensions' }, Object.keys({ 'audit.terms': '{audit.price} · four dimensions' })) ?? '',
    /0 fields naming a unit of time/,
    'a header with no duration must be named, not skipped'
  );
  // Two candidates: the guard must refuse to guess which one the record describes.
  assert.match(
    durationCoherenceError(record(['audit', '1 week']), { 'audit.terms': 'One week · within two weeks · inspected' }, Object.keys({ 'audit.terms': 'One week · within two weeks · inspected' })) ?? '',
    /2 fields naming a unit of time/,
    'an ambiguous header must be refused rather than resolved by position'
  );
  // A renamed fragment prefix, which would otherwise drop out of the denominator silently.
  assert.match(
    durationCoherenceError(record(['audit', '1 week']), { 'audit1.terms': 'One week · inspected' }, Object.keys({ 'audit1.terms': 'One week · inspected' })) ?? '',
    /names no product in products.json/,
    'a terms strip with no product must be named'
  );
  // The template renders no terms strip at all — the shape where a check measures nothing
  // and reports green.
  assert.match(
    durationCoherenceError(record(['audit', '1 week']), { 'audit.lede': 'One week of nothing' }, []) ?? '',
    /measured nothing and would have passed/,
    'an empty population must be an error, per check 16'
  );

  // A frag() call the guard cannot read a product out of is named, not skipped.
  assert.match(
    durationCoherenceError(record(['audit', '1 week']), { 'audit.lede': 'One week' }, ['audit.lede']) ?? '',
    /cannot read a product out of/,
    'a rendered fragment that is not a terms strip must be named'
  );
  // A hyphenated key spelled the way a token has to spell it.
  assert.equal(
    durationCoherenceError(record(['top-up', '~1 week']), { 'topup.terms': 'One week · inspected depth' }, Object.keys({ 'topup.terms': 'One week · inspected depth' })),
    null,
    'a `topup.terms` fragment must resolve to the `top-up` record, as copy tokens do'
  );
});

test('check 37 — the guard throws, it does not merely run', () => {
  // Certifying the THROW rather than the name. Rewriting the validator body to swallow its
  // error left every other arm in this file green, which is what this one exists for.
  assert.throws(
    () => validateDurationCoherence(
      record(['audit', '4 weeks']),
      { 'audit.terms': 'Nine weeks · eight dimensions' },
      ['audit.terms']
    ),
    /durations disagree across surfaces/,
    'validateDurationCoherence returned on a record whose surfaces disagree, so the build ' +
      'would render a page stating two durations for one product'
  );

  // And it must not throw on a record that agrees, or the build never renders at all.
  assert.doesNotThrow(
    () => validateDurationCoherence(
      record(['audit', '1 week']),
      { 'audit.terms': 'One week · x' },
      ['audit.terms']
    ),
    'the guard throws on a coherent record'
  );
});

test('check 37 — the build still calls the guard', () => {
  // Comments stripped first: `// validateDurationCoherence();` beside the declaration also
  // reads as two occurrences of the name, and a commented-out call is exactly the deletion
  // this arm exists to catch. Check 16's own scanner strips for the same reason.
  const source = readFileSync(CONFIG, 'utf8').replace(/\/\/[^\n]*/g, '');
  const s = survey({ calls: 'call sites of the duration guard inside the build config' });

  const occurrences = (source.match(/validateDurationCoherence\s*\(/g) ?? []).length;
  s.count('calls', occurrences);

  if (occurrences < 2) s.fail(
    `eleventy.config.js declares validateDurationCoherence but never calls it ` +
      `(${occurrences} occurrence(s) of the name). Every other arm in this file stays ` +
      `green with the call deleted, which is exactly why this one exists.`
  );

  s.report('the duration guard is wired into the build, not merely defined beside it');
});
