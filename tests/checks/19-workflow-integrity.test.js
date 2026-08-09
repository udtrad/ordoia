/**
 * Check 19 — the workflows repeat nothing the repo already knows, and pin what they run.
 *
 * CI is the one place in this repository where a claim is made without a check behind it.
 * `.github/workflows/` decides which bytes reach `ordoia.com`, and until now nothing read
 * it. Three defects were sitting there, and each is a shape this suite has already been
 * bitten by once:
 *
 * ── 1. The domain, written out by hand, twice ───────────────────────────────────────
 *
 * `deploy.yml` and `canary.yml` each carried `https://ordoia.com` as a literal. That is
 * lesson 8 wearing different clothes. The domain moved from `ordoia.co.uk` to `ordoia.com`
 * on 2026-08-08 and every copy of it had to be found by hand; check 14 was the copy that
 * was missed, and it kept passing while asserting nothing. `tests/lib/harness.js` says it
 * outright — "the domain lives here and nowhere else in the checks" — and the workflows
 * were simply outside the sentence's reach. They are inside it now: they read
 * `src/_data/site.json` at run time, and this check is what stops the literal coming back.
 *
 * ── 2. Every action floating on a major tag ────────────────────────────────────────
 *
 * `actions/checkout@v4` is a moving pointer. So is `wrangler-action@v4`, and its
 * `wranglerVersion` input was left unset, so each deploy resolved whatever npm published
 * that morning. In a repository that pins Eleventy to `3.1.2`, vendors and subsets its own
 * fonts from a SHA-pinned Adobe release, and asserts the build is byte-reproducible, the
 * deploy path was the one unpinned thing — and it is the part that touches production.
 *
 * ── 3. A deploy that does not say where it is going ────────────────────────────────
 *
 * Measured against wrangler 4.120.0: `pages deploy` infers its branch from
 * `git rev-parse --abbrev-ref HEAD`, and unlike the Workers path it has no CI fallback to
 * `GITHUB_REF_NAME`. `actions/checkout` leaves a detached HEAD, where that command returns
 * the literal string `HEAD` — which is not the production branch, so the upload lands as a
 * *preview* and `ordoia.com` never changes. The failure is silent in the worst way: the
 * deploy step goes green, and check 15 then fails with a byte mismatch that reads as "the
 * host mutated our bytes" when the truth is "we never deployed".
 *
 * ── Scope, and why this scanner is safe ────────────────────────────────────────────
 *
 * Deliberately lexical, for the reason check 16 gives: understanding YAML semantics is a
 * tarpit, and a scanner that half-understands is worse than none because it looks like
 * coverage. This one reads lines. It strips **full-line comments only** — a `#` is a YAML
 * comment at the start of a line, and anywhere else it may be inside a quoted string, and
 * deciding which is the tarpit again. A trailing `# ordoia.com` would therefore be flagged
 * as a violation. That is a false positive, it is loud, and it names its own line; the
 * alternative is a scanner that can be talked out of seeing things.
 *
 * It fails closed on every assumption it makes: the directory must exist, must contain at
 * least one workflow, every filename must be well-formed, every file must be non-empty,
 * and each of the three rules declares the population it measured. It carries planted
 * controls in the manner of check 0. It never touches the built site, so — like check 0
 * and check 16 — it passes under Baseline D, correctly and by construction.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { REPO_ROOT, SITE, escapeRe } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import {
  HARDCODED_DOMAIN,
  DOMAIN_IN_COMMENT,
  FORMER_DOMAIN,
  FLOATING_TAG,
  PINNED_WITH_NOTE,
  LOCAL_ACTION,
  DEPLOY_WITHOUT_BRANCH,
  DEPLOY_WITH_BRANCH,
  UNPINNED_WRANGLER,
} from '../fixtures/workflow-shape/controls.js';

const WORKFLOWS_DIR = path.join(REPO_ROOT, '.github', 'workflows');

/** The one file that holds the domain. Named once, here, for the same reason it is. */
const SITE_RECORD = 'src/_data/site.json';

/**
 * What counts as a workflow obtaining the origin from the record.
 *
 * Either reading the file, or running the tool that reads it. The tool is the better
 * shape and is what both workflows do: it fails with a sentence when `domain` is missing
 * or malformed, where an inline `node -p` would happily emit `origin=https://undefined`
 * and send check 15 at a host that does not exist.
 *
 * This is the half of single-sourcing that is easy to forget. Deleting the literal is not
 * the same as reading the record — a workflow that does neither has no domain at all, and
 * the next person to need one writes it out by hand.
 */
const READS_RECORD = [SITE_RECORD, 'tools/site-origin.mjs'];

/** A pinned action reference ends in a full commit SHA. Nothing shorter is a fixed point. */
const COMMIT_SHA = /^[0-9a-f]{40}$/;

/**
 * A workflow's lines, with full-line comments blanked rather than removed.
 *
 * Blanked, not dropped, so line numbers survive into the failure message. A finding that
 * cannot be clicked is a finding somebody has to search for.
 */
export function codeLines(source) {
  return source.split('\n').map((text, i) => ({
    n: i + 1,
    text: /^\s*#/.test(text) ? '' : text,
  }));
}

/** Every `uses:` reference in a workflow, with the line it sits on. */
export function usesRefs(lines) {
  const out = [];
  for (const { n, text } of lines) {
    const m = text.match(/^\s*(?:-\s+)?uses:\s*['"]?([^'"\s]+)/);
    if (m) out.push({ n, ref: m[1] });
  }
  return out;
}

/**
 * Is this reference a fixed point?
 *
 * A path beginning `./` is an action committed to this repository, so it is pinned by the
 * same commit that pins everything else here. Anything else must name a full SHA. A
 * trailing `# v7.0.1` comment is not only permitted but wanted — it is how a human renews
 * the pin, and a rule that forbade it would guarantee the pins rot back into tags.
 */
export function isPinned(ref) {
  if (ref.startsWith('./')) return true;
  const at = ref.lastIndexOf('@');
  return at > 0 && COMMIT_SHA.test(ref.slice(at + 1));
}

/** Does this workflow obtain the origin from the record, in either accepted form? */
export function readsRecord(lines) {
  return lines.some(({ text }) => text !== '' && READS_RECORD.some((t) => text.includes(t)));
}

/** Every `wrangler pages deploy` invocation, wherever in the YAML it is written. */
export function pagesDeploys(lines) {
  return lines.filter(({ text }) => /\bpages\s+deploy\b/.test(text));
}

/**
 * Domains this repository already records, longest first.
 *
 * Former domains are matched as well as the current one. `ordoia.co.uk` appearing in a
 * workflow would be the 2026-08-08 drift happening a second time, and catching only the
 * current domain would miss precisely the case that has already occurred here once.
 */
function knownDomains() {
  return [SITE.domain, ...(SITE.formerDomains ?? [])]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

async function workflows() {
  let names;
  try {
    names = (await readdir(WORKFLOWS_DIR)).sort();
  } catch {
    assert.fail(
      `${WORKFLOWS_DIR} does not exist. The deploy gate is a workflow; if there are no ` +
        'workflows, nothing gates the deploy and this check cannot be the thing that ' +
        'reports the site is fine.'
    );
  }

  assert.ok(names.length > 0, `${WORKFLOWS_DIR} is empty — there is no CI to check`);
  for (const name of names) {
    assert.match(
      name,
      /^[a-z0-9][a-z0-9-]*\.ya?ml$/,
      `${name} is not a workflow filename this scanner understands. Teach it the shape ` +
        'before using it, or the scan silently covers less than it appears to.'
    );
  }

  return Promise.all(
    names.map(async (name) => {
      const source = await readFile(path.join(WORKFLOWS_DIR, name), 'utf8');
      assert.ok(source.trim().length > 0, `${name} is empty`);
      return { name, source, lines: codeLines(source) };
    })
  );
}

test('check 19 — no workflow writes out what the site record already says', async () => {
  const files = await workflows();
  const domains = knownDomains();
  const re = new RegExp(domains.map(escapeRe).join('|'));

  const s = survey({
    files: 'workflow files scanned',
    lines: 'workflow lines read, comments excluded',
  });

  let sourced = 0;

  for (const { name, lines } of files) {
    s.count('files');
    if (readsRecord(lines)) sourced += 1;
    for (const { n, text } of lines) {
      if (text === '') continue;
      s.count('lines');
      const hit = text.match(re);
      if (hit) {
        s.fail(`${name}:${n} writes out ${hit[0]} — ${text.trim()}`);
      }
    }
  }

  if (sourced === 0) {
    s.fail(
      `no workflow obtains the origin from ${SITE_RECORD} — nothing here reads it and ` +
        'nothing runs tools/site-origin.mjs. Removing the literal is only half of ' +
        'single-sourcing it; if nothing reads the record, the next edit that needs a ' +
        'domain writes one out by hand.'
    );
  }

  s.report(
    `the domain belongs in ${SITE_RECORD} and nowhere else. It moved once already, on ` +
      '2026-08-08, and the copy that was missed — check 14 — went on passing while ' +
      'asserting nothing. Read the origin from the record in a step and use its output.'
  );
});

test('check 19 — every action a workflow runs is pinned to a commit', async () => {
  const files = await workflows();
  const s = survey({ references: '`uses:` references found across the workflows' });

  for (const { name, lines } of files) {
    for (const { n, ref } of usesRefs(lines)) {
      s.count('references');
      if (isPinned(ref)) continue;
      s.fail(`${name}:${n} — ${ref}`);
    }
  }

  s.report(
    'a major tag is a moving pointer, so these deploys run code nobody in this repository ' +
      'has read. Pin each to a full commit SHA, with the tag it stood for in a trailing ' +
      'comment so the pin can be renewed deliberately: ' +
      '`uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`'
  );
});

test('check 19 — the deploy names its wrangler and names its branch', async () => {
  const files = await workflows();
  const s = survey({
    deploys: 'wrangler pages deploy invocations found',
    wranglerSteps: 'workflows that run cloudflare/wrangler-action',
  });

  // No deploy at all is a legitimate state for a single workflow — the canary has none —
  // but it is not a legitimate state for the whole directory, so the population carries it.
  for (const { name, source, lines } of files) {
    for (const { n, text } of pagesDeploys(lines)) {
      s.count('deploys');
      if (/--branch=\S+/.test(text)) continue;
      s.fail(
        `${name}:${n} runs \`pages deploy\` without --branch. Measured against wrangler ` +
          '4.120.0: it then reads `git rev-parse --abbrev-ref HEAD`, which returns the ' +
          'literal "HEAD" under actions/checkout, so the upload lands as a preview and the ' +
          'custom domain never changes.'
      );
    }

    if (!source.includes('cloudflare/wrangler-action')) continue;
    s.count('wranglerSteps');
    if (/^\s*wranglerVersion:/m.test(source)) continue;
    s.fail(
      `${name} runs cloudflare/wrangler-action without wranglerVersion, so every deploy ` +
        'resolves whatever npm published that morning. The input exists on v4 — it was ' +
        'simply never set.'
    );
  }

  s.report(
    'the deploy path is the one place in this repo where an unpinned version or an ' +
      'unnamed branch reaches production directly'
  );
});

test('check 19 — nothing checks a host before waiting for it to serve this build', async () => {
  const files = await workflows();
  const s = survey({
    deploys: 'wrangler pages deploy invocations found',
    waits: 'wait-for-origin invocations found',
  });

  for (const { name, source, lines } of files) {
    const deploys = pagesDeploys(lines).length;
    const waits = lines.filter(({ text }) => text.includes('wait-for-origin.mjs')).length;

    s.count('deploys', deploys);
    s.count('waits', waits);

    if (deploys === 0) continue;

    if (waits < deploys) {
      s.fail(
        `${name} runs \`pages deploy\` ${deploys} time(s) but waits for the origin to serve ` +
          `the build ${waits} time(s). Measured on 2026-08-09: a Pages hostname lags its ` +
          `deployment — a file uploaded seconds earlier 404'd on the alias at t+3s and ` +
          `served at t+8s. Checking inside that window fails a good deploy, and on the ` +
          `production stage the workflow answers a failed check by rolling back, so the lag ` +
          `would undo a deployment that was fine and report it as bad bytes.`
      );
    }
  }

  // The canary has no deploy and no wait, so `waits` would be empty if the deploy workflow
  // ever lost its own. That is the case worth catching, and the population carries it
  // rather than a hand-written guard.
  s.report(
    'every workflow that deploys must wait for the host to serve that build before ' +
      'checking it, or the check is racing the edge'
  );
});

test('check 19 — the scanner still tells a violation from a near miss (controls)', () => {
  const domains = knownDomains();
  const re = new RegExp(domains.map(escapeRe).join('|'));
  const hardcodes = (src) => codeLines(src).some(({ text }) => text !== '' && re.test(text));
  const unpinned = (src) => usesRefs(codeLines(src)).filter(({ ref }) => !isPinned(ref));
  const branchless = (src) =>
    pagesDeploys(codeLines(src)).filter(({ text }) => !/--branch=\S+/.test(text));

  assert.equal(hardcodes(HARDCODED_DOMAIN), true, 'a hardcoded domain must be caught');
  assert.equal(hardcodes(FORMER_DOMAIN), true, 'a former domain must be caught too');
  assert.equal(
    hardcodes(DOMAIN_IN_COMMENT),
    false,
    'a workflow must be able to explain why the domain is not written in it'
  );

  // A workflow may mention the record in a comment and still not read it. The permitted
  // fixture explains itself in a comment *and* runs the tool on a code line; only the
  // second is what makes it sourced.
  assert.equal(
    readsRecord(codeLines(DOMAIN_IN_COMMENT)),
    true,
    'running tools/site-origin.mjs must count as obtaining the origin from the record'
  );
  assert.equal(
    readsRecord(codeLines(FLOATING_TAG)),
    false,
    'a workflow that neither reads the record nor runs the tool must not count as sourced'
  );

  assert.equal(unpinned(FLOATING_TAG).length, 1, 'a floating major tag must be caught');
  assert.equal(
    unpinned(PINNED_WITH_NOTE).length,
    0,
    'a SHA pin carrying the tag it stood for must be permitted — that comment is how it ' +
      'gets renewed'
  );
  assert.equal(unpinned(LOCAL_ACTION).length, 0, 'an action in this repo is already pinned');

  assert.equal(branchless(DEPLOY_WITHOUT_BRANCH).length, 1, 'a branchless deploy must be caught');
  assert.equal(branchless(DEPLOY_WITH_BRANCH).length, 0, 'a deploy naming its branch is fine');
  assert.equal(
    /^\s*wranglerVersion:/m.test(UNPINNED_WRANGLER),
    false,
    'a wrangler-action step with no version must be visible as such'
  );

  // The parsing assumptions themselves, asserted rather than trusted.
  assert.throws(
    () => codeLines(null),
    TypeError,
    'the line splitter must fail loudly on a source it cannot read, not scan zero lines'
  );
});
