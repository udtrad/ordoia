/**
 * Check 12 — copy provenance.
 *
 * BRIEF.md §3 check 12: "Rendered copy diverges from the source-of-truth copy
 * files without a corresponding entry in the change log (§8)."
 * §8: "Much of this wording has been fought over for honesty and legal reasons,
 * and the vault is the source of truth... Nothing is silently rewritten."
 *
 * This is the check that makes §8 enforceable rather than a request. It has two
 * halves, and the first is the one that matters:
 *
 *   1. A source of truth must EXIST. Copy must live in content files, not in
 *      templates (§8). Until it does, there is nothing to diverge from and the
 *      rule is unenforceable by construction.
 *   2. Rendered prose must trace back to it, or to a dated CHANGES.md entry.
 *
 * EXPECTED RED ON THE HANDOVER, and honestly so: the handover holds its copy
 * inside seven HTML files with no separate source and no change log. That is not
 * a criticism of the design pass — it is precisely the gap §8 asks engineering
 * to close, and a check that pretended otherwise would be measuring nothing.
 *
 * The normalisation rule is deliberately loose on whitespace and entities and
 * strict on words. A check that trips on a reflowed paragraph gets disabled
 * within a month; a check that misses a rewritten sentence was never worth
 * having.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { withSite, REPO_ROOT } from '../lib/harness.js';

const COPY_DIR = path.join(REPO_ROOT, 'src', '_data', 'copy');
const CHANGES = path.join(REPO_ROOT, 'CHANGES.md');

/** Words only: case-folded, entity-decoded, punctuation and whitespace dropped. */
function normalise(text) {
  return text
    .replace(/&(nbsp|middot|mdash|ndash|pound|amp|quot|hellip|darr|times);/g, ' ')
    .replace(/[‘’“”–—· ]/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9£%]+/g, ' ')
    .trim();
}

/** Sentence-ish units long enough to be worth tracing. */
function claims(text) {
  return normalise(text)
    .split(/\s+/)
    .reduce((acc, word) => {
      const last = acc[acc.length - 1];
      if (!last || last.length >= 12) acc.push([word]);
      else last.push(word);
      return acc;
    }, [])
    .map((w) => w.join(' '))
    .filter((s) => s.split(' ').length >= 8);
}

async function loadCopyCorpus() {
  if (!existsSync(COPY_DIR)) return null;
  const files = (await readdir(COPY_DIR, { recursive: true })).filter((f) => /\.(md|json|txt|njk)$/.test(f));
  const parts = await Promise.all(
    files.map((f) => readFile(path.join(COPY_DIR, f), 'utf8').catch(() => ''))
  );
  return normalise(parts.join('\n'));
}

test('check 12 — a source of truth for the copy exists outside the templates', async () => {
  assert.ok(
    existsSync(COPY_DIR),
    `no copy source of truth at src/_data/copy. §8 requires the copy to be held in ` +
      `content files rather than templates; while it lives only inside the HTML there is ` +
      `nothing for a divergence to be measured against, and "nothing is silently rewritten" ` +
      `is a request rather than a rule.`
  );

  const corpus = await loadCopyCorpus();
  assert.ok(corpus && corpus.length > 2000, 'the copy source exists but is essentially empty');
});

test('check 12 — a change log exists and every entry is complete', async () => {
  assert.ok(
    existsSync(CHANGES),
    `no CHANGES.md. §8 requires every departure from the vault copy to carry an entry ` +
      `with where, source, change and why — the format RATIONALE.md already establishes.`
  );

  const text = await readFile(CHANGES, 'utf8');
  const rows = text
    .split('\n')
    .filter((l) => /^\|/.test(l) && !/^\|\s*[-:]+/.test(l))
    .slice(1); // drop the header row

  assert.ok(rows.length > 0, 'CHANGES.md has no entries; every copy change so far was silent');

  const incomplete = rows
    .map((r) => r.split('|').map((c) => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1))
    .filter((cells) => cells.length < 5 || cells.some((c) => c === ''))
    .map((cells) => cells.join(' | ').slice(0, 100));

  assert.deepEqual(
    incomplete,
    [],
    `change-log entries missing where/source/change/why:\n  ${incomplete.join('\n  ')}`
  );
});

test('check 12 — rendered prose traces back to the copy source or to a logged change', async () => {
  const corpus = await loadCopyCorpus();
  if (!corpus) {
    assert.fail('no copy source of truth — see the first check in this file');
  }
  const changes = existsSync(CHANGES) ? normalise(await readFile(CHANGES, 'utf8')) : '';
  const untraced = [];

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      const prose = await page.evaluate(() =>
        [...document.querySelectorAll('main p, main li, main dd, main td, main h1, main h2, main h3')]
          .map((el) => (el.textContent || '').trim())
          .filter((t) => t.length > 40)
          .join('\n')
      );

      for (const claim of claims(prose)) {
        if (corpus.includes(claim) || changes.includes(claim)) continue;
        untraced.push(`${url}: "${claim}"`);
      }
    }
    await page.close();
  });

  const sample = untraced.slice(0, 12);
  assert.deepEqual(
    sample,
    [],
    `${untraced.length} rendered passage(s) appear in neither the copy source nor the change ` +
      `log, so they were rewritten without a record:\n  ${sample.join('\n  ')}`
  );
});
