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
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { readdir, readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { IS_HANDOVER, REPO_ROOT, TARGET, serve, withSite } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import { VISUAL_PROPS, capture } from '../lib/computed-style.js';
import { stylesheetFile, builtStylesheet, isStaleStylesheet } from '../../tools/freeze-version.mjs';

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
    documents: 'frozen version DOCUMENTS whose Cache-Control was read',
  });

  const versionsDir = path.join(TARGET, 'oal');
  const site = await serve(TARGET, { applyHeaders: true });
  const findings = [];

  try {
    for (const entry of await readdir(versionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^v\d/.test(entry.name)) continue;
      const root = path.join(versionsDir, entry.name);

      for (const rel of await walk(root)) {
        const url = `/oal/${entry.name}/${rel.split(path.sep).join('/')}`;

        // The DOCUMENT is exempt from the addressing rule and subject to the OPPOSITE
        // one, so it is measured rather than skipped.
        //
        // This read `continue` until an adversarial pass drilled it. `_headers` line 85
        // says "The DOCUMENT at /oal/v1.0/ is deliberately not listed" — a constraint
        // nothing enforced. Adding three lines to `_headers` served
        // `/oal/v1.0/index.html` as `200 public, max-age=31536000, immutable` with all
        // four targets on their committed numbers: build 136/126/0/10, handover
        // 136/83/10/43, empty 136/59/67/10. Check 28's HTML arm fetches the clean URL
        // `/oal/v1.0/` through `urlFor` and never requests the `.html` form; check 14's
        // overlap detector renders splats as a single `x`, so `styles.x` never intersects
        // `index.html`. A visitor or crawler landing on the file URL would cache the
        // published rubric for a year, and no purge could recall it. That is R3's exact
        // failure, in the branch whose subject is R3.
        if (/\.html$/.test(rel)) {
          const doc = await fetch(new URL(url, site.origin));
          const docCC = doc.headers.get('cache-control') ?? '';
          s.count('documents');
          if (/\bimmutable\b/.test(docCC)) {
            findings.push(
              `${url} is a DOCUMENT served \`${docCC}\`. A published version's bytes are ` +
                `immutable; the page that delivers them is not, because its chrome renders ` +
                `live and a reader holding a year-old copy sees last year's site with no ` +
                `way to be told otherwise. R3: no cache header may stop a visitor seeing ` +
                `the site as it is currently designed.`
            );
          }
          continue;
        }

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

  // The allowlist must self-liquidate, like every other allowance here — checks 9, 16, 17
  // and 27 all fail on a stale entry via `ledgerFor(...).unused()`. This one had no such
  // rule: adding `fonts/never-existed.woff2` left the check green, so the list could grow
  // by one line per re-freeze and never shrink. An allowlist nobody has to justify keeping
  // is how a residual stops being a residual and becomes the design.
  const present = new Set(
    (await readdir(path.join(versionsDir, 'v1.0'), { recursive: true }).catch(() => []))
      .map((f) => String(f).split(path.sep).join('/'))
  );
  const dead = [...KNOWN_STABLE].filter((entry) => !present.has(entry));
  assert.deepEqual(
    dead,
    [],
    `KNOWN_STABLE names ${dead.length} asset(s) the build does not contain: ${dead.join(', ')}. ` +
      `Every entry is a decision to leave something immutable at a stable URL, so an entry ` +
      `for a file that no longer exists is an exemption nobody is accountable for.`
  );

  s.failAll(findings);
  s.report(
    `immutable at a stable URL under a frozen version:\n  ${findings.join('\n  ')}`
  );
});

test('check 34 — the build sweeps a stale fingerprint, and the predicate says which (controls)', () => {
  // Deleting the sweep from eleventy.config.js leaves a CLEAN build green — there is no
  // stale file on a fresh `_site`, and CI always starts fresh — so the sweep's *code* had
  // no coverage at all while the state it prevents was well guarded (a planted second
  // sheet produces seven failures across checks 21, 28, 32 and 34). That asymmetry is the
  // trap: the mechanism only bites during a LOCAL re-freeze, which is exactly the workflow
  // DEPLOY.md tells an operator to run, and it is the one run nobody re-tests afterwards.
  const served = 'styles.ef0b25e2.css';

  assert.equal(
    isStaleStylesheet('styles.935d5f33.css', served),
    true,
    'a previous fingerprint was not identified as stale — it would keep being served ' +
      'immutable for a year alongside the current one'
  );
  assert.equal(
    isStaleStylesheet('styles.css', served),
    true,
    'the pre-fingerprint name was not identified as stale. It is the exact URL that used ' +
      'to carry a year of immutable caching, so leaving it behind is the worst case.'
  );
  assert.equal(
    isStaleStylesheet(served, served),
    false,
    'the CURRENT stylesheet was identified as stale — the sweep would delete the sheet it ' +
      'just wrote and every version page would render unstyled'
  );

  // Neighbours that must survive the sweep. `favicon.svg` and the fonts are the rest of
  // the frozen unit; deleting any of them mid-build stores a half-published snapshot.
  for (const keep of ['favicon.svg', 'fonts', 'main.html', 'index.html', 'stylesheet.css']) {
    assert.equal(
      isStaleStylesheet(keep, served),
      false,
      `the sweep would have deleted ${keep}, which is not a stylesheet fingerprint`
    );
  }

  // The CALL SITE, asserted separately from the predicate. Extracting `isStaleStylesheet`
  // covered the logic and left its invocation uncovered: deleting the loop in
  // eleventy.config.js still leaves a clean build green, because a fresh `_site` has
  // nothing stale to sweep and no gated target ever builds incrementally. The behavioural
  // proof is the test below; this is the cheap structural half, and it is what fails if
  // someone deletes the loop while keeping the helper.
  const config = readFileSync(path.join(REPO_ROOT, 'eleventy.config.js'), 'utf8');
  assert.match(
    config,
    /isStaleStylesheet\(/,
    'eleventy.config.js no longer invokes isStaleStylesheet. The predicate would still ' +
      'pass its own controls while nothing swept, and a local re-freeze would ship two ' +
      'stylesheets both served immutable for a year.'
  );
});

test('check 34 — the sweep removes every stale fingerprint and nothing else', async () => {
  // The sweep LOOP, over a real directory.
  //
  // Extracting `isStaleStylesheet` covered the predicate and left its call site uncovered:
  // deleting the loop from eleventy.config.js leaves a clean build green, because a fresh
  // `_site` has nothing stale to remove and no gated target ever builds incrementally. The
  // structural assertion above catches deletion of the call; this reproduces the loop's
  // semantics over a directory that actually contains the mess an operator's second build
  // finds — several generations of fingerprint plus the pre-fingerprint name.
  //
  // It does NOT drive Eleventy. The first version of this test did, and it broke check 32
  // three ways: node:test runs files in parallel, check 32 sandboxes a copy of
  // `_site/oal/v1.0`, and rebuilding underneath it raced. `--output` is no escape either —
  // the after-hook's `dir.output` does not track the CLI flag, so the build wrote its pages
  // to the temp tree and its assets to `_site`. A test that mutates shared state to prove a
  // point about isolation is its own counter-example.
  const box = await mkdtemp(path.join(os.tmpdir(), 'ordoia-sweep-'));
  try {
    const served = 'styles.ef0b25e2.css';
    const stale = ['styles.935d5f33.css', 'styles.aaaaaaaa.css', 'styles.css'];
    const keep = ['favicon.svg', 'main.html', 'index.html', 'stylesheet.css'];

    for (const f of [served, ...stale, ...keep]) await writeFile(path.join(box, f), 'x');

    // The loop, exactly as eleventy.config.js runs it.
    for (const name of await readdir(box)) {
      if (isStaleStylesheet(name, served)) await rm(path.join(box, name), { force: true });
    }

    const left = (await readdir(box)).sort();
    assert.deepEqual(
      left,
      [served, ...keep].sort(),
      `the sweep left the wrong set. Every stale fingerprint is served \`immutable\` for a ` +
        `year, so one surviving generation is one unrecallable stylesheet a reader can be ` +
        `handed instead of the current one.`
    );
    assert.ok(
      left.includes(served),
      'the sweep deleted the CURRENT stylesheet — every version page would render unstyled'
    );
  } finally {
    await rm(box, { recursive: true, force: true });
  }
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
  // NAMED, not counted. `length > 20` was the whole content guard until an adversarial
  // pass replaced the list with four margins and sixteen `--inert-N` custom properties:
  // length 21, five effective properties, and every gated target on its committed number.
  // Unknown custom properties resolve to '' on both sides of any comparison, so they can
  // never produce a finding — the list would have been long enough to pass and blind
  // enough to certify "0 computed-style differences" for a re-freeze that restyled the
  // published document. A count cannot defend a population; only the members can.
  assert.ok(Array.isArray(oracle.VISUAL_PROPS), 'VISUAL_PROPS is not a list');
  const required = [
    'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style',
    'line-height', 'letter-spacing', 'text-transform', 'text-decoration-line',
    'display', 'visibility', 'opacity', 'position',
    'padding-top', 'padding-left', 'border-top-width', 'border-top-color',
    'outline-color', 'outline-width',
  ];
  const absent = required.filter((prop) => !oracle.VISUAL_PROPS.includes(prop));
  assert.deepEqual(
    absent,
    [],
    `VISUAL_PROPS no longer measures ${absent.join(', ')}. The re-freeze comparison would ` +
      `report "0 computed-style differences" for a published document whose type, colour, ` +
      `spacing or visibility had changed — a clean answer to a question it stopped asking.`
  );
  assert.ok(
    oracle.VISUAL_PROPS.every((prop) => !prop.startsWith('--')),
    'VISUAL_PROPS contains a custom property. Unknown custom properties resolve to the ' +
      'empty string on both sides of every comparison, so they pad the list without ever ' +
      'being able to report a difference.'
  );

  // The oracle must have a real consumer, or "shared" is a claim rather than a fact. It
  // was exactly that for one commit: check 27 kept its own private copy while the
  // extracting commit's changelog row said the two were sharing.
  const check27 = await readFile(
    path.join(REPO_ROOT, 'tests/checks/27-one-chrome.test.js'),
    'utf8'
  );
  // The BINDING, not the module specifier, and no local declaration of ANY form.
  //
  // The first version of this asserted `doesNotMatch(/const\s+capture\s*=\s*\(props\)\s*=>/)`
  // — the exact spelling of the copy that was deleted. Re-growing it as
  // `function capture({ props, scope })` passed: check 34 7/7, check 27 8/8. A control
  // written from the artifact it removed can only catch that artifact returning byte for
  // byte. Matching the import specifier alone is no better: `import { VISUAL_PROPS }` with
  // a local `capture` satisfies it, which is precisely the one-commit state this exists to
  // prevent.
  const imported = check27.match(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/lib\/computed-style\.js'/);
  assert.ok(
    imported,
    'check 27 no longer imports the shared computed-style oracle, so the oracle has one ' +
      'consumer that is never run and the duplicate it was extracted to remove is back'
  );
  const bound = imported[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0]);
  for (const name of ['VISUAL_PROPS', 'capture']) {
    assert.ok(
      bound.includes(name),
      `check 27 imports [${bound.join(', ')}] from the shared oracle but not ${name}. ` +
        `Importing one half and keeping the other local is the duplicate wearing an import.`
    );
  }
  assert.doesNotMatch(
    check27,
    /^\s*(?:const|let|var|function)\s+capture\b/m,
    'check 27 declares its own capture(), in some spelling. Two copies of one predicate is ' +
      'the shape that made checks 30 and 31 blind to the same clip-path on 2026-08-13.'
  );

  assert.ok(tool, 'tools/frozen-render-diff.mjs failed to load');

  // The comparison's ACTUAL logic, exercised. `diffCaptures` is the pure half of the tool
  // — the half that decides whether a re-freeze is safe — and running the browser half per
  // commit would cost four viewports on every `npm test`, which is the operator's cost at
  // re-freeze time rather than every commit's. This covers what a load check cannot: that
  // the comparison can still tell same from different.
  const before = { 'a[0]': { color: 'rgb(0, 0, 0)' }, 'b[1]': { color: 'rgb(1, 1, 1)' } };

  const same = oracle.diffCaptures(before, structuredClone(before));
  assert.equal(same.findings.length, 0, 'identical captures reported a difference');
  assert.equal(same.compared, 2, 'the comparison counted the wrong number of values');

  const changed = oracle.diffCaptures(before, {
    ...structuredClone(before),
    'a[0]': { color: 'rgb(255, 0, 0)' },
  });
  assert.equal(changed.findings.length, 1, 'a changed property was not reported');
  assert.equal(changed.findings[0].prop, 'color');

  // An element appearing or vanishing is its own finding, not a skip. A stylesheet cannot
  // add or remove an element, so if this ever fires the comparison is being handed two
  // different documents and its answer about styles would be meaningless — which is worth
  // a loud finding rather than a quiet one.
  const { 'b[1]': _gone, ...missing } = structuredClone(before);
  const removed = oracle.diffCaptures(before, missing);
  assert.equal(removed.findings.length, 1, 'a vanished element was not reported');
  assert.equal(removed.findings[0].after, 'absent');

  const added = oracle.diffCaptures(missing, before);
  assert.equal(added.findings.length, 1, 'a new element was not reported');
  assert.equal(added.findings[0].after, 'present');

  // Zero values compared is the vacuity case: a comparison over nothing must be visible as
  // nothing, not indistinguishable from a clean result. The tool's own `run()` refuses to
  // report success on it, and this is the predicate that refusal rests on.
  assert.equal(oracle.diffCaptures({}, {}).compared, 0, 'an empty comparison claimed values');
});

test('check 34 — capture() separates the frozen <main> from the chrome', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  /**
   * `scope: 'main'` is the population `frozen-render-diff` certifies a re-freeze over, and
   * NOTHING executed it. Check 27 only ever passes `'chrome'`; check 34's other arm
   * exercises `diffCaptures` alone; the tool itself is import-loaded, never run.
   *
   * Drilled: collapse the scope selector to `if (inMain) continue;` — ignoring the argument
   * entirely — and the full suite stays at 137/127/0/10. With that one token changed,
   * `frozen-render-diff 1.0 --against src/styles.css` reports **48 elements / 9,216 values
   * / 0 computed-style differences** and exits 0, instead of 541 / 103,872. It measures the
   * CHROME, which check 27 has already proved is independent of the frozen sheet, so it can
   * never report a difference — a re-freeze that restyled the published rubric would be
   * certified clean. The tool's own vacuity guard cannot help: the wrong population is
   * non-empty. Only `--self-test` catches it, and nothing runs `--self-test`.
   *
   * So the two scopes are asserted to PARTITION: both non-empty, disjoint, and `main`
   * actually selecting elements under `<main>`.
   */
  const s = survey({ pages: 'version pages captured at both scopes' });

  await withSite(async ({ origin, browser }) => {
    const page = await browser.newPage();
    try {
      await page.goto(`${origin}/oal/v1.0/`, { waitUntil: 'load' });
      const chrome = await page.evaluate(capture, { props: VISUAL_PROPS, scope: 'chrome' });
      const main = await page.evaluate(capture, { props: VISUAL_PROPS, scope: 'main' });
      s.count('pages');

      const ck = Object.keys(chrome);
      const mk = Object.keys(main);

      if (!ck.length) s.fail('the chrome scope captured no element');
      if (!mk.length) {
        s.fail(
          'the main scope captured no element, so frozen-render-diff would certify a ' +
            're-freeze having compared nothing inside the published document'
        );
      }
      const overlap = ck.filter((k) => k in main);
      if (overlap.length) {
        s.fail(
          `scope does not partition: ${overlap.length} element(s) in both, e.g. ` +
            `${overlap[0]}. A tool asking about <main> would be answered about the chrome.`
        );
      }
      if (mk.length && !mk.some((k) => k.includes('main'))) {
        s.fail(
          'no captured key sits under <main>, so scope:"main" is selecting something other ' +
            'than the frozen document'
        );
      }
    } finally {
      await page.close();
    }
  });

  s.report('capture() no longer separates the frozen <main> from the chrome');
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
