/**
 * The override mechanism.
 *
 * BRIEF.md §3: "An override must be an explicit, dated, one-line-reason
 * allowance in a committed file — the same shape as a deviation log in a
 * working paper. Never a silenced rule."
 *
 * Two properties follow from that sentence and are enforced here:
 *
 *  1. A malformed allowance fails the suite. An override that cannot be read is
 *     worse than no override, because it looks like diligence.
 *  2. An allowance that matches nothing fails the suite. A deviation log that
 *     accumulates entries for violations that no longer exist stops being a
 *     record of judgement and becomes decoration — the exact defect the site's
 *     own rubric scores at OAL 1.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './harness.js';

const FILE = path.join(REPO_ROOT, 'tests', 'allowances.json');
const REQUIRED = ['id', 'check', 'page', 'match', 'reason', 'dated', 'addedBy'];

/** `/independence.html`, `/independence/` and `/independence` all compare equal. */
export function normalisePage(url) {
  let u = url.split('?')[0].split('#')[0];
  u = u.replace(/index\.html$/, '').replace(/\.html$/, '');
  if (u.length > 1) u = u.replace(/\/+$/, '');
  return u === '' ? '/' : u;
}

function validate(entry, index) {
  const where = `allowances[${index}]${entry.id ? ` (${entry.id})` : ''}`;
  for (const field of REQUIRED) {
    if (entry[field] === undefined || entry[field] === '') {
      throw new Error(`${where}: missing required field "${field}"`);
    }
  }
  if (!Number.isInteger(entry.check) || entry.check < 1 || entry.check > 99) {
    throw new Error(`${where}: "check" must be the check number`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.dated) || Number.isNaN(Date.parse(entry.dated))) {
    throw new Error(`${where}: "dated" must be a real ISO date, got "${entry.dated}"`);
  }
  if (/\n/.test(entry.reason)) {
    throw new Error(`${where}: "reason" must be one line`);
  }
  if (entry.reason.trim().length < 25) {
    throw new Error(`${where}: "reason" is too short to be a reason`);
  }
}

let cache = null;

export async function loadAllowances() {
  if (cache) return cache;
  const raw = JSON.parse(await readFile(FILE, 'utf8'));
  const list = raw.allowances ?? [];
  const seenId = new Set();
  const seenTarget = new Set();
  list.forEach((entry, i) => {
    validate(entry, i);
    if (seenId.has(entry.id)) throw new Error(`duplicate allowance id "${entry.id}"`);
    seenId.add(entry.id);
    const target = `${entry.check}::${normalisePage(entry.page)}::${entry.match.toLowerCase()}`;
    if (seenTarget.has(target)) {
      throw new Error(
        `allowances[${i}] (${entry.id}): a second allowance for check ${entry.check} on ` +
          `${entry.page} matching "${entry.match}". One allowance covers every matching ` +
          `violation on its page; a duplicate can only ever be dead weight in the log.`
      );
    }
    seenTarget.add(target);
  });
  cache = list;
  return list;
}

/**
 * A ledger for one check.
 *
 * `allows(page, match)` answers whether a violation is covered, and records
 * that it was used. `unused()` reports entries that covered nothing, which the
 * check then fails on.
 */
export async function ledgerFor(checkNumber) {
  const all = await loadAllowances();
  const mine = all.filter((a) => a.check === checkNumber);
  const used = new Set();

  return {
    entries: mine,
    allows(pageUrl, matchText) {
      const page = normalisePage(pageUrl);
      const text = String(matchText).toLowerCase();
      const hit = mine.find(
        (a) => normalisePage(a.page) === page && text.includes(a.match.toLowerCase())
      );
      if (hit) used.add(hit.id);
      return Boolean(hit);
    },
    /**
     * Allowances that fired against nothing this run.
     *
     * Strictly one entry per (page, match): an allowance covers every matching
     * violation on its page, so duplicates buy nothing and are rejected at load
     * time. The first draft was lenient here — two entries for the same
     * page+match were both marked used when either fired — and that leniency
     * immediately hid a dead allowance behind a live one. A deviation log that
     * cannot report its own dead entries is not a deviation log.
     */
    unused() {
      return mine.filter((a) => !used.has(a.id));
    },
  };
}
