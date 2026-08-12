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
 * So the enforceable form of it is byte identity against a manifest taken at publication.
 *
 * ── 2026-08-12: what "the published bytes" means changed, deliberately ─────────────
 *
 * Until this commit the frozen unit was the whole `index.html`. That froze the rubric's
 * content — correctly — and froze its **chrome** with it, which was never intended and
 * was not noticed until the footer changed. Measured on 2026-08-12: eight of nine pages
 * carried the footer field list with the VAT registration and `/oal/v1.0/` carried the
 * launch footer, a sentence the repository had already withdrawn. One site, two footers,
 * and the frozen one advertising the site as it stood at publication.
 *
 * The user's three requirements settle it:
 *
 *   R1  one chrome, on every page, updating without a version event
 *   R2  frozen v1.0 stays frozen — its content *and* its rendering
 *   R3  no visitor is ever shown a stale design
 *
 * So the unit is re-cut. **What is frozen is the `<main>` fragment and everything that
 * renders it** — its own stylesheet, its own fonts, its own favicon. The chrome around it
 * is rendered live from the same templates and the same data as every other page.
 *
 * This is not a re-freeze and the difference is the whole point. `versions/v1.0/main.html`
 * is a **byte-exact substring** of the published `index.html`, whose sha256 is still
 * `0289c300dd07…`; the published file is retained beside the manifest so that claim is
 * re-runnable rather than asserted, and check 21 re-runs it on every commit. No published
 * content byte changes, so `DEPLOY.md`'s record of the 2026-08-11 re-freeze as "not a
 * precedent" stands untouched. What does change is the *delivered document*, and only in
 * its chrome — which is R1, and is the thing being fixed.
 *
 * ── Why this matters more than the usual defect ───────────────────────────────────
 *
 * The frozen stylesheet and fonts are still `immutable` for a year. Once those bytes are
 * deployed they are in reader caches and cannot be recalled. A changed byte after
 * publication does not replace the published document; it creates a second one, and which
 * of the two a reader sees depends on when they first visited. That is why immutable stays
 * on the assets and comes off the document — see `src/_headers` and check 28.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { readdir, readFile, writeFile, mkdir, copyFile, cp } from 'node:fs/promises';
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

/** Where a published version's own bytes are kept. */
export const pinnedDir = (version) => path.join(FROZEN_DIR, `v${version}`);

/**
 * The document a version was published as, retained whole.
 *
 * Not served, not built, not hashed into the manifest. It exists so that the one claim
 * this commit rests on — that the stored `<main>` fragment is a byte-exact substring of
 * the bytes that were published — can be *measured* on every commit rather than believed
 * because a commit message said so. Check 21 does exactly that.
 */
export const publishedDocument = (version) =>
  path.join(FROZEN_DIR, `v${version}.published-index.html`);

/**
 * The sha256 of the document each version was published as, as a LITERAL.
 *
 * This is the anchor, and it is here rather than only in the manifest because the manifest
 * is written by this file. Measured 2026-08-12: `storePublishedAssets` overwrites the
 * retained document unconditionally and `writeManifest` then records the hash of that
 * freshly-written file, so the documented override — delete the manifest and the pinned
 * directory, rebuild, re-freeze — minted a NEW provenance file and a NEW anchor in one
 * command, and check 21 passed because it compared the file against a value rewritten in
 * the same breath. The one artifact the re-cut rests on was self-certifying.
 *
 * A literal cannot be re-minted by the tool that validates it. Changing a value here is a
 * deliberate act in a reviewed diff, which is what publishing a version should be.
 */
export const PUBLISHED_SHA256 = {
  '1.0': '0289c300dd07280815e09595d21794e097d2089170a16b3b3b02462053f32c9b',
};

/** The name of the stored `<main>` fragment inside a version's directory. */
export const MAIN_FRAGMENT = 'main.html';

/**
 * The frozen unit: everything whose bytes a published version is defined by.
 *
 * R2 in one list. The `<main>` fragment is the content; the stylesheet, the fonts and the
 * favicon are its rendering. All four are stored, hashed and never regenerated, so a
 * redesign of the live site cannot restyle a published document.
 */
export const FROZEN_UNIT = [MAIN_FRAGMENT, 'styles.css', 'fonts', 'favicon.svg'];

/**
 * The members of the frozen unit the build copies into the output verbatim.
 *
 * `main.html` is the one that is *not* here, and the distinction is load-bearing. The
 * fragment reaches the page through the template — `oal-version.njk` emits it inside the
 * live layout — rather than by overwriting a rendered file afterwards. That ordering is
 * what makes two things true that were previously only intended:
 *
 *   - rubric prose cannot leak into a frozen page, because for a frozen version the build
 *     never renders `rubric.njk` at all;
 *   - no regeneration step can re-record the old fragment and report success, because
 *     nothing overwrites HTML after it is rendered. That failure — `rm versions/v1.0.json
 *     && build && freeze` reproducing exactly what was already frozen — is CHANGES.md
 *     row 43, found by review rather than by the drill that should have caught it.
 *
 * A fragment copied into `_site` would also become a published URL in its own right, and
 * a chrome-less HTML file in the output is a page every site-touching check would then
 * measure and fail on. It is deliberately not emitted.
 */
export const PINNED_ASSETS = FROZEN_UNIT.filter((a) => a !== MAIN_FRAGMENT);

/**
 * The inner HTML of a document's single `<main>` element.
 *
 * Byte-exact: the substring between the open tag and `</main>`, untouched.
 *
 * **Throws on anything but exactly one open and one close tag, and that includes a
 * `</main>` that appears inside a comment or an attribute.** It refuses rather than
 * guesses. That is deliberate and it is the conservative direction: this is the one
 * function in the repository whose output becomes a permanent address, so a silently
 * truncated rubric is unrecoverable while a refused publication is a five-minute fix.
 *
 * The counting guard is what makes the refusal possible. A lazy `[\s\S]*?` would not
 * refuse — it would stop at the first `</main>` it met, inside a comment or not, and
 * store half a page reporting success. The distinction was only established by writing
 * check 21's control for it; the wording here previously implied such a document was
 * handled correctly rather than rejected.
 */
export function extractMain(html) {
  const text = String(html);
  const opens = (text.match(/<main[\s>]/gi) ?? []).length;
  const closes = (text.match(/<\/main\s*>/gi) ?? []).length;

  if (opens !== 1 || closes !== 1) {
    throw new Error(
      `expected exactly one <main> element, found ${opens} open and ${closes} close tags. ` +
        `The frozen unit is defined as the content of <main>, so a document without exactly ` +
        `one has no unambiguous fragment to freeze.`
    );
  }

  const start = text.indexOf('>', text.search(/<main[\s>]/i)) + 1;
  const end = text.search(/<\/main\s*>/i);
  if (start <= 0 || end < start) {
    throw new Error('found a <main> element whose open and close tags are out of order');
  }
  return text.slice(start, end);
}

/**
 * Copy a published version's frozen unit out of the build and into the repository.
 *
 * Run at publication, from the same bytes the manifest is taken from, so the hash and the
 * stored file can never disagree about what was published.
 */
export async function storePublishedAssets(version, built) {
  const target = pinnedDir(version);

  // Loud rather than partial. A missing asset here means the snapshot would be published
  // half-stored: the stored half immune to `src/`, the absent half silently re-derived
  // from it on every later build. That is the defect this function exists to end, and it
  // would ship reporting success — so it throws instead of returning a short list.
  const needed = ['index.html', ...PINNED_ASSETS];
  const missing = needed.filter((a) => !existsSync(path.join(built, a)));
  if (missing.length) {
    throw new Error(
      `cannot publish v${version}: ${missing.join(', ')} missing from ${built}. Every ` +
        `member of the frozen unit has to be stored, or the snapshot is frozen in part and ` +
        `re-derived from src/ in part — which looks identical today and diverges the ` +
        `first time src/ changes. Run \`npm run build\` and try again.`
    );
  }

  await mkdir(target, { recursive: true });

  // The document, whole, beside the manifest — the provenance the substring claim needs.
  //
  // Refuses to overwrite, for the same reason main() refuses an existing manifest: this
  // file is the anchor every later comparison is made against, and a tool that can rewrite
  // its own evidence is not evidence. Before 2026-08-12 this was an unconditional write,
  // so the documented override re-minted the anchor and the hash together and check 21
  // stayed green over it.
  const retained = publishedDocument(version);
  if (existsSync(retained)) {
    throw new Error(
      `refusing to overwrite ${path.relative(REPO_ROOT, retained)}. That file is the ` +
        `document v${version} was published as, and it is what every later check compares ` +
        `against — rewriting it would replace the evidence rather than the artifact. If ` +
        `v${version} is genuinely being re-published, delete the manifest, ` +
        `${path.relative(REPO_ROOT, pinnedDir(version))}/ AND this file, and update ` +
        `PUBLISHED_SHA256 in a reviewed diff.`
    );
  }
  const document = await readFile(path.join(built, 'index.html'));
  await writeFile(retained, document);

  // The content: the <main> fragment, extracted byte-for-byte from that same document.
  const fragment = extractMain(document.toString('utf8'));
  await writeFile(path.join(target, MAIN_FRAGMENT), fragment, 'utf8');

  const stored = [MAIN_FRAGMENT];
  for (const asset of PINNED_ASSETS) {
    const from = path.join(built, asset);
    const to = path.join(target, asset);
    if (statSync(from).isDirectory()) await cp(from, to, { recursive: true });
    else await copyFile(from, to);
    stored.push(asset);
  }
  return stored;
}

/** The manifest for a version, or null if that version is not frozen. */
export function readManifest(version) {
  const file = manifestPath(version);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

/** True when a version has been published and has stored bytes to be served from. */
export function isFrozen(version) {
  return Boolean(readManifest(version)) && existsSync(path.join(pinnedDir(version), MAIN_FRAGMENT));
}

/** The stored `<main>` fragment for a published version. */
export function frozenMain(version) {
  return readFileSync(path.join(pinnedDir(version), MAIN_FRAGMENT), 'utf8');
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

/** `{ 'main.html': '<sha256>', … }` for everything under `dir`. */
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

/**
 * Write a version's manifest over its stored frozen unit.
 *
 * The manifest hashes `versions/v<n>/` — the stored bytes — rather than the build output.
 * Before 2026-08-12 it hashed the build, which was right while the whole document was
 * frozen and is wrong now that the chrome is rendered: a manifest over the build would go
 * red on every legitimate chrome change, which is the un-editable-stylesheet failure
 * (CHANGES.md row 40) in a new place.
 *
 * The two halves meet in check 21: this manifest says the stored bytes are intact, and
 * check 21's second test says the build serves exactly those and nothing from `src/`.
 * Neither is sufficient alone and the conjunction is what the old single test asserted.
 */
export async function writeManifest(version) {
  const files = await hashTree(pinnedDir(version));
  const document = await readFile(publishedDocument(version));

  await mkdir(FROZEN_DIR, { recursive: true });
  await writeFile(
    manifestPath(version),
    JSON.stringify(
      {
        $comment: [
          `The frozen unit of /oal/v${version}/ — the <main> fragment and everything that`,
          'renders it. BRIEF.md §5: snapshot directories are immutable. Check 21 holds',
          'every later build to this file.',
          '',
          'The CHROME of that page is deliberately not here. It is rendered live from the',
          'same templates and data as every other page, so a header or footer change',
          'reaches this address without a version event (R1). What is frozen is the',
          "document's content and its rendering (R2), which is what a scorecard cites.",
          '',
          'Do not edit by hand. If a byte here has legitimately changed, that is a new',
          'rubric version, not a correction to this one.',
        ],
        version,
        frozen: new Date().toISOString().slice(0, 10),
        publishedDocument: {
          $comment:
            `The sha256 of the document v${version} was published as, retained whole at ` +
            `${path.basename(publishedDocument(version))}. main.html is a byte-exact ` +
            `substring of it; check 21 re-runs that comparison on every commit.`,
          file: path.basename(publishedDocument(version)),
          sha256: sha256(document),
        },
        files,
      },
      null,
      2
    ) + '\n'
  );
  return files;
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
        `no-op. The deliberate act that overrides this is deleting the manifest, ` +
        `${pinnedDir(version)}/ AND ${publishedDocument(version)}, and updating ` +
        `PUBLISHED_SHA256 — the manifest alone is not enough, because the build ` +
        `serves the fragment from the stored bytes, so a rebuild would reproduce exactly ` +
        `what is already frozen and this command would report success having changed ` +
        `nothing.`
    );
  }

  const stored = await storePublishedAssets(version, built);
  const files = await writeManifest(version);

  process.stdout.write(
    `froze /oal/v${version}/ — ${Object.keys(files).length} files recorded in ` +
      `${path.relative(REPO_ROOT, manifestPath(version))}\n` +
      `stored ${stored.join(', ')} in ${path.relative(REPO_ROOT, pinnedDir(version))}/ — ` +
      `the build serves the fragment and its assets from these, not from src/\n` +
      `retained the published document at ` +
      `${path.relative(REPO_ROOT, publishedDocument(version))}\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
