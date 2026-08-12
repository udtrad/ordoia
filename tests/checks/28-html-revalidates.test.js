/**
 * Check 28 — no HTML document is cached in a way that can hide a redesign.
 *
 * The user's R3, stated in the 2026-08-12 brief: *"No cache header may prevent a visitor
 * from seeing the site as it is currently designed or redesigned. Every page, not only
 * the frozen one."*
 *
 * ── What this was written against ──────────────────────────────────────────────────
 *
 * Measured on 2026-08-12 by reading the responses, not `_headers`:
 *
 *   /                200  public, max-age=0, must-revalidate
 *   /oal/            200  public, max-age=0, must-revalidate
 *   /oal/v1.0/       200  public, max-age=31536000, immutable   ← an HTML document
 *   /services/ …     200  public, max-age=0, must-revalidate
 *
 * One offender, and it was the one that matters: a year of `immutable` on a *document*,
 * which a purge cannot recall from a browser that has already loaded it. `_headers`
 * applied the rule by path — `/oal/v1.0/*` — and a path rule cannot tell a stylesheet
 * from the page that links it. The rule is now stated by type, and this check is what
 * holds it there.
 *
 * Written red-first. Against the `_headers` it was written against it produced exactly
 * one finding, naming `/oal/v1.0/`.
 *
 * ── Why the primary arm is the local host emulator, not the live site ──────────────
 *
 * Check 15 states the house rule: a check that needs the internet to pass must not be
 * able to block a build by being offline. So the arm that gates CI runs against
 * `serve(..., { applyHeaders: true })`, which reproduces the *documented* Cloudflare
 * parsing — including the comma-join that made two `max-age` values on one path a real
 * defect here on 2026-08-09, and that is precisely the failure this check has to be able
 * to see. A local origin that let the narrower rule win would reproduce the intuition
 * instead of the host.
 *
 * The live arm runs when `ORDOIA_LIVE` is set and adds the one thing no emulator can
 * establish: that revalidation actually happens, by asking twice and requiring a **304**.
 */

import test from 'node:test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { TARGET, IS_HANDOVER, htmlFiles, urlFor, serve } from '../lib/harness.js';
import { survey } from '../lib/population.js';

const LIVE = process.env.ORDOIA_LIVE?.replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.ORDOIA_LIVE_TIMEOUT_MS || 10_000);

const HANDOVER_SKIP =
  'the handover is eleven loose files with no _headers — there is no delivery posture to read';

/**
 * Is this Cache-Control safe on a document?
 *
 * Two independent ways to fail, and both are reported separately because the fixes
 * differ: `immutable` tells the browser never to ask again, and a long `max-age`
 * tells it not to ask for that long. Either one hides a redesign.
 */
function verdict(value) {
  const findings = [];
  if (value === undefined || value === '') {
    // Not a failure. Cloudflare's default for an undeclared path is
    // `public, max-age=0, must-revalidate`, which is what R3 wants; the emulator
    // reports the absence rather than inventing the default.
    return { findings, defaulted: true };
  }
  if (/\bimmutable\b/i.test(value)) {
    findings.push(`carries \`immutable\` — a browser that has loaded it will not ask again, and a purge cannot reach it`);
  }
  const ages = [...value.matchAll(/max-age\s*=\s*(\d+)/gi)].map((m) => Number(m[1]));
  if (ages.length > 1) {
    findings.push(
      `carries ${ages.length} max-age values (${ages.join(', ')}) — overlapping _headers ` +
        `blocks comma-join on this host rather than override, so what is served cannot be ` +
        `read off any single rule`
    );
  }
  for (const age of ages) {
    if (age > 0) findings.push(`caches for ${age}s without revalidating`);
  }
  if (ages.length === 0 && !/no-store|no-cache|must-revalidate/i.test(value)) {
    findings.push(`states no max-age and no revalidation directive, so freshness is the host's guess`);
  }
  return { findings, defaulted: false };
}

test('check 28 — every rendered HTML document is delivered revalidating, with no immutable', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    documents: 'rendered HTML documents whose delivered Cache-Control was read',
    defaulted: 'documents taking the host default rather than a declared rule',
  });

  const site = await serve(TARGET, { applyHeaders: true });
  try {
    for (const file of await htmlFiles()) {
      const url = urlFor(file);
      const res = await fetch(new URL(url, site.origin), { redirect: 'manual' });
      s.count('documents');

      const cc = res.headers.get('cache-control') ?? undefined;
      const { findings, defaulted } = verdict(cc);
      if (defaulted) s.count('defaulted');

      for (const f of findings) {
        s.fail(`${url} is delivered \`Cache-Control: ${cc}\`, which ${f}`);
      }
    }

    // A population that can never be zero would be a guard that guards nothing. If a
    // future _headers declares every path explicitly, `defaulted` legitimately empties.
    if (s.size('defaulted') === 0) {
      s.mayBeEmpty(
        'defaulted',
        'every HTML path now carries an explicitly declared Cache-Control rather than ' +
          "relying on the host's default, which is a stronger posture than this check requires"
      );
    }
  } finally {
    await site.close();
  }

  s.report(
    'an HTML document is delivered with a cache header that can outlive a redesign. R3: ' +
      'no cache header may prevent a visitor from seeing the site as it is currently ' +
      'designed. `immutable` on a document is the worst form of this — those bytes sit in ' +
      'reader caches for the stated year and a purge cannot recall them, so a correction ' +
      'reaches nobody who has already visited. Fingerprinted assets are where immutable ' +
      'belongs, because their URL changes when their content does.'
  );
});

test('check 28 — the frozen version keeps immutable on its assets, and only on its assets', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  /**
   * The other half of R2, and the reason this check is not simply "no immutable anywhere".
   *
   * The frozen stylesheet, its fonts and its favicon never change — they are the
   * published rendering of a document that scorecards cite. Immutable is legitimate for
   * them and is part of how R2 holds. Dropping it to satisfy R3 would trade a real
   * guarantee for a cosmetic one.
   */
  const s = survey({ assets: 'frozen version assets whose delivered Cache-Control was read' });

  const site = await serve(TARGET, { applyHeaders: true });
  try {
    const frozen = path.join(TARGET, 'oal', 'v1.0');
    if (!existsSync(frozen)) {
      s.mayBeEmpty(
        'assets',
        'no published version directory exists in this build, so there are no frozen ' +
          'assets to hold to the immutable rule; this population fills from publication onward'
      );
    } else {
      for (const rel of ['styles.css', 'favicon.svg', 'fonts/archivo-subset.woff2']) {
        if (!existsSync(path.join(frozen, rel))) continue;
        const url = `/oal/v1.0/${rel}`;
        const res = await fetch(new URL(url, site.origin));
        s.count('assets');
        const cc = res.headers.get('cache-control') ?? '';
        if (!/\bimmutable\b/i.test(cc)) {
          s.fail(
            `${url} is delivered \`Cache-Control: ${cc}\` with no \`immutable\`. These bytes ` +
              `are the published rendering of a cited methodology document and can never ` +
              `legally change, so immutable is correct here and is part of how R2 holds.`
          );
        }
      }
    }
  } finally {
    await site.close();
  }

  s.report(
    "the frozen version's own assets lost their immutable caching. R3 is about documents, " +
      'not about fingerprinted bytes that cannot change; weakening these buys nothing and ' +
      'costs a scorecard reader in 2032 a page that loads from cache.'
  );
});

test('check 28 — the live host actually revalidates', async (t) => {
  if (!LIVE) {
    return t.skip('set ORDOIA_LIVE=https://<host> to confirm revalidation against the real edge');
  }

  /**
   * The one thing the emulator cannot establish. `must-revalidate` in a header is a
   * claim; a **304** on the second request is the measurement. §6.5 asks for exactly this.
   */
  const s = survey({
    documents: 'live HTML documents asked for twice',
    revalidations: 'second requests that returned 304 Not Modified',
  });

  for (const file of await htmlFiles()) {
    const url = urlFor(file);
    if (url === '/404.html') continue; // redirected on this host; check 15 owns it

    const first = await fetch(`${LIVE}${url}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    s.count('documents');

    const cc = first.headers.get('cache-control') ?? '';
    if (/\bimmutable\b/i.test(cc)) {
      s.fail(`${LIVE}${url} is delivered \`${cc}\` by the real host, whatever _headers says`);
    }

    const etag = first.headers.get('etag');
    if (!etag) {
      s.fail(`${LIVE}${url} returns no ETag, so a revalidating header has nothing to revalidate against`);
      continue;
    }

    const second = await fetch(`${LIVE}${url}`, {
      headers: { 'if-none-match': etag },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (second.status === 304) s.count('revalidations');
    else {
      s.fail(
        `${LIVE}${url} returned ${second.status} to a conditional request carrying its own ` +
          `ETag ${etag}. Revalidation is what makes max-age=0 mean "ask me again" rather ` +
          `than "download it again", and a host that ignores If-None-Match is serving the ` +
          `whole document on every view.`
      );
    }
  }

  s.report(
    'the live host does not revalidate HTML. Everything R3 rests on is the second request ' +
      'returning 304; a header that says must-revalidate over a host that ignores ' +
      'conditional requests is a claim this repository has no evidence for.'
  );
});

test('check 28 — the verdict still tells a safe header from an unsafe one (controls)', () => {
  const s = survey({ controls: 'headers the verdict was run against' });

  const safe = ['public, max-age=0, must-revalidate', 'no-store', 'public, max-age=0'];
  for (const value of safe) {
    s.count('controls');
    if (verdict(value).findings.length) {
      s.fail(`"${value}" is safe on a document and was reported as a finding`);
    }
  }

  const unsafe = [
    // The exact header measured on /oal/v1.0/ on 2026-08-12.
    'public, max-age=31536000, immutable',
    // The comma-join defect from 2026-08-09, which check 15 went green over because
    // the string `immutable` did match.
    'public, max-age=600, must-revalidate, public, max-age=31536000, immutable',
    // A long cache with no immutable still hides a redesign, for the stated duration.
    'public, max-age=14400, must-revalidate',
  ];
  for (const value of unsafe) {
    s.count('controls');
    if (!verdict(value).findings.length) {
      s.fail(`"${value}" hides a redesign on a document and was not reported`);
    }
  }

  s.count('controls');
  if (
    verdict('public, max-age=600, must-revalidate, public, max-age=31536000, immutable').findings
      .length < 2
  ) {
    s.fail('the comma-join case must report both the immutable and the two max-age values');
  }

  s.report(
    'the cache verdict no longer discriminates. A verdict that passes ' +
      '`max-age=31536000, immutable` on a document would make this check green over the ' +
      'exact state it was written to catch.'
  );
});
