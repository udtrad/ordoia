/**
 * check 34 — an immutable URL under a frozen version is content-addressed.
 *
 * ## The failure this exists to prevent
 *
 * `DEPLOY.md`'s cost 4 of a re-freeze, in one sentence: `/oal/v1.0/styles.css` was served
 * `public, max-age=31536000, immutable` at a **stable** URL. That is correct while a
 * published version never changes, and wrong the moment one is re-frozen — a visitor who
 * loaded the page beforehand renders the new document against the old sheet, for up to a
 * year, and a cache purge cannot reach them.
 *
 * It was measured clean on 2026-08-13 and the note recording that said why the result was
 * not reassuring: it was safe "because the session's CSS happened to touch only the footer
 * and the grid, not because anything prevented otherwise". This check is the something
 * that prevents otherwise. Content-address the URL and the stale copy is never requested
 * again, because the document is `max-age=0` and always names the current name.
 *
 * ## Why it is not "nothing under a frozen version is immutable"
 *
 * Immutable on a published version's rendering is legitimate and load-bearing — check 28
 * defends it, and dropping it would trade a real R2 guarantee for a cosmetic R3 one. The
 * rule is narrower and it is about the URL, not the header: if the bytes can change, the
 * name must change with them.
 *
 * ## The residual, named rather than hidden
 *
 * The fonts and the favicon are still served immutable at stable URLs, and they are listed
 * below rather than pattern-matched away. Closing that would mean fingerprinting the font
 * files, whose names appear inside the stored stylesheet's `@font-face` rules — so the
 * stored sheet would stop being a byte-copy of `src/styles.css` at freeze time, which is a
 * property several other checks rest on. The exposure is smaller (a re-freeze has never
 * changed a font byte; `CHANGES.md` row 115 measured that) and the fix is a bigger change
 * than this one. What this check buys is that the list cannot GROW silently: a new
 * immutable asset at a stable URL fails here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { readdir, readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { IS_HANDOVER, REPO_ROOT, TARGET, serve } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import { stylesheetFile, builtStylesheet } from '../../tools/freeze-version.mjs';

const HANDOVER_SKIP = 'the handover has no /oal/ snapshot directory — that is the point';

/**
 * Assets under a frozen version that are immutable at a stable URL, and stay that way.
 *
 * Every entry is a decision, so it is a literal list rather than a glob: `fonts/*` would
 * also excuse a stylesheet someone moved into `fonts/`.
 */
const KNOWN_STABLE = new Set([
  'favicon.svg',
  'fonts/archivo-subset.woff2',
  'fonts/source-serif-4-subset.woff2',
  'fonts/source-serif-4-italic-subset.woff2',
  'fonts/ibm-plex-mono-400-subset.woff2',
  'fonts/OFL-Archivo.txt',
  'fonts/OFL-IBMPlexMono.txt',
  'fonts/OFL-SourceSerif4.md',
]);

/**
 * Is this name addressed by its own content?
 *
 * A hex run in the name has to be a PREFIX OF THE DIGEST of the bytes served at it. Merely
 * looking hexadecimal is not enough: `styles.deadbeef.css` would satisfy a shape test and
 * would still be a stable URL, because nothing would move it when the bytes moved.
 */
export function isContentAddressed(name, bytes) {
  const digest = createHash('sha256').update(bytes).digest('hex');
  const runs = String(name).match(/[0-9a-f]{8,}/g) ?? [];
  return runs.some((run) => digest.startsWith(run));
}

/** Every file under a directory, as paths relative to it. */
async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(path.relative(base, full));
  }
  return out;
}

test('check 34 — every immutable URL under a frozen version is content-addressed', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  /**
   * Two populations, and the second is the one that can go quiet.
   *
   * `assets` counts what was fetched and read. `immutable` counts how many of those
   * actually carried the header — because if the `_headers` rule stopped matching, every
   * asset would come back with the host default, nothing would be immutable, and a check
   * spelled "immutable implies addressed" would pass over an empty set while the caching
   * guarantee it is written around had silently disappeared.
   */
  const s = survey({
    assets: 'frozen version assets whose delivered Cache-Control was read',
    immutable: 'those that were actually served immutable',
  });

  const versionsDir = path.join(TARGET, 'oal');
  const site = await serve(TARGET, { applyHeaders: true });
  const findings = [];

  try {
    for (const entry of await readdir(versionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^v\d/.test(entry.name)) continue;
      const root = path.join(versionsDir, entry.name);

      for (const rel of await walk(root)) {
        if (rel === 'index.html') continue; // the document is deliberately not immutable
        const url = `/oal/${entry.name}/${rel.split(path.sep).join('/')}`;

        const res = await fetch(new URL(url, site.origin));
        const cc = res.headers.get('cache-control') ?? '';
        s.count('assets');
        if (!/\bimmutable\b/.test(cc)) continue;
        s.count('immutable');

        const bytes = Buffer.from(await res.arrayBuffer());
        const name = path.basename(rel);
        if (isContentAddressed(name, bytes)) continue;
        if (KNOWN_STABLE.has(rel.split(path.sep).join('/'))) continue;

        findings.push(
          `${url} is served \`${cc}\` at a URL that does not name its own bytes. A ` +
            `re-freeze that changes this file leaves every visitor who already has it ` +
            `rendering the new document against the old one, for up to a year, with no ` +
            `purge able to reach them.`
        );
      }
    }
  } finally {
    await site.close();
  }

  s.failAll(findings);
  s.report(
    `immutable at a stable URL under a frozen version:\n  ${findings.join('\n  ')}`
  );
});

test('check 34 — the stylesheet names the digest of the bytes actually served', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  // The arm above would be satisfied by any name whose hex happened to prefix the digest.
  // This one closes the loop the other way: the served name is the one `stylesheetFile`
  // would produce for those bytes, so the build cannot serve a name the freeze tool, the
  // template and checks 21, 27 and 32 would each resolve differently.
  const s = survey({ versions: 'frozen versions whose served stylesheet was resolved' });

  const versionsDir = path.join(TARGET, 'oal');
  const findings = [];

  for (const entry of await readdir(versionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^v\d/.test(entry.name)) continue;
    const root = path.join(versionsDir, entry.name);
    const sheets = (await readdir(root)).filter((f) => /^styles\.(?:[0-9a-f]+\.)?css$/.test(f));
    s.count('versions');

    if (sheets.length !== 1) {
      findings.push(
        `${entry.name}: ${sheets.length} stylesheets (${sheets.join(', ') || 'none'}). ` +
          `More than one means a stale fingerprint is being served immutable beside the ` +
          `current one; none means the page has no stylesheet at all.`
      );
      continue;
    }

    const bytes = await readFile(path.join(root, sheets[0]));

    // Asserted INDEPENDENTLY of stylesheetFile first, and that ordering is the point.
    // Comparing the served name against `stylesheetFile(bytes)` alone is self-referential:
    // when the fingerprint was drilled out by stubbing that function to return the bare
    // name, both sides of the comparison moved together and this arm stayed green while
    // the arm above went red. A guard whose expectation is computed by the thing it is
    // guarding cannot fail for the reason it exists.
    if (!isContentAddressed(sheets[0], bytes)) {
      findings.push(
        `${entry.name}: serving ${sheets[0]}, whose name contains no prefix of its own ` +
          `sha256. Whatever the naming helper currently returns, this URL does not move ` +
          `when the bytes move.`
      );
      continue;
    }

    const expected = stylesheetFile(bytes);
    if (sheets[0] !== expected) {
      findings.push(
        `${entry.name}: serving ${sheets[0]}, but its bytes hash to ${expected}. The name ` +
          `and the content disagree, so the freeze tool, the template and checks 21, 27 ` +
          `and 32 would each resolve a different file.`
      );
    }
  }

  s.failAll(findings);
  s.report(`a served stylesheet does not name its own bytes:\n  ${findings.join('\n  ')}`);
});

test('check 34 — the addressing predicate still tells a digest from a hex-shaped name (controls)', () => {
  const bytes = Buffer.from('body { color: red }');
  const digest = createHash('sha256').update(bytes).digest('hex');

  assert.equal(
    isContentAddressed(`styles.${digest.slice(0, 8)}.css`, bytes),
    true,
    'a real 8-character digest prefix is not being recognised, so the check would report ' +
      'every fingerprinted asset as a stable URL'
  );
  assert.equal(
    isContentAddressed(`styles.${digest}.css`, bytes),
    true,
    'a full digest is not being recognised'
  );

  // The one that matters: hex-shaped, correct length, and not this file's digest.
  assert.equal(
    isContentAddressed('styles.deadbeef.css', bytes),
    false,
    'a hex-shaped name that is NOT a prefix of the digest was accepted. That is the whole ' +
      'defect this predicate exists to reject — such a URL never moves when the bytes do, ' +
      'so it is stable however much it looks addressed.'
  );
  assert.equal(
    isContentAddressed('styles.css', bytes),
    false,
    'the pre-fingerprint name was accepted as content-addressed'
  );
  // A digest prefix shorter than the run threshold must not qualify, or a two-character
  // coincidence in an ordinary filename would excuse a stable URL.
  assert.equal(
    isContentAddressed(`styles.${digest.slice(0, 4)}.css`, bytes),
    false,
    'a 4-character run was accepted; the threshold is 8 and a shorter run collides by luck'
  );

  // PREFIX, not substring — the predicate's whole stated claim, and it had no control.
  // `deadbeef` above does not separate the two, because it is not a substring of the
  // digest either. A run taken from the MIDDLE is the only input that tells `startsWith`
  // from `includes`, and an adversarial pass proved the `includes()` mutant survived all
  // four gated targets without it.
  assert.equal(
    isContentAddressed(`styles.${digest.slice(8, 24)}.css`, bytes),
    false,
    'a hex run drawn from the middle of the digest was accepted. The predicate must ' +
      'require a PREFIX: a substring match would call any name containing digest-shaped ' +
      'text content-addressed, and such a URL still never moves when the bytes do.'
  );

  // The stated 8-character boundary, pinned at 7 and 8 rather than at 4 and 8. Without
  // the 7 case the threshold could drift down to any value below 8 undetected.
  assert.equal(
    isContentAddressed(`styles.${digest.slice(0, 7)}.css`, bytes),
    false,
    'a 7-character run was accepted; the documented threshold is 8'
  );
  assert.equal(
    isContentAddressed(`styles.${digest.slice(0, 8)}.css`, bytes),
    true,
    'an 8-character run was rejected; the documented threshold is 8 and this is the ' +
      'exact name the build produces'
  );

  // `runs.some()` must consider every hex run, not only the first. A name carrying an
  // unrelated hex token before the digest is the case that distinguishes them.
  assert.equal(
    isContentAddressed(`v2-abcdef01-styles.${digest.slice(0, 8)}.css`, bytes),
    true,
    'a digest prefix in a later position was missed, so the check only ever inspects the ' +
      'first hex run in a name'
  );
});

test('check 34 — the re-freeze comparison tool still loads and exports what DEPLOY.md runs', async () => {
  // `tools/frozen-render-diff.mjs` is the precondition DEPLOY.md names before any
  // re-freeze, and nothing in this suite imported it. Proven by an adversarial pass:
  // appending `this is not javascript at all !!!` to the tool AND to
  // tests/lib/computed-style.js left `npm test` at 133/123/0/10. Both could rot to
  // unparseable and the only person who would find out is the operator mid-re-freeze,
  // at the one moment the tool is supposed to be answering a question about a published
  // document.
  //
  // This is a load check, not a run: executing the tool costs a browser and four
  // viewports, which is the operator's cost to pay at re-freeze time, not every commit's.
  // It catches rot, which is the failure mode that actually happens to code nothing runs.
  const tool = await import('../../tools/frozen-render-diff.mjs');
  const oracle = await import('../lib/computed-style.js');

  assert.equal(typeof oracle.capture, 'function', 'the shared capture oracle is gone');
  assert.equal(typeof oracle.diffCaptures, 'function', 'the shared diff oracle is gone');
  assert.ok(
    Array.isArray(oracle.VISUAL_PROPS) && oracle.VISUAL_PROPS.length > 20,
    'VISUAL_PROPS is not a populated list — a comparison over a short property list ' +
      'reports 0 differences for the same reason an empty one does'
  );

  // The oracle must have a real consumer, or "shared" is a claim rather than a fact. It
  // was exactly that for one commit: check 27 kept its own private copy while the
  // extracting commit's changelog row said the two were sharing.
  const check27 = await readFile(
    path.join(REPO_ROOT, 'tests/checks/27-one-chrome.test.js'),
    'utf8'
  );
  assert.match(
    check27,
    /from '\.\.\/lib\/computed-style\.js'/,
    'check 27 no longer imports the shared computed-style oracle, so the oracle has one ' +
      'consumer that is never run and the duplicate it was extracted to remove is back'
  );
  assert.doesNotMatch(
    check27,
    /const\s+capture\s*=\s*\(props\)\s*=>/,
    'check 27 has re-grown its own private capture(). Two copies of one predicate is the ' +
      'shape that made checks 30 and 31 blind to the same clip-path on 2026-08-13.'
  );

  assert.ok(tool, 'tools/frozen-render-diff.mjs failed to load');
});

test('check 34 — the served-stylesheet resolver refuses none and refuses two (controls)', async () => {
  // Both throws in `builtStylesheet` were uncovered: an adversarial pass replaced the
  // whole function body with `return found[0]` and every gated target stayed at its
  // committed number — build 133/123/0/10, handover 10, empty 67. The 0-case is *reached*
  // by check 32's half-stored control, but `storePublishedAssets` wraps the call in a
  // try/catch that converts the resulting TypeError into the identical "missing" verdict,
  // so that control passes with or without the throw. Neither branch was load-bearing
  // anywhere. These two assertions are what make them so.
  const box = await mkdtemp(path.join(os.tmpdir(), 'ordoia-sheets-'));
  try {
    assert.throws(
      () => builtStylesheet(box),
      /no stylesheet in/,
      'a version directory with no stylesheet was accepted. The page would render unstyled ' +
        'and the freeze would store nothing for it.'
    );

    await writeFile(path.join(box, 'styles.aaaaaaaa.css'), 'a{}');
    await writeFile(path.join(box, 'styles.bbbbbbbb.css'), 'b{}');
    assert.throws(
      () => builtStylesheet(box),
      /stylesheets in/,
      'two stylesheets in one version directory were accepted, and one of them was picked. ' +
        'Both are served `immutable` for a year, so the stale one is unrecallable — this is ' +
        'the exact state the build sweep exists to prevent, and picking either is a guess.'
    );
  } finally {
    await rm(box, { recursive: true, force: true });
  }
});
