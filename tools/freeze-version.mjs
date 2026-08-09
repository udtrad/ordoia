/**
 * Freeze a published rubric version, and verify a frozen one.
 *
 *   node tools/freeze-version.mjs 1.0     # run once, at publication
 *
 * ── The requirement, and why it cannot be implemented literally ────────────────────
 *
 * BRIEF.md §5: *"Snapshot directories are immutable: the build refuses to write to a
 * version directory that already exists."*
 *
 * Taken at its word that rule is unimplementable, and worse, it is unimplementable in a
 * way that looks fine until you try: `_site/oal/v1.0/` exists after the first build, so a
 * build that refused to write to an existing version directory would refuse the second
 * build and every build after it. The sentence is about *published* bytes, not about a
 * directory entry in somebody's output folder.
 *
 * So the enforceable form of it is byte identity against a manifest taken at publication:
 *
 *   the build may regenerate a frozen version directory, and what it generates must be
 *   indistinguishable from what was published.
 *
 * That is the same rule — a reader who types the address off a scorecard in 2032 gets the
 * document that was published — and unlike the literal reading it can be checked on every
 * commit rather than once.
 *
 * ── Why this matters more than the usual defect ───────────────────────────────────
 *
 * `_headers` caches `/oal/v1.0/*` as `public, max-age=31536000, immutable`. Once those
 * bytes are deployed they are in reader caches for a year and cannot be recalled. A
 * changed byte after publication does not replace the published document; it creates a
 * second one, and which of the two a reader sees depends on when they first visited.
 *
 * ── What is frozen, and when ───────────────────────────────────────────────────────
 *
 * A version is frozen when it has a manifest under `versions/`. Nothing is frozen today:
 * v1.0 has not been published, and freezing an unpublished draft would be claiming a
 * publication that has not happened — the italic re-subset on 2026-08-09 is exactly the
 * kind of correction that must still be free to land before the first deploy.
 *
 * Run this at publication, in the same change that takes the site live. Check 21 then
 * holds the version to it, and also fails if a *superseded* version has no manifest —
 * which is the case `requirePublishableVersion` in `eleventy.config.js` stops the build
 * over, from the other direction.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');

/** Manifests live outside `src/`, so Eleventy never treats them as input or as data. */
export const FROZEN_DIR = path.join(REPO_ROOT, 'versions');

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Where a version's snapshot is built to, relative to the target. */
export const versionDir = (version) => path.join('oal', `v${version}`);

/** The manifest path for a version, whether or not it exists yet. */
export const manifestPath = (version) => path.join(FROZEN_DIR, `v${version}.json`);

/** The manifest for a version, or null if that version is not frozen. */
export function readManifest(version) {
  const file = manifestPath(version);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

/** Every file under `dir`, as paths relative to it, sorted. Recurses. */
export async function filesUnder(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await filesUnder(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

/** `{ 'index.html': '<sha256>', … }` for everything under `dir`. */
export async function hashTree(dir) {
  const files = await filesUnder(dir);
  const entries = await Promise.all(
    files.map(async (rel) => [rel, sha256(await readFile(path.join(dir, rel)))])
  );
  return Object.fromEntries(entries);
}

/**
 * Everything by which `actual` differs from what `manifest` recorded, as sentences.
 *
 * Pure, and separated from every filesystem call above, so check 21 can prove it catches a
 * changed file, an added one and a removed one without publishing anything. A guard on the
 * one directory that can never be corrected is not worth having undemonstrated.
 */
export function compareToManifest(manifest, actual) {
  const findings = [];
  const recorded = manifest?.files;

  if (!recorded || typeof recorded !== 'object' || Object.keys(recorded).length === 0) {
    return [
      `the freeze manifest for v${manifest?.version ?? '?'} lists no files, so comparing ` +
        `against it would pass over anything. Regenerate it with tools/freeze-version.mjs.`,
    ];
  }

  for (const [file, hash] of Object.entries(recorded)) {
    if (!(file in actual)) {
      findings.push(`${file} was published and is no longer generated`);
    } else if (actual[file] !== hash) {
      findings.push(
        `${file} differs from what was published — ${hash.slice(0, 12)} became ` +
          `${actual[file].slice(0, 12)}`
      );
    }
  }

  for (const file of Object.keys(actual)) {
    if (!(file in recorded)) findings.push(`${file} was added after publication`);
  }

  return findings.sort();
}

async function main([version]) {
  if (!version) throw new Error('usage: node tools/freeze-version.mjs <version>   e.g. 1.0');

  const built = path.join(REPO_ROOT, '_site', versionDir(version));
  if (!existsSync(built)) {
    throw new Error(
      `there is no build at ${built}. Run \`npm run build\` first — a version is frozen ` +
        `from the bytes that are about to be published, not from a stale output directory.`
    );
  }

  const existing = readManifest(version);
  if (existing) {
    throw new Error(
      `v${version} is already frozen (${manifestPath(version)}, taken ` +
        `${existing.frozen}). A published version is not re-frozen: if the bytes have ` +
        `legitimately changed, that is a new version, and if they have not, this is a ` +
        `no-op. Deleting the manifest by hand is the deliberate act that overrides this.`
    );
  }

  const files = await hashTree(built);
  await mkdir(FROZEN_DIR, { recursive: true });
  await writeFile(
    manifestPath(version),
    JSON.stringify(
      {
        $comment: [
          `The bytes /oal/v${version}/ was published with. BRIEF.md §5: snapshot`,
          'directories are immutable. Check 21 holds every later build to this file.',
          '',
          'Do not edit by hand. If a byte here has legitimately changed, that is a new',
          'rubric version, not a correction to this one.',
        ],
        version,
        frozen: new Date().toISOString().slice(0, 10),
        files,
      },
      null,
      2
    ) + '\n'
  );

  process.stdout.write(
    `froze /oal/v${version}/ — ${Object.keys(files).length} files recorded in ` +
      `${path.relative(REPO_ROOT, manifestPath(version))}\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
