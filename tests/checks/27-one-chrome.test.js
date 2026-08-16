/**
 * Check 27 — one chrome, on every page a visitor can reach.
 *
 * The user's R1, stated in the 2026-08-12 brief: *"A visitor must see the same header
 * and footer on every page they can reach, including /oal/v1.0/, and must keep seeing
 * the same chrome after future chrome changes without a version event."*
 *
 * ── What this was written against ──────────────────────────────────────────────────
 *
 * Measured on 2026-08-12, before the freeze/chrome split: eight of nine rendered pages
 * carried the footer field list with the VAT registration, and `/oal/v1.0/` carried the
 * *launch* footer — a sentence, `Ordoia · third-party assurance for LLM and agent
 * systems · United Kingdom`, whose replacement had already shipped everywhere else.
 * The site served two different footers, and the frozen one restated a sentence the
 * repository had withdrawn.
 *
 * That was not a defect in the footer. It was a consequence of the freeze storing the
 * whole `index.html`, so a published version's chrome froze with its content. This
 * check is the guard that makes the split's central promise hold on every later commit:
 * **the chrome is rendered, from live templates and live data, on every page.**
 *
 * Written red-first. Against the build it was written against it produced exactly one
 * finding, naming `/oal/v1.0/`.
 *
 * ── The three normalisations, and why each is legitimate ───────────────────────────
 *
 * A byte comparison across pages has to survive the differences the design intends,
 * or it fails on correct output and gets switched off within a month — check 12's
 * segmentation lesson, one check over.
 *
 *   1. `aria-current="page"` marks the visitor's position in the nav. It is *supposed*
 *      to differ per page; a chrome identical in that attribute too would be a bug.
 *   2. The footer nav omits the link to the page you are already on — `layout.njk`'s
 *      `{% if nav != "scorecard" %}`. Dropping the self-link before comparing measures
 *      the list rather than the omission.
 *   3. `assetBase` rewrites nothing inside the chrome today, but a version page's
 *      chrome must be free to differ in the status strip, which states a fact *about*
 *      that document. The strip is check 29's subject and is excluded here by being
 *      outside both regions this check extracts.
 *
 * Everything else is compared byte for byte. In particular the footer's legal field
 * strip is compared whole, because that strip is where a stored chrome shows up first:
 * it carries the VAT registration, and it is the field list Terms and Privacy arrive in.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { IS_HANDOVER, REPO_ROOT, TARGET, withSite, withSource } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import { ledgerFor } from '../lib/allowances.js';
import { deriveChromeSheet, isChromeSelector, parse } from '../../tools/chrome-sheet.mjs';
import { stylesheetHref } from '../../tools/freeze-version.mjs';
import { VISUAL_PROPS, capture } from '../lib/computed-style.js';

const HANDOVER_SKIP =
  'the designer handover predates the one-layout build — its eleven pages carry hand-written ' +
  'chrome by construction, so comparing them measures the handover rather than this rule';

const MASTHEAD = /<header class="masthead">[\s\S]*?<\/header>/i;
const FOOTER = /<footer[^>]*>[\s\S]*?<\/footer>/i;
const LEGAL = /<ul class="legal">[\s\S]*?<\/ul>/i;

/** Strip the position marker: it is meant to differ, and only on the current item. */
const dropCurrent = (html) => html.replace(/\s*aria-current="page"/g, '');

/**
 * The hrefs a chrome region links, in document order.
 *
 * The footer's nav is compared as a *set against a rule* rather than byte for byte,
 * because `layout.njk` deliberately omits the link to the page you are already on. The
 * first draft of this check normalised that by deleting the self-link from every page —
 * which is wrong, and was caught red-first: `/about/` then rendered five links with
 * `/about/` missing and `/scorecard/` rendered five with `/scorecard/` missing, and the
 * two compared as different for a reason that was the check's fault rather than the
 * site's. The rule the template actually implements is stated below and asserted directly.
 */
const hrefs = (html) => [...html.matchAll(/<li><a href="([^"]+)"/g)].map((m) => m[1]);

test('check 27 — every rendered page carries the same masthead', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    pages: 'rendered HTML pages whose masthead was read',
    mastheads: 'masthead regions extracted and compared',
  });

  await withSource(({ sources }) => {
    let reference = null;

    for (const { url, html } of sources) {
      s.count('pages');
      const found = MASTHEAD.exec(html)?.[0];

      if (!found) {
        s.fail(
          `${url}: no <header class="masthead"> at all. Every page renders through ` +
            `layout.njk, so a page without one is either not rendering through it or is ` +
            `being served from stored bytes that predate it.`
        );
        continue;
      }
      s.count('mastheads');

      // The masthead keeps every link on every page — only the position marker moves.
      const shape = dropCurrent(found);
      if (reference === null) {
        reference = { url, shape };
        continue;
      }
      if (shape !== reference.shape) {
        s.fail(
          `${url}: its masthead differs from ${reference.url}'s. A visitor moving between ` +
            `the two sees two different navigations, and the one that is wrong is the one ` +
            `that stopped being rendered.`
        );
      }
    }
  });

  s.report(
    'the site serves more than one masthead. R1: a visitor must see the same header on ' +
      'every page they can reach, and must keep seeing it after a future chrome change ' +
      'without a version event. A page whose masthead is stored rather than rendered ' +
      'satisfies neither.'
  );
});

test('check 27 — every rendered page carries the same footer field strip', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    pages: 'rendered HTML pages whose footer was read',
    strips: 'footer field strips extracted and compared',
  });

  await withSource(({ sources }) => {
    const seen = [];

    for (const { url, html } of sources) {
      s.count('pages');
      const footer = FOOTER.exec(html)?.[0];

      if (!footer) {
        s.fail(`${url}: no <footer> at all.`);
        continue;
      }

      const strip = LEGAL.exec(footer)?.[0];
      if (!strip) {
        // The exact state this check was written to catch. `/oal/v1.0/` carried the
        // launch footer — a sentence, not a field list — because the freeze stored the
        // whole document rather than its content.
        const shown = footer.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        s.fail(
          `${url}: its footer carries no <ul class="legal"> field strip. It reads ` +
            `"${shown.slice(0, 120)}…". The field list is what every other page renders, ` +
            `so this page's footer is not coming from site.json — it is stored.`
        );
        continue;
      }
      s.count('strips');
      seen.push({ url, strip: dropCurrent(strip), nav: hrefs(footer.replace(strip, '')) });
    }

    // The field strip is identical everywhere, byte for byte. It carries the VAT
    // registration and is where Terms and Privacy arrive, so there is no legitimate
    // per-page variance in it at all.
    const [reference, ...rest] = seen;
    for (const page of rest) {
      if (page.strip !== reference.strip) {
        s.fail(
          `${page.url}: its footer field strip differs from ${reference.url}'s.\n` +
            `      ${reference.url}: ${reference.strip.replace(/\s+/g, ' ').slice(0, 160)}\n` +
            `      ${page.url}: ${page.strip.replace(/\s+/g, ' ').slice(0, 160)}`
        );
      }
    }

    /**
     * The footer nav renders the same routes on every page, and **the only absence a
     * page may have is a link to itself.**
     *
     * Measured, not assumed — and the first draft got it wrong in the instructive
     * direction. It asserted "every route less this page's own", which is a rule
     * somebody could reasonably expect `layout.njk` to implement. What `layout.njk`
     * actually implements is narrower: the four primary routes are unconditional and
     * only `/scorecard/` and `/changelog/` are guarded by `{% if nav != … %}`, so
     * `/about/` does render a link to `/about/`. The invented rule reported four
     * correct pages as defects. Stated as a subset rule, this holds for both shapes
     * and still catches the one that matters — a footer that has stopped tracking the
     * site's page list because it was stored rather than rendered.
     */
    const full = new Set(seen.flatMap((p) => p.nav));
    for (const page of seen) {
      const present = new Set(page.nav);
      const missing = [...full].filter((href) => !present.has(href) && href !== page.url);
      if (missing.length) {
        s.fail(
          `${page.url}: its footer navigation is missing [${missing.join(', ')}], which every ` +
            `other page renders. The only link a page may legitimately omit is its own. A ` +
            `footer that has stopped tracking the site's page list is a footer that was ` +
            `stored rather than rendered — in 2028 it will still be advertising the site as ` +
            `it stood at publication.`
        );
      }
    }
  });

  s.report(
    'the site serves more than one footer. The field strip carries the VAT registration ' +
      'and is where Terms and Privacy arrive, so a page rendering a different one is ' +
      'publishing different legal facts at different addresses. R1 again: one chrome, ' +
      'everywhere, without a version event.'
  );
});

test('check 27 — the chrome stylesheet cannot reach inside <main>', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  /**
   * R2, measured against the rendered DOM rather than argued from the source.
   *
   * `/oal/v1.0/` carries two stylesheets in disjoint scopes: the frozen sheet, byte-identical
   * to what was published, governing `<main>`; and the live chrome sheet governing the
   * masthead, the status strip and the footer. The whole arrangement rests on the second
   * one being unable to reach the first. If it can, a redesign restyles a published
   * methodology document — silently, because every byte check would stay green.
   *
   * `tools/chrome-sheet.mjs` is written so this holds by construction, and this test is
   * what stops that being a claim about a regex. It asks the browser: for every selector
   * in the emitted sheet, does anything it matches live inside `<main>`?
   *
   * The planted control at the end is the point of the whole test — a selector the
   * derivation should never emit is checked to be catchable, so a predicate that quietly
   * started matching everything could not pass here.
   *
   * ── Why the assertion is scoped to version pages ──────────────────────────────────
   *
   * Two sheets only govern one page differently: a frozen version's, where `<main>` is
   * styled by 2026's stylesheet and the chrome by today's. Everywhere else both sheets
   * ARE today's design, so a chrome selector reaching into `<main>` changes nothing —
   * the live sheet was already applying the identical rule. Asserting it site-wide would
   * be measuring something R2 does not ask for.
   *
   * It is not ignored, though. The first run of this test reported `.skip` matching inside
   * `<main>` on `/` and `/services/`, and that is a real defect it found: `grid.njk` puts
   * `class="skip"` — the SKIP-LINK class — on the coverage grid's visually hidden corner
   * heading, where `.vh` is the class that exists for exactly that and says so in its own
   * comment. Harmless today and a latent hazard after this commit, because a class shared
   * between chrome and content is the one thing that can cross the scope boundary. It is
   * reported as a diagnostic below rather than fixed here: Commit A is landing on
   * unchanged content so that drill 1's byte comparison means something, and this is a
   * markup change. It belongs in Commit B.
   */
  const s = survey({
    selectors: 'chrome stylesheet selectors tested against the rendered DOM',
    pages: 'version pages the selectors were tested on',
  });

  const isVersionPage = (url) => /^\/oal\/v[\d.]+\/$/.test(url);

  const sheets = (await readdir(path.join(TARGET, 'chrome')).catch(() => [])).map((f) => `chrome/${f}`);
  if (sheets.length !== 1) {
    s.mayBeEmpty('selectors', 'placeholder — the assertion below reports the real problem');
    s.mayBeEmpty('pages', 'placeholder — the assertion below reports the real problem');
    s.fail(
      `expected exactly one derived chrome stylesheet in the build, found ${sheets.length} ` +
        `(${sheets.join(', ') || 'none'}). Every page links one by name, so none means an ` +
        `unstyled header and footer site-wide and two means the fingerprint is not a function ` +
        `of the content.`
    );
    return s.report('the build emitted no single chrome stylesheet to test');
  }

  const css = await readFile(path.join(TARGET, sheets[0]), 'utf8');
  const selectors = [
    ...new Set(
      css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/@media[^{]*\{/g, '')
        .split('}')
        .map((chunk) => chunk.split('{')[0].trim())
        .filter((sel) => sel && !sel.startsWith('@'))
        .flatMap((sel) => sel.split(',').map((one) => one.trim()))
        .filter(Boolean)
    ),
  ];

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    try {
      for (const { url } of pages) {
        await page.goto(`${origin}${url}`, { waitUntil: 'load' });
        if (isVersionPage(url)) s.count('pages');

        const reaching = await page.evaluate((list) => {
          const main = document.querySelector('main');
          if (!main) return { noMain: true, hits: [] };
          const hits = [];
          for (const sel of list) {
            let matched;
            try {
              matched = [...main.querySelectorAll(sel)];
            } catch {
              hits.push({ sel, invalid: true });
              continue;
            }
            if (matched.length) hits.push({ sel, count: matched.length, tag: matched[0].tagName });
          }
          return { noMain: false, hits };
        }, selectors);

        if (reaching.noMain) {
          if (isVersionPage(url)) {
            s.fail(`${url}: no <main>, so the isolation claim cannot be tested on this page`);
          }
          continue;
        }
        for (const hit of reaching.hits) {
          if (hit.invalid) {
            s.fail(`${url}: the chrome sheet carries a selector the browser rejects — "${hit.sel}"`);
            continue;
          }
          if (isVersionPage(url)) {
            s.fail(
              `${url}: chrome selector "${hit.sel}" matches ${hit.count} element(s) inside ` +
                `<main> (first: <${hit.tag.toLowerCase()}>). That is the live design reaching ` +
                `into a published document, which is exactly what R2 forbids and what no byte ` +
                `check can see.`
            );
          } else {
            // Not an R2 violation — both sheets are today's design here — but a class
            // shared between chrome and content is the only way the boundary can ever be
            // crossed, so it is named on every run rather than left to be rediscovered.
            t.diagnostic(
              `${url}: chrome selector "${hit.sel}" also matches ${hit.count} element(s) ` +
                `inside <main> (first: <${hit.tag.toLowerCase()}>). Harmless here because ` +
                `both stylesheets are the live design, but it is a chrome class doing a ` +
                `content job — see grid.njk's corner heading, which wants .vh.`
            );
          }
        }
      }
      s.count('selectors', selectors.length);

      // The control. A bare element selector is what an over-broad predicate would emit,
      // and it must be detectable — otherwise this test would pass over the failure it
      // exists to find.
      await page.goto(`${origin}/oal/v1.0/`, { waitUntil: 'load' });
      const planted = await page.evaluate(() =>
        [...document.querySelector('main').querySelectorAll('p, .sheet')].length
      );
      if (planted === 0) {
        s.fail(
          'the control found no <p> or .sheet inside the frozen <main>, so a chrome sheet ' +
            'that leaked a bare element selector would have been reported clean. This test ' +
            'is not measuring what it says it measures.'
        );
      }
    } finally {
      await page.close();
    }
  });

  s.report(
    'the chrome stylesheet reaches inside <main>. The freeze/chrome split rests entirely ' +
      'on the two sheets being in disjoint scopes: the frozen sheet governs the published ' +
      "document, the chrome sheet governs everything around it. A selector crossing that " +
      'line means a future redesign restyles a rubric that scorecards were issued against, ' +
      'and every manifest and byte check would stay green while it happened.'
  );
});

test('check 27 — the chrome does not depend on a frozen version stylesheet', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  /**
   * R1's forward half, and the exact mirror of the test above.
   *
   * That test asks whether the chrome sheet can reach *into* `<main>`. This one asks the
   * opposite and previously unasked question: can the frozen sheet reach *out* to the
   * chrome? Both must be false for the split to hold, and only one of them was measured.
   *
   * ── Why this is not the same as "the chrome matches across pages" ─────────────────
   *
   * It is tempting to compare rendered chrome between `/oal/v1.0/` and `/about/`. That
   * comparison is **green today** and would therefore be worthless: `src/styles.css` and
   * `versions/v1.0/styles.css` are still near-identical, right down to a byte-identical
   * `:root` block, so every page genuinely does render the same chrome. R1 does not only
   * say the chrome matches today — it says a visitor "must keep seeing the same chrome
   * after future chrome changes without a version event." A cross-page check cannot see
   * the difference between a mechanism that works and one that has never been asked to.
   *
   * So this asks the structural question instead: **strip the frozen sheet away and the
   * chrome must not move.** If it moves, the live chrome is being rendered in part by a
   * published document's stylesheet, and the two diverge the moment the live design does.
   *
   * ── Why it cannot inherit the bug it is looking for ───────────────────────────────
   *
   * `chromeRulesByContext` above builds its expectations by filtering the live sheet
   * through `isChromeSelector` — the same predicate the derivation uses. A rule the
   * derivation cannot keep is a rule that guard never asks for, so it is structurally
   * incapable of seeing an under-emission. This test never consults the predicate. It
   * takes its element set from the rendered DOM (everything outside `<main>`) and its
   * verdict from the browser's own cascade, so a selector form nobody has thought of yet
   * is covered by construction.
   *
   * ── Computed styles only, deliberately ────────────────────────────────────────────
   *
   * No geometry. Measured over 10,120 observations on this site: computed styles are a
   * zero-noise channel while `getBoundingClientRect` jitters up to ~0.1px between
   * identical loads, courtesy of the `font-display: optional` race that once produced a
   * fabricated R2 violation. A guard that reports rect deltas would be reporting its own
   * instrument, and this repository has already published one such number by mistake.
   */
  const s = survey({
    pages: 'version pages whose chrome was measured with the frozen sheet disabled',
    elements: 'chrome elements compared before and after',
    properties: 'computed property values compared',
  });

  const isVersionPage = (url) => /^\/oal\/v[\d.]+\/$/.test(url);
  const ledger = await ledgerFor(27);

  // Properties and element-walk both come from the shared oracle in
  // tests/lib/computed-style.js. They were a private copy here until 2026-08-15, and the
  // commit that extracted the oracle CLAIMED they were shared while leaving this copy in
  // place — so the file had one consumer and that consumer was never run. A duplicate
  // with a docstring saying it is not a duplicate is worse than an honest duplicate.
  //
  // `scope: 'chrome'` is everything OUTSIDE `<main>`; tools/frozen-render-diff.mjs passes
  // `'main'` for the complementary population. One predicate, so a blindness fixed for
  // one is fixed for both — the rule 2026-08-13 established when checks 30 and 31 were
  // found blind to the same `clip-path`.
  const PROPS = VISUAL_PROPS;

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    try {
      for (const { url } of pages) {
        if (!isVersionPage(url)) continue;
        s.count('pages');

        await page.goto(`${origin}${url}`, { waitUntil: 'load' });
        const before = await page.evaluate(capture, { props: PROPS, scope: 'chrome' });

        // Disable this version's own stylesheet, and confirm one was actually disabled —
        // a selector that matched nothing would make the comparison trivially green,
        // which is the vacuity this suite refuses.
        // Resolved, not spelled: the frozen sheet is served `styles.<sha>.css` since
        // 2026-08-15. Spelling it `${url}styles.css` matched nothing after that, and
        // because this arm counts what it disabled it went RED rather than green — which
        // is the only reason the disable-and-compare below still means anything.
        const frozenHref = stylesheetHref(url.match(/^\/oal\/v([^/]+)\//)[1]);
        const off = await page.evaluate((href) => {
          let n = 0;
          for (const sheet of document.styleSheets) {
            if (sheet.href && new URL(sheet.href).pathname === href) {
              sheet.disabled = true;
              n += 1;
            }
          }
          return n;
        }, frozenHref);

        if (off !== 1) {
          s.fail(
            `${url}: expected exactly one stylesheet at ${frozenHref} to disable, disabled ` +
              `${off}. Without it this comparison is between a page and itself, and would ` +
              `report clean over any dependency at all.`
          );
          continue;
        }

        const after = await page.evaluate(capture, { props: PROPS, scope: 'chrome' });

        const keys = Object.keys(before);
        s.count('elements', keys.length);
        const moved = [];
        for (const k of keys) {
          if (!after[k]) {
            moved.push(`${url} ${k}: the element disappeared when the frozen sheet was disabled`);
            continue;
          }
          for (const p of PROPS) {
            s.count('properties');
            if (before[k][p] !== after[k][p]) {
              moved.push(`${url} ${k} — ${p}: ${before[k][p]} → ${after[k][p]}`);
            }
          }
        }

        // Named in full rather than counted. The point of the finding is *which*
        // declarations the chrome is borrowing, because that is the fix list.
        const live = moved.filter((m) => !ledger.allows(url, m));
        s.failAll(live.slice(0, 40));
        if (live.length > 40) {
          s.fail(`${url}: and ${live.length - 40} further chrome properties supplied by the frozen sheet`);
        }
      }

      /**
       * Sensitivity control, and it is not optional.
       *
       * The assertion above passes when disabling a stylesheet changes nothing. A capture
       * that silently returned the same object twice, an `evaluate` that threw and was
       * swallowed, a `disabled` flag the browser ignored — every one of those produces a
       * clean green over a broken instrument. So the same machinery is pointed at a page
       * where the dependency is real and expected: on a live page the site stylesheet
       * genuinely does style the chrome, and removing it MUST move something.
       */
      const live = pages.find((p) => p.url === '/about/');
      if (!live) {
        s.fail('the sensitivity control needs /about/ in the build and it was not there');
      } else {
        await page.goto(`${origin}${live.url}`, { waitUntil: 'load' });
        const a = await page.evaluate(capture, { props: PROPS, scope: 'chrome' });
        const n = await page.evaluate(() => {
          let k = 0;
          for (const sheet of document.styleSheets) {
            if (sheet.href && new URL(sheet.href).pathname === '/styles.css') {
              sheet.disabled = true;
              k += 1;
            }
          }
          return k;
        });
        const b = await page.evaluate(capture, { props: PROPS, scope: 'chrome' });
        const changed = Object.keys(a).filter((k) => b[k] && PROPS.some((p) => a[k][p] !== b[k][p]));
        if (n !== 1 || changed.length === 0) {
          s.fail(
            `the control disabled ${n} stylesheet(s) on /about/ and measured ${changed.length} ` +
              `changed chrome elements. The live sheet indisputably styles the chrome there, ` +
              `so zero means this test cannot detect a dependency and its green above is not ` +
              `evidence of anything.`
          );
        }
      }
    } finally {
      await page.close();
    }
  });

  // A deviation log that keeps entries for violations that no longer exist stops being a
  // record of judgement. If the body-box allowance ever covers nothing, the R1/R2 conflict
  // it records has been resolved and the entry must go with it.
  s.failAll(
    ledger.unused().map(
      (a) =>
        `allowance ${a.id} covered nothing this run. It records a decision about ` +
        `${a.page}; if that decision no longer has a violation behind it, delete the entry.`
    )
  );

  s.report(
    "the live chrome is partly rendered by a published version's stylesheet. Those bytes are " +
      'frozen forever, so every declaration listed above is one the chrome can never change ' +
      'again: edit it in src/styles.css and the version page keeps the 2026 value, delete it ' +
      'and the version page keeps it alone. R1 says a visitor must keep seeing the same chrome ' +
      'after future chrome changes, and that is the half no byte comparison can reach — the ' +
      'chrome matches across pages today only because the two stylesheets have not yet been ' +
      'asked to differ.'
  );
});

test('check 27 — the derivation carries every token the live sheet declares', () => {
  /**
   * The regression test for CHANGES.md row 66's own bug, which shipped guarded by nothing.
   *
   * `declarations()` splits a rule body on `;`. The first version split the RAW body, so a
   * declaration preceded by a block comment — which in `:root` is most of them, because
   * this stylesheet documents what it measured — yielded a property name of
   * `/* … *\/ --track` and failed the `startsWith('--')` filter. Three tokens were dropped
   * silently: `--track`, `--surface`, `--p0`.
   *
   * It was fixed, and a guard was added, and the module's own docstring then claimed the
   * derivation "now cannot" drop a token quietly. **That claim was false.** Measured by
   * reverting the one line: all three tokens vanish again and every build guard stays
   * silent, because `undeclared` only fires when a KEPT CHROME RULE references a lost
   * token — and none currently does. A guard written for a bug that does not cover the bug
   * is the shape this repository keeps finding a comment above.
   *
   * So the property is asserted directly: every custom property the live `:root` declares
   * must appear in the derived sheet. This fails on the reverted line; the build guards
   * do not.
   */
  const s = survey({
    tokens: 'custom properties declared in the live :root and checked in the derived sheet',
  });

  const live = readFileSync(path.join(REPO_ROOT, 'src', 'styles.css'), 'utf8');
  const { css, dropped, undeclared } = deriveChromeSheet(live);

  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(live);
  assert.ok(root, 'src/styles.css has no :root block — the derivation has nothing to carry');

  const declaredInRoot = [
    ...new Set(
      [...root[1].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(
        (m) => m[1]
      )
    ),
  ];
  const carried = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));

  for (const token of declaredInRoot) {
    s.count('tokens');
    if (!carried.has(token)) {
      s.fail(
        `${token} is declared in the live :root and is missing from the derived chrome ` +
          `sheet. On /oal/v1.0/ the chrome would resolve it against the FROZEN :root ` +
          `instead — the live design silently rendering in a published document's 2026 ` +
          `palette, which is R2 leaking backwards into R1.`
      );
    }
  }

  // The comment-preceded tokens specifically, named, because they are the ones the bug ate.
  for (const token of ['--track', '--surface', '--p0']) {
    if (declaredInRoot.includes(token) && !carried.has(token)) {
      s.fail(
        `${token} is one of the three tokens the 2026-08-12 comment-stripping defect ` +
          `dropped. Its absence means declarations() is splitting the raw rule body again.`
      );
    }
  }

  /**
   * …and no chrome rule may be lost anywhere in the derivation.
   *
   * The first version of this asserted `!dropped.some(isChromeSelector)`, which **can
   * never fire**: `dropped` is populated only from selectors that already failed
   * `isChromeSelector` (see `convert()` — both call sites add the complement of `kept`),
   * so every member fails the predicate by construction. Measured: 124 dropped, 0
   * chrome-scoped. It was written to close the "`dropped[]` is read by nothing" finding
   * and closed nothing — the same guard-does-not-cover-the-bug shape, one commit later.
   *
   * The assertion that can fail is the complement: every chrome selector the LIVE sheet
   * declares must appear in the emitted one. That catches a rule lost to the skipped
   * at-rule branch, to a mis-scoped parse, or to a predicate that quietly narrowed —
   * none of which ever reach `dropped` at all.
   */
  /**
   * Counted PER CONTEXT — top level, and each at-rule prelude separately.
   *
   * A plain "does the emitted sheet contain this selector" check is not enough, and that
   * was measured rather than reasoned about: deleting `deriveChromeSheet`'s at-rule branch
   * loses all seven chrome rules inside `@media` — the entire print treatment of masthead
   * and footer, plus the 46rem nav collapse — and a substring check stays GREEN, because
   * `.masthead nav` and `footer .foot` also appear as top-level rules. That was the second
   * insufficient guard written for this same gap in two commits.
   *
   * Counting chrome rules within each context catches it: the `@media print` context goes
   * from N rules to absent, and absence of the context is itself the failure.
   */
  const chromeRulesByContext = (source) => {
    const byContext = new Map();
    const add = (context, node) => {
      const kept = node.prelude
        .replace(/\s+/g, ' ')
        .split(',')
        .map((x) => x.trim())
        .filter(isChromeSelector);
      if (!kept.length) return;
      if (!byContext.has(context)) byContext.set(context, []);
      byContext.get(context).push(...kept);
    };
    for (const node of parse(source)) {
      if (node.kind === 'rule') add('', node);
      if (node.kind === 'at-rule' && !/^@(font-face|keyframes|page|charset|import)/.test(node.prelude)) {
        for (const inner of parse(node.body)) {
          if (inner.kind === 'rule') add(node.prelude.replace(/\s+/g, ' ').trim(), inner);
        }
      }
    }
    return byContext;
  };

  const wanted = chromeRulesByContext(live);
  const got = chromeRulesByContext(css);

  assert.ok(
    wanted.size > 0 && [...wanted.values()].some((v) => v.length > 0),
    'found no chrome rules in src/styles.css at all — the parse or the predicate broke, and ' +
      'this test would otherwise pass having compared nothing'
  );

  for (const [context, selectors] of wanted) {
    const emitted = got.get(context) ?? [];
    s.count('tokens', selectors.length);

    if (emitted.length === 0) {
      s.fail(
        `every chrome rule in \`${context || 'the top level'}\` is missing from the derived ` +
          `sheet — ${selectors.length} rule(s), including ${selectors.slice(0, 3).join(', ')}. ` +
          `On every page that region of the chrome now falls back to whatever else styles ` +
          `it, and on /oal/v1.0/ that is the FROZEN 2026 sheet.`
      );
      continue;
    }
    for (const selector of selectors) {
      if (!emitted.includes(selector)) {
        s.fail(
          `the live sheet declares "${selector}" inside \`${context || 'the top level'}\` and ` +
            `the derived chrome sheet does not carry it there. It never reaches \`dropped\`, ` +
            `so nothing else notices.`
        );
      }
    }
  }

  if (undeclared.length) {
    s.fail(`the derived sheet uses undeclared custom properties: ${undeclared.join(', ')}`);
  }

  s.report(
    'the derived chrome stylesheet has stopped carrying the live design tokens. This is ' +
      'asserted directly rather than left to the build guards, because the build guards ' +
      'demonstrably do not catch it: `undeclared` only fires when a kept chrome rule ' +
      'references a missing token, and the three tokens this defect drops are referenced ' +
      'by none of them.'
  );
});

test('check 27 — the chrome selector boundary rule still rejects near-misses (controls)', () => {
  const s = survey({ controls: 'selectors the boundary rule was run against' });

  for (const yes of ['.masthead', '.masthead nav a', '.skip:focus', 'footer .rail', '.vstatus .sep']) {
    s.count('controls');
    if (!isChromeSelector(yes)) s.fail(`"${yes}" is chrome and was rejected`);
  }

  // The rule the module's docstring documents: anchored, with a boundary after the scope.
  for (const no of ['.skipped', '.masthead-inner', '.body footer', '.footer-note', 'p', '']) {
    s.count('controls');
    if (isChromeSelector(no)) {
      s.fail(
        `"${no}" is NOT chrome and was accepted. A predicate that matches beyond the ` +
          `chrome's own root can put a live rule inside a frozen document.`
      );
    }
  }

  s.report(
    'the chrome selector predicate no longer discriminates. Too loose and the chrome sheet ' +
      'reaches into <main>; too tight and the chrome ships unstyled.'
  );
});

test('check 27 — every rendered page links the derived chrome stylesheet', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  /**
   * The gap that made the whole arrangement bluffable: check 27's other tests query the
   * DOM and compare markup, and check 17 is satisfied by `/styles.css` alone. So a broken
   * or missing `chromeHref` would ship an unstyled header and footer on every page with
   * the entire suite green.
   */
  const s = survey({
    pages: 'rendered pages checked for the chrome stylesheet link',
    sheets: 'derived chrome stylesheets found in the build',
  });

  const built = (await readdir(path.join(TARGET, 'chrome')).catch(() => [])).map((f) => `chrome/${f}`);
  s.count('sheets', built.length);
  if (built.length !== 1) {
    s.fail(`expected exactly one derived chrome stylesheet in the build, found ${built.length}`);
    return s.report('the build did not emit a single chrome stylesheet');
  }

  await withSource(({ sources }) => {
    for (const { url, html } of sources) {
      s.count('pages');
      const chromeAt = html.indexOf(`<link rel="stylesheet" href="/${built[0]}">`);
      if (chromeAt < 0) {
        s.fail(
          `${url} does not link /${built[0]}. Its masthead, version status and footer are ` +
            `unstyled, and no other check in this suite would notice — the DOM is intact, ` +
            `only the stylesheet that governs it is absent.`
        );
        continue;
      }

      /**
       * Order is load-bearing, and `layout.njk` says so: "the frozen sheet is linked
       * first and governs `<main>`; the chrome sheet is linked second and cannot reach
       * inside it." Flipped, the frozen 2026 sheet wins every equal-specificity tie on
       * `/oal/v1.0/` and most of R1 reverts silently — the markup is identical, so every
       * other test here still passes.
       */
      // `styles.css` on a live page, `styles.<sha>.css` on a frozen version page since
      // 2026-08-15. Both spellings, because this regex pinned the bare name and went red
      // the moment the frozen sheet was fingerprinted — which is the correct behaviour and
      // is why it is widened here rather than loosened to `[^"]*\.css`, which would also
      // match the chrome sheet and let the order assertion pass against itself.
      const ownAt = html.search(/<link rel="stylesheet" href="[^"]*styles(?:\.[0-9a-f]+)?\.css">/);
      if (ownAt < 0 || chromeAt < ownAt) {
        s.fail(
          `${url}: the chrome stylesheet is linked before the page's own stylesheet. On a ` +
            `frozen version page that hands every equal-specificity tie to the published ` +
            `document's 2026 rules, so the live chrome silently reverts while the markup — ` +
            `and therefore every other test in this check — stays identical.`
        );
      }
    }
  });

  s.report(
    'a rendered page does not link the chrome stylesheet. R1 is that every page shows the ' +
      'same chrome; a page that links no chrome sheet shows none at all.'
  );
});

test('check 27 — the comparison still catches a diverged chrome (controls)', () => {
  const s = survey({ controls: 'planted divergences the comparison was run against' });

  const good = '<ul class="legal"><li>Ordoia</li><li>UK-based</li></ul>';

  // A permitted difference must NOT be reported: only the position marker moves.
  s.count('controls');
  const withCurrent = '<li><a href="/oal/" aria-current="page">the rubric</a></li>';
  const without = '<li><a href="/oal/">the rubric</a></li>';
  if (dropCurrent(withCurrent) !== dropCurrent(without)) {
    s.fail('aria-current="page" was not normalised away, so every page would compare as different');
  }

  // …and the marker must be the ONLY thing it swallows. The first draft of this check
  // also deleted the self-link, which made two correct pages compare as different.
  s.count('controls');
  const fourLinks = '<li><a href="/oal/">a</a></li><li><a href="/about/">b</a></li>';
  if (dropCurrent(fourLinks) !== fourLinks) {
    s.fail('the masthead normalisation is removing links, not just the position marker');
  }

  // A real divergence MUST be reported. This is the 2026-08-12 state in miniature.
  s.count('controls');
  const launch = '<p>Ordoia &middot; third-party assurance &middot; United Kingdom</p>';
  if (LEGAL.exec(launch)) s.fail('a sentence footer was matched as a field strip');

  s.count('controls');
  const changed = '<ul class="legal"><li>Ordoia</li><li>Elsewhere</li></ul>';
  if (dropCurrent(good) === dropCurrent(changed)) {
    s.fail('a changed field was not detected — the normalisation is eating real differences');
  }

  // The nav rule itself, in both shapes layout.njk produces. A page that renders its
  // own link is fine; a page missing somebody else's is not.
  const full = new Set(['/about/', '/oal/', '/scorecard/']);
  const permitted = (url, nav) =>
    [...full].filter((h) => !new Set(nav).has(h) && h !== url).length === 0;

  s.count('controls');
  if (!permitted('/about/', ['/about/', '/oal/', '/scorecard/'])) {
    s.fail('a page rendering every link, including its own, was reported as a defect');
  }
  s.count('controls');
  if (!permitted('/scorecard/', ['/about/', '/oal/'])) {
    s.fail('a page omitting only its own link was reported as a defect');
  }
  s.count('controls');
  if (permitted('/about/', ['/about/', '/oal/'])) {
    s.fail('a page missing another page\'s link was not reported — the rule is too loose');
  }

  s.report(
    'the chrome comparison no longer discriminates. A normalisation broad enough to ' +
      'swallow a changed field would make this check green over exactly the state it was ' +
      'written to catch.'
  );
});
