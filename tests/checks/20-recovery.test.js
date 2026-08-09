/**
 * Check 20 — the recovery path is a real one.
 *
 * `deploy.yml` promises that a bad production deploy is rolled back and the result
 * verified. Two pieces of code carry that promise, and both have a property that makes
 * them unusually easy to get wrong: **they only ever run in an emergency.** A deploy check
 * that has rotted is discovered on the next deploy. A rollback that has rotted is
 * discovered on the worst day this site has.
 *
 * So the two halves are separated into pure logic that can be exercised here, and one thin
 * network call that cannot:
 *
 *   tools/pages-api.mjs  selectServingDeployment()  ← pure. Covered below, against fixtures
 *                                                    built from real API responses.
 *   tools/probe-live.mjs probe()                   ← covered below against a real origin and
 *                                                    against planted broken ones.
 *
 * ── The drill was run, and it found the model here was wrong ───────────────────────
 *
 * On 2026-08-09 this path met the real Cloudflare API for the first time, on the `ordoia`
 * project before its custom domain was attached. The fixtures below are no longer built to
 * *documented* shapes; they are built to observed ones. What it found:
 *
 *   1. The rollback POST works, and its effect is real — verified by fetching with a
 *      cache-busting query string after rolling back.
 *   2. **The function this check covers returned the wrong deployment after a rollback.**
 *      Cloudflare keeps the rolled-away-from deployment in the production listing, newest
 *      first and still `success`, and records the serving one separately as
 *      `canonical_deployment`. Scanning the listing therefore answered with bytes that had
 *      been rejected. The old comment warned that rolling back to the wrong deployment
 *      "looks like a recovery"; it was describing itself.
 *   3. Cloudflare's edge served the pre-rollback bytes from cache afterwards
 *      (`cf-cache-status: HIT`), so a rollback is not visible to a reader until the cache
 *      is purged. DEPLOY.md carries that; the probe cannot see it, because the probe asks
 *      whether *a* healthy page is served, not *which* one.
 *
 * ── What this check still does not establish ───────────────────────────────────────
 *
 * The network calls are not exercised here — this check is pure and offline, and stays
 * that way so `npm test` remains hermetic. It proves the right deployment is chosen given
 * a pair of responses. That those responses keep their shape is what the drill settles,
 * and a drill is a point in time.
 *
 * ── Why the probe is narrow, and why that is not laziness ──────────────────────────
 *
 * Check 15 byte-compares `_site` against the host. After a rollback that comparison is
 * guaranteed to fail and be right to — the runner holds the build we just rolled away
 * from, and production is deliberately serving older bytes. The probe therefore asserts
 * only what must be true of *any* good deployment of this site, with no reference to the
 * artifact in the runner.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { TARGET, IS_HANDOVER, serve, SITE } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import { probe, ASSERTIONS, PROBE_PATH } from '../../tools/probe-live.mjs';
import { selectServingDeployment } from '../../tools/pages-api.mjs';

const HANDOVER_SKIP =
  'the handover ships no deploy configuration and no clean URLs — that is the point';

/** An origin that returns exactly the body it is given, for the controls below. */
async function planted(body, status = 200) {
  const server = createServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** One deployment, in the shape Cloudflare's deployments listing documents. */
function deployment({ id, environment = 'production', status = 'success', created_on }) {
  return {
    id,
    environment,
    created_on,
    url: `https://${id}.ordoia.pages.dev`,
    latest_stage: { name: 'deploy', status, started_on: created_on, ended_on: created_on },
  };
}

const listing = (result) => ({ success: true, result });

test('check 20 — the probe passes against the site as built', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    asserted: 'assertions the probe actually made against the origin',
  });

  const site = await serve(TARGET, { applyHeaders: true });
  try {
    const { findings, asserted } = await probe(site.origin, { email: SITE.email });
    s.count('asserted', asserted.length);

    // Pinned, not merely counted. `findings: []` reads identically for "healthy" and
    // "this function no longer asserts anything", and the second is how a path that only
    // runs in an emergency dies quietly.
    assert.deepEqual(
      asserted,
      ASSERTIONS,
      'the probe did not make every assertion it claims to. A recovery probe that has ' +
        'quietly stopped checking something is worse than no probe: it reports success.'
    );

    s.failAll(findings);
    s.report(
      `the probe fails against this repository's own build, so it would fail after every ` +
        `rollback whether or not the rollback worked. It fetches ${PROBE_PATH} and looks ` +
        `for mailto:${SITE.email} and the absence of /cdn-cgi/.`
    );
  } finally {
    await site.close();
  }
});

test('check 20 — the probe still catches a dead CTA and a rewriting edge (controls)', async () => {
  const good = `<a href="mailto:${SITE.email}">Start a conversation</a>`;

  // Email Address Obfuscation's actual output shape: the address is replaced by a
  // /cdn-cgi/ path and a decode script. This site's own script-src 'none' then blocks the
  // script, so the link is dead rather than merely obfuscated.
  const obfuscated =
    '<a href="/cdn-cgi/l/email-protection#a1c4ccc0c8">' +
    '<span class="__cf_email__" data-cfemail="deadbeef">[email&#160;protected]</span></a>';

  const cases = [
    { name: 'the CTA removed entirely', body: '<p>nothing here</p>', expect: 1 },
    { name: 'the CTA obfuscated by the edge', body: obfuscated, expect: 2 },
    { name: 'the page intact', body: good, expect: 0 },
  ];

  for (const { name, body, expect } of cases) {
    const origin = await planted(body);
    try {
      const { findings, asserted } = await probe(origin.origin, { email: SITE.email });
      assert.equal(findings.length, expect, `${name}: ${findings.join(' / ') || 'no findings'}`);
      assert.deepEqual(asserted, ASSERTIONS, `${name}: the probe short-circuited`);
    } finally {
      await origin.close();
    }
  }

  // A 404 must be one finding naming the status, not three about a body that was never
  // read — and the reported coverage must say so rather than claiming the full set.
  const missing = await planted('<p>not found</p>', 404);
  try {
    const { findings, asserted } = await probe(missing.origin, { email: SITE.email });
    assert.equal(findings.length, 1, 'a 404 must report one cause, not three symptoms');
    assert.match(findings[0], /HTTP 404/);
    assert.deepEqual(asserted, ['reachable', 'status'], 'the probe must report where it stopped');
  } finally {
    await missing.close();
  }

  const dead = await probe('http://127.0.0.1:1', { email: SITE.email });
  assert.equal(dead.findings.length, 1, 'an unreachable origin is one finding');
  assert.match(dead.findings[0], /unreachable/);
  assert.deepEqual(dead.asserted, ['reachable'], 'an unreachable origin asserted only that');
});

test('check 20 — the rollback target is what is actually serving (controls)', () => {
  const B = deployment({ id: 'bbbb', created_on: '2026-08-09T10:00:00Z' });
  const A = deployment({ id: 'aaaa', created_on: '2026-08-09T09:00:00Z' });
  const ourPreview = deployment({
    id: 'pppp',
    environment: 'preview',
    created_on: '2026-08-09T11:00:00Z',
  });

  const project = (canonical, latest = 'bbbb') => ({
    name: 'ordoia',
    canonical_deployment: canonical === null ? null : { id: canonical },
    latest_deployment: { id: latest },
  });

  // The ordinary case: nothing has been rolled back, so canonical and latest agree.
  assert.equal(selectServingDeployment(project('bbbb'), listing([ourPreview, B, A])), 'bbbb');

  // **The case the previous implementation got wrong, measured against the real API on
  // 2026-08-09.** Deploy A, deploy B, roll back to A. Cloudflare keeps B in the listing,
  // newest-first and still `success`, and records A as canonical. Scanning the listing
  // returns B — a deployment that was rolled away from, quite possibly because it was bad.
  // deploy.yml captures this value as its rollback target, so the old behaviour would have
  // "recovered" a failed deploy onto exactly the bytes that were rejected last time.
  assert.equal(
    selectServingDeployment(project('aaaa'), listing([ourPreview, B, A])),
    'aaaa',
    'after a rollback the serving deployment is NOT the newest one in the listing'
  );

  assert.equal(
    selectServingDeployment(project(null), listing([])),
    null,
    'a project that has never deployed has nothing to roll back to — the first ever ' +
      'deploy, which must not be an error'
  );

  // A canonical deployment old enough to have fallen off one page of the listing is
  // legitimate, so absence from the listing is accepted rather than fatal.
  assert.equal(
    selectServingDeployment(project('zzzz'), listing([ourPreview, B, A])),
    'zzzz',
    'a canonical deployment beyond the first page of the listing is still the answer'
  );

  // Shape guards. Falling back to "the newest" when the field is missing is exactly the
  // wrong direction to fail in, so the absence of the field must stop the rollback.
  assert.throws(
    () => selectServingDeployment({ name: 'ordoia' }, listing([B])),
    /no `canonical_deployment` field/,
    'a project response without the field must fail loudly, not guess'
  );
  assert.throws(
    () => selectServingDeployment(project('bbbb'), { success: true }),
    /the API shape changed/,
    'a response with no result array must fail loudly'
  );

  // Two Cloudflare responses disagreeing about the same project is not a thing to average.
  assert.throws(
    () => selectServingDeployment(project('pppp'), listing([ourPreview, B, A])),
    /Two answers from the same API disagree/,
    'a canonical deployment the listing calls a preview must stop the rollback'
  );
});
