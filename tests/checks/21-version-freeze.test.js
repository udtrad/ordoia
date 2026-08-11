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
 * ── The hole that pinning `index.html` opened, and the fourth test ────────────────
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
 * definition, and the last test in this file asserts exactly that. When v1.1 publishes
 * and v1.0 becomes `Superseded`, the assertion stops applying to v1.0 on its own — which
 * is correct, and is the moment the two are *supposed* to diverge.
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
  hashTree,
  readManifest,
  versionDir,
  manifestPath,
  pinnedDir,
  PINNED_ASSETS,
  sha256,
} from '../../tools/freeze-version.mjs';

const HANDOVER_SKIP = 'the handover has no /oal/ snapshot directory — that is the point';

test('check 21 — every frozen version still generates the bytes it was published with', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    versions: 'rubric versions declared in oal.json',
    files: 'files compared against a freeze manifest',
  });

  let frozen = 0;

  for (const { version } of oal.versions) {
    s.count('versions');

    const manifest = readManifest(version);
    if (!manifest) continue;
    frozen += 1;

    const dir = path.join(TARGET, versionDir(version));
    if (!existsSync(dir)) {
      s.fail(
        `v${version} is frozen by ${path.basename(manifestPath(version))} but the build ` +
          `produced no ${versionDir(version)}/ at all. A published permanent address that ` +
          `stops being generated is §9's most serious operational failure.`
      );
      continue;
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
    'a published version directory has changed. Those bytes are cached immutable for a ' +
      'year and are printed on the face of every scorecard issued under that version, so ' +
      'a change does not replace the published document — it creates a second one. If the ' +
      'change is wanted, it is a new rubric version.'
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

    for (const asset of PINNED_ASSETS) {
      const stored = path.join(pinned, asset);
      const output = path.join(built, asset);
      if (!existsSync(stored) || !existsSync(output)) continue;
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
 * Prose as a reader receives it, with markup and whitespace collapsed away.
 *
 * The two pages differ legitimately in their chrome — `assetBase` rewrites the
 * stylesheet and font URLs, the canonical link differs, the masthead marks a different
 * nav item current. None of that is the rubric. What must not differ is a word of the
 * methodology, so the comparison is over text and not over bytes.
 */
const prose = (html) =>
  String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(nbsp|middot|mdash|ndash|amp|quot|hellip|darr|times|gt|lt|#\d+);/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

test('check 21 — a current version says the same thing at both of its addresses', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    current: 'versions whose status is Current',
    words: 'words of rubric prose compared between the live page and the snapshot',
  });

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
    s.count('words', b.split(' ').length);

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
