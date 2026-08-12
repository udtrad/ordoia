/**
 * Check 21 — a published version still serves the bytes it was published with.
 *
 * BRIEF.md §5: *"Snapshot directories are immutable: the build refuses to write to a
 * version directory that already exists."* §13's first judging criterion is whether
 * `/oal/v1.0` "renders identically in 2032, styled by 2026's stylesheet".
 *
 * ── Why this is a check and not a build failure ────────────────────────────────────
 *
 * `CHECKS.md` records the house rule — an invariant belongs in `eleventy.config.js` when
 * it can fail "at the moment somebody edits the wrong value" — and this one is a genuine
 * exception, so the reason is stated rather than left to be inferred.
 *
 * Half of what a frozen directory contains is not rendered at all. `styles.css`,
 * `favicon.svg` and the four version-scoped `.woff2` files are passthrough copies; an
 * Eleventy transform sees none of them, and a guard covering only `index.html` would leave
 * the fonts — the exact files the 2026-08-09 re-subset changed — unguarded. Worse, such a
 * transform could not be demonstrated before there is something frozen, and shipping an
 * undemonstrated guard over the one directory that can never be corrected is the trade
 * this repository exists to refuse.
 *
 * `npm run check` builds and then tests, and that is the deploy gate, so a violation
 * cannot reach a deploy by this route either. `requirePublishableVersion` still stops the
 * build from the other direction — generating a superseded version's page out of a newer
 * rubric — and the two guards meet in the middle.
 *
 * ── v1.0 is frozen, since 2026-08-11 ──────────────────────────────────────────────
 *
 * A version is frozen when it has a manifest under `versions/`. This header said
 * "nothing is frozen yet" for a day after that stopped being true — the same shape as
 * row 42, a correction landing in one place and not the others.
 *
 * `tools/freeze-version.mjs 1.0` is the command that writes the first manifest, and
 * DEPLOY.md carries it as a publication step.
 *
 * ── The hole that pinning `index.html` opened, and the fifth test ────────────────
 *
 * Pinning `index.html` (row 50) closed a coupling and opened a quieter one. Before it,
 * `/oal/v1.0/index.html` was regenerated from live `oal.md` on every build, so editing
 * the rubric's copy turned this check red and forced a decision. After it, the snapshot
 * is served from stored bytes — so the same edit changes `/oal/`, leaves `/oal/v1.0/`
 * alone, and **check 21 stays green while one version number names two different
 * documents.**
 *
 * That is worse than what pinning fixed, because it is silent. While a version's status
 * is `Current`, the live rubric page and its snapshot are the same document by
 * definition, and the last test in this file asserts exactly that.
 *
 * ── 2026-08-12: the unit is the fragment, and what each test became ───────────────
 *
 * Pinning the whole document also froze the page's **chrome**, which was never intended
 * and showed up as one site serving two footers. The frozen unit is now the `<main>`
 * fragment plus the assets that render it; `index.html` is rendered live and is no longer
 * stored, pinned or in the manifest. Every test here has a successor and none was dropped:
 *
 *   1. was: the build still generates the published bytes (manifest over `_site`).
 *      now:  the STORED bytes are intact (manifest over `versions/v1.0/`). It had to move
 *            off the build, because a manifest over the build would now go red on every
 *            legitimate chrome change — the un-editable-stylesheet failure (row 40) in a
 *            new place. Test 2 carries the other half.
 *   2. was: the build serves stored bytes rather than re-deriving from `src/`.
 *      now:  the same, **plus** the fragment: the `<main>` the build emits must be
 *            byte-equal to the stored `main.html`. Together 1 and 2 assert exactly what
 *            the old test 1 asserted, over a unit that no longer includes the chrome.
 *   3. unchanged — no superseded version is left unfrozen.
 *   4. unchanged — the pure-function controls.
 *   5. unchanged in meaning, and it now says out loud when it stops applying. See below.
 *
 * A sixth test is added, and it is the one that makes the re-cut honest rather than
 * asserted: the stored fragment must still be a **byte-exact substring of the document
 * v1.0 was published as**, whose sha256 is `0289c300dd07…`. That document is retained at
 * `versions/v1.0.published-index.html` precisely so this can be re-run forever rather
 * than believed because a commit message said so.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { TARGET, IS_HANDOVER, REPO_ROOT } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import oal from '../../src/_data/oal.json' with { type: 'json' };
import {
  compareToManifest,
  extractMain,
  hashTree,
  readManifest,
  versionDir,
  manifestPath,
  pinnedDir,
  publishedDocument,
  MAIN_FRAGMENT,
  PINNED_ASSETS,
  PUBLISHED_SHA256,
  sha256,
} from '../../tools/freeze-version.mjs';

const HANDOVER_SKIP = 'the handover has no /oal/ snapshot directory — that is the point';

test('check 21 — every frozen version still holds the bytes it was published with', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    versions: 'rubric versions declared in oal.json',
    files: 'stored files compared against a freeze manifest',
  });

  let frozen = 0;

  for (const { version } of oal.versions) {
    s.count('versions');

    const manifest = readManifest(version);
    if (!manifest) continue;
    frozen += 1;

    // The manifest is taken over the STORED unit, not over the build. Before 2026-08-12
    // it hashed `_site/oal/v1.0/`, which was right while the whole document was frozen
    // and is wrong now that the chrome renders live: a manifest over the build would go
    // red on every legitimate footer change. Test 2 holds the build to these bytes.
    const dir = pinnedDir(version);
    if (!existsSync(dir)) {
      s.fail(
        `v${version} is frozen by ${path.basename(manifestPath(version))} but there are no ` +
          `stored bytes at ${path.relative(REPO_ROOT, dir)}/. The build would fall back to ` +
          `src/, so the published fragment would be re-derived from the living site.`
      );
      continue;
    }

    const built = path.join(TARGET, versionDir(version));
    if (!existsSync(built)) {
      s.fail(
        `v${version} is frozen but the build produced no ${versionDir(version)}/ at all. A ` +
          `published permanent address that stops being generated is §9's most serious ` +
          `operational failure.`
      );
    }

    const actual = await hashTree(dir);
    s.count('files', Object.keys(actual).length);
    s.failAll(compareToManifest(manifest, actual).map((f) => `v${version}: ${f}`));
  }

  if (frozen === 0) {
    s.mayBeEmpty(
      'files',
      'no rubric version has been published yet, so there is nothing frozen to compare ' +
        'against; tools/freeze-version.mjs writes the first manifest at publication and ' +
        'this population fills from that commit onward'
    );
  }

  s.report(
    "a published version's stored bytes have changed. Those bytes are the content and the " +
      'rendering of a document printed on the face of every scorecard issued under that ' +
      'version, and its assets are cached immutable for a year — so a change does not ' +
      'replace the published document, it creates a second one. If the change is wanted, ' +
      'it is a new rubric version.'
  );
});

test('check 21 — the stored fragment is still part of the document that was published', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  /**
   * The test that makes the 2026-08-12 re-cut honest rather than asserted.
   *
   * Redefining the frozen unit from the whole `index.html` to the `<main>` fragment is
   * only safe if the fragment is *the same bytes*, and "we checked at the time" is exactly
   * the kind of one-off proof this repository has been bitten by — the stylesheet
   * decoupling was proved by a hand drill and then held by nothing until row 40.
   *
   * So the document v1.0 was published as is retained whole, its sha256 is recorded in the
   * manifest, and both halves are re-checked here on every commit: the retained file still
   * hashes to what was published, and `main.html` is still a literal substring of it.
   */
  const s = survey({
    versions: 'frozen versions whose published document was re-checked',
    substrings: 'stored fragments confirmed as substrings of the published document',
  });

  for (const { version } of oal.versions) {
    const manifest = readManifest(version);
    if (!manifest) continue;
    s.count('versions');

    const record = manifest.publishedDocument;
    if (!record?.sha256) {
      s.fail(
        `v${version}'s manifest records no publishedDocument, so nothing ties the stored ` +
          `fragment to the bytes that were actually published and the re-cut rests on a ` +
          `commit message.`
      );
      continue;
    }

    const file = publishedDocument(version);
    if (!existsSync(file)) {
      s.fail(
        `v${version}'s manifest names ${record.file} but ${path.relative(REPO_ROOT, file)} ` +
          `is not there. Without it the substring claim cannot be re-run, which is the ` +
          `whole reason the document is retained.`
      );
      continue;
    }

    const document = await readFile(file, 'utf8');
    const hash = sha256(Buffer.from(document, 'utf8'));

    /**
     * Compared against a LITERAL first, and that ordering is the point.
     *
     * Comparing only against `manifest.publishedDocument.sha256` was self-certifying:
     * `storePublishedAssets` wrote the document and `writeManifest` recorded the hash of
     * that same freshly-written file, so re-freezing minted a new anchor and a new
     * document together and this test passed green over it. `PUBLISHED_SHA256` is a
     * constant in a reviewed diff, which the tool cannot rewrite.
     */
    const anchor = PUBLISHED_SHA256[version];
    if (!anchor) {
      s.fail(
        `v${version} is frozen but has no entry in PUBLISHED_SHA256, so the only thing ` +
          `holding its provenance is a hash the freeze tool writes itself.`
      );
      continue;
    }
    if (hash !== anchor) {
      s.fail(
        `v${version}: the retained published document now hashes ${hash.slice(0, 12)} and ` +
          `PUBLISHED_SHA256 pins ${anchor.slice(0, 12)}. The one artifact that proves what ` +
          `was published has itself been replaced.`
      );
      continue;
    }
    if (record.sha256 !== anchor) {
      s.fail(
        `v${version}: the manifest records publishedDocument.sha256 ${record.sha256.slice(0, 12)} ` +
          `and PUBLISHED_SHA256 pins ${anchor.slice(0, 12)}. The manifest has been re-taken ` +
          `against different bytes than the ones this version was published as.`
      );
      continue;
    }

    const fragment = await readFile(path.join(pinnedDir(version), MAIN_FRAGMENT), 'utf8');
    s.count('substrings');
    if (!document.includes(fragment)) {
      s.fail(
        `v${version}: main.html is no longer a byte-exact substring of the document that ` +
          `was published. The frozen fragment has stopped being the published content, ` +
          `which is the only thing that made re-cutting the unit not a re-freeze.`
      );
      continue;
    }

    // …and it is the whole of <main>, not merely some substring of the page.
    if (extractMain(document) !== fragment) {
      s.fail(
        `v${version}: main.html is a substring of the published document but is not its ` +
          `<main> content. Part of the published rubric has been left out of the frozen ` +
          `unit, and nothing else would notice.`
      );
    }
  }

  if (s.size('versions') === 0) {
    s.mayBeEmpty(
      'versions',
      'no rubric version has been published yet, so there is no published document to ' +
        'hold a stored fragment against; this population fills from publication onward'
    );
    s.mayBeEmpty(
      'substrings',
      'no rubric version has been published yet, so there is no stored fragment to ' +
        'confirm; this population fills from publication onward'
    );
  }

  s.report(
    'the stored fragment is no longer the content of the document that was published. ' +
      'Re-cutting the frozen unit from the whole file to its <main> was defensible only ' +
      'because no published content byte moved; if that stops being true it is a re-freeze, ' +
      'and DEPLOY.md records the first one as "not a precedent".'
  );
});

test('check 21 — a published version is served from its stored bytes, not from src/', async () => {
  /**
   * The check the freeze mechanism was missing until 2026-08-11.
   *
   * From that date the build serves `/oal/v<n>/` from `versions/v<n>/` rather than
   * re-copying `src/`. The manifest cannot verify that on its own: today the stored
   * stylesheet and `src/styles.css` are byte-identical, so **both arms of the branch
   * produce the same manifest and the same green**. A regression that pointed the copy
   * back at `src/` would be invisible here and would only surface years later, as a
   * published methodology document quietly restyled by a change nobody connected to it.
   *
   * Which is the repository's own recurring shape: the property was proved once by hand
   * (DEPLOY.md's drill) and then held by nothing. This makes it hold on every commit.
   *
   * It compares the stored bytes to the built ones directly rather than mutating `src/`,
   * so it needs no build and cannot leave the working tree dirty if it throws.
   */
  const s = survey({
    versions: 'frozen versions checked for independence from src/',
    assets: 'pinned assets compared between versions/ and the build',
    fragments: 'rendered <main> fragments compared against their stored bytes',
  });

  for (const { version } of oal.versions) {
    if (!readManifest(version)) continue;
    const pinned = pinnedDir(version);
    if (!existsSync(pinned)) {
      s.count('versions');
      s.fail(
        `v${version} has a freeze manifest but no stored bytes at ` +
          `${path.relative(REPO_ROOT, pinned)}/. The build therefore falls back to src/, ` +
          `so the published snapshot is re-derived from the living site on every build ` +
          `and the next stylesheet edit silently rewrites a document that has been cited. ` +
          `Re-publish with \`node tools/freeze-version.mjs ${version}\`.`
      );
      continue;
    }
    s.count('versions');

    const built = path.join(REPO_ROOT, '_site', versionDir(version));
    if (!existsSync(built)) continue;

    /**
     * The fragment, which is the half a copy loop cannot cover.
     *
     * `main.html` is the one member of the frozen unit that reaches the page through the
     * template rather than by being copied, so nothing below would see it. This is the
     * assertion that the rendered document still carries the published rubric and not
     * something regenerated from `src/_data/copy/oal.md` — the exact regression that
     * would otherwise surface years later as a quietly restated methodology.
     */
    const page = path.join(built, 'index.html');
    if (existsSync(page)) {
      s.count('fragments');
      const rendered = extractMain(await readFile(page, 'utf8'));
      const storedFragment = await readFile(path.join(pinned, MAIN_FRAGMENT), 'utf8');
      if (rendered !== storedFragment) {
        const a = sha256(Buffer.from(storedFragment, 'utf8'));
        const b = sha256(Buffer.from(rendered, 'utf8'));
        s.fail(
          `v${version}: the <main> the build renders does not match the stored fragment — ` +
            `${a.slice(0, 12)} became ${b.slice(0, 12)}. The published rubric is being ` +
            `regenerated from src/ rather than served from what was published, which is ` +
            `the freeze having been removed rather than rescoped.`
        );
      }
    }

    for (const asset of PINNED_ASSETS) {
      const stored = path.join(pinned, asset);
      const output = path.join(built, asset);

      // A PINNED_ASSET missing from versions/v<n>/ is precisely the state this test
      // claims to detect, and skipping it made the test pass green while the snapshot
      // was provably being re-derived from src/. Demonstrated: move
      // versions/v1.0/favicon.svg away, rebuild — all five tests passed, and the only
      // symptom was the manifest arm going red on a *stylesheet* edit, which is the
      // un-editable-stylesheet problem row 40 closed. `storePublishedAssets` cannot
      // catch it either: main() throws on an existing manifest long before reaching it.
      if (!existsSync(stored)) {
        s.count('assets');
        s.fail(
          `v${version}: ${asset} is in PINNED_ASSETS but absent from ` +
            `${path.relative(REPO_ROOT, pinned)}/, so the build falls back to src/ for it ` +
            `and that part of the snapshot is re-derived from the living site every build.`
        );
        continue;
      }
      if (!existsSync(output)) continue;
      if (statSync(stored).isDirectory()) continue;
      s.count('assets');

      const a = sha256(await readFile(stored));
      const b = sha256(await readFile(output));
      if (a !== b) {
        s.fail(
          `v${version}: ${asset} in the build does not match the stored copy — ` +
            `${a.slice(0, 12)} became ${b.slice(0, 12)}. The build is not serving the ` +
            `snapshot from versions/, which means it is serving it from src/.`
        );
      }
    }
  }

  s.report(
    'a published version whose assets are re-derived from src/ is not frozen, it is ' +
      'merely unchanged so far. The manifest cannot see the difference while the two ' +
      'sources agree, which is exactly when the regression would be introduced.'
  );
});

test('check 21 — no superseded version is left unfrozen', () => {
  const s = survey({ versions: 'rubric versions declared in oal.json' });

  for (const { version } of oal.versions) {
    s.count('versions');
    if (version === oal.current) continue;
    if (readManifest(version)) continue;
    s.fail(
      `v${version} is superseded by v${oal.current} and has no freeze manifest, so ` +
        `nothing holds its published bytes to what they were. It should have been frozen ` +
        `when it was published: run \`node tools/freeze-version.mjs ${version}\` against ` +
        `the build that was deployed, not against today's.`
    );
  }

  s.report(
    'a superseded version with no manifest is a permanent address nothing is defending. ' +
      'eleventy.config.js already refuses to regenerate its page from a newer rubric; this ' +
      'is the same rule from the other side.'
  );
});

test('check 21 — extractMain still refuses a document it cannot freeze unambiguously (controls)', () => {
  /**
   * `extractMain` decides what a published version IS. Its own docstring calls it "the one
   * function in the repository whose output becomes a permanent address" and explains why
   * it counts tags rather than running a lazy regex — a `</main>` inside a comment or an
   * attribute would truncate the fragment and freeze half a page.
   *
   * None of that was tested. Both throw paths and the comment case were reachable only
   * through real single-`<main>` documents, so replacing the counting guard with the lazy
   * regex it warns against left the entire suite green — and the defect would surface at
   * the next publication, on bytes that can never be corrected.
   */
  assert.equal(extractMain('<body><main id="main">X</main></body>'), 'X');

  assert.throws(
    () => extractMain('<main>a</main><main>b</main>'),
    /exactly one <main>/,
    'two <main> elements have no single answer and a silent pick would freeze half a page'
  );
  assert.throws(() => extractMain('<body>no main here</body>'), /exactly one <main>/);
  assert.throws(() => extractMain('<main>unclosed'), /exactly one <main>/);

  /**
   * A `</main>` inside a comment: the guard REFUSES rather than guesses, and that is the
   * correct behaviour for this function even though it looks like a limitation.
   *
   * Writing this control is what established it. The docstring said the counting guard
   * exists because "a lazy `[\s\S]*?` would stop at the first `</main>` inside a comment",
   * which reads as a claim that such a document is handled. It is not — the count sees two
   * close tags and throws. For a tool whose output becomes a permanent address that is the
   * right call: a silently truncated rubric is unrecoverable, a refused publication is a
   * five-minute fix. The assertion is on the refusal, and the docstring now says so.
   */
  assert.throws(
    () => extractMain('<main>A<!-- </main> -->B</main>'),
    /exactly one <main>/,
    'an ambiguous close tag must stop publication, not be guessed at'
  );

  // Attributes on the open tag must not shift the boundary — the live layout emits
  // `<main id="main" data-frozen="1.0">`.
  assert.equal(extractMain('<main id="main" data-frozen="1.0">\nY\n</main>'), '\nY\n');
});

test('check 21 — the comparison still catches a changed, added and removed file (controls)', () => {
  const published = {
    version: '1.0',
    frozen: '2026-09-19',
    files: {
      'index.html': 'a'.repeat(64),
      'styles.css': 'b'.repeat(64),
      'fonts/source-serif-4-italic-subset.woff2': 'c'.repeat(64),
    },
  };

  assert.deepEqual(
    compareToManifest(published, { ...published.files }),
    [],
    'an unchanged version directory must produce no findings'
  );

  // The 2026-08-09 re-subset in miniature: the same file name, different bytes. It was
  // the right change to make *before* publication and would be unrecoverable after it.
  const reSubset = { ...published.files, 'fonts/source-serif-4-italic-subset.woff2': 'd'.repeat(64) };
  const changed = compareToManifest(published, reSubset);
  assert.equal(changed.length, 1, `expected one finding, got: ${changed.join(' / ')}`);
  assert.match(changed[0], /source-serif-4-italic-subset\.woff2 differs/);

  const { 'styles.css': _removed, ...missing } = published.files;
  assert.deepEqual(
    compareToManifest(published, missing),
    ['styles.css was published and is no longer generated'],
    'a file that stops being generated must be caught'
  );

  assert.deepEqual(
    compareToManifest(published, { ...published.files, 'extra.js': 'e'.repeat(64) }),
    ['extra.js was added after publication'],
    'a file appearing after publication must be caught'
  );

  // An empty manifest would make every comparison pass — the population failure this
  // suite is built to refuse, arriving through the manifest rather than through the site.
  assert.match(
    compareToManifest({ version: '1.0', files: {} }, { 'index.html': 'f'.repeat(64) })[0],
    /lists no files/,
    'a manifest recording nothing must fail rather than vacuously pass'
  );
});

/**
 * The rubric's own prose, with markup and whitespace collapsed away.
 *
 * Scoped to `<main>`, and the scope is the substantive part. The two pages differ
 * legitimately in their chrome: `assetBase` rewrites asset URLs, the canonical link
 * differs, the masthead marks a different nav item current — and from row 50 the
 * snapshot's footer is frozen at what it was published with, so a footer change makes
 * the two differ *by design*. None of that is the methodology.
 *
 * Written unscoped first, and it failed on exactly that: the VAT footer landed and this
 * went red at word 4,801, with words 0–4,800 identical. The failure was correct about
 * the bytes and wrong about the claim, which is the difference between a check that
 * measures what it says and one that measures what was easy to reach.
 */
const RUBRIC = /<main[^>]*>([\s\S]*?)<\/main>/i;

const prose = (html) => {
  const body = RUBRIC.exec(String(html));
  return String(body ? body[1] : '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(nbsp|middot|mdash|ndash|amp|quot|hellip|darr|times|gt|lt|#\d+);/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

test('check 21 — a current version says the same thing at both of its addresses', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    current: 'versions whose status is Current',
    words: 'words of rubric prose compared between the live page and the snapshot',
  });

  /**
   * §3.6: a test that quietly stops applying is the vacuous-check failure this repository
   * has already been bitten by across twenty-three checks.
   *
   * This assertion is conditioned on a version being `Current`, and that condition is now
   * load-bearing in a way it was not before: the status is read from a record that a
   * future edit can change. So when it goes false the test says so, by name, rather than
   * passing in silence. Publishing v1.1 must produce "deliberately not asserting for
   * v1.0 (Superseded)" in the output — a reader of the log can then tell a lapsed
   * assertion from a satisfied one, which is the whole difference.
   */
  const lapsed = oal.versions
    .filter((v) => String(v.status).toLowerCase() !== 'current')
    .map((v) => `v${v.version} (${v.status})`);
  if (lapsed.length) {
    t.diagnostic(
      `deliberately not asserting for ${lapsed.join(', ')} — a superseded version and the ` +
        `current rubric are SUPPOSED to differ, and this test stops applying to them by ` +
        `design rather than by accident.`
    );
  }

  for (const v of oal.versions) {
    if (String(v.status).toLowerCase() !== 'current') continue;
    s.count('current');

    const live = path.join(TARGET, 'oal', 'index.html');
    const snapshot = path.join(TARGET, versionDir(v.version), 'index.html');

    if (!existsSync(live) || !existsSync(snapshot)) {
      s.fail(
        `v${v.version} is Current but ${!existsSync(live) ? '/oal/' : versionDir(v.version)}` +
          `/index.html was not generated, so the two addresses cannot be compared.`
      );
      continue;
    }

    const a = prose(await readFile(live, 'utf8'));
    const b = prose(await readFile(snapshot, 'utf8'));

    // A page with no <main> yields '', and '' === '' would pass having compared nothing —
    // the vacuous green this suite exists to refuse. The population guard does not catch
    // it either: ''.split(' ').length is 1, not 0, so report()'s empty-population test
    // never fires. Both halves are closed here.
    if (!a || !b) {
      s.fail(
        `v${v.version}: no <main> found on ${!a ? '/oal/' : `/${versionDir(v.version)}/`}, ` +
          `so the two addresses cannot be compared. An extraction that silently returns ` +
          `nothing would make this check pass over any divergence.`
      );
      continue;
    }
    s.count('words', b.split(' ').filter(Boolean).length);

    if (a === b) continue;

    // Name the first divergence rather than printing two documents at each other.
    const wa = a.split(' ');
    const wb = b.split(' ');
    let i = 0;
    while (i < wa.length && i < wb.length && wa[i] === wb[i]) i += 1;
    s.fail(
      `v${v.version} reads differently at /oal/ and /${versionDir(v.version)}/, from word ` +
        `${i}:\n      live:     …${wa.slice(Math.max(0, i - 6), i + 12).join(' ')}…\n` +
        `      snapshot: …${wb.slice(Math.max(0, i - 6), i + 12).join(' ')}…`
    );
  }

  s.report(
    'the current rubric version states different things at its two addresses. While a ' +
      'version is Current those are the same document, and a scorecard citing it does not ' +
      'say which address the reader should have used. This is the failure mode pinning ' +
      "index.html introduced: before it, editing the rubric's copy moved the snapshot and " +
      'turned the manifest red; after it, the snapshot holds its stored bytes and the edit ' +
      'reaches only /oal/. If the rubric text is meant to change, that is a new version — ' +
      'publish it, and this check stops comparing the old one the moment it is superseded.'
  );
});
