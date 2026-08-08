/**
 * The banned-lexicon detector, as a pure function.
 *
 * Extracted from check 3 for one reason: the check's first draft flagged
 * fourteen passages, and every single one was the site *disclaiming* the thing —
 * "We do not certify, attest, accredit or approve", "Not an accreditation, and
 * not a badge", "There is no overall score, no weighted average, no percentage".
 *
 * Banning those would have deleted the disclosures BRIEF.md §2 exists to
 * produce. The invariant is not "these letters must not appear"; it is "the
 * practice must not claim these things". A disclaimer is the opposite of a
 * claim, and a check that cannot tell them apart is measuring spelling.
 *
 * So detection is claim-shaped: a banned term counts only when the sentence
 * carrying it has no negation. That heuristic is permissive by construction,
 * which is exactly why `lexicon.test.js` plants claim-shaped strings and asserts
 * they are still caught. Without those positive controls a broad negation rule
 * would quietly turn check 3 into a no-op, and a check that cannot fail is the
 * thing this whole suite exists to prevent.
 */

export const BANNED = [
  { word: 'independent', re: /\bindependen(?:t|ce|tly)\b/gi, why: 'the word we do not use' },
  { word: 'certified', re: /\bcertif(?:y|ies|ied|ication|ications)\b/gi, why: 'no certification exists' },
  { word: 'accredited', re: /\baccredit(?:ed|ation|ations)\b/gi, why: 'no accreditation stands behind this' },
  { word: 'attested', re: /\battest(?:s|ed|ation|ations)?\b/gi, why: 'attestation is phase 2' },
  { word: 'trusted by', re: /\btrusted by\b/gi, why: 'there is nobody to be trusted by' },
  { word: 'overall score', re: /\boverall score\b/gi, why: 'there is no total' },
  { word: 'average', re: /\baverage[ds]?\b/gi, why: 'nothing is averaged across dimensions' },
];

/** A percentage sitting next to a level: "OAL 2 (75%)", "72% assured". */
export const PERCENT_ON_LEVEL =
  /(?:OAL\s*[0-3][^.\n]{0,30}?\d+\s*%)|(?:\d+\s*%[^.\n]{0,30}?OAL\s*[0-3])/gi;

/**
 * Negation cues. Sentence-scoped rather than look-behind, because the copy
 * negates in both directions: "We do not certify" puts the cue first,
 * "Anything that averages the dimensions is marketing, not assessment" puts it
 * last, and both are disclaimers.
 */
const NEGATION =
  /\b(?:no|not|never|nobody|nothing|neither|nor|none|without|cannot|can't|don't|doesn't|didn't|isn't|aren't|wasn't|won't|rather than|instead of|free of|absent|lacks?|refus\w+|declin\w+|deliberately un\w+)\b/i;

/** Split on sentence enders, keeping em-dash clauses together. */
export function sentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z£"'(]|$)/)
    .filter((s) => s.trim().length > 0);
}

export function isNegated(sentence) {
  return NEGATION.test(sentence);
}

/**
 * Every claim-shaped use of a banned term in `text`.
 * Returns `{ word, why, match, sentence }` per finding.
 */
export function findBannedLexicon(text) {
  const found = [];
  for (const sentence of sentences(text)) {
    const negated = isNegated(sentence);
    for (const { word, re, why } of BANNED) {
      re.lastIndex = 0;
      for (const m of sentence.matchAll(re)) {
        if (negated) continue;
        found.push({ word, why, match: m[0], sentence: sentence.trim() });
      }
    }
    PERCENT_ON_LEVEL.lastIndex = 0;
    for (const m of sentence.matchAll(PERCENT_ON_LEVEL)) {
      // A percentage on an ordinal level is wrong even inside a denial, because
      // the shape itself teaches the reader that levels are interval-scaled.
      found.push({
        word: 'percentage on a level',
        why: 'OAL 0-3 is ordinal; a percentage implies an interval',
        match: m[0],
        sentence: sentence.trim(),
      });
    }
  }
  return found;
}
