/**
 * Check 26 — a price is never typed.
 *
 * Draft 5 §4.3: `£` followed by a digit appears zero times across
 * `src/_data/copy/*.md` and `src/**` templates.
 *
 * ── Why this check and not thirteen careful edits ─────────────────────────────────
 *
 * The VAT suffix could have been added by hand to every price string on the site. The
 * objection is not that hand-editing is tedious; it is that a hand-edited set has no
 * membership rule, so the *fourteenth* price — the one somebody adds next month — is
 * added without the suffix and nothing notices. Prices now render through one filter,
 * and this is the check that makes going around the filter impossible rather than
 * discouraged.
 *
 * It is also the check that would have caught row 46 four sessions earlier. Card 3's
 * header carried a typed `From £3,000/month` while `{retainer.price}` sat unused, so
 * the grid cell and the card header could disagree about the same product's price on
 * the same page. Nothing in the suite could see it, because no check had ever asked
 * where the character `£` occurs.
 *
 * ── What counts, and why comments count too ───────────────────────────────────────
 *
 * The scan is over raw file text, so a price inside a `{# … #}` Nunjucks comment is a
 * finding. That is deliberate and it is not pedantry: on its first run this check
 * failed on `src/services.njk`, whose rationale comment read *"the page a buyer reads
 * before spending £2,500"* — a sentence that silently becomes false the day the audit
 * is repriced, sitting in a file nobody re-reads. §4.4 states the rule this is an
 * instance of: a literal is a claim with a known expiry, and this repo has already
 * shipped two of those.
 *
 * Deciding instead that comments are exempt would need a Nunjucks parser to work out
 * what is comment and what is content — a parser is a bug surface, and the exemption
 * would be protecting the one place a stale price is hardest to see.
 *
 * The entity forms are caught as well. `&pound;2,500` and `&#163;2,500` are the same
 * defect wearing a costume, and the designer handover at the repo root is written that
 * way, so the costume is one copy-paste away.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from '../lib/harness.js';
import { survey } from '../lib/population.js';

const SRC = path.join(REPO_ROOT, 'src');

/**
 * A currency amount as a human would type one: the sign, optional space, then a digit.
 *
 * The sign is matched in all three spellings it can reach a file in. `\s*` is here
 * because `£ 2,500` is the same mistake with a space in it, and a check that reads
 * only the tight form teaches people to type the loose one.
 */
const PRICE_LITERAL = /(?:£|&pound;|&#0*163;|&#[xX]0*A3;)\s*\d/gi;

/**
 * Every price literal in one file's raw text, with the line it sits on.
 *
 * Pure and exported so the controls below can exercise the judgement without touching
 * the filesystem — the pattern `overlap.js` and `compareToManifest` established, and
 * the reason a guard on something that can never be corrected is worth demonstrating.
 */
export function priceLiterals(text) {
  const out = [];
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    for (const m of lines[i].matchAll(PRICE_LITERAL)) {
      out.push({
        line: i + 1,
        column: m.index + 1,
        excerpt: lines[i].trim().slice(0, 96),
      });
    }
  }
  return out;
}

/**
 * Every file this check is responsible for, as repo-relative paths, sorted.
 *
 * §4.3 names the copy fragments and the templates. The data files are here as well,
 * which is wider than the brief asked for and is the point: once amounts are numbers,
 * `£` has no legitimate occurrence anywhere under `src/`, so the honest rule is "not
 * here either" rather than a boundary somebody has to remember. The regression this
 * closes is putting the symbol back into `products.json`, which is exactly where it
 * used to live and therefore the most likely place for it to return.
 */
async function scannedFiles() {
  const entries = await readdir(SRC, { recursive: true });
  return entries
    .filter((rel) => /\.(njk|md|json)$/.test(rel))
    .map((rel) => path.join('src', rel))
    .sort();
}

test('check 26 — no price is typed into a copy file or a template', async () => {
  const files = await scannedFiles();
  const findings = [];

  const s = survey({
    files: 'copy fragments and templates scanned for a typed currency amount',
  });

  for (const rel of files) {
    s.count('files');
    const text = await readFile(path.join(REPO_ROOT, rel), 'utf8');
    for (const hit of priceLiterals(text)) {
      findings.push(`${rel}:${hit.line}:${hit.column} — "${hit.excerpt}"`);
    }
  }

  s.failAll(findings);
  s.report(
    `a currency amount is typed out where the price filter cannot reach it:\n  ` +
      `${findings.join('\n  ')}\n\n` +
      `Prices render from products.json through the \`price\` filter, which is what makes ` +
      `"+ VAT" a property of the code rather than a convention every string has to ` +
      `remember. A typed amount is outside that guarantee: it does not gain the suffix, ` +
      `it does not follow a repricing, and nothing but this check can see it. Put the ` +
      `amount in products.json and reference the product, or — if the sentence is prose ` +
      `about a price rather than a price — say it without the figure.`
  );
});

test('check 26 — the scan still finds a typed price, and still permits prose (controls)', async () => {
  // The rule is a regex over raw text, which is permissive in one direction and strict
  // in the other. These pin both. Without them a broken pattern reports green over a
  // page full of hand-typed prices, which is precisely the state this check was added
  // to end.
  const mustCatch = [
    ['the tight form', 'One week · £2,500 fixed · inspected depth'],
    ['a space after the sign', 'from £ 9,000 before we start'],
    ['the named entity, as the handover writes it', '<span>&pound;2,500</span>'],
    ['the decimal entity', '&#163;3,000/month'],
    ['a zero-padded decimal entity', '&#0163;2,500'],
    ['a zero-padded hex entity', '&#x00A3;2,500'],
    ['the hex entity', '&#xA3;5,000'],
    ['inside a Nunjucks comment', '{# a buyer reads this before spending £2,500 #}'],
    ['inside a markdown fragment', '@@ audit.terms\nOne week · £2,500 fixed'],
  ];
  for (const [what, text] of mustCatch) {
    assert.ok(
      priceLiterals(text).length > 0,
      `the scan missed a typed price (${what}): "${text}"`
    );
  }

  const mustPermit = [
    ['a token, which is the correct form', 'One week · {audit.price} fixed · inspected depth'],
    ['the sign with no amount, discussing currency', 'Prices are quoted in £ and exclude VAT.'],
    ['prose about price carrying no figure', 'we do not award OAL 3 at inspected depth, at any price'],
    ['a bare number that is not money', 'Version 1.0, published 2026-09-19'],
    ['a percentage', 'VAT is added at the prevailing UK rate, currently 20%'],
  ];
  for (const [what, text] of mustPermit) {
    assert.deepEqual(
      priceLiterals(text),
      [],
      `the scan rejected something that is not a typed price (${what}): "${text}"`
    );
  }

  // The population is the point of the check above, so it is asserted here too: a
  // scan that finds no files reports green having read nothing.
  const files = await scannedFiles();
  assert.ok(
    files.length > 20,
    `only ${files.length} files matched the scan. This check's guarantee is worth ` +
      `exactly what its file list is worth, and a glob that stops matching is how a ` +
      `check goes quiet instead of red.`
  );
});
