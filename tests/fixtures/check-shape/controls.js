/**
 * Controls for check 16.
 *
 * These live outside `tests/checks/` on purpose. They are source text *about* tests, and
 * check 16 scans `tests/checks/*.test.js` — so holding them inline made check 16 the
 * loudest offender in its own scan, and the attempt to strip them back out with a regex
 * mis-paired against backticks in ordinary line comments. Lexing JavaScript with a regular
 * expression to decide what counts as JavaScript is the failure this file avoids.
 *
 * Check 0 sets the precedent: a permissive rule needs planted cases proving it still
 * catches what it must and permits what it must.
 */

/** Reaches the site, never says what it measured. Must be caught. */
export const UNGUARDED = [
  "test('a — unguarded', async () => {",
  '  await withSite(async ({ pages }) => {',
  '    assert.deepEqual(violations, []);',
  '  });',
  '});',
].join('\n');

/** Reaches the site and reports. Must be permitted. */
export const GUARDED = [
  "test('b — guarded', async () => {",
  '  await withSite(async ({ pages }) => {',
  "    s.report('the invariant');",
  '  });',
  '});',
].join('\n');

/** Never touches the site. Out of scope, and must not be caught. */
export const NO_SITE = [
  "test('c — a unit test that never loads a page', () => {",
  '  assert.equal(ratio(1, 2), 0.5);',
  '});',
].join('\n');

/** A declaration a column-0 split cannot see. Must break the scan, not shrink it. */
export const INDENTED = "  test('indented, invisible to a column-0 split', () => {});\n";

/** A shape the scanner does not understand. Must break the scan. */
export const UNSUPPORTED_SHAPE = "describe('a suite', () => {});\n";
