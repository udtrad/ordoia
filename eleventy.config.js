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

import { readFileSync, existsSync, statSync } from 'node:fs';
import { copyFile, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';

import { contrastRatio, AA_NON_TEXT } from './tests/lib/contrast.js';
// The snapshot's location and its asset list are owned by the freeze tool. Re-deriving
// them here is how a third PINNED_ASSET would get stored at publication and never served
// — the exact store-vs-serve divergence the pinning exists to close.
import { pinnedDir, PINNED_ASSETS } from './tools/freeze-version.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const readJSON = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

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

  return {
    partyWord: terminology.partyWord,
    partyWordCap: terminology.partyWordCap,

    version: oal.current,
    published: site.publicationDate,
    domain: site.domain,
    email: site.email,
    elsewhereLabel: site.elsewhere.label,
    elsewhereUrl: site.elsewhere.url,

    'audit.price': byKey.audit.price,
    'audit.duration': byKey.audit.duration,
    'topup.price': byKey['top-up'].price,
    'baseline.price': byKey.baseline.price,
    'review.price': byKey.review.price,
    'retainer.price': byKey.retainer.price,

    // §8's outstanding reconciliation, closed structurally: both lists are derived
    // from products.json `auditCoverage` against the rubric's own names, so the
    // rubric's names win by construction and cannot be re-broken by an edit here.
    'audit.inScope': named(inScope),
    'audit.outOfScope': named(outOfScope),
    auditCoverage: inScope.join(', '),
  };
}

const TOKENS = buildTokens();

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
    return vocabulary[key];
  });
}

/* -------------------------------------------------------------------------- */

const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false });

export default function (eleventyConfig) {
  const tokens = readTokens();
  validateRubric();

  eleventyConfig.addGlobalData('tokens', tokens);
  eleventyConfig.addGlobalData('buildTokens', TOKENS);

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
   * Today `/oal/v1.0/` is rendered from the live oal.json, which is correct while
   * v1.0 IS the live rubric and self-contained in its assets. The moment v1.1 is
   * published, generating v1.0's page from v1.1's data would silently restate a
   * historical methodology — the same defect class as restating a historical score,
   * and §13's first judging criterion.
   *
   * Freezing the content (a per-version copy plus a build that refuses to write to a
   * version directory that already exists) is pass-2 work. This is the guard that
   * makes shipping pass 2 non-optional: publish a second version and the build stops.
   */
  eleventyConfig.addFilter('requirePublishableVersion', (version) => {
    if (version !== oal.current) {
      throw new Error(
        `refusing to generate the /oal/v${version}/ snapshot from oal.json, which now ` +
          `describes v${oal.current}. A superseded version must be served from the content ` +
          `it was published with, not regenerated from the current rubric. Freeze v${version} ` +
          `to its own content and add the immutability guard before publishing v${oal.current}.`
      );
    }
    return version;
  });

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

  /** Dimensions belonging to a pair, in order. */
  eleventyConfig.addFilter('inPair', (dimensions, pair) =>
    pair.dimensions.map((n) => dimensions.find((d) => d.number === n))
  );

  eleventyConfig.addFilter('lower', (text) => String(text ?? '').toLowerCase());

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
   * The frozen version is self-contained: its own stylesheet, its own fonts, its own
   * favicon, at version-scoped paths. §5 — if /oal/v1.0 were styled by the live
   * stylesheet, a colour change in 2028 would silently alter a methodology document
   * that scorecards have been issued against, which is the same defect class as
   * restating a historical score.
   *
   * ── That paragraph described an intention this code did not implement ──────────────
   *
   * Until 2026-08-11 the copy below read from `src/`, so the "self-contained" snapshot
   * was self-contained in its *paths* and not in its *bytes*: every build re-derived
   * /oal/v1.0/styles.css from the living stylesheet. The comment above the copy warned
   * about the exact hazard the copy had.
   *
   * Nothing had noticed because check 21 hides it in the most misleading way possible —
   * it holds the built snapshot to a manifest, so the coupling never showed up as a
   * frozen page changing. It showed up as **the living stylesheet being un-editable**:
   * touch one declaration in src/styles.css and the freeze check goes red, on a file the
   * edit was never about. A legibility defect in the measure sat unfixable behind that
   * for exactly as long as anyone had wanted to fix it.
   *
   * ── What it does now ──────────────────────────────────────────────────────────────
   *
   * A version with bytes stored under `versions/v<n>/` is served from those bytes, and
   * `src/` cannot reach it. A version with no stored bytes is being published for the
   * first time, and live source *is* its published content — so the fallback is correct
   * rather than lenient. `tools/freeze-version.mjs` stores the bytes at the same moment
   * it records their hashes, which is what turns the first case on.
   *
   * Still generated rather than pinned: `index.html` and `favicon.svg`. Editing a layout
   * or the favicon will turn check 21 red and force this decision again, deliberately —
   * full content-pinning is the pass-2 work `requirePublishableVersion` describes below.
   * The line here is passthrough assets, which is where the silent re-derivation was.
   *
   * Copied rather than passed through, for two reasons: Eleventy takes one target per
   * passthrough source, and a real `copyFile` puts byte-identical bytes at both paths
   * rather than a re-serialised template. Font URLs inside styles.css are relative, so
   * the one file is correct at both locations without being edited.
   */
  eleventyConfig.on('eleventy.after', async ({ dir }) => {
    for (const v of oal.versions) {
      const target = path.join(ROOT, dir.output, 'oal', `v${v.version}`);
      const pinned = pinnedDir(v.version);
      const published = existsSync(pinned);
      const from = (rel) => (published ? path.join(pinned, rel) : path.join(ROOT, 'src', rel));

      await mkdir(target, { recursive: true });
      for (const asset of PINNED_ASSETS) {
        const source = from(asset);
        if (!existsSync(source)) continue;
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
