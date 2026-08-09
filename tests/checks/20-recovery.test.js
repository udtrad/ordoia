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
 *   tools/pages-api.mjs  selectRollbackTarget()  ← pure. Covered below, against fixtures
 *                                                  built to Cloudflare's documented shape.
 *   tools/probe-live.mjs probe()                 ← covered below against a real origin and
 *                                                  against planted broken ones.
 *
 * ── What this check does not establish, stated because the rubric would ask ─────────
 *
 * **No call has ever been made to the Cloudflare API.** There is no account yet. This
 * check proves that given a listing, the right deployment is chosen; it cannot prove that
 * a listing comes back in that shape, or that the rollback POST does what its
 * documentation says. Only the drill in DEPLOY.md settles that, and it has not been run.
 * The distinction matters here more than usual: a rollback that silently promoted the
 * wrong deployment would look exactly like a recovery.
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
import { selectRollbackTarget } from '../../tools/pages-api.mjs';

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

test('check 20 — the rollback target is the deployment currently in production (controls)', () => {
  const previous = deployment({ id: 'aaaa', created_on: '2026-08-01T00:00:00Z' });
  const older = deployment({ id: 'bbbb', created_on: '2026-07-01T00:00:00Z' });

  // The listing this pipeline actually produces: our own preview upload is the newest
  // deployment in the project, and it is not a valid rollback target. "The most recent
  // deployment" would pick it every time.
  const ourPreview = deployment({
    id: 'cccc',
    environment: 'preview',
    created_on: '2026-08-09T00:00:00Z',
  });

  const failed = deployment({
    id: 'dddd',
    status: 'failure',
    created_on: '2026-08-05T00:00:00Z',
  });

  assert.equal(
    selectRollbackTarget(listing([ourPreview, failed, previous, older])),
    'aaaa',
    'the newest *successful production* deployment is the one production is serving'
  );

  assert.equal(
    selectRollbackTarget(listing([ourPreview])),
    null,
    'a project with no successful production deployment has nothing to roll back to — ' +
      'the first ever deploy, which must not be an error'
  );

  assert.equal(selectRollbackTarget(listing([])), null, 'an empty project rolls back to nothing');

  // The ordering assumption is about someone else's service, so it is checked rather than
  // trusted. Rolling back to the wrong deployment is worse than not rolling back: it
  // looks like a recovery.
  assert.throws(
    () => selectRollbackTarget(listing([older, previous])),
    /no longer newest-first/,
    'a listing that is not newest-first must stop the rollback, not silently promote the ' +
      'wrong bytes'
  );

  assert.throws(
    () => selectRollbackTarget({ success: true }),
    /the API shape changed/,
    'a response with no result array must fail loudly'
  );
});
