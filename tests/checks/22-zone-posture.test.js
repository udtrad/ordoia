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
 * ── The DNS records, added 2026-09-10 ──────────────────────────────────────────────
 *
 * This check is no longer only about switches. `evaluateZone` also asserts that every
 * record `tools/dns-plan.json` requires is still on the zone, and that exactly one SPF
 * record exists. Those six records — the apex CNAME and the five that let ordoia.com send
 * and receive mail — were applied by `records()` and read back by nothing, so deleting all
 * of them from the dashboard left this check, the suite and the weekly canary green on a
 * domain that could not receive a word.
 *
 * The population is `DNS_ENSURE`, imported from the plan rather than written out here, and
 * `goodRecords()` below is built from it for the same reason `goodSettings()` is built from
 * `ZONE_SETTINGS`. It asserts presence, not exclusivity: a record the plan never declared
 * is invisible to it, and `CHECKS.md` records why that gap is left open.
 *
 * ── Why the target table lives in tools/ and not here ──────────────────────────────
 *
 * `ZONE_SETTINGS`, `DNS_ENSURE` and `evaluateZone()` are exported from
 * `tools/zone-setup.mjs`, which is also what applies them. One table, two consumers.
 * `tests/lib/posture.js` exists because check 14 and check 15 each wrote their own header
 * evaluator and check 14's was wrong; a zone hardened by one table and asserted by another
 * would be the same defect, one layer down. Check 20 imports from `tools/` for the same
 * reason.
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
import {
  ZONE_SETTINGS,
  REQUIRED_CAA,
  DNS_ENSURE,
  evaluateZone,
  findZone,
  readZone,
  wholeListing,
  wouldDuplicate,
} from '../../tools/zone-setup.mjs';

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

/**
 * A zone holding every record `tools/dns-plan.json` requires.
 *
 * Derived from the plan for the same reason `goodSettings()` is derived from
 * `ZONE_SETTINGS`: a record added to the plan cannot then be left untested by omission.
 * Written out by hand until 2026-09-10, this fixture listed mx1 but not mx2, and no DKIM
 * record at all — which was invisible precisely because nothing asserted against it.
 */
const goodRecords = (apex) =>
  DNS_ENSURE.map((r) => ({ ...r, name: r.name === '@' ? apex : r.name }));

/** The good records with one of the plan's entries taken away. */
const withoutRecord = (apex, predicate) => goodRecords(apex).filter((r) => !predicate(r));

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
    required: 'records tools/dns-plan.json requires that the zone still holds',
  });

  const observed = await readZone(found.id);
  const { findings, observed: counts } = evaluateZone({ ...observed, apex });

  s.count('settings', counts.settings);
  s.count('records', counts.records);
  s.count('required', counts.required);
  s.failAll(findings);

  s.report(
    `the Cloudflare zone for ${apex} is not in the posture DEPLOY.md sets. Two of these ` +
      `settings — Speed Brain and Email Address Obfuscation — are on by default, and the ` +
      `first of them is invisible to check 15. The mail records are here too: this domain ` +
      `receives at hello@ordoia.com, which is the site's only conversion path. Apply the ` +
      `table with: node tools/zone-setup.mjs harden --apply, and the records with: ` +
      `node tools/zone-setup.mjs records --apply`
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
  assert.equal(
    clean.observed.required,
    DNS_ENSURE.length,
    'the fixture satisfied fewer of the plan\'s records than it declares, so the mail ' +
      'controls below would be measuring an empty population'
  );
  assert.ok(DNS_ENSURE.length > 0, 'tools/dns-plan.json declared no records to require');

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
    // ── Mail ──────────────────────────────────────────────────────────────────────
    //
    // Namecheap Private Email is live on this domain and `hello@ordoia.com` is the only
    // conversion path the site has. Every record below can be deleted from the Cloudflare
    // dashboard in one click, and until 2026-09-10 the whole of this check stayed green
    // when they were — the weekly canary would have reported a healthy zone that cannot
    // receive a word.
    {
      name: 'the primary mail exchanger deleted',
      input: zone(apex, {
        records: withoutRecord(apex, (r) => r.content === 'mx1.privateemail.com'),
      }),
      match: /no MX record at ordoia\.com with content "mx1\.privateemail\.com"/,
    },
    {
      // The one a hand-written fixture missed. Losing the fallback costs nothing on a day
      // mx1 answers, which is what makes it survive: mail keeps arriving until it doesn't.
      name: 'the fallback mail exchanger deleted, leaving mail with no second route',
      input: zone(apex, {
        records: withoutRecord(apex, (r) => r.content === 'mx2.privateemail.com'),
      }),
      match: /no MX record at ordoia\.com with content "mx2\.privateemail\.com"/,
    },
    {
      name: 'the SPF record deleted, so this domain authorises no sender at all',
      input: zone(apex, {
        records: withoutRecord(apex, (r) => String(r.content).startsWith('v=spf1')),
      }),
      match: /no TXT record at ordoia\.com with content "v=spf1 /,
    },
    {
      // A second SPF record is worse than a wrong one: RFC 7208 §4.5 makes both permerror
      // rather than merging them, so adding a sender the "safe" way breaks the sender that
      // already worked. `dns-plan.json` states this in prose; nothing enforced it.
      name: 'a second SPF record added beside the first',
      input: zone(apex, {
        records: [
          ...goodRecords(apex),
          { type: 'TXT', name: apex, content: 'v=spf1 include:sendgrid.net ~all' },
        ],
      }),
      match: /has 2 SPF records/,
    },
    {
      name: 'the DKIM public key deleted, so nothing this domain sends can be verified',
      input: zone(apex, {
        records: withoutRecord(apex, (r) => String(r.name).startsWith('privateemail._domainkey')),
      }),
      match: /no TXT record at privateemail\._domainkey\.ordoia\.com/,
    },
    {
      name: 'the DMARC record deleted',
      input: zone(apex, {
        records: withoutRecord(apex, (r) => String(r.name).startsWith('_dmarc')),
      }),
      match: /no TXT record at _dmarc\.ordoia\.com/,
    },
    {
      // The apex CNAME is in the plan too. The negative DNS rules above are statements
      // about the records that *are* there — "the CNAME points at X", "it is proxied" —
      // so none of them has anything to say when the record is gone. Only the plan loop
      // notices, and until it existed a deleted apex CNAME was a silent zone.
      name: 'the apex CNAME deleted outright, which the negative DNS rules cannot see',
      input: zone(apex, { records: withoutRecord(apex, (r) => r.type === 'CNAME') }),
      match: /no CNAME record at ordoia\.com with content "ordoia\.pages\.dev"/,
    },
    {
      // Comparison includes MX priority, because two exchangers differing only in
      // preference are two different records. A dashboard edit that renumbers mx1 leaves
      // a record with the right hostname that is not the record the plan asked for — and
      // the finding has to name the priority it wanted, or it reads as a lie about a
      // hostname that is plainly present.
      name: 'the primary mail exchanger renumbered, so it is no longer the preferred route',
      input: zone(apex, {
        records: goodRecords(apex).map((r) =>
          r.content === 'mx1.privateemail.com' ? { ...r, priority: 20 } : r
        ),
      }),
      match: /no MX record at ordoia\.com with content "mx1\.privateemail\.com" \(priority 10\)/,
    },
    {
      // Priority absent rather than wrong, which is what a hand-made record or a changed
      // API shape looks like. It must read as the record being absent, not as a match:
      // an MX with no preference is not the MX the plan applied.
      name: 'an MX record served with no priority field at all',
      input: zone(apex, {
        records: goodRecords(apex).map((r) =>
          r.content === 'mx2.privateemail.com' ? { ...r, priority: undefined } : r
        ),
      }),
      match: /no MX record at ordoia\.com with content "mx2\.privateemail\.com" \(priority 10\)/,
    },
    {
      // The SPF count reads TXT values through `txtValue`, not the raw field. A second
      // record served as the quoted strings DNS actually uses would otherwise never be
      // counted — and a duplicate added by hand is the only way this finding ever fires,
      // so a counter blind to how DNS serves TXT is a counter that never fires at all.
      name: 'a second SPF record returned as the quoted strings DNS serves',
      input: zone(apex, {
        records: [
          ...goodRecords(apex),
          { type: 'TXT', name: apex, content: '"v=spf1 include:sendgrid.net" " ~all"' },
        ],
      }),
      match: /has 2 SPF records/,
    },
    {
      // `sameRecord` compares type, name, content and MX priority — not `proxied` — so a
      // DNS-only apex CNAME still counts toward `observed.required`. That is only safe
      // because the CNAME rule states it separately, and this control holds every other
      // plan record in place so that rule is demonstrably the one reporting.
      name: 'the apex CNAME turned DNS-only while every plan record is still present',
      input: zone(apex, {
        records: goodRecords(apex).map((r) => (r.type === 'CNAME' ? { ...r, proxied: false } : r)),
      }),
      match: /is DNS-only/,
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
    {
      // The `v=spf1` token is case-insensitive, so a record typed into a dashboard as
      // `V=spf1` is a second SPF record to every resolver on earth. The count folds case
      // for exactly that, and until 2026-09-10 nothing witnessed the fold: both duplicate
      // controls wrote their second record lowercase, so deleting `.toLowerCase()` left
      // this check green while the domain permerrored on both records.
      name: 'a second SPF record written with an uppercase v=, as a dashboard accepts it',
      input: zone(apex, {
        records: [
          ...goodRecords(apex),
          { type: 'TXT', name: apex, content: 'V=SPF1 include:sendgrid.net ~all' },
        ],
      }),
      match: /has 2 SPF records/,
    },
    {
      // Two of the plan's six entries spell the domain out rather than using `@`, so the
      // plan can name a record that cannot exist in the zone being evaluated. Evaluating
      // against a different apex is what makes those two unmatchable, which is precisely
      // what a domain change would do — and it must be reported as a mis-specified plan,
      // not as six records mysteriously missing.
      name: 'a plan entry naming a domain this zone does not serve',
      input: zone('example.net'),
      match: /not a name inside example\.net/,
    },
    {
      // The must-permit case for uppercase names cannot defend `apexRecords` on its own: an
      // un-normalised filter selects nothing, and a rule with nothing to iterate reports
      // nothing, which reads exactly like a clean zone. This is that fixture with a real
      // violation planted in it — if the apex population goes empty, the parking record is
      // never seen and this control fails.
      name: 'a parking A record at an apex whose names are served uppercase',
      input: zone(apex, {
        records: [
          ...goodRecords(apex).map((r) => ({ ...r, name: String(r.name).toUpperCase() })),
          { type: 'A', name: apex.toUpperCase(), content: '162.255.119.119' },
        ],
      }),
      match: /there is an A record at ordoia\.com/,
    },
    {
      // Addition, not deletion. Every mail control above removes or mutates a planned
      // record; this one leaves all six in place. `required` reads 6/6, the SPF count is 1,
      // and every other rule is satisfied — while an exchanger at a lower preference number
      // quietly receives every message sent to the domain.
      name: 'a rogue MX below both planned exchangers, with the plan otherwise intact',
      input: zone(apex, {
        records: [
          ...goodRecords(apex),
          { type: 'MX', name: apex, content: 'mail.attacker.example', priority: 5 },
        ],
      }),
      match: /MX record at ordoia\.com that tools\/dns-plan\.json does not declare/,
    },
    {
      // The same shape one record type over: a second selector is a second private key that
      // can sign mail passing DMARC alignment for this domain.
      name: 'an undeclared DKIM selector beside the planned one',
      input: zone(apex, {
        records: [
          ...goodRecords(apex),
          { type: 'TXT', name: `selector2._domainkey.${apex}`, content: 'v=DKIM1;k=rsa;p=AAAB' },
        ],
      }),
      match: /DKIM selector at selector2\._domainkey\.ordoia\.com that tools\/dns-plan\.json does not declare/,
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
      // The DKIM public key is 408 bytes and a DNS character-string holds 255, so it is
      // served as several quoted strings. Comparing the raw field would report the record
      // absent on every real zone — a check that is red for a correct configuration gets
      // switched off, which is worse than not having written it.
      name: 'the DKIM key returned as the several quoted strings DNS actually serves',
      input: zone(apex, {
        records: goodRecords(apex).map((r) => {
          if (!String(r.name).startsWith('privateemail._domainkey')) return r;
          const v = String(r.content);
          return { ...r, content: `"${v.slice(0, 200)}" "${v.slice(200)}"` };
        }),
      }),
    },
    {
      name: 'an unrelated TXT record at the apex that is not an SPF record',
      input: zone(apex, {
        records: [
          ...goodRecords(apex),
          { type: 'TXT', name: apex, content: 'google-site-verification=abc123' },
        ],
      }),
    },
    {
      // Every rule in the evaluator reads records through `r?.`, deliberately. The plan
      // loop reaches them through `sameRecord`, which did not, so a single null entry in
      // a DNS listing turned this check from a zone report into an opaque TypeError —
      // a check that crashes says nothing about the zone, which is the state this whole
      // file exists to refuse.
      name: 'a null entry in the records array, which must not crash the evaluator',
      input: zone(apex, { records: [null, undefined, ...goodRecords(apex)] }),
    },
    {
      // TXT values are read through `String()` before they are compared, so a record with
      // no content, or one whose content arrived as a number, is a record that does not
      // match the plan. Not a crash, and not an SPF record that the count then trips on.
      name: 'a TXT record at the apex with a missing or non-string content',
      input: zone(apex, {
        records: [
          ...goodRecords(apex),
          { type: 'TXT', name: apex },
          { type: 'TXT', name: apex, content: 12345 },
        ],
      }),
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
    {
      // The SPF count is scoped to the apex. An ESP's sending subdomain publishes its own
      // SPF record, which is not a second SPF record for ordoia.com — counting it would
      // turn this check red the first day anyone sends mail from a subdomain, and a check
      // that is red on a correct zone is a check that gets switched off.
      name: 'an SPF record on a sending subdomain, which is not a second apex SPF record',
      input: zone(apex, {
        records: [
          ...goodRecords(apex),
          { type: 'TXT', name: `em.${apex}`, content: 'v=spf1 include:sendgrid.net ~all' },
        ],
      }),
    },
    {
      // Preference is compared through Number(), because "10" and 10 are the same
      // preference to a mail server. The MX controls above use a number and an absent
      // field; neither reaches the coercion, so a listing that quoted the field would read
      // as both exchangers missing on a zone that is entirely correct.
      name: 'MX preferences served as strings, which are the same preference',
      input: zone(apex, {
        records: goodRecords(apex).map((r) =>
          r.type === 'MX' ? { ...r, priority: String(r.priority) } : r
        ),
      }),
    },
    {
      // DNS names are case-insensitive and the root label is optional. No other fixture can
      // catch a comparison that does not know that, because every one of them builds the
      // zone from the same `DNS_ENSURE` and the same `apex` the evaluator then compares
      // against — `sameRecord(x, x)`, reflexive by construction. This one spells the names
      // the other two legal ways.
      name: 'records served with uppercase names and a trailing root dot',
      input: zone(apex, {
        records: goodRecords(apex).map((r, i) => ({
          ...r,
          name: i % 2 === 0 ? String(r.name).toUpperCase() : `${r.name}.`,
        })),
      }),
    },
  ];

  for (const { name, input } of mustPermit) {
    const { findings } = evaluateZone(input);
    assert.deepEqual(findings, [], `${name}: falsely flagged`);
  }

  // `observed.required` counts *plan entries satisfied*, not records seen, so a zone holding
  // one record twice cannot inflate it past what the plan declares. If it could, the live
  // check's population would read healthy on a zone missing a record that some unrelated
  // duplicate had padded the count for — lesson 8 with `required` as the denominator.
  const duplicated = evaluateZone(
    zone(apex, {
      records: [
        ...goodRecords(apex),
        { type: 'MX', name: apex, content: 'mx1.privateemail.com', priority: 10 },
      ],
    })
  );
  assert.deepEqual(
    duplicated.findings,
    [],
    'the same MX record present twice is untidy, not a mail failure, and must not be flagged'
  );
  assert.equal(
    duplicated.observed.required,
    DNS_ENSURE.length,
    'a duplicated record inflated the satisfied-plan-entries count past the plan itself'
  );

  // And it has to go DOWN. Asserting the counter only at its full value leaves it free to
  // report a full population on a zone that is missing records — the live check feeds it to
  // `survey`, which tests for zero and cannot tell a padded count from an honest one. A
  // denominator that cannot shrink is not a denominator.
  const missingOne = evaluateZone(
    zone(apex, { records: withoutRecord(apex, (r) => r.content === 'mx2.privateemail.com') })
  );
  assert.equal(
    missingOne.observed.required,
    DNS_ENSURE.length - 1,
    'a plan record absent from the zone still counted toward observed.required'
  );

  // The apex population itself, for the same reason: every rule keyed on `apexRecords` is
  // disarmed by an empty one, and disarmed rules report nothing rather than reporting a
  // problem.
  const upper = evaluateZone(
    zone(apex, {
      records: goodRecords(apex).map((r) => ({ ...r, name: String(r.name).toUpperCase() })),
    })
  );
  assert.equal(
    upper.observed.required,
    DNS_ENSURE.length,
    'uppercase record names emptied the matched population instead of matching'
  );

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

/**
 * The two guards on the read and the write, which `evaluateZone` never reaches.
 *
 * They are here rather than left to the applier because a guard with no witness is the
 * thing this check exists to refuse, and both of these protect mail: one stops a partial
 * DNS listing being read as the whole zone, the other stops the repair command creating
 * the duplicate its own finding warns about.
 */
test('check 22 — a truncated listing is not a zone, and the applier will not duplicate', () => {
  const page = (n) => Array.from({ length: n }, (_, i) => ({ type: 'TXT', name: `r${i}` }));

  assert.equal(
    wholeListing({ result: page(6), result_info: { total_count: 6 } }).length,
    6,
    'a complete listing must be returned as it is'
  );
  assert.throws(
    () => wholeListing({ result: page(200), result_info: { total_count: 341 } }),
    /the zone has 341 DNS records and this read returned 200/,
    'a truncated listing must throw rather than be evaluated as the whole zone — a full ' +
      'first page is the shape a truncation actually takes, and it reads as healthy'
  );
  assert.equal(
    wholeListing({ result: page(3) }).length,
    3,
    'an API that stops sending result_info must not start throwing on every read'
  );

  // The drift case the applier used to get wrong: same name, different content. It cannot
  // be told apart from "absent" by `sameRecord`, so `toAdd` contains it and a plain POST
  // leaves two.
  const liveSpf = [{ type: 'TXT', name: 'ordoia.com', content: 'v=spf1 include:widened.example ~all' }];
  assert.ok(
    wouldDuplicate(
      { type: 'TXT', name: 'ordoia.com', content: 'v=spf1 include:spf.privateemail.com ~all' },
      liveSpf
    ),
    'adding the plan SPF beside a hand-widened one must be refused — two SPF records ' +
      'permerror on both, which is the failure this plan exists to prevent'
  );
  assert.ok(
    wouldDuplicate(
      { type: 'TXT', name: 'privateemail._domainkey.ordoia.com', content: 'v=DKIM1;k=rsa;p=NEW' },
      [{ type: 'TXT', name: 'privateemail._domainkey.ordoia.com', content: 'v=DKIM1;k=rsa;p=OLD' }]
    ),
    'a rotated DKIM key must be refused rather than added beside the old one'
  );

  // And it must not refuse the ordinary cases, or the plan can never be applied at all.
  assert.equal(wouldDuplicate({ type: 'TXT', name: 'ordoia.com', content: 'v=spf1 a ~all' }, []), null,
    'an SPF record on a zone that has none must apply normally');
  assert.equal(
    wouldDuplicate({ type: 'MX', name: 'ordoia.com', content: 'mx2.privateemail.com', priority: 10 }, [
      { type: 'MX', name: 'ordoia.com', content: 'mx1.privateemail.com', priority: 10 },
    ]),
    null,
    'a second mail exchanger is a fallback, not a duplicate — refusing it would make the ' +
      'plan unappliable and leave the domain with one route to its mail'
  );
  assert.equal(
    wouldDuplicate({ type: 'TXT', name: 'ordoia.com', content: 'google-site-verification=x' }, [
      { type: 'TXT', name: 'ordoia.com', content: 'v=spf1 include:spf.privateemail.com ~all' },
    ]),
    null,
    'an unrelated TXT at a name that also holds SPF must apply normally'
  );
});
