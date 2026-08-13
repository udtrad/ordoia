/**
 * Check 32 — the publication path, exercised.
 *
 * `tools/freeze-version.mjs` is the only thing that writes a frozen version, and until
 * this file existed **none of it had ever been run by a test.** Check 21 reads what the
 * tool produced; nothing exercised the tool. The gap matters now rather than in the
 * abstract, because §4's chosen exit — re-freezing v1.0 — runs directly through the one
 * refusal nobody has watched fire, and if that refusal is wrong the cost is the provenance
 * anchor: `versions/v1.0.published-index.html` and the `PUBLISHED_SHA256` literal that
 * validates it.
 *
 * That is not hypothetical. Before `b10fad8` the tool **rewrote its own evidence** — the
 * documented override minted a new document and a new hash in one command and check 21
 * passed over it. The fix was a refusal. A refusal is exactly the kind of guard this
 * branch has repeatedly found to be untestable-by-construction, so it is tested here.
 *
 * ── The sandbox, and why it is not optional ──────────────────────────────────────
 *
 * `REPO_ROOT` is resolved from the module's own location and the module imports nothing
 * but node builtins, so a copy of `tools/freeze-version.mjs` under a temporary directory
 * treats that directory as the repository. Every test below therefore runs against
 * throwaway `versions/` and `_site/` trees.
 *
 * This is a safety property, not tidiness. A test that ran the real CLI against the real
 * repo to prove it refuses would, on the day the refusal is broken, **destroy the artifact
 * it was written to protect** — and it would do so while reporting a failure, which is far
 * too late. The sandbox means the worst case is a red test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { REPO_ROOT } from '../lib/harness.js';
import { survey } from '../lib/population.js';

const run = promisify(execFile);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** The version this repo has actually published, and the one §4's exit would re-freeze. */
const FROZEN_VERSION = '1.0';

/** A version that has never been published, for the arm that must SUCCEED. */
const FRESH_VERSION = '9.9';

/**
 * A throwaway repository containing the freeze tool, the stored versions, and a build.
 *
 * `_site/oal/v<version>/` is populated from the real frozen snapshot, which is the closest
 * thing available to "the bytes about to be published" and means the fresh-publication arm
 * stores something realistic rather than a stub.
 */
async function sandbox({ withBuild = true, buildVersion = FROZEN_VERSION, withVersions = true } = {}) {
  // `realpath`, and it is load-bearing rather than defensive. `freeze-version.mjs` only
  // runs `main()` when `process.argv[1] === fileURLToPath(import.meta.url)`, and on macOS
  // `os.tmpdir()` is `/var/folders/…`, a symlink to `/private/var/folders/…`. Invoked
  // through the symlinked path the two strings differ, so the module imports, defines
  // everything, runs nothing and **exits 0** — every assertion below would then be made
  // against a command that never executed, and four of the five would have passed.
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'ordoia-freeze-')));
  await mkdir(path.join(root, 'tools'), { recursive: true });
  await cp(
    path.join(REPO_ROOT, 'tools', 'freeze-version.mjs'),
    path.join(root, 'tools', 'freeze-version.mjs')
  );

  if (withVersions && existsSync(path.join(REPO_ROOT, 'versions'))) {
    await cp(path.join(REPO_ROOT, 'versions'), path.join(root, 'versions'), { recursive: true });
  } else {
    await mkdir(path.join(root, 'versions'), { recursive: true });
  }

  if (withBuild) {
    const from = path.join(REPO_ROOT, '_site', 'oal', `v${FROZEN_VERSION}`);
    const to = path.join(root, '_site', 'oal', `v${buildVersion}`);
    await mkdir(path.dirname(to), { recursive: true });
    if (existsSync(from)) await cp(from, to, { recursive: true });
  }

  return {
    root,
    tool: path.join(root, 'tools', 'freeze-version.mjs'),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

/** Run the CLI in a sandbox. Never rejects — the exit code is the thing being measured. */
async function freeze(box, version) {
  try {
    const { stdout } = await run(process.execPath, [box.tool, version], { cwd: box.root });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? String(err) };
  }
}

const anchorPath = (root, v) => path.join(root, 'versions', `v${v}.published-index.html`);
const manifestOf = (root, v) => path.join(root, 'versions', `v${v}.json`);

test('check 32 — the CLI refuses to re-freeze a published version, and nothing moves', async () => {
  const s = survey({
    artifacts: 'provenance artifacts compared before and after the refused command',
  });

  const box = await sandbox();
  try {
    const before = {};
    for (const file of [anchorPath(box.root, FROZEN_VERSION), manifestOf(box.root, FROZEN_VERSION)]) {
      assert.ok(existsSync(file), `the sandbox is missing ${path.basename(file)}, so this test would prove nothing`);
      before[file] = sha256(await readFile(file));
    }

    const result = await freeze(box, FROZEN_VERSION);

    assert.notEqual(result.code, 0, `the CLI re-froze a published version and exited 0:\n${result.stdout}`);
    assert.match(
      result.stderr,
      /already frozen/i,
      `the CLI failed, but not for the documented reason:\n${result.stderr}`
    );

    // The assertion that matters. An error message is a claim; unchanged bytes are the
    // property. A tool that printed a refusal and rewrote the anchor anyway would pass
    // every message assertion ever written.
    const findings = [];
    for (const [file, hash] of Object.entries(before)) {
      s.count('artifacts');
      const now = sha256(await readFile(file));
      if (now !== hash) {
        findings.push(`${path.basename(file)} changed: ${hash.slice(0, 12)} -> ${now.slice(0, 12)}`);
      }
    }
    s.failAll(findings);
    s.report(
      `the refused re-freeze modified a provenance artifact anyway:\n  ${findings.join('\n  ')}\n\n` +
        `Before b10fad8 the tool rewrote the retained document and the hash that validates ` +
        `it in one command, with check 21 green over the result. The refusal is the whole ` +
        `of what stands between §4's chosen exit and that outcome.`
    );
  } finally {
    await box.cleanup();
  }
});

test('check 32 — the refusal is about the manifest, not about failing at everything (controls)', async () => {
  // Without this, the test above passes if the CLI is broken in any way at all — a typo
  // in an import, a missing build, a thrown error before the check it claims to be
  // exercising. Same sandbox, same command, manifest removed: it must SUCCEED.
  const box = await sandbox();
  try {
    await rm(manifestOf(box.root, FROZEN_VERSION), { force: true });
    await rm(anchorPath(box.root, FROZEN_VERSION), { force: true });
    await rm(path.join(box.root, 'versions', `v${FROZEN_VERSION}`), { recursive: true, force: true });

    const result = await freeze(box, FROZEN_VERSION);
    assert.equal(
      result.code,
      0,
      `with the manifest, the pinned directory and the anchor removed the CLI still refused, ` +
        `so the previous test's refusal cannot be attributed to the version being frozen:\n` +
        `${result.stderr}`
    );
    assert.ok(existsSync(manifestOf(box.root, FROZEN_VERSION)), 'no manifest was written');
    assert.ok(existsSync(anchorPath(box.root, FROZEN_VERSION)), 'no published document was retained');
  } finally {
    await box.cleanup();
  }
});

test('check 32 — a fresh publication stores the frozen unit and hashes what it stored', async () => {
  // Two different claims, and conflating them is how a half-stored snapshot passes.
  //   `stored`  — the manifest records the bytes that were STORED. That is what
  //               `writeManifest` hashes: `hashTree(pinnedDir(version))`, never `_site`.
  //   `faithful`— those stored bytes are the ones that were BUILT. A manifest can agree
  //               perfectly with a directory the tool corrupted on the way in.
  const s = survey({
    stored: 'manifest entries verified against the stored snapshot',
    faithful: 'stored assets compared against the build they were taken from',
  });

  const box = await sandbox({ buildVersion: FRESH_VERSION });
  try {
    const result = await freeze(box, FRESH_VERSION);
    assert.equal(result.code, 0, `publishing an unfrozen version failed:\n${result.stderr}`);

    const manifest = JSON.parse(await readFile(manifestOf(box.root, FRESH_VERSION), 'utf8'));
    const files = manifest.files ?? manifest;
    const pinned = path.join(box.root, 'versions', `v${FRESH_VERSION}`);
    const build = path.join(box.root, '_site', 'oal', `v${FRESH_VERSION}`);

    const findings = [];
    for (const [rel, recorded] of Object.entries(files)) {
      if (typeof recorded !== 'string') continue;
      s.count('stored');
      const onDisk = path.join(pinned, rel);
      if (!existsSync(onDisk)) {
        findings.push(`${rel} is in the manifest and not in the stored snapshot`);
        continue;
      }
      const actual = sha256(await readFile(onDisk));
      if (actual !== recorded) {
        findings.push(`${rel}: manifest says ${recorded.slice(0, 12)}, stored bytes are ${actual.slice(0, 12)}`);
      }

      // main.html is the extracted fragment, so it has no counterpart in the build and is
      // covered by the substring assertion below instead.
      if (rel === 'main.html') continue;
      const fromBuild = path.join(build, rel);
      if (!existsSync(fromBuild)) {
        findings.push(`${rel} was stored but is not in the build it claims to come from`);
        continue;
      }
      s.count('faithful');
      if (sha256(await readFile(fromBuild)) !== actual) {
        findings.push(`${rel}: stored bytes differ from the built bytes they were copied from`);
      }
    }

    // The retained document is the document that was published, not a re-render of it.
    const anchor = await readFile(anchorPath(box.root, FRESH_VERSION));
    const built = await readFile(path.join(box.root, '_site', 'oal', `v${FRESH_VERSION}`, 'index.html'));
    assert.equal(
      sha256(anchor),
      sha256(built),
      'the retained document is not byte-identical to the document that was published'
    );

    // The stored fragment is a byte-exact substring of it — the claim check 21 rests on.
    const fragment = await readFile(
      path.join(box.root, 'versions', `v${FRESH_VERSION}`, 'main.html'),
      'utf8'
    );
    assert.ok(
      built.toString('utf8').includes(fragment),
      'the stored <main> fragment is not a byte-exact substring of the published document'
    );

    s.failAll(findings);
    s.report(
      `the manifest disagrees with the bytes it was taken from:\n  ${findings.join('\n  ')}`
    );
  } finally {
    await box.cleanup();
  }
});

test('check 32 — a half-stored snapshot is refused rather than published', async () => {
  // The failure this arm describes is the one storePublishedAssets exists to end: a
  // snapshot frozen in part and re-derived from src/ in part looks identical on the day it
  // is taken and diverges the first time src/ changes.
  const box = await sandbox({ buildVersion: FRESH_VERSION });
  try {
    await rm(path.join(box.root, '_site', 'oal', `v${FRESH_VERSION}`, 'styles.css'), { force: true });

    const result = await freeze(box, FRESH_VERSION);
    assert.notEqual(result.code, 0, 'a snapshot missing a member of the frozen unit was published');
    assert.match(result.stderr, /missing|styles\.css/i, `refused for an undocumented reason:\n${result.stderr}`);

    assert.equal(
      existsSync(manifestOf(box.root, FRESH_VERSION)),
      false,
      'the command refused and wrote a manifest anyway, so a later run would see the version as frozen'
    );
    assert.equal(
      existsSync(anchorPath(box.root, FRESH_VERSION)),
      false,
      'the command refused and retained a published document anyway'
    );
  } finally {
    await box.cleanup();
  }
});

test('check 32 — publishing with no build at all is refused', async () => {
  const box = await sandbox({ withBuild: false });
  try {
    const result = await freeze(box, FRESH_VERSION);
    assert.notEqual(result.code, 0, 'a version was frozen from a directory that does not exist');
    assert.match(result.stderr, /no build|npm run build/i, `refused for an undocumented reason:\n${result.stderr}`);
  } finally {
    await box.cleanup();
  }
});

test('check 32 — the sandbox is a sandbox (controls)', async () => {
  // If REPO_ROOT ever stops resolving from the module's own location, every test above
  // silently starts operating on the real repository — and the first one to do so would
  // be the re-freeze test, against the real provenance anchor. Pinned here.
  const box = await sandbox();
  try {
    // The VALUE, not the shape of the expression that produces it. This asserted only
    // that the source still MATCHED /REPO_ROOT = path.resolve(fileURLToPath(...)/ and
    // said nothing about its second argument — so changing '../..' to '../../..',
    // which relocates the whole sandbox to os.tmpdir() OUTSIDE the tree cleanup()
    // deletes, left this control green. Drilled by the red team 2026-08-13.
    const copied = await import(pathToFileURL(box.tool).href + `?v=${Date.now()}`);
    assert.equal(
      path.resolve(copied.FROZEN_DIR),
      path.resolve(path.join(box.root, 'versions')),
      'the copied tool does not resolve its repository root to the sandbox, so every test ' +
        'in this file is operating somewhere other than where it believes it is'
    );

    // A copy of ONE file is only a sandbox while that file imports nothing local.
    // Both directions, because `./sibling` is as fatal as `../parent`.
    const source = await readFile(box.tool, 'utf8');
    assert.doesNotMatch(
      source,
      /from ['"]\.\.?\//,
      'freeze-version.mjs now imports from the repository, so a copy of the single file is ' +
        'no longer a complete sandbox'
    );

    // Positively, and against the TOOL rather than against a write this test performs
    // itself: run the real CLI in the sandbox and require the real repository to be
    // byte-unchanged afterwards. The old canary proved only that node can write to a
    // temp directory, with the tool never involved.
    const snapshot = async () => {
      const parts = [];
      for (const rel of ['versions', path.join('_site', 'oal')]) {
        const dir = path.join(REPO_ROOT, rel);
        if (!existsSync(dir)) { parts.push(`${rel}:absent`); continue; }
        const walk = async (d) => {
          for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) await walk(full);
            else parts.push(`${path.relative(REPO_ROOT, full)}:${sha256(await readFile(full))}`);
          }
        };
        await walk(dir);
      }
      return sha256(Buffer.from(parts.join('\n')));
    };

    const before = await snapshot();
    await freeze(box, FRESH_VERSION);
    await freeze(box, FROZEN_VERSION);
    assert.equal(
      await snapshot(),
      before,
      'running the freeze tool inside the sandbox modified the REAL repository'
    );
  } finally {
    await box.cleanup();
  }
});
