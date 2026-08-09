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
 * ── Nothing is frozen yet, and that is the correct state ───────────────────────────
 *
 * A version is frozen when it has a manifest under `versions/`. v1.0 has none, because it
 * has not been published: freezing a draft would claim a publication that has not
 * happened, and the italic re-subset of 2026-08-09 is exactly the kind of correction that
 * has to stay free to land until the first deploy. So today this check verifies the rule
 * that *is* live — no superseded version may be unfrozen — and says plainly, through
 * `mayBeEmpty`, that the comparison population is empty and why.
 *
 * `tools/freeze-version.mjs 1.0` is the one command that changes that, and DEPLOY.md
 * carries it as a publication step.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { TARGET, IS_HANDOVER } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import oal from '../../src/_data/oal.json' with { type: 'json' };
import {
  compareToManifest,
  hashTree,
  readManifest,
  versionDir,
  manifestPath,
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
