#!/usr/bin/env node
/**
 * Does swapping the frozen stylesheet change how the frozen `<main>` renders?
 *
 * `DEPLOY.md`'s cost 2 of a re-freeze: "the frozen stylesheet becomes the stylesheet as at
 * the re-freeze, not as at publication". A re-freeze copies the CURRENT `src/styles.css`
 * into `versions/v<n>/`, so a design change made since publication reaches a published
 * document. On 2026-08-13 that was measured AFTER the fact and came back clean — 0
 * computed-style differences across 45,444 values — and `DEPLOY.md:652` then required that
 * the next re-freeze either fingerprint the frozen stylesheet or run that same comparison.
 *
 * Neither existed. The 45,444 figure lived only in prose; no script produced it. This is
 * the script, and it answers the question BEFORE the re-freeze rather than after, which is
 * when the answer is still worth having.
 *
 * ## How the variable is isolated
 *
 * Not by comparing two builds. A version event changes the rubric's words in the same
 * commit series that changes the stylesheet, so a build-to-build comparison would report
 * both and could not tell them apart.
 *
 * Instead the SAME document is rendered twice and the stylesheet response is intercepted
 * on the second pass and replaced with the candidate bytes. Identical DOM, identical
 * cascade position, identical everything — only the stylesheet's bytes differ. Whatever
 * comes back is attributable to the stylesheet and to nothing else.
 *
 * ## Usage
 *
 *   node tools/frozen-render-diff.mjs 1.0 --against src/styles.css
 *   node tools/frozen-render-diff.mjs --self-test
 *
 * Exit 0 when the candidate renders the frozen `<main>` identically. Exit 1 on any
 * difference, and exit 1 if it measured nothing — a comparison over an empty population
 * is the vacuity this suite refuses, and reporting "no differences" from zero values would
 * be the most expensive kind of green.
 */

import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve, TARGET, REPO_ROOT } from '../tests/lib/harness.js';
import { VISUAL_PROPS, capture, diffCaptures } from '../tests/lib/computed-style.js';
import { stylesheetHref, STORED_STYLESHEET } from './freeze-version.mjs';

/**
 * The widths the 2026-08-13 measurement used.
 *
 * `src/styles.css` has exactly ONE width breakpoint — `@media (max-width: 46rem)` — and
 * 46rem is 736px, so 320 and 375 sit below it and 768 and 1280 above. An earlier version
 * of this comment named "736px and 46rem" as two breakpoints "either side of 768", which
 * is the same one twice and on the wrong side of 768. A reader moving a width would have
 * trusted it.
 */
const WIDTHS = [320, 375, 768, 1280];

/** Every value at every width, so a single width cannot carry the whole answer. */
async function renderPair(browser, origin, version, candidateCss) {
  const url = `/oal/v${version}/`;
  const frozenHref = stylesheetHref(version);
  const perWidth = [];

  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await page.goto(origin + url, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const before = await page.evaluate(capture, { props: VISUAL_PROPS, scope: 'main' });

      // Substitute the stylesheet's BYTES on the wire. Routing rather than CSSOM editing,
      // because a `<style>` injected after the fact sits later in the cascade and would
      // win ties the real sheet loses — which would report differences the swap does not
      // actually cause.
      let served = 0;
      await page.route(`**${frozenHref}`, async (route) => {
        served += 1;
        await route.fulfill({ contentType: 'text/css', body: candidateCss });
      });
      await page.reload({ waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const after = await page.evaluate(capture, { props: VISUAL_PROPS, scope: 'main' });

      // A route that never fired would make the comparison trivially green. This is the
      // same refusal check 27 makes when it disables a sheet and counts what it disabled.
      if (served === 0) {
        throw new Error(
          `nothing was intercepted at ${frozenHref} — the candidate stylesheet never ` +
            `reached the page, so a green result here would mean nothing`
        );
      }

      const { findings, compared } = diffCaptures(before, after);
      perWidth.push({ width, findings, compared, elements: Object.keys(before).length });
    } finally {
      await page.close();
    }
  }

  return perWidth;
}

async function run(version, candidatePath) {
  const abs = path.isAbsolute(candidatePath)
    ? candidatePath
    : path.join(REPO_ROOT, candidatePath);
  if (!existsSync(abs)) throw new Error(`no candidate stylesheet at ${abs}`);
  if (!existsSync(path.join(TARGET, 'oal', `v${version}`, 'index.html'))) {
    throw new Error(`no build at ${TARGET}/oal/v${version}/ — run npm run build first`);
  }

  const candidateCss = readFileSync(abs, 'utf8');

  // Refuse a candidate identical to the frozen sheet.
  //
  // Sibling of the never-fired-route guard below. `DEPLOY.md` tells the next operator to
  // run `--against src/styles.css`, and that command is informative only BEFORE the
  // re-freeze: afterwards the freeze has copied `src/styles.css` into the snapshot, so the
  // two are byte-identical and the run becomes this tool's own identity arm wearing the
  // clothes of a measurement. It returns 0 differences over 104,256 values and a reviewer
  // reasonably reads it as proof. It proves the comparison works, which `--self-test`
  // already says, and nothing about the re-freeze.
  //
  // Found by the design pass, which noticed the documented command had stopped carrying
  // information the moment the branch it documents was committed.
  const frozenPath = path.join(REPO_ROOT, 'versions', `v${version}`, STORED_STYLESHEET);
  if (existsSync(frozenPath) && readFileSync(frozenPath, 'utf8') === candidateCss) {
    console.error(
      `The candidate is byte-identical to versions/v${version}/${STORED_STYLESHEET}, so this ` +
        `run would compare the frozen sheet with itself and report 0 differences whatever ` +
        `the state of the world.\n\n` +
        `That is the identity arm of --self-test, not a measurement. It is what this command ` +
        `becomes AFTER a re-freeze has copied src/styles.css into the snapshot — run it ` +
        `BEFORE, while the two still differ and backing out is free (DEPLOY.md step 1). To ` +
        `check a re-freeze after the fact, compare against the PREVIOUS frozen bytes:\n` +
        `  git show <pre-freeze-commit>:versions/v${version}/${STORED_STYLESHEET} > /tmp/before.css\n` +
        `  node tools/frozen-render-diff.mjs ${version} --against /tmp/before.css`
    );
    return 1;
  }

  const site = await serve();
  const browser = await chromium.launch();
  let perWidth;
  try {
    perWidth = await renderPair(browser, site.origin, version, candidateCss);
  } finally {
    await browser.close().catch(() => {});
    await site.close();
  }

  const compared = perWidth.reduce((n, w) => n + w.compared, 0);
  const findings = perWidth.flatMap((w) => w.findings.map((f) => ({ ...f, width: w.width })));
  const elements = perWidth[0]?.elements ?? 0;

  console.log(`frozen-render-diff — /oal/v${version}/ against ${candidatePath}`);
  console.log(`  widths     ${WIDTHS.join(', ')}`);
  console.log(`  elements   ${elements} inside <main>`);
  console.log(`  values     ${compared.toLocaleString()} compared`);

  if (elements === 0 || compared === 0) {
    console.error(
      '\nMEASURED NOTHING. No element was found inside <main>, so passing would have ' +
        'meant nothing. This is a broken comparison, not a clean one.'
    );
    return 1;
  }

  if (findings.length === 0) {
    console.log(`\n  0 computed-style differences. The candidate renders <main> identically.`);
    return 0;
  }

  console.error(`\n  ${findings.length} computed-style difference(s):\n`);
  for (const f of findings.slice(0, 40)) {
    console.error(
      f.prop === null
        ? `  @${f.width}  ${f.el}\n      element ${f.before} → ${f.after}`
        : `  @${f.width}  ${f.el}\n      ${f.prop}: ${f.before} → ${f.after}`
    );
  }
  if (findings.length > 40) console.error(`  … ${findings.length - 40} more`);
  console.error(
    `\nThis is DEPLOY.md's cost 2: a stylesheet change reaching a published document. ` +
      `Do not re-freeze until every difference above is understood.`
  );
  return 1;
}

/**
 * Prove the comparison can report a difference before trusting it to report none.
 *
 * Two arms, and the negative one is the one that matters. A tool that cannot detect a
 * planted change cannot certify the absence of one — which is the pathology this repository
 * has recorded against its own guards more than once.
 */
async function selfTest(version) {
  const frozen = path.join(REPO_ROOT, 'versions', `v${version}`, 'styles.css');
  if (!existsSync(frozen)) throw new Error(`no frozen stylesheet at ${frozen}`);
  const frozenCss = readFileSync(frozen, 'utf8');

  // The planted declaration targets `<main>` itself, which every frozen rubric page has,
  // so the control cannot silently match nothing.
  const planted = `${frozenCss}\nmain { letter-spacing: 3.7px; }\n`;

  const site = await serve();
  const browser = await chromium.launch();
  let identity;
  let plantedResult;
  try {
    identity = await renderPair(browser, site.origin, version, frozenCss);
    plantedResult = await renderPair(browser, site.origin, version, planted);
  } finally {
    await browser.close().catch(() => {});
    await site.close();
  }

  const idFindings = identity.reduce((n, w) => n + w.findings.length, 0);
  const idCompared = identity.reduce((n, w) => n + w.compared, 0);
  const plFindings = plantedResult.reduce((n, w) => n + w.findings.length, 0);

  const arms = [
    {
      name: 'identity — the frozen sheet against itself reports nothing',
      ok: idFindings === 0 && idCompared > 0,
      detail: `${idFindings} finding(s) over ${idCompared.toLocaleString()} values`,
    },
    {
      name: 'planted — one added declaration inside <main> is reported',
      ok: plFindings > 0,
      detail: `${plFindings} finding(s)`,
    },
  ];

  console.log(`frozen-render-diff --self-test (v${version})\n`);
  for (const a of arms) console.log(`  ${a.ok ? 'PASS' : 'FAIL'}  ${a.name} — ${a.detail}`);
  const failed = arms.filter((a) => !a.ok).length;
  console.log(`\n  ${arms.length - failed}/${arms.length} arms fired.`);
  return failed === 0 ? 0 : 1;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const version = argv.find((a) => /^\d+\.\d+$/.test(a)) ?? '1.0';
  try {
    if (argv.includes('--self-test')) {
      process.exit(await selfTest(version));
    }
    const i = argv.indexOf('--against');
    if (i === -1 || !argv[i + 1]) {
      console.error(
        'usage: node tools/frozen-render-diff.mjs <version> --against <stylesheet>\n' +
          '       node tools/frozen-render-diff.mjs [<version>] --self-test'
      );
      process.exit(2);
    }
    process.exit(await run(version, argv[i + 1]));
  } catch (err) {
    console.error(`frozen-render-diff: ${err.message}`);
    process.exit(1);
  }
}
