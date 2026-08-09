/**
 * The narrow probe that runs after a rollback.
 *
 *   node tools/probe-live.mjs https://ordoia.com
 *
 * ── Why check 15 cannot be the thing that runs here ────────────────────────────────
 *
 * Check 15's first and strongest assertion is byte-equality between `_site` and what the
 * host returns. After a rollback that assertion is *guaranteed* to fail and be right to:
 * the runner's `_site` is the new build — the one we just rolled away from — and
 * production is deliberately serving the older bytes. Running check 15 there would report
 * a failed recovery on every successful one.
 *
 * So the probe asserts only what must be true of *any* good deployment of this site,
 * without reference to the build in the runner:
 *
 *   1. `/services/` returns 200                — the page carrying the £2,500 CTA is up
 *   2. it still carries `mailto:<site.email>`  — the only conversion path on the site
 *   3. nothing on it says `/cdn-cgi/`          — the edge is not rewriting HTML
 *
 * Two and three are the pair that catch Email Address Obfuscation, which is on by default
 * on every new Cloudflare zone, rewrites `mailto:` links, and injects a decode script that
 * this site's own `script-src 'none'` then blocks — leaving the CTA dead rather than
 * obfuscated. They are the same two keywords DEPLOY.md asks the external monitor to watch,
 * deliberately: one failure mode, one pair of strings, three places that look for it.
 *
 * ── What a green probe does and does not mean ──────────────────────────────────────
 *
 * It means the site is up and serving un-rewritten HTML. It does **not** mean the rollback
 * restored the right bytes — only that what is being served is a working page. Rollback
 * answers "we shipped bad bytes". If the cause was a zone setting rather than the bytes,
 * the older deployment is rewritten identically and this probe fails again, which is the
 * correct and useful outcome: it tells the operator the cause is the zone, not the build.
 */

import { fileURLToPath } from 'node:url';
import { siteRecord } from './site-origin.mjs';

const TIMEOUT_MS = Number(process.env.ORDOIA_LIVE_TIMEOUT_MS || 10_000);

/** The page the probe is about. The one the money arrives through. */
export const PROBE_PATH = '/services/';

/** Every assertion the probe makes when it gets all the way through. */
export const ASSERTIONS = ['reachable', 'status', 'mailto', 'cdn-cgi'];

/**
 * Probe `origin`. Returns the findings, and what was actually asserted to get them.
 *
 * ── Why it reports its own coverage ────────────────────────────────────────────────
 *
 * `findings: []` is the same value for "the site is healthy" and "this function stopped
 * asserting anything", and the second is how a recovery path rots: it is only ever
 * executed in an emergency, so nobody notices it has gone quiet. `asserted` is the
 * denominator — the same distinction `tests/lib/population.js` is built on — and check 20
 * pins it, so deleting an assertion turns the suite red rather than turning the probe into
 * a function that always succeeds.
 *
 * Network failure is a finding rather than a thrown error, for the reason check 15 gives:
 * an unreachable host should produce the caller's own message, not an unhandled rejection
 * three frames away.
 */
export async function probe(origin, { email = siteRecord().email } = {}) {
  const findings = [];
  const asserted = [];
  const url = origin.replace(/\/+$/, '') + PROBE_PATH;

  let res;
  asserted.push('reachable');
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const why =
      err.name === 'TimeoutError'
        ? `no response in ${TIMEOUT_MS}ms`
        : err.cause?.code || err.cause?.message || err.code || err.message;
    return { findings: [`${url} is unreachable — ${why}`], asserted };
  }

  asserted.push('status');
  if (res.status !== 200) {
    // Returned early: every assertion below is about the body of a page that is up, and
    // reporting three failures for one cause buries the cause.
    return { findings: [`${url} returned HTTP ${res.status}, not 200`], asserted };
  }

  const body = await res.text();

  asserted.push('mailto');
  if (!body.includes(`mailto:${email}`)) {
    findings.push(
      `${url} no longer carries mailto:${email} — this is the only conversion path on ` +
        `the site`
    );
  }

  asserted.push('cdn-cgi');
  if (body.includes('/cdn-cgi/')) {
    findings.push(
      `${url} carries a /cdn-cgi/ reference, so the edge is rewriting HTML. Email ` +
        `Address Obfuscation is the usual cause: turn it off in the zone under ` +
        `Security > Settings. Rolling back will not fix this — the older bytes are ` +
        `rewritten identically.`
    );
  }

  return { findings, asserted };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const origin = process.argv[2];
  if (!origin) {
    process.stderr.write('usage: node tools/probe-live.mjs <origin>\n');
    process.exit(1);
  }

  const { findings, asserted } = await probe(origin);
  if (findings.length > 0) {
    process.stderr.write(`the probe failed against ${origin}:\n  ${findings.join('\n  ')}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `${origin}${PROBE_PATH} is up, and the CTA survived the edge ` +
      `(asserted: ${asserted.join(', ')})\n`
  );
}
