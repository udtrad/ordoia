/**
 * Print the site's origin, in the shape a GitHub Actions step output wants.
 *
 *   node tools/site-origin.mjs >> "$GITHUB_OUTPUT"   ->  origin=https://ordoia.com
 *
 * ── Why this exists ────────────────────────────────────────────────────────────────
 *
 * `src/_data/site.json` holds the domain, and `tests/lib/harness.js` says the reason
 * plainly: "the domain lives here and nowhere else in the checks. A check that hardcodes
 * it stops matching the day the domain changes, and a matcher that matches nothing makes
 * its assertion vacuous rather than red."
 *
 * The workflows were outside that sentence. `deploy.yml` and `canary.yml` each wrote
 * `https://ordoia.com` out by hand — two more copies to find the next time the domain
 * moves, and it has already moved once, from `ordoia.co.uk` on 2026-08-08. Check 19 now
 * fails the suite if either literal comes back.
 *
 * ── Why a file rather than a `node -e` one-liner in the YAML ───────────────────────
 *
 * Three reasons, in order of weight. A file can be read by check 19 as *evidence the
 * record is read*, which is the half of single-sourcing that stops the literal returning.
 * A `.mjs` file is unambiguously a module, where `node -e` in a `"type": "module"` package
 * depends on Node's syntax detection to decide whether `require` is available. And a
 * missing or empty `domain` can fail here with a sentence, rather than emitting
 * `origin=https://undefined` and sending check 15 at a host that does not exist.
 *
 * It writes `key=value` rather than a bare origin so the calling step is one line with no
 * shell interpolation of its own — `$GITHUB_OUTPUT` is append-only key=value, and a step
 * that builds that string in bash is a step that can quote it wrong.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const RECORD = path.join(REPO_ROOT, 'src/_data/site.json');

/**
 * The site record, for the deploy tools.
 *
 * `tests/lib/harness.js` exports the same file as `SITE`, and the checks should keep
 * using that. Tools cannot: importing the harness resolves the check target at module
 * load and throws when there is no build, which is the wrong failure for a script whose
 * job is to talk to a host.
 */
export function siteRecord() {
  return JSON.parse(readFileSync(RECORD, 'utf8'));
}

/** The origin the site is published at, read from the one file that records it. */
export function siteOrigin(record = siteRecord()) {
  const { domain } = record;

  if (typeof domain !== 'string' || domain.trim() === '') {
    throw new Error(
      `src/_data/site.json has no usable "domain". Every printed address on every ` +
        `scorecard is built from it, so there is no sensible default to fall back to.`
    );
  }

  // A scheme here would produce `https://https://…`, and a path would produce an origin
  // that is not one. Both are the kind of thing that fails four steps later, against the
  // live host, with a message about bytes.
  if (/[:/]/.test(domain)) {
    throw new Error(
      `src/_data/site.json's "domain" is ${JSON.stringify(domain)}. It is a bare ` +
        `hostname — no scheme, no path — because the build joins it to both.`
    );
  }

  return `https://${domain}`;
}

// `node tools/site-origin.mjs`, but not `import`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`origin=${siteOrigin()}\n`);
}
