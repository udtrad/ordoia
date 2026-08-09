/**
 * The deploy posture, as data — and as one evaluator.
 *
 * BRIEF.md §9 names the headers this site must carry and the widenings that would
 * quietly undo them. Two checks care about it:
 *
 *   check 14 — against `_headers` as the build emits it
 *   check 15 — against what a host actually returns on the wire
 *
 * The tables were moved here first, because a second copy is a second thing to keep in
 * step and the failure mode of drift is that the file-level check and the wire-level
 * check quietly stop agreeing about what the posture is.
 *
 * That turned out to be the smaller half of the duplication. Both checks also wrote
 * their own *evaluator* over the shared tables, and **check 14's was wrong**: it found a
 * header by line prefix across the whole file, so `.find()` took the first occurrence of
 * a name anywhere in it. A Content-Security-Policy declared only under `/oal/v1.0/*`
 * satisfied check 14 for the entire site, including the eight pages that had none. Two
 * evaluators over one table is not sharing; it is a table with two readers who disagree.
 *
 * So the evaluation lives here too. `evaluateHeaders(get)` takes a getter and knows
 * nothing about where the values came from: check 14 backs it with the `/*` block of the
 * parsed `_headers`, check 15 with `res.headers`.
 *
 * ── The invariant check 14 asserts, and why it is written that way ──────────────────
 *
 * Cloudflare's documented precedence when two `_headers` blocks match one request is not
 * something this repo has verified, and a check resting on unverified vendor semantics is
 * the kind of claim §13 exists to forbid. So the invariant is written to hold either way:
 *
 *     the `/*` block **alone** must satisfy REQUIRED_HEADERS,
 *     and **no block anywhere** may contain a widening.
 *
 * Correct under "last match wins" and under "all matching blocks apply". It cannot be
 * satisfied by a posture scoped to one directory, and it cannot be undone by one.
 */

/** One year, in seconds — the HSTS floor. See the `Strict-Transport-Security` entry. */
export const HSTS_FLOOR_SECONDS = 31_536_000;

/**
 * Directives that take no sources at all.
 * Their presence is the whole value; a source list on one is malformed.
 */
const VALUELESS = new Set(['upgrade-insecure-requests', 'block-all-mixed-content']);

/**
 * Directives whose values are not source expressions.
 *
 * `sandbox` takes sandboxing flags and can only ever *restrict*, so nothing in it can
 * widen the posture. `require-trusted-types-for` and `trusted-types` are the same shape.
 *
 * `report-to` is the exception that gets a finding rather than a skip: its value is a
 * group name, and the address that group resolves to lives in a `Reporting-Endpoints`
 * header this evaluator does not read. It is out of scope, so it is reported as out of
 * scope rather than passed over in silence.
 */
const NOT_A_SOURCE_LIST = new Set(['sandbox', 'require-trusted-types-for', 'trusted-types']);

/**
 * Source expressions that keep the policy on our own origin.
 *
 * This is an allowlist, and that is the point. The previous detector was three regexes
 * naming forbidden shapes, and it missed `script-src example.com` — a bare authority,
 * which is valid CSP and loads an off-origin script — because the pattern was anchored on
 * `//`. Enumerating what is forbidden dates the same way enumerating edge features does.
 * §9 says "a CSP that permits only own origin", so that is the rule expressed directly:
 * anything not on this list has to be added deliberately, with a control to prove it.
 */
const PERMITTED_SOURCE = [
  /^'self'$/i,
  /^'none'$/i,
  /^'sha(?:256|384|512)-[A-Za-z0-9+/=_-]+'$/i, // a hash of our own content
  /^'nonce-[A-Za-z0-9+/=_-]+'$/i,
  /^\//, // a path on our own origin, e.g. report-uri /csp-report
];

/**
 * Directives that may carry `data:`.
 *
 * `data:` fetches nothing off-origin, and `img-src 'self' data:` is shipped. It is scoped
 * to the fetch directives where inline data is the point rather than permitted globally,
 * because `script-src data:` is a script-injection vector and should have to be argued
 * for rather than inherited from a blanket allowance.
 */
const DATA_URI_OK = new Set(['img-src', 'font-src', 'media-src']);

/** The one inline exception the site ships, and the reason it does. */
const INLINE_STYLE_ATTR_EXCEPTION = 'style-src-attr';

/** Keywords that widen, with the name each should be reported under. */
const UNSAFE_KEYWORDS = new Map([
  ["'unsafe-inline'", 'permits inline content'],
  ["'unsafe-eval'", 'permits eval'],
  ["'unsafe-hashes'", 'permits inline event handlers'],
  ["'strict-dynamic'", 'delegates trust to whatever a permitted script loads'],
  ["'wasm-unsafe-eval'", 'permits WebAssembly compilation from source'],
]);

/**
 * Parse a Content-Security-Policy into its directives.
 *
 * Returns the occurrences in file order, the effective directive map, and any directive
 * declared more than once.
 *
 * `directives` is first-occurrence-wins, which is what a browser does: CSP ignores every
 * repeat of a directive it has already seen. Recording that faithfully matters, because
 * reasoning about `script-src 'none'; script-src 'unsafe-inline'` as though the second
 * one applied would report a widening the wire does not actually have.
 */
export function parseCsp(text) {
  const occurrences = [];
  const directives = new Map();
  const duplicated = [];

  for (const segment of String(text ?? '').split(';')) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    const name = tokens[0].toLowerCase();
    const sources = tokens.slice(1);
    occurrences.push({ name, sources });

    if (directives.has(name)) {
      if (!duplicated.includes(name)) duplicated.push(name);
      continue; // the browser keeps the first; so do we
    }
    directives.set(name, sources);
  }

  return { occurrences, directives, duplicated };
}

/**
 * Every way a CSP permits more than our own origin.
 *
 * Returns one line per finding, empty when the policy is own-origin only.
 *
 * Every occurrence is scanned, not just the effective one. A repeat that the browser
 * ignores is still a defect, and the day the first declaration is deleted it becomes a
 * live widening with no diff to explain it.
 */
export function cspWidenings(csp) {
  const { occurrences, duplicated } = parseCsp(csp);
  const findings = [];

  for (const name of duplicated) {
    findings.push(
      `${name} is declared more than once. CSP keeps the first and ignores the rest, so ` +
        `the later one is dead text today and a widening the day the first is removed.`
    );
  }

  for (const { name, sources } of occurrences) {
    if (VALUELESS.has(name)) {
      if (sources.length > 0) {
        findings.push(`${name} takes no sources, but carries "${sources.join(' ')}"`);
      }
      continue;
    }
    if (NOT_A_SOURCE_LIST.has(name)) continue;
    if (name === 'report-to') {
      findings.push(
        `report-to names a group whose address is declared in a Reporting-Endpoints ` +
          `header this check does not read, so where reports go cannot be established here.`
      );
      continue;
    }

    for (const raw of sources) {
      const source = raw.trim();
      if (source === '') continue;

      if (PERMITTED_SOURCE.some((re) => re.test(source))) continue;

      const lower = source.toLowerCase();

      if (lower === 'data:') {
        if (DATA_URI_OK.has(name)) continue;
        findings.push(`${name} permits data:, which on this directive is a code-injection source`);
        continue;
      }

      // The site emits `style="--p:var(--p1)"` on every tick of every measure, and the
      // shipped CSP permits exactly that inline surface and nothing else. Tightening
      // without this exception turns the site red on its own design rather than on a
      // defect — the single most likely false positive in this file.
      if (lower === "'unsafe-inline'" && name === INLINE_STYLE_ATTR_EXCEPTION) continue;

      const unsafe = UNSAFE_KEYWORDS.get(lower);
      if (unsafe) {
        findings.push(`${name} ${unsafe} (${source})`);
        continue;
      }

      if (source.includes('*')) {
        findings.push(`${name} permits a wildcard source (${source})`);
        continue;
      }

      if (/^[a-z][a-z0-9+.-]*:$/i.test(source)) {
        findings.push(`${name} permits the scheme ${source}, which is every host on it`);
        continue;
      }

      findings.push(`${name} permits the off-origin source ${source}`);
    }
  }

  return findings;
}

/**
 * The headers §9 requires, and the shape each must have.
 *
 * `ok(value)` returns `true`, or a sentence saying what is wrong with the value it was
 * given. A predicate returning a reason rather than a boolean is what lets the HSTS entry
 * below say *why* seven digits is not a duration.
 */
export const REQUIRED_HEADERS = [
  {
    name: 'Content-Security-Policy',
    ok(value) {
      const { directives } = parseCsp(value);
      const defaultSrc = directives.get('default-src');
      if (!defaultSrc) {
        return 'no default-src, so any fetch without its own directive is unrestricted';
      }
      if (defaultSrc.length !== 1 || defaultSrc[0].toLowerCase() !== "'self'") {
        return `default-src is "${defaultSrc.join(' ')}", and §9 requires 'self'`;
      }
      return true;
    },
  },
  {
    name: 'Strict-Transport-Security',
    /**
     * The floor is parsed, not matched.
     *
     * This was `/max-age=\d{7,}/`, which accepts `max-age=1000000` — eleven and a half
     * days, wearing the shape of a two-year commitment. A digit count is not a duration.
     *
     * `includeSubDomains` is required as well as present. DEPLOY.md documents the
     * omission of `preload` as deliberate and says nothing about this one, so asserting
     * it is what makes shipping it a decision rather than an accident. Removing it later
     * is then a visible edit with a reason attached, which is the whole posture here.
     */
    ok(value) {
      const maxAge = /(?:^|[\s;])max-age\s*=\s*"?(\d+)"?/i.exec(value);
      if (!maxAge) return `no max-age in "${value}"`;
      const seconds = Number(maxAge[1]);
      if (seconds < HSTS_FLOOR_SECONDS) {
        const days = (seconds / 86_400).toFixed(1);
        return (
          `max-age=${seconds} is ${days} days, below the one-year floor of ` +
          `${HSTS_FLOOR_SECONDS}s. The site ships 63072000.`
        );
      }
      if (!/(?:^|[\s;])includeSubDomains\b/i.test(value)) {
        return 'no includeSubDomains, so a subdomain served over plain HTTP is not covered';
      }
      return true;
    },
  },
  {
    name: 'Referrer-Policy',
    ok: (value) =>
      /no-referrer|strict-origin/i.test(value) || `"${value}" leaks more than §9 permits`,
  },
  {
    name: 'Permissions-Policy',
    ok: (value) => /geolocation=\(\)/i.test(value) || 'geolocation is not denied',
  },
  {
    name: 'X-Content-Type-Options',
    ok: (value) => /nosniff/i.test(value) || `"${value}" is not nosniff`,
  },
];

/**
 * Evaluate one set of headers against the posture.
 *
 * `get(name)` returns the header's value or a nullish value. Check 14 backs it with the
 * `/*` block of the parsed `_headers`; check 15 backs it with a live `Headers` object.
 * Neither knows what the other is reading, and both reach the same verdict, which is the
 * whole reason this function exists rather than two of it.
 */
export function evaluateHeaders(get) {
  const findings = [];

  for (const { name, ok } of REQUIRED_HEADERS) {
    const value = get(name);
    if (value === null || value === undefined || String(value).trim() === '') {
      findings.push(`${name} is absent`);
      continue;
    }
    const verdict = ok(String(value));
    if (verdict !== true) findings.push(`${name}: ${verdict}`);
  }

  const csp = get('Content-Security-Policy');
  if (csp) findings.push(...cspWidenings(String(csp)));

  return findings;
}

/**
 * Parse a `_headers` file into ordered blocks.
 *
 * The syntax is the one Netlify, Cloudflare Pages and Workers static assets all read:
 * an unindented path pattern, then indented `Name: value` lines beneath it.
 *
 * Removal lines — `! Header-Name`, which asks the host to strip a header it would
 * otherwise add — are recorded separately. They used to be dropped: they carry no colon,
 * and every colon-less line was discarded. That mattered, because check 15's failure
 * message tells the operator to remove `Access-Control-Allow-Origin` exactly that way,
 * and nothing in the suite could see whether they had.
 */
export function parseHeadersFile(text) {
  const blocks = [];
  let current = null;

  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;

    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: new Map(), removals: new Set() };
      blocks.push(current);
      continue;
    }
    if (!current) continue;

    const body = line.trim();
    if (body.startsWith('!')) {
      current.removals.add(body.slice(1).trim().toLowerCase());
      continue;
    }

    const idx = body.indexOf(':');
    if (idx > 0) {
      current.headers.set(body.slice(0, idx).trim().toLowerCase(), body.slice(idx + 1).trim());
    }
  }

  return blocks;
}

/** A getter over one parsed block, in the shape `evaluateHeaders` expects. */
export function headersFromBlock(block) {
  return (name) => block.headers.get(name.toLowerCase()) ?? null;
}

/**
 * Turn a `_headers` path pattern into a matcher.
 *
 * Splats are greedy and there may be at most one. Placeholders (`:name`) match a run of
 * non-delimiter characters. Absolute-URL patterns are reduced to their path, because this
 * is used to decide whether two rules can apply to the same request and the host part
 * only ever narrows that.
 */
export function patternToRegExp(pattern) {
  const pathOnly = pattern.replace(/^https?:\/\/[^/]*/i, '') || '/';
  const source = pathOnly
    .split('*')
    .map((part) =>
      part
        .split(/(:[A-Za-z]\w*)/)
        .map((piece) => (/^:[A-Za-z]\w*$/.test(piece) ? '[^/]+' : piece.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
        .join('')
    )
    .join('.*');
  return new RegExp(`^${source}$`);
}

/** A concrete request path that the pattern certainly matches. */
function sampleFor(pattern) {
  return (pattern.replace(/^https?:\/\/[^/]*/i, '') || '/')
    .replace(/\*/g, 'x')
    .replace(/:[A-Za-z]\w*/g, 'x');
}

/**
 * Header names declared in two blocks that can both match one request.
 *
 * This exists because Cloudflare's documented behaviour is not the intuitive one, and the
 * intuitive reading is the dangerous one. From the Pages `_headers` documentation:
 *
 *   "An incoming request which matches multiple rules' URL patterns will inherit ALL
 *    rules' headers."
 *   "If a header is applied twice in the _headers file, the values are joined with a
 *    comma separator."
 *
 * So overlapping declarations do not override — they concatenate. This site shipped
 * `Cache-Control: public, max-age=600, must-revalidate` under `/*` and
 * `public, max-age=31536000, immutable` under `/oal/v1.0/*`, and every asset in the frozen
 * version directory matches both. The value on the wire would have carried two max-ages
 * and a must-revalidate, on the one directory that can never be corrected after
 * publication.
 *
 * Check 15 would not have caught it: it asserts the version asset's Cache-Control matches
 * /immutable/, and the joined string does. A check that passes over a broken freeze is the
 * shape CHECKS.md calls lesson 8, arriving by a new route.
 *
 * The rule is therefore structural rather than a value comparison: no header name may be
 * declared twice for one request, whatever the values happen to be.
 */
export function overlappingDeclarations(blocks) {
  const findings = [];

  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const a = blocks[i];
      const b = blocks[j];
      const overlap =
        patternToRegExp(a.pattern).test(sampleFor(b.pattern)) ||
        patternToRegExp(b.pattern).test(sampleFor(a.pattern));
      if (!overlap) continue;

      for (const name of a.headers.keys()) {
        if (!b.headers.has(name)) continue;
        findings.push(
          `${name} is declared under both ${a.pattern} and ${b.pattern}, which can match ` +
            `the same request. Cloudflare joins the two values with a comma rather than ` +
            `letting the narrower one win, so the wire carries ` +
            `"${a.headers.get(name)}, ${b.headers.get(name)}".`
        );
      }
    }
  }

  return findings;
}
