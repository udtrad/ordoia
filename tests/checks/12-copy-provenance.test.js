/**
 * Check 12 — copy provenance.
 *
 * BRIEF.md §3 check 12: "Rendered copy diverges from the source-of-truth copy files
 * without a corresponding entry in the change log (§8)."
 * §8: "Much of this wording has been fought over for honesty and legal reasons, and
 * the vault is the source of truth... Hold the copy in content files, not in
 * templates... Nothing is silently rewritten."
 *
 * Three halves, and the first is the one that matters:
 *
 *   1. A source of truth must EXIST, outside the templates. Until it does there is
 *      nothing to diverge from and the rule is unenforceable by construction.
 *   2. A change log must exist, and its entries must be complete.
 *   3. Every rendered sentence must trace to the source or to a logged change.
 *
 * ---------------------------------------------------------------------------------
 * WHAT THIS CHECK CAN AND CANNOT ESTABLISH — stated here because the site's own
 * rubric would ask.
 *
 * The vault is not in this repository. `src/_data/` is the repo's copy of it. So this
 * check cannot establish "the rendered copy matches the vault"; it establishes that
 * no prose has been written into a template rather than a content file, which is
 * §8's first sentence and the precondition for the rest. Divergence from the vault is
 * caught by review against CHANGES.md, not here.
 *
 * ---------------------------------------------------------------------------------
 * THE SEGMENTATION RULE, and why it changed.
 *
 * The first draft cut each page's prose into twelve-word windows across the whole
 * page and required each window to appear in the corpus. That measured ADJACENCY, not
 * provenance: a window spanning the boundary between a paragraph from copy/oal.md and
 * a level descriptor from oal.json can never appear in either file, however faithful
 * both are. On a page that interleaves hand-written prose with generated rubric
 * content — which is every page that matters — it would have failed on correct copy
 * and been switched off within a month.
 *
 * The unit is now the SENTENCE, which is also the unit §8 protects: wording that was
 * fought over. Sentences do not span composition seams, because a literal composed in
 * a template is almost always its own clause.
 *
 * The second problem is values. "Version 1.0, published 2026-08-07" is assembled from
 * site.json and oal.json around a skeleton of words. The words are the copy; the
 * values are data, governed by checks 4 and 10. So a source sentence carrying a
 * `{token}` becomes a skeleton — its literal fragments, in order, with the values
 * free. Every word must still match, and in order. What is relaxed is only the value
 * itself, which is the one part that is not wording.
 *
 * Both relaxations are permissive, so — following the same discipline check 0 applies
 * to check 3 — the controls at the bottom of this file plant rewrites that must still
 * be caught. Without them, a broad tracing rule quietly turns this check into a no-op.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { withSite, REPO_ROOT } from '../lib/harness.js';
import { sentences } from '../lib/lexicon.js';

const DATA_DIR = path.join(REPO_ROOT, 'src', '_data');
const COPY_DIR = path.join(DATA_DIR, 'copy');
const CHANGES = path.join(REPO_ROOT, 'CHANGES.md');

/** A build-time value substitution, as written in a content file. */
const TOKEN = /\{[A-Za-z][A-Za-z0-9.]*\}/g;
const GAP = '\u0001';

/** Rendered prose. Excludes the visually hidden restatement of values. */
const PROSE = 'main p, main li, main dd, main td, main h1, main h2, main h3';

/** The shortest run of words worth tracing. Below this it is a label, not wording. */
const MIN_WORDS = 8;

/**
 * The middle dot is this design's field separator and never a clause join — it
 * separates the four values in a stamp, the entries in the rail, the two dimensions
 * in a pair, the parts of the footer line. Splitting on it traces each field on its
 * own, which is right: a field is a value, and values are governed by checks 2, 4
 * and 10. What is left after the split is prose, and prose is what §8 protects.
 */
const FIELD_SEPARATOR = '·';

/**
 * Everything a page renders as a traceable unit, in order.
 *
 * Split on line breaks as well as on the field separator. `innerText` puts a break
 * at every block boundary, which is exactly where one rendered thing ends and the
 * next begins: the `Self-check` label above its question, the dimension name below
 * a self-scoring question. Without it those two run together into a sentence that
 * exists on no page and in no file.
 */
function units(text) {
  return text
    .split(/[\n\r]+/)
    .flatMap((line) => line.split(FIELD_SEPARATOR))
    .flatMap((field) => sentences(field));
}

/**
 * Words only: entity-decoded, case-folded, punctuation and whitespace dropped.
 * Deliberately loose on whitespace and entities and strict on words. A check that
 * trips on a reflowed paragraph gets disabled; one that misses a rewritten sentence
 * was never worth having.
 */
function normalise(text) {
  return String(text)
    .replace(/&pound;/g, '£')
    .replace(/&(nbsp|middot|mdash|ndash|amp|quot|hellip|darr|times|gt|lt|#\d+);/g, ' ')
    .replace(/[‘’“”–—·×↓ ]/g, ' ')
    .toLowerCase()
    .replace(new RegExp(`[^a-z0-9£%${GAP}]+`, 'g'), ' ')
    .trim();
}

const words = (s) => (s ? s.split(' ').filter(Boolean) : []);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The renderable bodies of a content file.
 *
 * For a copy `.md` that is its `@@ key` fragments, matching how eleventy.config.js
 * reads the same file — the note above the first delimiter is for whoever opens it
 * and never reaches a page. For anything else it is the whole file.
 */
function fragmentsOf(file) {
  if (!file.name.endsWith('.md')) return [file.raw];
  const out = [];
  let buffer = null;
  for (const line of file.raw.split('\n')) {
    if (/^@@\s+\S+\s*$/.test(line)) {
      if (buffer) out.push(buffer.join('\n'));
      buffer = [];
    } else if (buffer) {
      buffer.push(line);
    }
  }
  if (buffer) out.push(buffer.join('\n'));
  return out;
}

/**
 * The corpus: every committed content file under src/_data, plus the change log.
 * Templates are excluded on purpose — prose living in one is the defect.
 */
async function loadCorpus() {
  if (!existsSync(COPY_DIR)) return null;

  const names = (await readdir(DATA_DIR, { recursive: true })).filter((f) =>
    /\.(md|json|txt)$/.test(f)
  );
  // A markdown link's target is an address, not wording: `[the rubric](/oal/)` renders
  // as "the rubric", and leaving the URL in the corpus puts a word on the source side
  // that is on no page. Same reasoning as the token gaps — trace what is read.
  const stripLinkTargets = (text) => text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  const files = await Promise.all(
    names.map(async (name) => ({
      name,
      raw: stripLinkTargets(await readFile(path.join(DATA_DIR, name), 'utf8').catch(() => '')),
    }))
  );

  const changes = existsSync(CHANGES) ? await readFile(CHANGES, 'utf8') : '';

  // Plain text, tokens removed. Catches every sentence that carries no value.
  const plain =
    files.map((f) => normalise(f.raw.replace(TOKEN, ' '))).join(' \n ') +
    ' \n ' +
    normalise(changes);

  // Skeletons, from source units that DO carry a value.
  //
  // Split per FRAGMENT, not per file. A copy file is a sequence of `@@ key` fragments
  // with a note to the reader at the top, and running the sentence splitter over the
  // whole file glues the tail of one fragment to the head of the next — which then
  // demands words in the rendered page that were never on it.
  const skeletons = [];
  for (const f of files) {
    for (const source of fragmentsOf(f)) {
      for (const unit of units(source)) {
        TOKEN.lastIndex = 0;
        if (!TOKEN.test(unit)) continue;
        const shaped = normalise(unit.replace(TOKEN, ` ${GAP} `));
        const literals = shaped.split(GAP).map((part) => part.trim()).filter(Boolean);
        if (!literals.length) continue;

        // Anchored to the WHOLE unit, and this is load-bearing rather than tidiness.
        // Unanchored, the scorecard stamp's `OAL v{version}` field contributes a
        // skeleton whose only literal is "oal v" — which matches any sentence
        // containing those two characters, including one whose every other word has
        // been rewritten. A skeleton describes a complete rendered unit, not a
        // fragment of one. The controls below pin this.
        const wild = '[a-z0-9£% ]*?';
        const source =
          '^' +
          (shaped.startsWith(GAP) ? wild : '') +
          literals.map(escapeRegex).join(wild) +
          (shaped.endsWith(GAP) ? wild : '') +
          '$';

        skeletons.push({ file: f.name, re: new RegExp(source) });
      }
    }
  }

  return { plain, skeletons, size: plain.length };
}

const traces = (corpus, sentence) =>
  corpus.plain.includes(sentence) || corpus.skeletons.some((s) => s.re.test(sentence));

test('check 12 — a source of truth for the copy exists outside the templates', async () => {
  assert.ok(
    existsSync(COPY_DIR),
    `no copy source of truth at src/_data/copy. §8 requires the copy to be held in ` +
      `content files rather than templates; while it lives only inside the HTML there is ` +
      `nothing for a divergence to be measured against, and "nothing is silently rewritten" ` +
      `is a request rather than a rule.`
  );

  const corpus = await loadCorpus();
  assert.ok(corpus && corpus.size > 2000, 'the copy source exists but is essentially empty');
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
  const corpus = await loadCorpus();
  if (!corpus) assert.fail('no copy source of truth — see the first check in this file');

  const untraced = [];

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      const blocks = await page.evaluate((selector) =>
        [...document.querySelectorAll(selector)]
          .filter((el) => !el.closest('.vh'))
          // Only the innermost prose element. A <li> that wraps two <p>s is not a
          // third passage; counting it as one both double-checks its children and
          // invents a sentence that spans the gap between them.
          .filter((el) => !el.querySelector(selector))
          // innerText, not textContent: it is what a reader reads. textContent
          // concatenates across block boundaries, gluing a label to the sentence
          // below it into a run that appears nowhere.
          .map((el) => (el.innerText || el.textContent || '').trim())
          .filter(Boolean), PROSE);

      for (const block of blocks) {
        for (const raw of units(block)) {
          const sentence = normalise(raw);
          if (words(sentence).length < MIN_WORDS) continue;
          if (traces(corpus, sentence)) continue;
          untraced.push(`${url}: "${raw.trim().slice(0, 110)}"`);
        }
      }
    }
    await page.close();
  });

  const unique = [...new Set(untraced)];
  const sample = unique.slice(0, 12);
  assert.deepEqual(
    sample,
    [],
    `${unique.length} rendered sentence(s) appear in neither the copy source nor the change ` +
      `log, so they were written into a template rather than a content file:\n  ${sample.join('\n  ')}`
  );
});

test('check 12 — the tracing rule still catches a rewrite (controls)', async () => {
  // Both relaxations above — sentences rather than windows, skeletons rather than
  // literals — make tracing easier. These are the planted cases that must still fail,
  // in the same spirit as check 0. Without them this file measures nothing.
  const corpus = await loadCorpus();
  assert.ok(corpus, 'controls need a corpus');

  const mustTrace = [
    // Verbatim from copy/home.md.
    'agent systems don t fail loudly they fail quietly correctly formatted and confidently',
    // Verbatim from oal.json — a level descriptor, which is copy that lives in data.
    'no tracing logs are print statements nobody would know',
    // A skeleton: the values differ from today's, the wording does not.
    'version 9 4 published 2031 01 02 at ordoia co uk oal v9 4',
  ];
  for (const sentence of mustTrace) {
    assert.ok(
      traces(corpus, normalise(sentence)),
      `tracing rejected copy that is genuinely in the source: "${sentence}"`
    );
  }

  const mustNotTrace = [
    // One word changed. This is the rewrite the check exists to catch.
    'agent systems don t fail loudly they fail quietly correctly formatted and confidently and often',
    'no tracing logs are print statements nobody would care',
    // A skeleton whose literals were altered — the values are free, the words are not.
    'version 9 4 released 2031 01 02 at ordoia co uk oal v9 4',
    // Wholly invented, and exactly the kind of sentence a contributor types into a
    // template because it is quicker than opening the copy file.
    'ordoia is trusted by leading uk financial services firms to certify their agent systems',
    // Reordered: the same words, a different claim. A bag-of-words rule would pass this.
    'nobody would know logs are print statements no tracing at all in this system',
  ];
  for (const sentence of mustNotTrace) {
    assert.ok(
      !traces(corpus, normalise(sentence)),
      `tracing accepted a rewrite it must catch: "${sentence}"`
    );
  }
});
