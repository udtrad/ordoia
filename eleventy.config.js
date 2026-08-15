/**
 * Ordoia — the build.
 *
 * BRIEF.md §4 asked for a generator that gives components and data files rather than
 * an application. Eleventy's data cascade gives §6's single source of truth directly:
 * one `oal.json` renders the rubric page, `scorecard.html` and the markdown scorecard
 * with no second templating layer. Nunjucks macros make the measure and the CTA real
 * components rather than copied markup. The output is static HTML with no client
 * runtime, no asset hashing and no hydration, so content works with JavaScript
 * disabled and View Source stays legible to someone pasting the rubric into their own
 * standards document (§13 item 3).
 *
 * ------------------------------------------------------------------------------
 * This file is also where §3's central instruction is carried out: the invariants
 * that RATIONALE.md states as conventions become build failures. Every `throw` below
 * is one of them. A rule that fails a build is enforced; a rule in a document is
 * asserted, and the site's own rubric scores that at OAL 1.
 *
 *   1. A `score` measure without level, depth, version and working paper.   §2
 *   2. A depth cap whose prose disagrees with its own number.               §6
 *   3. The eight dimensions not covered exactly once by the four pairs.     §6
 *   4. A copy fragment referenced by a key that does not exist.             §8
 *   5. A design token referenced by the build but absent from styles.css.   §7
 *   6. `--track` below 3:1 on either surface it is drawn on.                §7
 *
 * Numbers 1 and 6 are the two that also have checks behind them (2 and 7). That is
 * deliberate: the build defends the pages it renders, and the check defends the ones
 * it does not — a hand-written `.measure` in a future page would slip past the macro
 * and be caught by the suite.
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { copyFile, cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';

import { contrastRatio, AA_NON_TEXT } from './tests/lib/contrast.js';
// The snapshot's location and its asset list are owned by the freeze tool. Re-deriving
// them here is how a member of the frozen unit would get stored at publication and never
// served — the exact store-vs-serve divergence the freeze exists to close.
import {
  pinnedDir,
  PINNED_ASSETS,
  STORED_STYLESHEET,
  isFrozen,
  frozenMain,
  stylesheetFile,
  stylesheetHref,
  isStaleStylesheet,
} from './tools/freeze-version.mjs';
import { deriveChromeSheet } from './tools/chrome-sheet.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const readJSON = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

/* -------------------------------------------------------------------------- *
 * Prices.
 *
 * One function renders every price on the site, from an amount that is a number.
 *
 * ── Why a filter and not careful editing ──────────────────────────────────────
 *
 * Adding `+ VAT` by hand meant editing twenty rendered strings (six on Home,
 * fourteen on Services — the grid renders on both). The objection is not the
 * tedium; it is that a hand-edited set has no membership rule, so the price
 * somebody adds next month is added without the suffix and nothing notices.
 * Card 3's header had already drifted out of the data this way — see CHANGES.md
 * row 46, where a typed `From £3,000/month` sat beside an unused token.
 *
 * The retainer is why the ORDER is code rather than a convention: it renders
 * `£3,000/month + VAT` and never `£3,000 + VAT/month`. Written down, that is a
 * rule someone has to remember; written here, it is the only thing that can
 * happen.
 *
 * ── Why plain text with NBSP, and not `<span class="price">` ──────────────────
 *
 * Draft 5 §4.1 asks for `<span class="price">…</span>` with a `white-space:
 * nowrap` rule. Measured, that cannot work: a price reaches the page by two
 * routes, and markup survives neither. Copy fragments run through markdown-it
 * with `html: false`, which renders the span as `&lt;span class=&quot;price…`;
 * and the three card headers use no `md` filter at all, so Nunjucks' own
 * auto-escaping does the same. A `&nbsp;` entity is escaped to `&amp;nbsp;` on
 * that second route and would print literally.
 *
 * A literal U+00A0 survives both routes intact, and non-breaking spaces are
 * precisely the mechanism for "must never break after the `+`" — which is the
 * requirement the span and the CSS rule were there to satisfy. So the guarantee
 * is kept and the markup is dropped, rather than adding a second rendering path
 * for copy that would defeat the point of having one filter.
 * -------------------------------------------------------------------------- */

const NBSP = ' ';

/**
 * A published rate, as a reader sees it.
 *
 * Throws rather than degrades: a price cell that quietly renders empty is a
 * mis-sold engagement, and this file's header makes build failures the way
 * conventions are enforced here.
 */
export function renderPrice(product) {
  const label = product?.key ? `product "${product.key}"` : 'a product';
  const amount = product?.amount;

  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new Error(
      `${label} has no usable \`amount\` (got ${JSON.stringify(amount)}). Amounts in ` +
        `products.json are plain numbers — no currency symbol, no comma, no "from", ` +
        `no "/month". Those are rendering decisions and they live in renderPrice().`
    );
  }
  if (product.period !== undefined && typeof product.period !== 'string') {
    throw new Error(`${label} has a non-string \`period\`: ${JSON.stringify(product.period)}`);
  }

  const figure = `£${amount.toLocaleString('en-GB')}`;
  // The floor word is joined with a non-breaking space for the same reason the suffix is.
  // With an ordinary space the widened string broke there: measured at 1280px, the Review
  // cell went from `from £9,000` / `· 3 weeks` to `from` / `£9,000 + VAT · 3` / `weeks`,
  // orphaning "from" on its own line above the figure it modifies, where it means nothing.
  const floor = product.from ? `from${NBSP}` : '';
  const period = product.period ? `/${product.period}` : '';

  // VAT is unconditional and has no opt-out parameter. Every published rate on this
  // site excludes VAT, so a call site able to render one without the suffix is a call
  // site able to be wrong — and an option defaulting the right way is still an option
  // somebody can pass. The suffix goes last, after the period: `£3,000/month + VAT`,
  // never `£3,000 + VAT/month`. That ordering is the whole reason this is a function.
  return `${floor}${figure}${period}${NBSP}+${NBSP}VAT`;
}

const site = readJSON('src/_data/site.json');
const oal = readJSON('src/_data/oal.json');
const products = readJSON('src/_data/products.json');
const terminology = readJSON('src/_data/terminology.json');

/* -------------------------------------------------------------------------- *
 * Design tokens, read out of the stylesheet rather than restated beside it.
 *
 * §7 lists the favicon's hardcoded `#E6EAE7` as a latent defect. Parameterising it
 * from a second file would only move the defect, so the stylesheet stays the one
 * source and the build reads it. Drift becomes impossible rather than unlikely.
 * -------------------------------------------------------------------------- */

const REQUIRED_TOKENS = ['ground', 'raised', 'ink', 'slate', 'untravelled', 'track', 'floor'];

function readTokens() {
  const css = readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
  const root = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (!root) throw new Error('styles.css: no :root block, so no tokens to read');

  const tokens = {};
  for (const m of root[1].matchAll(/--([a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[m[1]] = m[2];
  }

  const missing = REQUIRED_TOKENS.filter((t) => !tokens[t]);
  if (missing.length) {
    throw new Error(
      `styles.css is missing colour tokens the build depends on: --${missing.join(', --')}. ` +
        `The favicon and the contrast guarantee are generated from these.`
    );
  }

  // §7 / check 7: the measure's rule and its minor ticks are load-bearing graphics
  // under WCAG 1.4.11, not decoration. They are drawn in --track on both surfaces,
  // so --track has to clear 3:1 against both. This is the same assertion check 7
  // makes against the rendered page; making it here as well means the failure
  // arrives at the moment somebody edits the colour, not two minutes later.
  for (const surface of ['ground', 'raised']) {
    const ratio = contrastRatio(tokens.track, tokens[surface]);
    if (ratio === null || ratio < AA_NON_TEXT) {
      throw new Error(
        `--track ${tokens.track} is ${ratio === null ? 'unparseable' : ratio.toFixed(2) + ':1'} ` +
          `on --${surface} ${tokens[surface]}, below the ${AA_NON_TEXT}:1 that WCAG 1.4.11 ` +
          `requires of a graphic you need in order to read the content. The measure IS the ` +
          `content here.`
      );
    }
  }

  return tokens;
}

/* -------------------------------------------------------------------------- *
 * oal.json invariants
 * -------------------------------------------------------------------------- */

function validateRubric() {
  const numbers = oal.dimensions.map((d) => d.number);
  const paired = oal.pairs.flatMap((p) => p.dimensions);

  const expected = [1, 2, 3, 4, 5, 6, 7, 8];
  if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
    throw new Error(`oal.json: dimensions must be numbered 1-8 in order, got ${numbers.join(', ')}`);
  }
  if (JSON.stringify([...paired].sort((a, b) => a - b)) !== JSON.stringify(expected)) {
    throw new Error(
      `oal.json: the four pairs must cover all eight dimensions exactly once, got ${paired.join(', ')}. ` +
        `The pairing is how the scorecard is read.`
    );
  }

  for (const d of oal.dimensions) {
    if (!oal.pairs.some((p) => p.name === d.pair && p.dimensions.includes(d.number))) {
      throw new Error(`oal.json: dimension ${d.number} claims pair "${d.pair}", which does not list it`);
    }
    if (d.levels.length !== oal.levels.length) {
      throw new Error(`oal.json: dimension ${d.number} has ${d.levels.length} level descriptors, expected ${oal.levels.length}`);
    }
    // The cap is prose and the maximum is a number. They can disagree, and a depth
    // cap that says one thing and means another is a mis-sold engagement.
    const stated = new RegExp(`\\bOAL ${d.inspectedMax}\\b`);
    if (!stated.test(d.inspectedCap)) {
      throw new Error(
        `oal.json: dimension ${d.number} has inspectedMax ${d.inspectedMax} but its cap prose ` +
          `does not state "OAL ${d.inspectedMax}": "${d.inspectedCap.slice(0, 70)}…"`
      );
    }
    if (d.testedMax < d.inspectedMax) {
      throw new Error(`oal.json: dimension ${d.number} caps tested depth below inspected depth`);
    }
  }
}

/* -------------------------------------------------------------------------- *
 * Copy fragments
 *
 * §8: the copy is held in content files, not in templates. Each file in
 * src/_data/copy/ is split on lines beginning `@@ `; everything before the first
 * delimiter is a note to whoever opens the file and is never rendered.
 * -------------------------------------------------------------------------- */

function parseFragments(contents) {
  const out = {};
  let key = null;
  let buffer = [];

  const flush = () => {
    if (key) out[key] = buffer.join('\n').trim();
  };

  for (const line of contents.split('\n')) {
    const delimiter = line.match(/^@@\s+(\S+)\s*$/);
    if (delimiter) {
      flush();
      key = delimiter[1];
      buffer = [];
    } else if (key) {
      buffer.push(line);
    }
  }
  flush();
  return out;
}

/**
 * `{token}` substitution.
 *
 * Deliberately not a template engine. A copy file is a content file, and a content
 * file that can branch and loop has quietly become a template again — which is the
 * thing §8 forbids. The whole vocabulary is here, it is flat, and an unknown token
 * fails the build rather than rendering as literal braces.
 */
function buildTokens() {
  const byKey = Object.fromEntries(products.products.map((p) => [p.key, p]));
  const dims = Object.fromEntries(oal.dimensions.map((d) => [d.number, d]));
  const named = (numbers) => {
    const names = numbers.map((n) => dims[n].name.toLowerCase());
    return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
  };
  const inScope = products.auditCoverage;
  const outOfScope = oal.dimensions.map((d) => d.number).filter((n) => !inScope.includes(n));

  // A price that opens a unit needs its first letter up — card 3's header is a
  // `·`-separated label strip and "from £3,000/month" would be the only field on the
  // page starting lower case. The same shape as partyWord/partyWordCap below, and for
  // the same reason: the capital is a rendering concern, so it does not go in the data
  // where it would leak into the grid cell, which is mid-sentence and correct as is.
  const capitalise = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

  return {
    partyWord: terminology.partyWord,
    partyWordCap: terminology.partyWordCap,

    version: oal.current,
    published: site.publicationDate,
    // The registration belongs to the current legal person and does not survive
    // incorporation, so it is read from the one record that holds the entity with it
    // rather than typed anywhere. Check 25 asserts it was never typed.
    vatNumber: site.legalEntity.vatNumber,
    domain: site.domain,
    email: site.email,
    name: site.name,

    // Every price token goes through the same renderer the templates use, so copy
    // and markup cannot disagree about what a price looks like.
    'audit.price': renderPrice(byKey.audit),
    'audit.duration': byKey.audit.duration,
    'topup.price': renderPrice(byKey['top-up']),
    'baseline.price': renderPrice(byKey.baseline),
    'review.price': renderPrice(byKey.review),
    'retainer.price': renderPrice(byKey.retainer),
    'retainer.priceCap': capitalise(renderPrice(byKey.retainer)),

    // §8's outstanding reconciliation, closed structurally: both lists are derived
    // from products.json `auditCoverage` against the rubric's own names, so the
    // rubric's names win by construction and cannot be re-broken by an edit here.
    'audit.inScope': named(inScope),
    'audit.outOfScope': named(outOfScope),
    auditCoverage: inScope.join(', '),
  };
}

const TOKENS = buildTokens();

/**
 * The footer's field list, resolved and filtered, ready to render.
 *
 * Draft 6 §5.4. One rule closes four separate defects, which is the reason it is a filter
 * over the data rather than four conditions in the template:
 *
 *   - `VAT registration no.` left standing with nothing after it. **A field is one unit**:
 *     the label and its value drop together or not at all. The registration belongs to the
 *     current legal person and does not survive incorporation (VAT68 is open), so an empty
 *     `vatNumber` is a scheduled state, not a hypothetical one.
 *   - A leading separator, when the first field is the one that dropped.
 *   - A trailing separator, when the last field is.
 *   - The known empty-anchor defect — a field with an `href` and no text rendered `<a></a>`
 *     and the build succeeded. Cosmetic until the array contained a link; it does now.
 *
 * The emptiness test is applied to the **token**, before substitution, and that distinction
 * is the whole point. Testing the resolved string instead passes `VAT registration no. `
 * — non-empty, and a published label with nothing behind it.
 */
export function footerLine(fields, extra = {}) {
  const TOKEN = /\{[A-Za-z][A-Za-z0-9.]*\}/g;

  /** The resolved string, or null if any token in it resolved to nothing. */
  const resolve = (raw, where) => {
    const text = String(raw ?? '');
    for (const token of text.match(TOKEN) ?? []) {
      if (!substitute(token, where, extra).trim()) return null;
    }
    const done = substitute(text, where, extra).trim();
    return done || null;
  };

  const out = [];
  for (const field of fields ?? []) {
    const text = resolve(field.text, 'site.json footerFields text');
    if (text === null) continue;

    if (field.href === undefined) {
      out.push({ text });
      continue;
    }
    const href = resolve(field.href, 'site.json footerFields href');
    // A link whose target did not resolve is worse than a missing field: it renders as
    // an anchor a reader can click into nothing.
    if (href === null) continue;
    out.push({ text, href });
  }
  return out;
}

function substitute(text, where, extra = {}) {
  const vocabulary = { ...TOKENS, ...extra };
  return text.replace(/\{([A-Za-z][A-Za-z0-9.]*)\}/g, (whole, key) => {
    if (!(key in vocabulary)) {
      throw new Error(
        `${where}: unknown copy token "{${key}}". The vocabulary is fixed in ` +
          `eleventy.config.js buildTokens(); add it there, pass it at the call site, ` +
          `or fix the typo.`
      );
    }
    // A KNOWN token holding null or undefined resolves to nothing, never to the strings
    // "null" or "undefined". An unknown token still throws above — the two cases are
    // different and only the first is a value question. Found by check 30's unit test:
    // `{ vatNumber: null }` published "VAT registration no. null".
    return String(vocabulary[key] ?? '');
  });
}

/* -------------------------------------------------------------------------- */

const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });

/* -------------------------------------------------------------------------- *
 * The chrome stylesheet.
 *
 * Derived from `src/styles.css` — see tools/chrome-sheet.mjs for why it is derived and
 * not written by hand, and for the three ways the derivation fails closed.
 *
 * Fingerprinted, because it is the one stylesheet on this site whose URL may change: that
 * is what lets it keep a year of `immutable` caching under R3 while still reaching a
 * returning visitor the moment the chrome is redesigned. The live `styles.css` stays
 * unhashed and unminified on purpose — somebody will read it (§4) — and takes an explicit
 * revalidating rule in `_headers` instead.
 * -------------------------------------------------------------------------- */

function buildChromeSheet() {
  const { css, dropped, undeclared } = deriveChromeSheet(
    readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8')
  );

  if (undeclared.length) {
    throw new Error(
      `the derived chrome stylesheet uses custom properties it does not declare: ` +
        `${undeclared.join(', ')}. On /oal/v1.0/ those would resolve against the FROZEN ` +
        `:root, so the live chrome would silently render in a published document's 2026 ` +
        `palette and drift further with every redesign. Add them to the chrome scope in ` +
        `tools/chrome-sheet.mjs rather than letting the cascade guess.`
    );
  }
  if (!/\.masthead\b/.test(css) || !/\bfooter\b/.test(css)) {
    throw new Error(
      'the derived chrome stylesheet styles no masthead or no footer, which means the ' +
        'selector predicate stopped matching. An empty chrome sheet ships an unstyled ' +
        'header and footer on every page, and the build should stop rather than emit it.'
    );
  }
  // Never `:root`. Two `:root` blocks on one page merge rather than isolate, and the
  // frozen <main> would inherit the live palette while every byte check stayed green.
  //
  // Tested against the rules with comments stripped, because the first version of this
  // guard matched the sheet's own header — which explains, in prose, that it declares no
  // `:root`. A guard that fires on its own documentation is a guard nobody trusts twice.
  if (/(^|[\s,}])[:]root\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    throw new Error(
      'the derived chrome stylesheet declares :root. On /oal/v1.0/ that merges with the ' +
        "frozen sheet's :root, last one wins, and the published rubric silently takes the " +
        'live palette and type scale. This is the failure R2 is designed against.'
    );
  }

  const digest = createHash('sha256').update(css).digest('hex').slice(0, 8);
  // A directory, not `chrome.<sha>.css` at the root, so `_headers` can match it with a
  // TRAILING splat (`/chrome/*`). The previous form needed `/chrome.*.css` — a splat with
  // a literal suffix after it, which Cloudflare documents for the trailing position only.
  // If the host does not honour a mid-pattern splat, that rule matches nothing and the
  // fingerprinted sheet silently drops to the zone's Browser Cache TTL, which is the same
  // 4-hour default this file's own `/styles.css` comment was written to close.
  return { css, dropped, file: `chrome/${digest}.css`, href: `/chrome/${digest}.css` };
}

/**
 * Derived per build, not once per process.
 *
 * `const CHROME = buildChromeSheet()` at module scope was correct for `npm run build` and
 * wrong for `eleventy --serve` and `--watch`, which reuse the config module: measured on
 * 2026-08-12, editing `.masthead`'s padding under `--watch` updated `_site/styles.css` and
 * left the chrome sheet at its old bytes, old fingerprint and old `<link>`. So this
 * module's claim that "a chrome edit reaches /oal/v1.0/ on the next build with nothing to
 * remember" was false in the dev loop — the one place a designer actually edits the
 * chrome. Derivation costs 0.67 ms, so hoisting it bought nothing it was worth.
 */
let CHROME = buildChromeSheet();

export default function (eleventyConfig) {
  const tokens = readTokens();
  validateRubric();

  eleventyConfig.addGlobalData('tokens', tokens);
  eleventyConfig.addGlobalData('buildTokens', TOKENS);

  // Every page links this, so one chrome edit reaches every address on the site —
  // including a frozen version's, which is R1. A function rather than a value, so a watch
  // rebuild picks up the re-derived fingerprint instead of the one from process start.
  eleventyConfig.addGlobalData('chromeHref', () => CHROME.href);

  // Re-derive before every build, including watch rebuilds. `src/styles.css` is already
  // watched as a passthrough source, so no addWatchTarget is needed.
  eleventyConfig.on('eleventy.before', () => {
    CHROME = buildChromeSheet();
  });

  // §6: stable filenames carrying the methodology version.
  eleventyConfig.addGlobalData(
    'scorecardMarkdown',
    `/scorecard/ordoia-scorecard-audit-oal-v${oal.current}.md`
  );
  eleventyConfig.addGlobalData(
    'scorecardPdf',
    `/scorecard/ordoia-scorecard-audit-oal-v${oal.current}.pdf`
  );

  // The dimensions an audit-scope engagement does not reach, in order. The scorecard
  // prints all eight and marks these four; the services page names them. Derived, so
  // that changing `auditCoverage` changes both.
  eleventyConfig.addGlobalData(
    'auditGaps',
    oal.dimensions.map((d) => d.number).filter((n) => !products.auditCoverage.includes(n))
  );

  /**
   * A version snapshot may only be generated from the data it was published from.
   *
   * Generating a superseded version's page from a newer rubric would silently restate a
   * historical methodology — the same defect class as restating a historical score, and
   * §13's first judging criterion.
   *
   * ── Rewritten 2026-08-12; the version above described a model that had already gone ──
   *
   * It said `/oal/v1.0/` "is rendered from the live oal.json", that the version is
   * "self-contained in its assets", and that freezing the content is "pass-2 work" that
   * had not shipped. All three were false when read: v1.0 has been frozen since
   * 2026-08-10 and its `<main>` comes from `versions/v1.0/main.html` through the
   * `frozenMain` filter; `self-contained` is the exact word DEPLOY.md now retires,
   * because the page links a shared `/chrome.<sha>.css`; and the `!isFrozen(version)`
   * clause one line below IS the pass-2 work the comment said was outstanding.
   *
   * What the filter guards now is the remaining case: a version that is no longer current
   * and has NOT been frozen, which would otherwise be regenerated out of today's data.
   * A frozen version needs no such guard — it is served from its stored fragment and
   * `oal.json` cannot reach it.
   */
  eleventyConfig.addFilter('requirePublishableVersion', (version) => {
    if (version !== oal.current && !isFrozen(version)) {
      throw new Error(
        `refusing to generate the /oal/v${version}/ page from oal.json, which now ` +
          `describes v${oal.current}. A superseded version must be served from the content ` +
          `it was published with, not regenerated from the current rubric. Freeze v${version} ` +
          `to its own content — \`node tools/freeze-version.mjs ${version}\` against the ` +
          `build that was deployed — before publishing v${oal.current}.`
      );
    }
    return version;
  });

  /** True when a version has stored bytes and must be served from them. */
  eleventyConfig.addFilter('isFrozen', (version) => isFrozen(version));

  // The content-addressed stylesheet a version page links. One function decides this name
  // for the build, the template and every check that resolves it — see `stylesheetFile`.
  eleventyConfig.addFilter('stylesheetHref', (version) => stylesheetHref(version));

  /**
   * The versions that are no longer current, in declaration order.
   *
   * The changelog rail printed `Superseded: None` from a hand-typed copy fragment until
   * 2026-08-12. Publishing v1.1 would have left that rail saying "None" while the index
   * table three sections below rendered `Superseded` from the record — one page, two
   * surfaces, both reading as authoritative, which CHECKS.md records as worse than merely
   * being out of date. Deriving it is what makes publishing a version ONE edit.
   *
   * Renders identically today (there are no superseded versions, so the rail still reads
   * "None"), which is the point: the fix changes what can go wrong, not what is shown.
   */
  eleventyConfig.addFilter('supersededVersions', (versions) =>
    versions.filter((v) => String(v.status).toLowerCase() !== 'current')
  );

  /**
   * One version's record, by number.
   *
   * The single source of truth for a version's standing. Publishing v1.1 flips v1.0
   * everywhere in one edit — its own page, the changelog, /oal/ — because every surface
   * reads this record rather than restating it. A missing version is a build failure
   * rather than an empty stamp: a version page that renders no status is exactly the
   * state check 29 was written against, and it should not be reachable by a typo.
   */
  eleventyConfig.addFilter('versionRecord', (versions, version) => {
    const found = versions.find((v) => v.version === version);
    if (!found) {
      throw new Error(
        `oal.json declares no version "${version}", so its page cannot state its standing. ` +
          `Known: ${versions.map((v) => v.version).join(', ')}.`
      );
    }
    if (!found.status) {
      throw new Error(
        `oal.json's record for v${version} has no \`status\`. A version page must state ` +
          `whether it is the current rubric; rendering it blank publishes the question ` +
          `rather than the answer.`
      );
    }
    return found;
  });

  /**
   * The stored `<main>` fragment for a published version.
   *
   * This is where the freeze actually happens, and the ordering is the point. Before
   * 2026-08-12 the build rendered `rubric.njk` into a full page and then *overwrote the
   * file* with stored bytes. That worked, and it made two things true only by accident:
   * `requirePublishableVersion` guarded output nobody read, and any regeneration recipe
   * could re-record the old fragment and report success having changed nothing —
   * CHANGES.md row 43, found by review rather than by the drill that should have caught it.
   *
   * Emitting the fragment through the template instead means a frozen version never
   * renders `rubric.njk` at all, so rubric prose has no path onto a frozen page. Drill 3
   * is then true by construction rather than by vigilance.
   */
  eleventyConfig.addFilter('frozenMain', (version) => frozenMain(version));

  eleventyConfig.addDataExtension('md', {
    parser: (contents) => parseFragments(contents),
    read: true,
  });

  /**
   * Pull one fragment by key. A missing key is a build failure, not an empty div.
   *
   * `extra` adds call-site values to the token vocabulary — a per-dimension maximum,
   * say — so that a line like the scorecard's stamp can live in the copy file whole
   * rather than being assembled out of literals in a template. §8 again: the wording
   * of the most scrutinised line on the artifact belongs where wording is reviewed.
   */
  eleventyConfig.addFilter('frag', function (fragments, key, extra) {
    if (!fragments || !(key in fragments)) {
      const known = fragments ? Object.keys(fragments).join(', ') : '(no fragments loaded)';
      throw new Error(`copy fragment "${key}" does not exist. Known keys: ${known}`);
    }
    return substitute(fragments[key], `copy fragment "${key}"`, extra);
  });

  /**
   * Markdown.
   *
   * `<code>` becomes `<span class="mono">`, because in this design backticks mean
   * exactly what RATIONALE.md says monospace means: somewhere a human compares
   * characters one at a time — a hash, a reference, an address. There is no code on
   * this site, so `<code>` would be the wrong element as well as the wrong style.
   */
  const monospace = (html) =>
    html.replace(/<code>/g, '<span class="mono">').replace(/<\/code>/g, '</span>');

  eleventyConfig.addFilter('md', (text) => monospace(md.render(String(text ?? ''))));
  eleventyConfig.addFilter('mdi', (text) => monospace(md.renderInline(String(text ?? ''))));

  /**
   * A markdown list, carrying the class its section needs.
   * RATIONALE.md's rule rule: lists carry no rules, so the class is only ever
   * spacing and never a border.
   */
  eleventyConfig.addFilter('mdList', (text, className) => {
    const html = md.render(String(text ?? ''));
    if (!html.startsWith('<ul>')) {
      throw new Error(`mdList: fragment did not render as a list — "${html.slice(0, 60)}"`);
    }
    return html.replace('<ul>', `<ul class="${className}">`);
  });

  /**
   * `- Label | value` lines, as rows.
   * Used by the About page's apparatus table and the scorecard's field sets, where
   * the copy is a label and a value rather than a paragraph. `value` may be empty:
   * a blank scorecard field is a field, not a missing one.
   */
  eleventyConfig.addFilter('rows', (text) =>
    String(text ?? '')
      .split('\n')
      .map((line) => line.replace(/^-\s+/, '').trim())
      .filter(Boolean)
      .map((line) => {
        const [label, ...rest] = line.split('|');
        return { label: label.trim(), value: rest.join('|').trim() };
      })
  );

  /** Substitute tokens in a template-side string (link text, aria labels). */
  eleventyConfig.addFilter('tok', (text) => substitute(String(text ?? ''), 'template string'));

  /**
   * The footer's fields, resolved and filtered. See `footerLine` above.
   *
   * Filtering happens here rather than in the template because the template has to know
   * which field is LAST in order to place separators between fields and after none of
   * them — and "last" only means anything once the empty ones are gone.
   */
  eleventyConfig.addFilter('footerLine', (fields) => footerLine(fields));

  /** Dimensions belonging to a pair, in order. */
  eleventyConfig.addFilter('inPair', (dimensions, pair) =>
    pair.dimensions.map((n) => dimensions.find((d) => d.number === n))
  );

  eleventyConfig.addFilter('lower', (text) => String(text ?? '').toLowerCase());

  /**
   * A product's price, rendered. See renderPrice() at the top of this file for why
   * the suffix rule lives in code and why the output carries no markup.
   */
  eleventyConfig.addFilter('price', (product) => renderPrice(product));

  /** One product by key. Unknown key is a build failure, not an empty price cell. */
  eleventyConfig.addFilter('product', (list, key) => {
    const found = list.find((p) => p.key === key);
    if (!found) throw new Error(`products.json has no product "${key}"`);
    return found;
  });

  /** Dimensions by number, in the order given. */
  eleventyConfig.addFilter('dims', (dimensions, numbers) =>
    numbers.map((n) => {
      const found = dimensions.find((d) => d.number === n);
      if (!found) throw new Error(`oal.json has no dimension ${n}`);
      return found;
    })
  );

  /**
   * The four qualifiers of a score, as a stamp.
   *
   * RATIONALE.md: the score variant "does not render without them". This is where
   * that stops being a sentence in a document. Called by the measure macro; throws
   * before a page can be written that shows a level with a qualifier missing —
   * including in a decorative mock or a test fixture (§2).
   */
  eleventyConfig.addFilter('requireQualifiers', (stamp, label) => {
    const required = {
      level: /\bOAL\s*[0-3]\b|\blevel\b/i,
      depth: /\b(inspected|tested|sustained)\b/i,
      version: /\bv\d+\.\d+\b/i,
      'working paper': /\bworking paper\b|\bWP/i,
    };
    const missing = Object.entries(required)
      .filter(([, re]) => !re.test(stamp))
      .map(([name]) => name);
    if (missing.length) {
      throw new Error(
        `measure "${label}": the score variant is showing a level with no ${missing.join(', ')}. ` +
          `A score is a statement about a named system, under a named rubric version, on a date, ` +
          `at a named depth — dropping any of the four makes it something else.`
      );
    }
    return stamp;
  });

  // Static assets. The stylesheet is copied unhashed and unminified: someone will
  // read it (§4), and a version snapshot has to be reproducible byte for byte in
  // 2032 (§13 item 1).
  eleventyConfig.addPassthroughCopy({ 'src/styles.css': 'styles.css' });
  eleventyConfig.addPassthroughCopy({ 'src/fonts': 'fonts' });

  // Deploy posture, as files the host reads. Both Netlify and Cloudflare Pages
  // consume this exact syntax, so the repo does not have to pick one. §9, and
  // check 14 parses them so they cannot rot into decoration.
  eleventyConfig.addPassthroughCopy({ 'src/_headers': '_headers' });
  eleventyConfig.addPassthroughCopy({ 'src/_redirects': '_redirects' });

  /**
   * A published version's rendering, frozen: its own stylesheet, its own fonts, its own
   * favicon, at version-scoped paths. §5 — if /oal/v1.0 were styled by the live
   * stylesheet, a colour change in 2028 would silently alter a methodology document
   * that scorecards have been issued against, which is the same defect class as
   * restating a historical score.
   *
   * ── That paragraph described an intention this code did not implement ──────────────
   *
   * Until 2026-08-11 the copy below read from `src/`, so the snapshot was frozen in its
   * *paths* and not in its *bytes*: every build re-derived /oal/v1.0/styles.css from the
   * living stylesheet. The comment above the copy warned about the exact hazard the copy
   * had. Nothing had noticed, because check 21 held the *built* snapshot to a manifest, so
   * the coupling never showed up as a frozen page changing — it showed up as **the living
   * stylesheet being un-editable**, on a file the edit was never about.
   *
   * ── 2026-08-12: what is frozen is the content and its rendering, not the document ──
   *
   * Pinning the whole `index.html` closed that and froze the page's **chrome** with it.
   * Measured: eight of nine pages carried the footer field list with the VAT registration
   * and /oal/v1.0/ carried the launch footer — a sentence the repository had already
   * withdrawn. One site, two footers, and the frozen one advertising the site as it stood
   * at publication.
   *
   * So the unit is now the `<main>` fragment plus the assets that render it. The fragment
   * is emitted through the template (see the `frozenMain` filter above); the assets are
   * copied here. **`index.html` is no longer stored, no longer pinned and no longer in the
   * manifest** — it is rendered live, like every other page, and its chrome tracks the site.
   *
   * A version with bytes stored under `versions/v<n>/` is served from those bytes, and
   * `src/` cannot reach them. A version with no stored bytes is being published for the
   * first time, and live source *is* its published content — so the fallback is correct
   * rather than lenient. `tools/freeze-version.mjs` stores the bytes at the same moment it
   * records their hashes, which is what turns the first case on.
   *
   * Copied rather than passed through, for two reasons: Eleventy takes one target per
   * passthrough source, and a real `copyFile` puts byte-identical bytes at both paths
   * rather than a re-serialised template. Font URLs inside styles.css are relative, so
   * the one file is correct at both locations without being edited.
   */
  eleventyConfig.on('eleventy.after', async ({ dir }) => {
    const out = path.join(ROOT, dir.output);

    // The chrome sheet, fingerprinted. Written here rather than passed through because
    // it is derived rather than copied — there is no source file to point at.
    //
    // Stale fingerprints are removed first. Eleventy does not clean its output directory,
    // so without this an edited chrome sheet leaves the previous one behind and a local
    // `_site` accumulates one file per edit — which check 27b then reports as "expected
    // exactly one derived chrome stylesheet, found 4". Found while running drill 4, where
    // the mutate-and-revert cycle produces exactly that.
    const chromeDir = path.join(out, 'chrome');
    await mkdir(chromeDir, { recursive: true });
    for (const stale of await readdir(chromeDir)) {
      if (path.join('chrome', stale) !== CHROME.file) await rm(path.join(chromeDir, stale));
    }
    await writeFile(path.join(out, CHROME.file), CHROME.css, 'utf8');

    for (const v of oal.versions) {
      const target = path.join(out, 'oal', `v${v.version}`);
      const pinned = pinnedDir(v.version);
      const published = existsSync(pinned);
      const from = (rel) => (published ? path.join(pinned, rel) : path.join(ROOT, 'src', rel));

      await mkdir(target, { recursive: true });
      for (const asset of PINNED_ASSETS) {
        const source = from(asset);
        if (!existsSync(source)) continue;

        // The stylesheet is served content-addressed — `styles.<sha>.css` rather than
        // `styles.css` — so that `immutable` stays honest across a re-freeze. The STORED
        // name is unchanged; only the served one moves. See `stylesheetFile` in
        // tools/freeze-version.mjs for why, and `src/_headers` for why it stays in the
        // version's own directory rather than a `css/` subdirectory of it.
        //
        // This comment said `css/<sha>.css` until 2026-08-15 — the abandoned first design,
        // rejected because a subdirectory re-bases the stylesheet's relative `@font-face`
        // URLs and check 17 caught four fonts fetched from a path that exists nowhere
        // (`CHANGES.md` row 134). The same stale sentence was fixed in `src/_headers` and
        // survived here, so it also pointed the reader AT `src/_headers` as corroboration
        // for a claim that file explicitly contradicts.
        if (asset === STORED_STYLESHEET) {
          const served = stylesheetFile(readFileSync(source));

          // Stale fingerprints go first, for the reason the chrome sheet's do: Eleventy
          // does not clean its output, so without this a local `_site` accumulates one
          // frozen stylesheet per edit and every one of them is served `immutable`. The
          // bare `styles.css` is swept by the same pass — it is the pre-fingerprint name,
          // and it is the exact URL that used to carry a year of immutable caching.
          for (const stale of await readdir(target)) {
            if (isStaleStylesheet(stale, served)) await rm(path.join(target, stale), { force: true });
          }
          await copyFile(source, path.join(target, served));
          continue;
        }

        const to = path.join(target, asset);
        if (statSync(source).isDirectory()) await cp(source, to, { recursive: true });
        else await copyFile(source, to);
      }
    }
  });

  eleventyConfig.setTemplateFormats(['njk']);

  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
      data: '_data',
    },
    markdownTemplateEngine: false,
    htmlTemplateEngine: 'njk',
    templateFormats: ['njk'],
  };
}
