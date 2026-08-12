/**
 * The chrome stylesheet, derived from the live one.
 *
 * ── What this is for ──────────────────────────────────────────────────────────────
 *
 * R1 and R2 pull in opposite directions on exactly one page. `/oal/v1.0/` must render
 * **live chrome** (so a header or footer change reaches it without a version event) around
 * **frozen content** (so a redesign cannot restyle a published methodology document). Two
 * stylesheets, two scopes, one page.
 *
 * The frozen sheet is `versions/v1.0/styles.css` — byte-identical to what was published,
 * still hashed by the manifest, still `immutable`. It governs `<main>`. This module emits
 * the other one: a chrome-only sheet that governs the masthead, the version status strip
 * and the footer, and **cannot reach inside `<main>`**.
 *
 * ── Why derived, and not written by hand ──────────────────────────────────────────
 *
 * A hand-maintained chrome sheet is a second copy of the chrome's rules, and a second copy
 * drifts. When it drifts, R1 fails silently: the frozen page keeps rendering last year's
 * footer styling while every other page moves, which is the *styling* version of the exact
 * defect this commit exists to fix. Deriving it means a chrome edit in `src/styles.css`
 * reaches `/oal/v1.0/` on the next build with nothing to remember.
 *
 * ── Why the derivation is safe: it fails closed, three ways ───────────────────────
 *
 * A silent under-match here would ship an unstyled footer on the site's most-cited page,
 * so none of this is allowed to guess:
 *
 *   1. `parse()` asserts that its own nodes concatenate back to the input **byte for
 *      byte**. A scanner that lost a rule cannot pretend otherwise.
 *   2. Selectors are matched against an explicit predicate, and anything the predicate
 *      does not recognise is **dropped rather than guessed at** — with the dropped set
 *      returned, so the caller can assert on it.
 *   3. Check 27b loads the rendered page and asserts that **no selector in the emitted
 *      sheet matches any element inside `<main>`**. That is the isolation claim measured
 *      against the real DOM rather than argued from the source.
 *
 * ── The `:root` trap this is designed around ──────────────────────────────────────
 *
 * Two `:root` blocks on one page do not isolate — they merge, last one wins, and the
 * frozen `<main>` silently inherits the live palette and type scale while every byte check
 * stays green. So this sheet **never emits `:root`**. The custom properties the chrome
 * needs are re-emitted on the chrome's own scope selectors, where they cannot reach
 * `<main>` and cannot be reached by it.
 *
 * The same reasoning applies to everything the chrome currently *inherits* from `body`:
 * font family, size, line height, colour. On the frozen page `body` is styled by the
 * frozen sheet, so an inherited chrome would render in 2026's type scale forever. Those
 * declarations are re-emitted on the chrome scope too — §3.1's "the scope is
 * self-sufficient", applied to the chrome rather than to the content.
 */

/** The scope selectors the chrome is allowed to reach, and nothing else. */
export const CHROME_SCOPES = ['.masthead', 'footer', '.skip', '.wordmark', '.vstatus'];

/**
 * The chrome's ROOTS — the scopes that are siblings in the document rather than nested
 * inside another scope. Re-homed document-level declarations land on exactly these.
 *
 * `.wordmark` is absent because it lives inside `.masthead .sheet` and inherits from it.
 * `.skip` is present and was missing until 2026-08-12, which was a real leak rather than
 * a tidiness point: `<a class="skip">` is a SIBLING of `<header class="masthead">` in
 * `layout.njk`, so it inherited none of the re-homed tokens, and the emitted
 * `.skip:focus { background: var(--raised) }` therefore resolved `--raised` against
 * whatever `:root` the document carried. On `/oal/v1.0/` that is the FROZEN palette —
 * the live chrome taking a published document's 2026 colours, which is precisely the
 * R2-into-R1 leak this module's header claims cannot happen. Neither guard could see it:
 * `undeclared` collects `--x:` from anywhere in the sheet and `--raised` IS declared,
 * just not on a scope `.skip` inherits from.
 *
 * Derived from here rather than restated, so adding a scope cannot silently leave it
 * token-less again.
 */
const SCOPE_ROOTS = ['.masthead', 'footer', '.skip', '.vstatus'];

/** Where re-homed document-level declarations land. */
const SCOPE_LIST = SCOPE_ROOTS.join(', ');

/** The same roots, plus their descendants, for the universal reset. */
const SCOPE_UNIVERSAL = SCOPE_ROOTS.flatMap((s) => [s, `${s} *`]).join(', ');

/**
 * Inherited properties only.
 *
 * `body`'s `background` and `margin` are document-level and belong to whichever sheet owns
 * the document; re-emitting them on the chrome would paint two backgrounds and indent the
 * page. What the chrome actually needs from `body` is the typography it inherits.
 */
const INHERITED = new Set([
  'font-family',
  'font-size',
  'line-height',
  'color',
  'font-variant-numeric',
  'letter-spacing',
  '-webkit-text-size-adjust',
]);

/**
 * Source selectors that are shared with `<main>` and must be re-homed rather than copied.
 *
 * `.sheet` is the page grid and `.rail` is its left column; both are used by the frozen
 * `<main>` markup *and* by the masthead and footer. Emitting either bare would put a live
 * grid rule on frozen content — which is how this site once rendered the rubric page 152px
 * wide inside a rail's column (CHANGES.md #4), and is precisely what R2 forbids.
 */
const REHOME = new Map([
  [':root', SCOPE_LIST],
  ['html', SCOPE_LIST],
  ['body', SCOPE_LIST],
  ['*, *::before, *::after', SCOPE_UNIVERSAL],
  ['.sheet', '.masthead .sheet, footer .sheet'],
  ['.rail', 'footer .rail'],
  ['.rail:empty', 'footer .rail:empty'],
]);

/** Declarations to keep when re-homing a document-level rule. */
const REHOME_FILTER = new Map([
  [':root', (prop) => prop.startsWith('--')],
  ['html', (prop) => INHERITED.has(prop)],
  ['body', (prop) => INHERITED.has(prop) || prop.startsWith('--')],
]);

/**
 * Does this single selector belong to the chrome?
 *
 * Anchored at the start, and the character after the scope has to be a boundary — so
 * `.masthead nav a` and `.skip:focus` are chrome, and a hypothetical `.skipped` is not.
 * Descendant selectors that merely *contain* a scope (`.body footer`) are deliberately
 * not chrome: this sheet may only ever match from the chrome's own root outward.
 */
export function isChromeSelector(selector) {
  const s = selector.trim();
  if (!s) return false;
  return CHROME_SCOPES.some((scope) => {
    if (!s.startsWith(scope)) return false;
    const rest = s.slice(scope.length);
    return rest === '' || /^[\s.:[>+~]/.test(rest);
  });
}

/**
 * Split a CSS source into top-level nodes.
 *
 * Brace-matching rather than a regex, and string- and comment-aware, because a selector
 * list or a `content: "}"` containing a brace would end a regex-delimited rule in the
 * wrong place. Asserts round-tripping: the nodes' raw text concatenated must equal the
 * input exactly.
 */
export function parse(css) {
  const nodes = [];
  let i = 0;

  const readComment = () => {
    const end = css.indexOf('*/', i + 2);
    const stop = end === -1 ? css.length : end + 2;
    nodes.push({ kind: 'comment', raw: css.slice(i, stop) });
    i = stop;
  };

  const readBlock = (from) => {
    let depth = 0;
    let j = from;
    while (j < css.length) {
      const c = css[j];
      if (c === '/' && css[j + 1] === '*') {
        const end = css.indexOf('*/', j + 2);
        j = end === -1 ? css.length : end + 2;
        continue;
      }
      if (c === '"' || c === "'") {
        const quote = c;
        j += 1;
        while (j < css.length && css[j] !== quote) j += css[j] === '\\' ? 2 : 1;
        j += 1;
        continue;
      }
      if (c === '{') depth += 1;
      else if (c === '}') {
        depth -= 1;
        if (depth === 0) return j + 1;
      }
      j += 1;
    }
    return css.length;
  };

  while (i < css.length) {
    if (css[i] === '/' && css[i + 1] === '*') {
      readComment();
      continue;
    }
    if (/\s/.test(css[i])) {
      let j = i;
      while (j < css.length && /\s/.test(css[j])) j += 1;
      nodes.push({ kind: 'space', raw: css.slice(i, j) });
      i = j;
      continue;
    }

    const brace = (() => {
      // Find the `{` that opens this rule, skipping comments and strings.
      let j = i;
      while (j < css.length) {
        if (css[j] === '/' && css[j + 1] === '*') {
          const end = css.indexOf('*/', j + 2);
          j = end === -1 ? css.length : end + 2;
          continue;
        }
        if (css[j] === '"' || css[j] === "'") {
          const quote = css[j];
          j += 1;
          while (j < css.length && css[j] !== quote) j += css[j] === '\\' ? 2 : 1;
        }
        if (css[j] === '{') return j;
        if (css[j] === ';') return -1; // a statement at-rule, e.g. @charset
        j += 1;
      }
      return -1;
    })();

    if (brace === -1) {
      const semi = css.indexOf(';', i);
      const stop = semi === -1 ? css.length : semi + 1;
      nodes.push({ kind: 'statement', raw: css.slice(i, stop) });
      i = stop;
      continue;
    }

    const stop = readBlock(brace);
    const prelude = css.slice(i, brace).trim();
    const body = css.slice(brace + 1, stop - 1);
    nodes.push({
      kind: prelude.startsWith('@') ? 'at-rule' : 'rule',
      prelude,
      body,
      raw: css.slice(i, stop),
    });
    i = stop;
  }

  // The parser's own guard. A scanner that silently lost a rule would emit a chrome sheet
  // missing a declaration nobody would notice until the footer rendered wrong on the one
  // page that cannot be corrected.
  const roundTrip = nodes.map((n) => n.raw).join('');
  if (roundTrip !== css) {
    throw new Error(
      `the CSS parser did not round-trip: ${roundTrip.length} bytes out of ${css.length} in. ` +
        `Every derivation below is unsafe until this is exact, because a lost rule becomes ` +
        `an unstyled chrome on the site's most-cited page.`
    );
  }
  return nodes;
}

/**
 * The declarations of a rule body, as `[property, wholeDeclaration]`.
 *
 * Comments are stripped **before** splitting, and that is not tidiness. The first version
 * split on `;` over the raw body, so a declaration preceded by a block comment — which in
 * `:root` is most of them, because this stylesheet documents what it measured — produced a
 * property name of `/* … *\/ --track` and failed the `startsWith('--')` filter. The result
 * was a chrome sheet silently missing `--track`, `--surface` and `--p0`, with no visual
 * symptom today because no chrome rule happens to use them. A derivation that drops a
 * token quietly is the thing this module's header claims it cannot do, so it now also
 * cannot: `deriveChromeSheet` reports any custom property a kept rule references and the
 * emitted sheet does not declare.
 */
function declarations(body) {
  const out = [];
  const text = body.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let start = 0;
  const push = (raw) => {
    const decl = raw.trim();
    if (decl) out.push([decl.split(':')[0].trim(), decl]);
  };
  for (let j = 0; j < text.length; j += 1) {
    const c = text[j];
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === ';' && depth === 0) {
      push(text.slice(start, j));
      start = j + 1;
    }
  }
  push(text.slice(start));
  return out;
}

/** Emit one rule, or '' if nothing of it belongs to the chrome. */
function convert(node, dropped) {
  const prelude = node.prelude.replace(/\s+/g, ' ').trim();

  const rehomed = REHOME.get(prelude);
  if (rehomed) {
    const keep = REHOME_FILTER.get(prelude) ?? (() => true);
    const decls = declarations(node.body)
      .filter(([prop]) => keep(prop))
      .map(([, text]) => `  ${text};`);
    return decls.length ? `${rehomed} {\n${decls.join('\n')}\n}\n` : '';
  }

  const selectors = prelude.split(',').map((s) => s.trim()).filter(Boolean);
  const kept = selectors.filter((s) => isChromeSelector(s));
  if (kept.length === 0) {
    for (const s of selectors) dropped.add(s);
    return '';
  }
  for (const s of selectors) if (!kept.includes(s)) dropped.add(s);

  const body = node.body.trim();
  return `${kept.join(', ')} {\n${body
    .split('\n')
    .map((line) => (line.trim() ? `  ${line.trim()}` : ''))
    .filter(Boolean)
    .join('\n')}\n}\n`;
}

/**
 * Derive the chrome stylesheet from the live one.
 *
 * Returns `{ css, dropped }` — the sheet, and every selector left behind, so a caller can
 * assert the derivation dropped what it meant to. Deliberately carries no `@font-face`:
 * the families are declared by whichever sheet owns the document, and font faces are
 * document-scoped rather than stylesheet-scoped, so the chrome reuses them at **zero extra
 * bytes**. Emitting them here would make `/oal/v1.0/` fetch a second copy of four
 * byte-identical fonts from `/fonts/` — measured at **+123,008 B**, which puts the page
 * 112.0 KiB over its 150 KiB budget.
 *
 * The DELTA is the durable figure; a page total is not, because it moves whenever the
 * document does. This comment carried `139.9 KiB to 269.6 KiB` until 2026-08-12 — wrong on
 * both ends, and the origin of a second contradictory `119.6 KiB over` that had been
 * copied into `layout.njk` and into the emitted sheet's own header, where it shipped to
 * every visitor. One measurement, five restatements, two mutually exclusive answers.
 * Check 17 owns the budget arithmetic; state the delta here and let it own the total.
 */
export function deriveChromeSheet(css) {
  const dropped = new Set();
  const out = [];

  for (const node of parse(css)) {
    if (node.kind === 'rule') {
      const text = convert(node, dropped);
      if (text) out.push(text);
      continue;
    }
    if (node.kind === 'at-rule') {
      // `@font-face` is the deliberate omission above. `@keyframes` animates content.
      if (/^@(font-face|keyframes|page|charset|import)/.test(node.prelude)) continue;

      const inner = parse(node.body)
        .filter((n) => n.kind === 'rule')
        .map((n) => convert(n, dropped))
        .filter(Boolean);
      if (inner.length) {
        out.push(
          `${node.prelude} {\n${inner
            .join('')
            .trimEnd()
            .split('\n')
            .map((l) => (l ? `  ${l}` : l))
            .join('\n')}\n}\n`
        );
      }
    }
  }

  const header =
    '/* Derived from src/styles.css by tools/chrome-sheet.mjs — do not edit.\n' +
    ' *\n' +
    ' * The masthead, the version status strip and the footer, and nothing else. Every\n' +
    ' * selector here is anchored to one of those, so this sheet cannot reach inside\n' +
    ' * <main> — which is what lets /oal/v1.0/ render live chrome around frozen content.\n' +
    ' * Check 27b asserts that against the rendered DOM.\n' +
    ' *\n' +
    ' * No :root, deliberately. Two :root blocks on one page merge rather than isolate,\n' +
    " * and the frozen <main> would inherit the live palette while every byte check\n" +
    ' * stayed green. The tokens the chrome needs are re-emitted on the chrome scope.\n' +
    ' *\n' +
    ' * No @font-face, deliberately. Font families are document-scoped, so the chrome\n' +
    ' * reuses the faces the page has already loaded. Declaring them again would fetch a\n' +
    ' * second copy of four byte-identical fonts (+123,008 B) and blow the page budget.\n' +
    ' */\n\n';

  const sheet = header + out.join('\n');

  /**
   * The guard the comment bug got past.
   *
   * Every custom property this sheet *uses* must be one this sheet *declares*. If it is
   * not, the chrome resolves it against whatever `:root` the document happens to carry —
   * on `/oal/v1.0/` that is the frozen 2026 palette, which is R2 leaking backwards into
   * R1: the chrome would silently render in the published document's colours and drift
   * further from the rest of the site with every redesign. Cheap to check, and it fails
   * closed rather than looking fine.
   */
  const declared = new Set([...sheet.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
  const undeclared = [
    ...new Set(
      [...sheet.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)]
        .map((m) => m[1])
        .filter((name) => !declared.has(name))
    ),
  ].sort();

  return { css: sheet, dropped: [...dropped].sort(), undeclared };
}
