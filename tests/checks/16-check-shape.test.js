/**
 * Check 16 — every check that reaches the site names what it measured.
 *
 * This is a check about the checks. It exists because the suite has learned the same
 * lesson nine times and patched it twice.
 *
 * CHECKS.md lesson 8: check 14 collected printed addresses against a hardcoded domain,
 * the domain changed, the match set went empty, and the assertion kept *passing* while
 * asserting nothing. The fix — `assert.ok(printed.size > 0)` — was applied to check 14 and
 * to check 9, and to nothing else.
 *
 * On 2026-08-09 the suite was run against an empty directory to find out how far the shape
 * reached. Result: **33 pass, 12 fail, 7 skipped, against a directory containing nothing**.
 * Twenty-five of those passes were site-touching checks reporting green having examined an
 * empty page list. Fixing twenty-five instances by hand would be the tenth time; this is
 * the check that makes it the last.
 *
 * ── The invariant, deliberately lexical ─────────────────────────────────────────────
 *
 * Not "no test asserts over a collection without a guard" — that needs an understanding of
 * assertions, and it is a tarpit of false positives. Instead:
 *
 *   Every top-level `test()` in tests/checks/ whose body reaches the site — by calling
 *   withSite(, withSource( or htmlFiles( — must also call .report(), or carry a waiver.
 *
 * Shallow, and almost exactly right on this repo. The tests correctly out of scope are the
 * ones that never touch the site: check 0 in its entirety, check 4's aggregate-detector
 * controls, check 7's contrast arithmetic, check 12's tracing controls, and check 14's
 * file-reading tests that use `read()` rather than the harness.
 *
 * ── Why a source scanner is safe here: it fails closed ──────────────────────────────
 *
 * A scanner that silently under-matches is worse than no scanner, because it looks like
 * coverage. So this one asserts its own parsing assumptions and goes red when they break,
 * rather than quietly scanning less:
 *
 *   - it counts `test(` at column 0 and `test(` anywhere, and fails if they disagree
 *   - it rejects `describe(`, `test.skip(`, `test.only(` and `it(`, which would change the
 *     shape it relies on
 *   - it reads its file list from disk rather than hardcoding one, and requires every
 *     filename to be `NN-name.test.js`
 *   - it requires every check file to contain at least one test
 *   - it declares its own populations, so it is subject to the rule it enforces
 *   - it carries planted controls, in the manner of check 0, proving it can still tell a
 *     guarded test from an unguarded one
 *
 * It reads source as text and never imports a check, so `node --test`'s one-process-per-file
 * model — which makes a shared in-memory registry impossible — never comes into it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { REPO_ROOT } from '../lib/harness.js';
import { ledgerFor, normalisePage } from '../lib/allowances.js';
import { survey } from '../lib/population.js';
import {
  UNGUARDED,
  GUARDED,
  NO_SITE,
  INDENTED,
  UNSUPPORTED_SHAPE,
} from '../fixtures/check-shape/controls.js';

const CHECKS_DIR = path.join(REPO_ROOT, 'tests', 'checks');

/** Calling any of these means the test is looking at the built site. */
const REACHES_SITE = ['withSite(', 'withSource(', 'htmlFiles('];

/**
 * Shapes this scanner does not understand. Their presence is a failure, not a skip.
 *
 * Anchored at statement position — start of line, indentation allowed — rather than
 * matched anywhere in the source. Substring matching flagged this very file on its first
 * run, because `describe(` appears here as a quoted list entry and inside a control
 * fixture. Check 16 is subject to its own rule, so it has to be able to name these shapes
 * without tripping over having named them.
 */
const UNSUPPORTED = [
  /^[ \t]*describe\s*\(/m,
  /^[ \t]*test\.(skip|only|todo)\s*\(/m,
  /^[ \t]*it\s*\(/m,
];

async function checkFiles() {
  const names = (await readdir(CHECKS_DIR)).filter((n) => n.endsWith('.test.js')).sort();
  return names.map((name) => ({ name, full: path.join(CHECKS_DIR, name) }));
}

/**
 * Remove block comments before scanning.
 *
 * This file documents the shapes it rejects, so a scanner matching raw text flagged check
 * 16 as the worst offender in the suite on its second run. A scanner that cannot read its
 * own file cannot claim to be subject to its own rule.
 *
 * Block comments only. Two narrower-is-safer decisions sit behind that:
 *
 *   Template literals were stripped here too, for one revision, because the control
 *   fixtures were written as them. The regex mis-paired against backticks in ordinary line
 *   comments and stripped the gaps *between* the fixtures instead of the fixtures. The
 *   controls moved to tests/fixtures/check-shape/ and the strip came out. Lexing
 *   JavaScript with a regular expression to decide what counts as JavaScript is exactly
 *   the tarpit this check was scoped to avoid.
 *
 *   Line comments are left alone: stripping `//` correctly requires knowing whether it sits
 *   inside a string, and a regex that gets that wrong silently eats real code.
 *
 * The residual cost is that writing a bare test declaration inside a line comment or a
 * string in a check file breaks the scan. It breaks it *loudly*, with a message naming the
 * file, which is the trade this check exists to make.
 */
function stripNonCode(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Split a check file into its top-level tests.
 *
 * Throws rather than under-reporting when the file's shape is not the one assumed.
 */
export function parseTests(rawSource, name) {
  const source = stripNonCode(rawSource);
  for (const shape of UNSUPPORTED) {
    const found = source.match(shape);
    assert.ok(
      !found,
      `${name} uses ${found?.[0].trim()}, which check 16's scanner does not understand. ` +
        'Teach the scanner before using the shape, or the scan silently covers less.'
    );
  }

  // The lookbehind excludes `re.test(...)` and `subtest(...)`. Without it the very first
  // run of this scanner counted check 2's `.filter(([, re]) => !re.test(m.stamp))` as a
  // test declaration and refused to scan the file — the fail-closed behaviour working, on
  // its own author, before the rule had caught anything real.
  const atColumnZero = source.split(/^test\(/m).slice(1);
  const anywhere = source.match(/(?<![.\w])test\s*\(/g) ?? [];

  assert.equal(
    atColumnZero.length,
    anywhere.length,
    `${name}: found ${anywhere.length} test declarations but only ${atColumnZero.length} ` +
      'at column 0. A declaration the scanner cannot see is one the rule does not reach.'
  );

  return atColumnZero.map((block) => {
    const title = block.match(/^\s*(['"])([\s\S]*?)\1/);
    assert.ok(title, `${name}: a test declaration has no string literal title`);
    return { title: title[2], body: block };
  });
}

test('check 16 — every check that reaches the site reports what it measured', async () => {
  const files = await checkFiles();
  const ledger = await ledgerFor(16);
  const s = survey({
    files: 'check files scanned',
    tests: 'tests parsed',
    reaching: 'tests that reach the built site',
  });

  for (const { name, full } of files) {
    s.count('files');
    const source = await readFile(full, 'utf8');
    const tests = parseTests(source, name);

    assert.ok(tests.length > 0, `${name} contains no tests`);
    s.count('tests', tests.length);

    for (const { title, body } of tests) {
      if (!REACHES_SITE.some((call) => body.includes(call))) continue;
      s.count('reaching');
      if (body.includes('.report(')) continue;
      if (ledger.allows(`tests/checks/${name}`, title)) continue;
      s.fail(`${name} :: ${title}`);
    }
  }

  assert.deepEqual(
    ledger.unused().map((a) => a.id),
    [],
    'a check-16 waiver covered nothing this run — the test it names was fixed, renamed or ' +
      'deleted, and the waiver is now decoration'
  );

  s.report(
    'these tests reach the built site but never say what they measured, so each one passes ' +
      'whenever its collection comes back empty — the shape CHECKS.md records as lesson 8'
  );
});

test('check 16 — the scanner still tells a guarded test from an unguarded one (controls)', () => {
  const scan = (src) =>
    parseTests(src, 'control').filter(
      ({ body }) => REACHES_SITE.some((c) => body.includes(c)) && !body.includes('.report(')
    );

  assert.equal(scan(UNGUARDED).length, 1, 'an unguarded site-touching test must be caught');
  assert.equal(scan(GUARDED).length, 0, 'a test calling .report() must be permitted');
  assert.equal(scan(NO_SITE).length, 0, 'a test that never touches the site is out of scope');

  // The count-agreement guard: a declaration the scanner cannot see must break the scan
  // loudly rather than shrink its coverage in silence.
  assert.throws(
    () => parseTests(INDENTED, 'control'),
    /only 0 at column 0/,
    'a declaration the scanner cannot see must fail the scan, not be skipped'
  );

  assert.throws(
    () => parseTests(UNSUPPORTED_SHAPE, 'control'),
    /does not understand/,
    'an unsupported shape must fail the scan'
  );
});

test('check 16 — a check-file path survives normalisePage unchanged', () => {
  // Waivers key on `page`, and check 16 puts a repo path there rather than a URL. That is a
  // mild abuse of the field, taken over changing the schema of a file whose stability is
  // itself an asset. It only works while normalisePage leaves such a path alone.
  const p = 'tests/checks/07-contrast.test.js';
  assert.equal(normalisePage(p), p);
});
