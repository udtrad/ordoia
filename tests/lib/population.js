/**
 * Populations — the denominator a check measured.
 *
 * Every check in this suite has the same shape: collect some things, then assert that a
 * list of *findings* is empty. The failure mode that shape hides is not "findings was
 * wrong". It is that the thing being examined was empty too, so there was nothing for a
 * finding to come from and the assertion passed without measuring anything.
 *
 * CHECKS.md records this as lesson 8: check 14 collected printed addresses with a
 * hardcoded `ordoia.co.uk`, the domain became `ordoia.com`, the match set went empty, and
 * the assertion defending §9's worst-case failure kept passing while asserting nothing.
 * Check 9, doing the same work with `assert.ok(printed.size > 0)` in front of it, failed
 * as it should have.
 *
 * That fix was applied to checks 9 and 14. On 2026-08-09 the whole suite was run against
 * an empty directory to find out how far the same shape reached:
 *
 *   33 pass, 12 fail, 7 skipped — against a directory containing nothing at all.
 *
 * Eight of those passes were honest (check 0, and three controls tests, none of which
 * touch the site). The other twenty-five were site-touching checks reporting green having
 * examined an empty page list.
 *
 * ── Why this is an object and not a `population(items)` helper ──────────────────────
 *
 * A helper you call and then assert on is hand-guarding with extra steps: you can still
 * forget it, which is exactly how check 14 shipped without the guard while check 9 had
 * it. So declaring the population is not optional here. `survey()` requires at least one
 * named population up front, and `report()` checks every one of them is non-empty
 * *before* it looks at the findings. There is no way to reach the findings assertion
 * without having said what you measured.
 *
 * ── The distinction that makes this work everywhere ─────────────────────────────────
 *
 * Vacuity is never `findings === 0`. It is always `population === 0`. Once those are
 * separated, the checks that look like exceptions stop being exceptions:
 *
 *   check 9  "Terms and Privacy are absent"  population: pages scanned. findings: dangling links.
 *   check 6  "zero off-origin requests"      population: requests observed. findings: off-origin ones.
 *
 * Both legitimately expect zero findings. Neither may legitimately observe zero pages, and
 * "requests observed > 0" is a real guard — a page that failed to load also makes zero
 * off-origin requests.
 *
 * No check needs exempting. Some need their population named correctly.
 */

import assert from 'node:assert/strict';

/** A reason for `mayBeEmpty` has to be a sentence, matching allowances.json's rule. */
const MIN_REASON = 25;

class Survey {
  #populations = new Map();
  #findings = [];
  #reported = false;

  constructor(declared) {
    const entries = Object.entries(declared ?? {});
    assert.ok(
      entries.length > 0,
      'survey() needs at least one named population — what did this check measure?'
    );
    for (const [name, description] of entries) {
      assert.ok(
        typeof description === 'string' && description.trim().length > 0,
        `population "${name}" needs a description saying what it counts`
      );
      this.#populations.set(name, { description, n: 0, emptyBecause: null });
    }
  }

  #get(name) {
    const p = this.#populations.get(name);
    assert.ok(p, `population "${name}" was never declared to survey()`);
    return p;
  }

  /** Record that `n` more of `name` were measured. */
  count(name, n = 1) {
    this.#get(name).n += n;
    return this;
  }

  /** Record a violation. These are the findings, and they are expected to be empty. */
  fail(message) {
    this.#findings.push(message);
    return this;
  }

  /** Record findings in bulk. */
  failAll(messages) {
    for (const m of messages) this.#findings.push(m);
    return this;
  }

  /**
   * Permit a population to be empty, with a reason.
   *
   * The escape hatch costs a sentence in the file a reviewer reads, rather than a dated
   * entry in allowances.json, for the same reason check 2's reader-mark exemption is
   * written into the check: it is a permanent property of the design, not a judgement
   * that expires.
   */
  mayBeEmpty(name, reason) {
    assert.ok(
      typeof reason === 'string' && reason.trim().length >= MIN_REASON,
      `mayBeEmpty("${name}") needs a reason of at least ${MIN_REASON} characters saying why ` +
        'measuring nothing is the correct outcome here'
    );
    this.#get(name).emptyBecause = reason;
    return this;
  }

  /** What was counted, for a check that wants to assert something further. */
  size(name) {
    return this.#get(name).n;
  }

  get findings() {
    return [...this.#findings];
  }

  /**
   * Assert the populations first, then the findings.
   *
   * Order matters: an empty population makes the findings assertion meaningless, so the
   * failure has to name the empty population rather than report "no violations found".
   */
  report(invariant) {
    assert.ok(!this.#reported, 'report() was already called on this survey');
    this.#reported = true;

    const empty = [];
    for (const [name, p] of this.#populations) {
      if (p.n === 0 && !p.emptyBecause) empty.push(`${name} (${p.description})`);
    }

    assert.deepEqual(
      empty,
      [],
      'this check measured nothing, so passing would have meant nothing. Empty: ' +
        `${empty.join('; ')}. Either the target is wrong, or a selector stopped matching ` +
        'and the check went quiet instead of red.'
    );

    assert.deepEqual(this.#findings, [], invariant);
    return this;
  }
}

/**
 * Declare what this check is about to measure.
 *
 *   const s = survey({ pages: 'pages loaded', rules: '.measure__rule elements' });
 *   ...
 *   s.count('pages');
 *   s.count('rules', found.length);
 *   if (bad) s.fail(`${url}: ${ratio}:1 on the rule`);
 *   s.report('every load-bearing graphic meets 3:1');
 */
export function survey(declared) {
  return new Survey(declared);
}
