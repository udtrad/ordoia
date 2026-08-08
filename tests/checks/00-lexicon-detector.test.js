/**
 * Check 0 — the detector that check 3 depends on.
 *
 * Check 3 permits a banned word inside a negated sentence. That rule is
 * permissive, and a permissive rule with no positive controls is how a check
 * quietly stops checking. These are the controls.
 *
 * The claim cases below are the failures check 3 exists to catch. If any of them
 * stops failing, check 3 has become decoration and the site's own rubric would
 * score it OAL 1: a behaviour requested in a comment, with nothing verifying it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { findBannedLexicon, isNegated, sentences } from '../lib/lexicon.js';

const words = (text) => findBannedLexicon(text).map((f) => f.match.toLowerCase());

test('check 0 — claim-shaped uses are caught', () => {
  const claims = [
    ['Ordoia is an independent assurance practice.', 'independent'],
    ['Our assessors are certified by a recognised body.', 'certified'],
    ['We are an accredited third-party assessor.', 'accredited'],
    ['Every engagement produces an attested scorecard.', 'attested'],
    ['Trusted by leading UK financial services firms.', 'trusted by'],
    ['Your overall score is calculated from all eight dimensions.', 'overall score'],
    ['The system scores an average of OAL 2 across the rubric.', 'average'],
  ];

  for (const [sentence, expected] of claims) {
    const hits = words(sentence);
    assert.ok(
      hits.some((h) => h.includes(expected.split(' ')[0])),
      `detector missed a claim it must catch: "${sentence}" (expected "${expected}", got ${JSON.stringify(hits)})`
    );
  }
});

test('check 0 — a percentage on a level is caught even when denied', () => {
  // The shape teaches the reader that levels are interval-scaled, so unlike the
  // words, it is not rescued by a negation.
  assert.ok(words('We never report OAL 2 as 66% assured.').length > 0);
  assert.ok(words('Your system reached OAL 3 (95%).').length > 0);
});

test('check 0 — disclaimers are permitted', () => {
  const disclaimers = [
    'We do not certify, attest, accredit or approve.',
    'Not an accreditation, and not a badge.',
    'No accreditation stands behind it.',
    'There is no overall score, no weighted average, no percentage and no traffic light.',
    'This field takes the lowest rather than the average.',
    'Anything that averages the dimensions is marketing, not assessment.',
    'Nobody asks whether their tracing vendor is independent.',
    'No client logos and nothing trusted by anybody.',
    'no accredited certification currently exists to fill it',
  ];

  for (const sentence of disclaimers) {
    assert.deepEqual(
      words(sentence),
      [],
      `detector flagged a disclaimer as a claim: "${sentence}"`
    );
  }
});

test('check 0 — sentence splitting keeps a disclaimer from rescuing its neighbour', () => {
  // The one real risk of sentence-scoped negation: a denial in sentence A must
  // not launder a claim in sentence B.
  const text = 'We do not certify anything. Ordoia is an independent practice.';
  const hits = words(text);
  assert.deepEqual(hits, ['independent'], `expected only the second sentence to fail, got ${JSON.stringify(hits)}`);
});

test('check 0 — negation and splitting behave', () => {
  assert.equal(isNegated('We do not certify.'), true);
  assert.equal(isNegated('We certify.'), false);
  assert.equal(sentences('One. Two. Three.').length, 3);
});
