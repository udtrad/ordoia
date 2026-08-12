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
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { IS_HANDOVER, TARGET, withSite, withSource } from '../lib/harness.js';
import { survey } from '../lib/population.js';

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

  const sheets = (await readdir(TARGET)).filter((f) => /^chrome\..*\.css$/.test(f));
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
