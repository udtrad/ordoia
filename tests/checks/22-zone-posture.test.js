/**
 * Check 22 — the Cloudflare zone still holds the posture it was set to.
 *
 * `_headers` is checked twice already: check 14 reads the file the build emits, check 15
 * reads what the host actually returns. Neither can see the layer underneath them. Email
 * Address Obfuscation, Rocket Loader and Speed Brain are not headers and are not files —
 * they are switches on the zone, they are on by default, and two of the three rewrite or
 * augment what a reader receives.
 *
 * Check 15 catches Email Obfuscation and Rocket Loader indirectly, because both leave
 * `/cdn-cgi/` in the HTML. **It cannot catch Speed Brain**, which adds a `Speculation-Rules`
 * response header pointing at a Cloudflare URL and leaves the body byte-identical. So the
 * strongest check in this suite is green on a zone that is instructing browsers to prefetch
 * on our behalf, undisclosed, on a site whose argument is that the edge does not touch what
 * it published.
 *
 * `DEPLOY.md` names the gap this closes in its own words: the weekly canary *"is the only
 * thing in this repository that would notice a Cloudflare zone setting being switched on
 * years from now, long after anyone remembers why it was off"* — and until now the only way
 * it would notice was a byte diff, which two of these settings do not produce.
 *
 * ── Why the target table lives in tools/ and not here ──────────────────────────────
 *
 * `ZONE_SETTINGS` and `evaluateZone()` are exported from `tools/zone-setup.mjs`, which is
 * also what applies them. One table, two consumers. `tests/lib/posture.js` exists because
 * check 14 and check 15 each wrote their own header evaluator and check 14's was wrong; a
 * zone hardened by one table and asserted by another would be the same defect, one layer
 * down. Check 20 imports from `tools/` for the same reason.
 *
 * ── What this check does not establish ─────────────────────────────────────────────
 *
 * It reads Cloudflare's answer about Cloudflare's own configuration. A setting reported
 * `off` that is nonetheless applied at the edge would satisfy this check and fail check 15,
 * which is the right division: this one is about configuration, that one about bytes on the
 * wire. Neither replaces the other.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import { ZONE_SETTINGS, REQUIRED_CAA, evaluateZone, findZone, readZone } from '../../tools/zone-setup.mjs';

/**
 * Opt-in, in the manner of check 15's `ORDOIA_LIVE`: `npm test` stays hermetic and nothing
 * needing the network can block a build.
 *
 * But when it *is* set and the credentials are not, this fails rather than skips. A check
 * that quietly skips itself in CI reports a green gate having tested nothing — the shape
 * `deploy.yml`'s "The preview must have an address" step exists to refuse, and the reason
 * check 15's skip is safe only because nothing ever sets `ORDOIA_LIVE` to an empty string
 * on purpose.
 */
const WANTED = process.env.ORDOIA_ZONE_CHECK;
const SKIP = 'set ORDOIA_ZONE_CHECK=1 (with Cloudflare credentials) to check the live zone';

const PAGES_HOST = 'ordoia.pages.dev';

/**
 * A zone answering exactly as a hardened one should. The controls mutate copies of it.
 *
 * Built *from* `ZONE_SETTINGS` rather than written out beside it, so a target added to the
 * table cannot be left untested by omission — the `observed.settings` assertion below
 * catches any target the fixture fails to satisfy. Nested targets (`path`) are nested back
 * into the shape Cloudflare returns.
 */
function goodSettings() {
  return ZONE_SETTINGS.map((target) => {
    if (!target.path) return { id: target.id, value: target.value, editable: true };
    const value = target.path.reduceRight((acc, key) => ({ [key]: acc }), target.value);
    return { id: target.id, value, editable: true };
  });
}

/** Set a target's value inside a copy of the good settings, nesting where it needs to. */
function mutate(id, value) {
  return goodSettings().map((s) => {
    if (s.id !== id) return s;
    const target = ZONE_SETTINGS.find((t) => t.id === id);
    if (!target?.path) return { ...s, value };
    return { ...s, value: target.path.reduceRight((acc, key) => ({ [key]: acc }), value) };
  });
}

const goodRecords = (apex) => [
  { type: 'CNAME', name: apex, content: PAGES_HOST, proxied: true },
  { type: 'MX', name: apex, content: 'mx1.privateemail.com', priority: 10, proxied: false },
  { type: 'TXT', name: apex, content: 'v=spf1 include:spf.privateemail.com ~all' },
  { type: 'TXT', name: `_dmarc.${apex}`, content: 'v=DMARC1; p=none;' },
];

const goodBots = () => ({ available: true, fightMode: false });

const zone = (apex, over = {}) => ({
  settings: goodSettings(),
  records: goodRecords(apex),
  botManagement: goodBots(),
  apex,
  pagesHost: PAGES_HOST,
  ...over,
});

test('check 22 — the live zone holds its posture', async (t) => {
  if (!WANTED) return t.skip(SKIP);

  const apex = SITE.domain;
  const found = await findZone(apex);
  assert.ok(
    found,
    `${apex} is not a zone on this Cloudflare account, so there is no posture to check. ` +
      `Run: node tools/zone-setup.mjs zone-create --apply`
  );

  const s = survey({
    settings: 'target settings found in the zone settings response',
    records: 'DNS records read from the zone',
  });

  const observed = await readZone(found.id);
  const { findings, observed: counts } = evaluateZone({ ...observed, apex });

  s.count('settings', counts.settings);
  s.count('records', counts.records);
  s.failAll(findings);

  s.report(
    `the Cloudflare zone for ${apex} is not in the posture DEPLOY.md sets. Two of these ` +
      `settings — Speed Brain and Email Address Obfuscation — are on by default, and the ` +
      `first of them is invisible to check 15. Apply the table with: ` +
      `node tools/zone-setup.mjs harden --apply`
  );
});

test('check 22 — the evaluator still catches a widened zone (controls)', () => {
  const apex = 'ordoia.com';

  // Must permit: the hardened zone, and every population non-empty on it. If the fixture
  // ever stops matching the table, `settings` goes to zero and the must-catch cases below
  // would all "pass" by measuring nothing — the exact failure this check is about.
  const clean = evaluateZone(zone(apex));
  assert.deepEqual(clean.findings, [], 'the hardened fixture must produce no findings');
  assert.equal(
    clean.observed.settings,
    ZONE_SETTINGS.length,
    'the fixture matched fewer settings than the table declares, so the controls below ' +
      'would be measuring an empty population'
  );

  const mustCatch = [
    {
      name: 'Email Address Obfuscation back on',
      input: zone(apex, { settings: mutate('email_obfuscation', 'on') }),
      match: /email_obfuscation is "on"/,
    },
    {
      name: 'Speed Brain back on — the one check 15 cannot see',
      input: zone(apex, { settings: mutate('speed_brain', 'on') }),
      match: /speed_brain is "on"/,
    },
    {
      name: 'Rocket Loader back on',
      input: zone(apex, { settings: mutate('rocket_loader', 'on') }),
      match: /rocket_loader is "on"/,
    },
    {
      name: 'the JavaScript-library rewriter back on',
      input: zone(apex, { settings: mutate('replace_insecure_js', 'on') }),
      match: /replace_insecure_js is "on"/,
    },
    {
      name: 'Server Side Excludes back on — the same URL serving different documents',
      input: zone(apex, { settings: mutate('server_side_exclude', 'on') }),
      match: /server_side_exclude is "on"/,
    },
    {
      name: "Always Online back on — a third party's archived copy served as ours",
      input: zone(apex, { settings: mutate('always_online', 'on') }),
      match: /always_online is "on"/,
    },
    {
      // Nested inside a structured setting, so it exercises the path resolution as well as
      // the rule. Enabling this puts a second Strict-Transport-Security on the wire beside
      // the one _headers sends, and CHANGES.md row 22 records what Cloudflare does with a
      // header declared twice: it joins the values with a comma.
      name: 'zone-level HSTS switched on beside the one _headers already sends',
      input: zone(apex, { settings: mutate('security_header', true) }),
      match: /security_header\.strict_transport_security\.enabled is true/,
    },
    {
      name: 'SSL downgraded from Full (strict)',
      input: zone(apex, { settings: mutate('ssl', 'flexible') }),
      match: /ssl is "flexible"/,
    },
    {
      name: 'SSL at "full", which reads as strict in the dashboard and validates nothing',
      input: zone(apex, { settings: mutate('ssl', 'full') }),
      match: /ssl is "full"/,
    },
    {
      name: 'Always Use HTTPS switched off',
      input: zone(apex, { settings: mutate('always_use_https', 'off') }),
      match: /always_use_https is "off"/,
    },
    {
      name: 'the TLS floor lowered',
      input: zone(apex, { settings: mutate('min_tls_version', '1.0') }),
      match: /min_tls_version is "1\.0"/,
    },
    {
      // The one that matters most. A naive evaluator asks "of the settings returned, is
      // each one what we wanted?" and finds nothing to disagree with, reporting green
      // while measuring nothing. Lesson 8, one layer below the site.
      name: 'a target setting missing from the response entirely',
      input: zone(apex, {
        settings: goodSettings().filter((s) => s.id !== 'email_obfuscation'),
      }),
      match: /does not contain "email_obfuscation" at all/,
    },
    {
      name: "the registrar's parking A record still at the apex",
      input: zone(apex, {
        records: [...goodRecords(apex), { type: 'A', name: apex, content: '162.255.119.119' }],
      }),
      match: /there is an A record at ordoia\.com/,
    },
    {
      name: 'the apex CNAME pointing somewhere other than this Pages project',
      input: zone(apex, {
        records: [{ type: 'CNAME', name: apex, content: 'someone-else.pages.dev', proxied: true }],
      }),
      match: /points at someone-else\.pages\.dev/,
    },
    {
      name: 'the apex CNAME left DNS-only, so no zone setting applies to it',
      input: zone(apex, {
        records: [{ type: 'CNAME', name: apex, content: PAGES_HOST, proxied: false }],
      }),
      match: /is DNS-only/,
    },
    {
      name: 'a CAA record that would block the certificate',
      input: zone(apex, {
        records: [...goodRecords(apex), { type: 'CAA', name: apex, content: '0 issue "digicert.com"' }],
      }),
      match: /none of them permits letsencrypt\.org/,
    },
    {
      name: 'Bot Fight Mode on',
      input: zone(apex, { botManagement: { available: true, fightMode: true } }),
      match: /Bot Fight Mode is on/,
    },
    {
      name: 'Bot Fight Mode unreadable — unmeasured is not the same as fine',
      input: zone(apex, { botManagement: { available: false, why: 'HTTP 403' } }),
      match: /Bot Fight Mode could not be read \(HTTP 403\)/,
    },
  ];

  for (const { name, input, match } of mustCatch) {
    const { findings } = evaluateZone(input);
    assert.ok(
      findings.some((f) => match.test(f)),
      `${name}: not caught. Findings were: ${findings.join(' / ') || 'none at all'}`
    );
  }

  // Must permit: things that look like violations and are not.
  const mustPermit = [
    {
      name: 'no CAA records at all — issuance is unrestricted, which is correct here',
      input: zone(apex, { records: goodRecords(apex) }),
    },
    {
      name: 'CAA records that permit every CA the custom domain may use',
      input: zone(apex, {
        records: [
          ...goodRecords(apex),
          ...REQUIRED_CAA.map((ca) => ({ type: 'CAA', name: apex, content: `0 issue "${ca}"` })),
        ],
      }),
    },
    {
      name: 'settings this table does not target',
      input: zone(apex, {
        settings: [...goodSettings(), { id: 'brotli', value: 'on' }, { id: 'early_hints', value: 'on' }],
      }),
      // Compression and 103 responses do not change the bytes of the document, so they are
      // deliberately not in the table. Asserting settings that do not matter is how a
      // posture check becomes noise that gets switched off.
    },
    {
      name: 'an address record on a subdomain, which the apex rule is not about',
      input: zone(apex, {
        records: [...goodRecords(apex), { type: 'A', name: `mail.${apex}`, content: '203.0.113.9' }],
      }),
    },
    {
      name: 'CAA given structured rather than as a content string',
      input: zone(apex, {
        records: [
          ...goodRecords(apex),
          ...REQUIRED_CAA.map((ca) => ({
            type: 'CAA',
            name: apex,
            data: { flags: 0, tag: 'issue', value: ca },
          })),
        ],
      }),
    },
  ];

  for (const { name, input } of mustPermit) {
    const { findings } = evaluateZone(input);
    assert.deepEqual(findings, [], `${name}: falsely flagged`);
  }

  // The API shape is someone else's, so a change in it must stop the check rather than be
  // read as a clean zone — the same reason selectRollbackTarget throws on a missing result.
  assert.throws(
    () => evaluateZone({ ...zone(apex), settings: undefined }),
    /the API shape changed/,
    'a settings response with no array must fail loudly, not evaluate as a zone with no settings'
  );
  assert.throws(
    () => evaluateZone({ ...zone(apex), records: null }),
    /the API shape changed/,
    'a DNS response with no array must fail loudly'
  );
});
