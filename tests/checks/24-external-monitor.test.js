/**
 * Check 24 — the external monitor exists, and watches what it was set up to watch.
 *
 * BRIEF.md §9 asks for uptime and certificate monitoring. `canary.yml` cannot supply it:
 * GitHub disables scheduled workflows after 60 days of repository quiet, this site is
 * finished by design, so the canary switches off exactly when it becomes the only thing
 * watching. DEPLOY.md records the two in-repo fixes that were rejected and why.
 *
 * Liveness therefore runs at Better Stack. This check is what stops that being an act of
 * faith: `tools/monitors.json` says what should be watching, and this reads the account
 * back and fails if it is not.
 *
 * ── The branch that matters ────────────────────────────────────────────────────────
 *
 * **A planned monitor missing from the API response is a failure, not a pass.**
 *
 * The naive evaluator — "for each monitor the account returned, is it configured right?" —
 * reports green against an account with no monitors at all. That is lesson 8 with the
 * denominator moved one layer out, and it is not hypothetical here: deletion is the
 * failure mode that actually happens to monitoring, because monitors are deleted by
 * people tidying up dashboards, not by systems failing.
 *
 * Check 22 made exactly this decision about absent zone settings and it caught
 * `speed_brain` being missing from the settings listing entirely. Same shape, one layer
 * further out.
 *
 * ── What this does not prove ───────────────────────────────────────────────────────
 *
 * That someone reads the alerts. That the monitor has not been paused at the provider.
 * And it only runs when somebody runs the suite, so it does not close the 60-day hole —
 * it moves the trust from "a monitor was set up once" to "a monitor matching this file
 * existed the last time anyone looked". `canary.yml`'s header records the residual, and
 * it stands.
 *
 * ── Gated, in the manner of check 22 ───────────────────────────────────────────────
 *
 * Skips without `ORDOIA_MONITOR_CHECK=1` and credentials, because a check that needs the
 * network must not block a build. The controls below need neither and always run, so the
 * evaluator itself is covered on every commit even when the account is not reachable.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { survey } from '../lib/population.js';
import { SITE } from '../lib/harness.js';
import { PLAN, COMPARED, diff, identity, wanted, listMonitors } from '../../tools/monitor-setup.mjs';

const WANTED = process.env.ORDOIA_MONITOR_CHECK;
const SKIP =
  'set ORDOIA_MONITOR_CHECK=1 (with BETTERSTACK_API_TOKEN) to check the external monitor';

/** A planned monitor as the API would hand it back, for the controls. */
const asFound = (m, over = {}) => ({ id: '1', ...m, ...over });

test('check 24 — the external monitor watches what the plan says it watches', async (t) => {
  if (!WANTED) return t.skip(SKIP);

  const plan = wanted();
  const s = survey({
    planned: 'monitors declared in tools/monitors.json',
    existing: 'monitors read from the Better Stack account',
  });

  const existing = await listMonitors();
  s.count('planned', plan.length);
  s.count('existing', existing.length);

  // Deliberately NOT `mayBeEmpty`. An account that returns nothing is the exact state
  // this check exists to catch, so an empty population here must reach the findings
  // assertion as a finding rather than excuse itself.
  const { missing, drifted } = diff(existing, plan);

  s.failAll(
    missing.map(
      (m) =>
        `no monitor is watching ${identity(m)} — nothing external is checking this, and ` +
        `the weekly canary stops after 60 days of repository quiet. ` +
        `Run: node tools/monitor-setup.mjs apply --apply`
    )
  );
  s.failAll(
    drifted.map((d) => `${identity(d.want)} has drifted — ${d.fields.join('; ')}`)
  );

  s.report(
    'the account matches tools/monitors.json:\n  ' +
      [...missing.map(identity), ...drifted.map((d) => identity(d.want))].join('\n  ')
  );
});

test('check 24 — the plan still asserts the pair that catches obfuscation', () => {
  /**
   * The keywords are the whole point, so they are pinned here rather than trusted to a
   * JSON file nobody re-reads. Email Address Obfuscation is on by default at Cloudflare
   * and rewrites the services CTA into `/cdn-cgi/l/email-protection`, which breaks the
   * only conversion path on the site while leaving every page returning 200.
   *
   * The same pair is used by tools/probe-live.mjs and check 15. One failure mode, one pair
   * of strings, three places that look for it — and this is the assertion that keeps the
   * three in step when someone edits one of them.
   */
  const plan = wanted();
  const s = survey({ monitors: 'monitors in the plan', urls: 'distinct URLs monitored' });
  s.count('monitors', plan.length);
  s.count('urls', new Set(plan.map((m) => m.url)).size);

  const absence = plan.filter((m) => m.monitor_type === 'keyword_absence');
  assert.ok(
    absence.length > 0 && absence.every((m) => m.required_keyword === '/cdn-cgi/l/email-protection'),
    'every keyword_absence monitor should be watching for the Cloudflare email-obfuscation ' +
      'rewrite, which is the one zone setting that silently breaks the CTA'
  );

  const presence = plan.filter((m) => m.monitor_type === 'keyword');
  assert.ok(
    presence.some((m) => m.required_keyword.includes(`mailto:hello@${SITE.domain}`)),
    `some monitor must assert the mailto: on ${SITE.domain} is present — it is the only ` +
      'conversion path on the site'
  );

  // MEASURED 2026-08-11: /oal/v1.0/ contains that mailto zero times. A monitor asserting
  // it there would alert on its first run, and the plan file said so before this did.
  for (const m of presence) {
    if (!m.url.includes('/oal/')) continue;
    assert.ok(
      !m.required_keyword.startsWith('mailto:'),
      `${m.url} does not carry a mailto: — asserting one there is a false alarm, not a check`
    );
  }

  // The trailing slash is load-bearing: /oal/v1.0 returns 301, and a keyword monitor that
  // does not follow redirects reads the redirect body.
  for (const m of plan) {
    if (!/\/oal\/v\d+\.\d+/.test(m.url)) continue;
    assert.ok(
      m.url.endsWith('/'),
      `${m.url} needs its trailing slash — the slashless form 301s and a keyword check ` +
        'that does not follow redirects sees no page'
    );
    assert.equal(m.follow_redirects, true, 'and follow_redirects belt-and-braces');
  }

  assert.ok(
    PLAN.defaults.ssl_expiration > 0 && PLAN.defaults.domain_expiration > 0,
    "§9 asks for certificate monitoring, and §5's domain-lapse worry is only prose until " +
      'something alerts on it'
  );

  s.report('the plan asserts the obfuscation pair on both endpoints');
});

test('check 24 — the evaluator still catches a deleted and a drifted monitor (controls)', () => {
  const plan = wanted();

  // Everything present and correct.
  const green = diff(plan.map((m) => asFound(m)), plan);
  assert.deepEqual(green.missing, [], 'a matching account should produce no findings');
  assert.deepEqual(green.drifted, []);

  // The branch that matters: an empty account is 4 missing, not 0 problems.
  const empty = diff([], plan);
  assert.equal(
    empty.missing.length,
    plan.length,
    'an account with no monitors must report every planned monitor missing. If this ever ' +
      'reads 0, the check has become a statement about an empty list and passes while ' +
      'nothing is watching the site.'
  );

  // One deleted, the rest fine — the realistic case, and the one a per-returned-monitor
  // evaluator reports green on.
  const short = diff(plan.slice(1).map((m) => asFound(m)), plan);
  assert.equal(short.missing.length, 1);
  assert.equal(identity(short.missing[0]), identity(plan[0]));

  // Drift in each compared field is seen.
  for (const field of COMPARED) {
    if (plan[0][field] === undefined) continue;
    const mutated = plan.map((m, i) =>
      asFound(m, i === 0 ? { [field]: field === 'url' ? 'https://example.com/' : 999 } : {})
    );
    const d = diff(mutated, plan);
    assert.ok(
      d.missing.length + d.drifted.length > 0,
      `a changed ${field} must be reported — either as drift, or as missing when the ` +
        'field is part of the monitor identity'
    );
  }

  // A monitor the plan does not mention is not a finding: the plan says what must be
  // true, not what must be absent, and the account may carry monitors for other things.
  const extra = diff([...plan.map((m) => asFound(m)), asFound({ ...plan[0], url: 'https://elsewhere.test/' })], plan);
  assert.deepEqual(extra.missing, []);
  assert.deepEqual(extra.drifted, []);
});
