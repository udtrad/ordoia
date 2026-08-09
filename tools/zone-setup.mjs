/**
 * Stage 6 — the Cloudflare zone, and the posture it has to hold.
 *
 *   node tools/zone-setup.mjs preflight            what this token can actually reach
 *   node tools/zone-setup.mjs zone-create [--apply]  add ordoia.com as a zone
 *   node tools/zone-setup.mjs status                 zone state, settings, records
 *   node tools/zone-setup.mjs harden [--apply]       apply ZONE_SETTINGS
 *   node tools/zone-setup.mjs records [--apply]      apply tools/dns-plan.json
 *   node tools/zone-setup.mjs custom-domain [--apply]  attach the apex to the Pages project
 *
 * **Every mutating command is a dry run unless `--apply` is passed.** It prints the diff
 * it would make and exits 0 having changed nothing. That is not politeness: half of these
 * calls are hard to undo, and `DEPLOY.md` is explicit that a Direct Upload project's
 * production branch cannot be changed from the dashboard afterwards.
 *
 * ── One table, two consumers ───────────────────────────────────────────────────────
 *
 * `ZONE_SETTINGS` below is both what `harden` applies and what check 22 asserts, through
 * the pure `evaluateZone()`. That is the shape `tests/lib/posture.js` already uses for the
 * HTTP headers — one evaluator, two sources — and it exists for the same reason: check 14
 * and check 15 each wrote their own header evaluator, and check 14's was wrong.
 *
 * ── Why an absent setting is a failure ─────────────────────────────────────────────
 *
 * `evaluateZone` fails when a target id does not appear in Cloudflare's response at all.
 * That looks pedantic and is the most important line in the file. If Cloudflare renames
 * `email_obfuscation`, or moves it behind a plan, the naive evaluator — "for each setting
 * the API returned, is it what we wanted?" — finds nothing to disagree with and reports
 * green. That is lesson 8 with a different denominator: an assertion whose population went
 * empty, passing while measuring nothing. The population here is *settings matched*, and
 * it is asserted.
 *
 * ── Secrets ────────────────────────────────────────────────────────────────────────
 *
 * The token comes from the environment via `cf-api.mjs` and is never printed. Nothing here
 * writes it to a file, and no command takes it as an argument.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cfCall, tryCall, accountId } from './cf-api.mjs';
import { siteRecord } from './site-origin.mjs';
import { PROJECT } from './pages-api.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const DNS_PLAN = path.join(REPO_ROOT, 'tools', 'dns-plan.json');

/** Certificate authorities that must be able to issue for the apex, per DEPLOY.md. */
export const REQUIRED_CAA = ['letsencrypt.org', 'pki.goog', 'ssl.com'];

/**
 * The zone posture. Every entry is a thing the Cloudflare edge would otherwise do to
 * bytes this site published, or a floor §9 asks for.
 *
 * `why` is not decoration — it is what the check prints when the setting drifts, years
 * from now, to somebody who was not here.
 */
export const ZONE_SETTINGS = [
  {
    id: 'email_obfuscation',
    value: 'off',
    why:
      'on by default — measured "on" on this zone at creation. It rewrites mailto: links into ' +
      "/cdn-cgi/l/email-protection and injects a decode script, which this site's own " +
      "script-src 'none' then blocks — so the services CTA does not become obfuscated, it " +
      'becomes dead. It is the only conversion path here.',
  },
  {
    id: 'speed_brain',
    value: 'off',
    why:
      'adds a Speculation-Rules response header pointing at a Cloudflare-hosted URL, telling ' +
      'browsers to prefetch. It does not mutate HTML, so check 15 cannot see it: byte-equality ' +
      'passes and the header assertions do not look for it. Cloudflare documents it as enabled ' +
      'by default on Free; this zone reported "off" at creation, unmodified. Pinned either way, ' +
      'because a default that disagrees with its own documentation is a default that can change.',
  },
  {
    id: 'rocket_loader',
    value: 'off',
    why: 'injects JavaScript into the page. There is no JavaScript on this site.',
  },
  {
    id: 'automatic_https_rewrites',
    value: 'off',
    why:
      'rewrites link targets inside HTML. Measured "on" at zone creation. A no-op on this site, ' +
      'because every URL it emits is already absolute and https — but it is an HTML rewriter, ' +
      'and the posture is that the edge does not rewrite HTML. Off by decision, not by luck.',
  },
  {
    id: 'replace_insecure_js',
    value: 'off',
    why:
      'rewrites HTML to substitute Cloudflare-hosted copies of JavaScript libraries. Measured ' +
      '"on" at zone creation, and not in DEPLOY.md before this zone was read. A no-op here for ' +
      'the strongest possible reason — there is no JavaScript to replace — but it is an edge ' +
      'feature whose whole job is altering the document, on a site that publishes byte-equality ' +
      'as a claim.',
  },
  {
    id: 'server_side_exclude',
    value: 'off',
    why:
      'removes content between <!--sse--> markers from the HTML for visitors Cloudflare judges ' +
      'suspicious, so the same URL serves different documents to different readers. Measured ' +
      '"on" at zone creation. This site ships no such markers, so it changes nothing today; it ' +
      'is off because "what it published is what it published" cannot be conditional on who is ' +
      'asking.',
  },
  {
    id: 'always_online',
    value: 'off',
    why:
      'serves a third-party archived copy of a page when the origin is unreachable. Measured ' +
      '"off", and pinned there. A scorecard reader in 2032 following a printed address to an ' +
      'archived rendering of /oal/v1.0 would have no way to tell it was not ours — which is ' +
      'worse than the 404 that BRIEF.md §9 calls the most serious failure this site can have, ' +
      'because a 404 is honest.',
  },
  {
    id: 'security_header',
    path: ['strict_transport_security', 'enabled'],
    value: false,
    assertOnly: true,
    why:
      'zone-level HSTS. Measured disabled, and it must stay that way: _headers already sends ' +
      'Strict-Transport-Security, and a second source would put two values on the wire. That is ' +
      'exactly the failure CHANGES.md row 22 records — Cloudflare comma-joins duplicate headers, ' +
      'and posture.js parses a max-age out of the result, so the joined value can satisfy the ' +
      'check while meaning something nobody chose. One source for this header, and it is a file ' +
      'in this repository.',
  },
  {
    id: 'ssl',
    value: 'strict',
    why:
      'BRIEF.md §9. Full (strict); anything less accepts an unauthenticated origin. Measured ' +
      '"full" at zone creation, which is the dangerous one — it looks like strict in the ' +
      'dashboard and validates nothing.',
  },
  {
    id: 'always_use_https',
    value: 'on',
    why: 'BRIEF.md §9, and the companion to the HSTS header _headers already sets.',
  },
  {
    id: 'min_tls_version',
    value: '1.2',
    why:
      'a floor asserted rather than inherited — measured "1.0" at zone creation. Raising it ' +
      'later is a visible edit here with a reason attached, which is the same standard ' +
      'DEPLOY.md sets for includeSubDomains.',
  },
];

/**
 * Targets the `GET /zones/{id}/settings` listing does not return, fetched one at a time.
 *
 * Measured on 2026-08-09: the listing answered with 56 settings and `speed_brain` was not
 * among them, while `GET /zones/{id}/settings/speed_brain` returned it perfectly well,
 * editable, with a value. So "not in the listing" does not mean "not a setting on this
 * zone", and an evaluator that only ever read the listing would have reported this item
 * unmeasurable forever.
 *
 * This list is the exception, and it is deliberately an exception rather than a switch to
 * fetching all eleven individually: the listing is one request, and a target that silently
 * disappears from it should still be *noticed*. Anything added here has been checked by
 * hand first.
 */
export const SETTINGS_NOT_IN_LISTING = ['speed_brain'];

/** The value a target is about — the whole setting, or something nested inside it. */
function valueAt(setting, target) {
  let v = setting?.value;
  for (const key of target.path ?? []) v = v?.[key];
  return v;
}

/** Does this setting satisfy this target? Strings and booleans compare the same way. */
function satisfies(target, setting) {
  return String(valueAt(setting, target)) === String(target.value);
}

/** How a target's current state reads in a diff. */
const describeCurrent = (target, setting) => JSON.stringify(valueAt(setting, target));

/** The apex web record Pages creates, and the only proxied thing that belongs at the apex. */
const pagesTarget = () => `${PROJECT}.pages.dev`;

// ── The evaluator ───────────────────────────────────────────────────────────────────

/** Cloudflare returns CAA either structured or as a single content string. Read both. */
function caaIssuers(record) {
  const tagged = [];
  const { data } = record;
  if (data && typeof data === 'object' && data.tag) {
    tagged.push({ tag: String(data.tag), value: String(data.value ?? '') });
  } else if (typeof record.content === 'string') {
    const m = record.content.match(/^\s*\d+\s+(issue|issuewild|iodef)\s+"?([^"]*)"?\s*$/i);
    if (m) tagged.push({ tag: m[1].toLowerCase(), value: m[2] });
  }
  return tagged.filter((t) => t.tag === 'issue' || t.tag === 'issuewild');
}

/**
 * Everything wrong with this zone, as sentences, plus what was measured.
 *
 * Pure: it takes the API's responses and returns findings. Check 22 exercises it against
 * fixtures with no network at all, in the manner check 20 exercises `selectRollbackTarget`.
 *
 * `botManagement` is `{ available: true, fightMode }` or `{ available: false, why }`. An
 * unreachable Bot Fight Mode is reported as a finding rather than skipped — a posture item
 * nobody can read is not a posture item, and deciding it is fine because the endpoint 403s
 * is precisely the reasoning this suite exists to refuse.
 */
export function evaluateZone({ settings, records, botManagement, apex, pagesHost = pagesTarget() }) {
  const findings = [];

  if (!Array.isArray(settings)) {
    throw new Error('the zone settings response had no array of settings — the API shape changed');
  }
  if (!Array.isArray(records)) {
    throw new Error('the DNS records response had no array of records — the API shape changed');
  }

  const byId = new Map(settings.map((s) => [s?.id, s]));
  let matched = 0;

  for (const target of ZONE_SETTINGS) {
    const got = byId.get(target.id);

    if (!got) {
      findings.push(
        `the zone settings response does not contain "${target.id}" at all, so this posture ` +
          `item was not checked. Either Cloudflare renamed it or it is gated by plan — find ` +
          `out which. Silently passing over it is how a check goes quiet instead of red. ` +
          `Wanted ${target.value}, because ${target.why}`
      );
      continue;
    }

    matched += 1;

    if (!satisfies(target, got)) {
      const where = target.path ? `${target.id}.${target.path.join('.')}` : target.id;
      findings.push(
        `${where} is ${describeCurrent(target, got)}, not ${JSON.stringify(target.value)} — ` +
          target.why
      );
    }
  }

  // ── DNS ────────────────────────────────────────────────────────────────────────
  //
  // Negative invariants, so the same table holds before and after the custom domain is
  // attached. The positive statement — "the apex serves the Pages project" — is check 15's
  // job, and it makes it against the live host rather than against a record.

  const apexRecords = records.filter((r) => r?.name === apex);

  for (const r of apexRecords.filter((r) => r.type === 'A' || r.type === 'AAAA')) {
    findings.push(
      `there is an ${r.type} record at ${apex} pointing at ${r.content}. Cloudflare Pages ` +
        `attaches an apex custom domain as a CNAME, so an address record here is left over ` +
        `from the registrar's parking page and will either serve it or fight the CNAME.`
    );
  }

  for (const r of apexRecords.filter((r) => r.type === 'CNAME')) {
    if (r.content !== pagesHost) {
      findings.push(
        `the CNAME at ${apex} points at ${r.content}, not ${pagesHost}. The apex must resolve ` +
          `to this Pages project and nothing else.`
      );
    }
    if (r.proxied === false) {
      findings.push(
        `the CNAME at ${apex} is DNS-only. A Pages custom domain has to be proxied, or the ` +
          `zone's settings and TLS never apply to it.`
      );
    }
  }

  const caa = records.filter((r) => r?.type === 'CAA').flatMap(caaIssuers);
  if (caa.length > 0) {
    const permitted = new Set(caa.map((c) => c.value.trim().toLowerCase()).filter(Boolean));
    for (const ca of REQUIRED_CAA) {
      if (!permitted.has(ca)) {
        findings.push(
          `CAA records exist on ${apex} and none of them permits ${ca}. Certificate issuance ` +
            `for the custom domain fails when the CA it uses is not listed, and it fails after ` +
            `the domain is already pointed here. Permitted today: ${[...permitted].join(', ')}`
        );
      }
    }
  }

  if (botManagement?.available !== true) {
    findings.push(
      `Bot Fight Mode could not be read (${botManagement?.why ?? 'no reason given'}). It ` +
        `injects a challenge script, so leaving it unread is leaving the posture unmeasured.`
    );
  } else if (botManagement.fightMode !== false) {
    findings.push(
      'Bot Fight Mode is on. It injects a /cdn-cgi/challenge-platform script, which ' +
        "script-src 'none' blocks, and check 15 reads as the edge rewriting HTML."
    );
  }

  return { findings, observed: { settings: matched, records: records.length } };
}

// ── Reads ───────────────────────────────────────────────────────────────────────────

const NEEDS = {
  zoneRead: 'Zone → Zone → Read',
  zoneEdit: 'Zone → Zone → Edit, at *account* scope (the zone does not exist yet)',
  dnsRead: 'Zone → DNS → Read',
  dnsEdit: 'Zone → DNS → Edit',
  settingsRead: 'Zone → Zone Settings → Read',
  settingsEdit: 'Zone → Zone Settings → Edit',
  bots: 'Zone → Bot Management → Edit',
  pages: 'Account → Cloudflare Pages → Edit',
  account: 'Account → Account Settings → Read',
};

export async function findZone(name) {
  const body = await cfCall(`/zones?name=${encodeURIComponent(name)}`, { needs: NEEDS.zoneRead });
  return body.result?.[0] ?? null;
}

/**
 * Every zone setting this posture is about, however Cloudflare chooses to expose it.
 *
 * The listing plus the handful it omits. A per-id fetch that fails is simply not appended,
 * so `evaluateZone` reports the target as absent rather than as satisfied — the fail-closed
 * path is preserved through the workaround, which is the only way a workaround for a
 * missing setting is safe.
 */
export async function readSettings(zoneId) {
  const listed = (await cfCall(`/zones/${zoneId}/settings`, { needs: NEEDS.settingsRead })).result;
  const known = new Set((listed ?? []).map((s) => s?.id));

  const extra = await Promise.all(
    SETTINGS_NOT_IN_LISTING.filter((id) => !known.has(id)).map(async (id) => {
      const r = await tryCall(`/zones/${zoneId}/settings/${id}`, { needs: NEEDS.settingsRead });
      return r.ok ? r.body.result : null;
    })
  );

  return [...(listed ?? []), ...extra.filter(Boolean)];
}

export async function readZone(zoneId) {
  const [settings, records, bots] = await Promise.all([
    readSettings(zoneId),
    cfCall(`/zones/${zoneId}/dns_records?per_page=200`, { needs: NEEDS.dnsRead }),
    tryCall(`/zones/${zoneId}/bot_management`, { needs: NEEDS.bots }),
  ]);

  return {
    settings,
    records: records.result,
    botManagement: bots.ok
      ? { available: true, fightMode: bots.body.result?.fight_mode }
      : { available: false, why: bots.error },
  };
}

// ── Commands ────────────────────────────────────────────────────────────────────────

const APPLY = process.argv.includes('--apply');
const out = (s) => process.stdout.write(`${s}\n`);

function heading(text) {
  out(`\n${text}\n${'─'.repeat(text.length)}`);
}

async function preflight(apex) {
  heading('Preflight — what this token can reach');
  out('Reads only. A read probe proves read; write permissions cannot be probed without');
  out('writing, so the first write is the real test. It fails closed and names what it needed.\n');

  const verify = await tryCall('/user/tokens/verify');
  out(`token            ${verify.ok ? `active (${verify.body.result?.status})` : verify.error}`);

  // Fatal, and it exits non-zero. A preflight that prints a failure and returns success is
  // the same shape as a check that passes having measured nothing: anything scripted on top
  // of it reads the exit code, not the prose.
  if (!verify.ok) throw new Error('\nthe token could not be verified, so nothing below was probed');

  const accounts = await tryCall('/accounts', { needs: NEEDS.account });
  if (accounts.ok) {
    for (const a of accounts.body.result ?? []) out(`account          ${a.id}  ${a.name}`);
    if ((accounts.body.result ?? []).length === 0) out('account          none visible to this token');
  } else {
    out(`account          ${accounts.error}`);
    out('                 (or read it from any dashboard URL and export CLOUDFLARE_ACCOUNT_ID)');
  }

  const zone = await tryCall(`/zones?name=${encodeURIComponent(apex)}`, { needs: NEEDS.zoneRead });
  if (zone.ok) {
    const z = zone.body.result?.[0];
    out(`zone ${apex}  ${z ? `${z.id}  status=${z.status}` : 'does not exist yet'}`);
    if (z?.name_servers) out(`nameservers      ${z.name_servers.join(', ')}`);
  } else {
    out(`zone ${apex}  ${zone.error}`);
  }

  if (process.env.CLOUDFLARE_ACCOUNT_ID) {
    const projects = await tryCall(`/accounts/${accountId()}/pages/projects`, { needs: NEEDS.pages });
    if (projects.ok) {
      const names = (projects.body.result ?? []).map((p) => p.name);
      out(`pages projects   ${names.length ? names.join(', ') : 'none'}`);
      out(`project "${PROJECT}"  ${names.includes(PROJECT) ? 'exists' : 'not created yet'}`);
    } else {
      out(`pages projects   ${projects.error}`);
    }
  } else {
    out('pages projects   skipped — CLOUDFLARE_ACCOUNT_ID is not set');
  }
}

async function zoneCreate(apex) {
  const existing = await findZone(apex);
  if (existing) {
    out(`${apex} is already a zone: ${existing.id}, status=${existing.status}`);
    if (existing.name_servers) out(`nameservers: ${existing.name_servers.join(', ')}`);
    return;
  }

  if (!APPLY) {
    out(`DRY RUN — would create zone ${apex} (type: full) on account ${accountId()}`);
    out('Re-run with --apply. Nothing else in Stage 6 can proceed until this exists.');
    return;
  }

  const body = await cfCall('/zones', {
    method: 'POST',
    needs: NEEDS.zoneEdit,
    body: { name: apex, account: { id: accountId() }, type: 'full' },
  });

  const z = body.result;
  out(`created zone ${apex}: ${z.id}, status=${z.status}`);
  out(`\nSet these two nameservers at Namecheap:\n  ${(z.name_servers ?? []).join('\n  ')}`);
}

async function status(apex) {
  const zone = await findZone(apex);
  if (!zone) return out(`${apex} is not a zone on this account yet.`);

  heading(`Zone ${apex}`);
  out(`id          ${zone.id}`);
  out(`status      ${zone.status}`);
  out(`nameservers ${(zone.name_servers ?? []).join(', ')}`);
  if (zone.original_name_servers) {
    out(`registrar   ${zone.original_name_servers.join(', ')}`);
  }

  const observed = await readZone(zone.id);

  heading('Posture');
  const { findings, observed: counts } = evaluateZone({ ...observed, apex });
  out(`${counts.settings}/${ZONE_SETTINGS.length} target settings matched, ` +
      `${counts.records} DNS records observed`);
  if (findings.length === 0) out('green — every posture item holds');
  else for (const f of findings) out(`  ✗ ${f}`);

  heading('DNS records');
  for (const r of observed.records) {
    const extra = [r.priority !== undefined ? `priority=${r.priority}` : null,
                   r.proxied ? 'proxied' : 'dns-only'].filter(Boolean).join(' ');
    out(`  ${r.type.padEnd(6)} ${r.name.padEnd(28)} ${r.content}  ${extra}`);
  }
}

async function harden(apex) {
  const zone = await findZone(apex);
  if (!zone) throw new Error(`${apex} is not a zone on this account yet — run zone-create first`);

  const byId = new Map((await readSettings(zone.id)).map((s) => [s.id, s]));

  const changes = [];
  const missing = [];

  for (const target of ZONE_SETTINGS) {
    const got = byId.get(target.id);
    if (!got) {
      missing.push(target);
      continue;
    }
    if (!satisfies(target, got)) {
      changes.push({ target, from: describeCurrent(target, got), editable: got.editable });
    }
  }

  heading(`Harden ${apex}${APPLY ? '' : ' (DRY RUN)'}`);

  if (missing.length > 0) {
    out('These target settings are NOT offered by the API on this zone:');
    for (const m of missing) out(`  ! ${m.id} — wanted ${m.value}`);
    out('Nothing is applied for them, and check 22 will be red until this is resolved.');
    out('Resolve it by finding what Cloudflare calls the setting now, not by removing the row.\n');
  }

  if (changes.length === 0) {
    out('Every offered setting already matches the target. Nothing to change.');
  }

  for (const { target, from, editable } of changes) {
    const where = target.path ? `${target.id}.${target.path.join('.')}` : target.id;
    out(`  ${where}: ${from} → ${JSON.stringify(target.value)}` +
        `${editable === false ? '  (NOT EDITABLE)' : ''}`);
    if (!APPLY) continue;

    if (editable === false) {
      out('    skipped: Cloudflare reports this setting as not editable on this plan');
      continue;
    }

    // A nested target is asserted, never written. Patching one field of a structured
    // setting means sending the whole object back, and any field this table does not know
    // about would be overwritten with whatever we happened to reconstruct. Refusing is the
    // honest option: the check still fails, and a human changes it deliberately.
    if (target.assertOnly || target.path) {
      out('    NOT APPLIED — this target is assert-only. Change it in the dashboard; writing');
      out('    one field of a structured setting would clobber the fields around it.');
      continue;
    }

    await cfCall(`/zones/${zone.id}/settings/${target.id}`, {
      method: 'PATCH',
      needs: NEEDS.settingsEdit,
      body: { value: target.value },
    });
    out('    applied');
  }

  if (!APPLY) return out('\nRe-run with --apply to make these changes.');

  // Read back. A PATCH that returned 200 is not evidence the value stuck — a pending zone,
  // a plan restriction or a silently coerced value all return success.
  heading('Read-back');
  const after = await readZone(zone.id);
  const { findings, observed } = evaluateZone({ ...after, apex });
  out(`${observed.settings}/${ZONE_SETTINGS.length} target settings matched`);
  if (findings.length === 0) out('green — the posture holds after applying it');
  else for (const f of findings) out(`  ✗ ${f}`);
}

/**
 * A TXT value as the domain owner wrote it, whatever the API hands back.
 *
 * A DNS character-string holds 255 bytes, and the DKIM public key is 408, so it is served
 * as several strings that resolvers concatenate. Cloudflare may return that as
 * `"chunk one" "chunk two"`, or return a short value bare. Comparing the raw field would
 * make the DKIM record look absent on every run and re-add it every time — a plan that is
 * supposed to be idempotent quietly becoming one that duplicates records.
 *
 * Limit, stated: a TXT value that genuinely contains a double quote would be mangled here.
 * SPF, DKIM and DMARC syntax has no use for one.
 */
function txtValue(content) {
  const s = String(content);
  const chunks = [...s.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  return chunks.length > 0 ? chunks.join('') : s;
}

/**
 * A record in the plan matches one on the zone when type, name and value agree — and, for
 * MX, the priority too: two mail exchangers differing only in preference are two different
 * records, and treating them as one would silently drop a fallback.
 */
function sameRecord(a, b) {
  if (a.type !== b.type || a.name !== b.name) return false;
  if (a.type === 'MX' && Number(a.priority) !== Number(b.priority)) return false;
  const value = a.type === 'TXT' ? txtValue : String;
  return value(a.content) === value(b.content);
}

async function records(apex) {
  const zone = await findZone(apex);
  if (!zone) throw new Error(`${apex} is not a zone on this account yet — run zone-create first`);

  const plan = JSON.parse(await readFile(DNS_PLAN, 'utf8'));
  const live = (await cfCall(`/zones/${zone.id}/dns_records?per_page=200`, { needs: NEEDS.dnsRead }))
    .result;

  const toDelete = live.filter((r) =>
    (plan.remove ?? []).some(
      (m) =>
        r.type === m.type &&
        r.name === (m.name === '@' ? apex : m.name) &&
        (m.contentMatches ? new RegExp(m.contentMatches).test(r.content) : true)
    )
  );

  const toAdd = (plan.ensure ?? [])
    .map((r) => ({ ...r, name: r.name === '@' ? apex : r.name }))
    .filter((want) => !live.some((have) => sameRecord(have, want)));

  heading(`DNS plan for ${apex}${APPLY ? '' : ' (DRY RUN)'}`);

  if (toDelete.length === 0 && toAdd.length === 0) {
    return out('The zone already matches tools/dns-plan.json. Nothing to change.');
  }

  for (const r of toDelete) out(`  delete  ${r.type.padEnd(6)} ${r.name}  ${r.content}`);
  for (const r of toAdd) {
    out(`  add     ${r.type.padEnd(6)} ${r.name}  ${r.content}` +
        `${r.priority !== undefined ? `  priority=${r.priority}` : ''}`);
  }

  if (!APPLY) return out('\nRe-run with --apply to make these changes.');

  for (const r of toDelete) {
    await cfCall(`/zones/${zone.id}/dns_records/${r.id}`, { method: 'DELETE', needs: NEEDS.dnsEdit });
    out(`  deleted ${r.type} ${r.name}`);
  }
  for (const r of toAdd) {
    await cfCall(`/zones/${zone.id}/dns_records`, {
      method: 'POST',
      needs: NEEDS.dnsEdit,
      body: { proxied: false, ttl: 1, ...r },
    });
    out(`  added   ${r.type} ${r.name}`);
  }
}

async function customDomain(apex) {
  const zone = await findZone(apex);
  if (!zone) throw new Error(`${apex} is not a zone on this account yet`);

  if (zone.status !== 'active') {
    throw new Error(
      `the zone is "${zone.status}", not "active". Cloudflare creates the apex CNAME itself ` +
        `once the nameservers resolve to it, so attaching the custom domain before then either ` +
        `fails or sits pending. Set the nameservers at Namecheap first:\n  ` +
        `${(zone.name_servers ?? []).join('\n  ')}`
    );
  }

  const listing = await cfCall(`/accounts/${accountId()}/pages/projects/${PROJECT}/domains`, {
    needs: NEEDS.pages,
  });
  const already = (listing.result ?? []).find((d) => d.name === apex);
  if (already) return out(`${apex} is already attached to ${PROJECT}: status=${already.status}`);

  if (!APPLY) {
    out(`DRY RUN — would attach ${apex} to the Pages project "${PROJECT}".`);
    out('');
    out('This is the launch. Until it runs, the site is live only at');
    out(`  https://${pagesTarget()}`);
    out(`and nothing is published at the address printed on every scorecard.`);
    return out('\nRe-run with --apply when that is what you mean to do.');
  }

  const body = await cfCall(`/accounts/${accountId()}/pages/projects/${PROJECT}/domains`, {
    method: 'POST',
    needs: NEEDS.pages,
    body: { name: apex },
  });
  out(`attached ${apex}: status=${body.result?.status}`);
  out(`\nNow verify it, and do not take a pending status for a working one:`);
  out(`  ORDOIA_LIVE=https://${apex} npm test`);
}

/**
 * Empty the edge cache for the zone.
 *
 * ── Why the recovery path needs this ───────────────────────────────────────────────
 *
 * Measured during the rollback drill on 2026-08-09: after rolling production back, the
 * edge went on serving the pre-rollback bytes, answering `cf-cache-status: HIT`. A
 * cache-busting query string got the rolled-back content; a plain request did not, and
 * neither did `Cache-Control: no-cache` on the request. So **a rollback on its own does not
 * change what a reader receives.**
 *
 * That is the difference between the rollback being an operation and the rollback being a
 * recovery, and the probe cannot see it: the probe asks whether *a* healthy page is served,
 * not *which* one — and the stale page is a healthy page.
 *
 * Zone-scoped, so it only applies to the custom domain. `*.pages.dev` is not in a zone we
 * own and cannot be purged this way, which is one more reason the preview stage is a gate
 * rather than a place to recover.
 *
 * Reads `CLOUDFLARE_ZONE_ID` when set, so the CI token needs only Cache Purge and not Zone
 * Read to use it.
 */
async function purgeCache(apex) {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID || (await findZone(apex))?.id;
  if (!zoneId) throw new Error(`${apex} is not a zone on this account, and CLOUDFLARE_ZONE_ID is unset`);

  if (!APPLY) {
    out(`DRY RUN — would purge the entire edge cache for ${apex} (zone ${zoneId}).`);
    return out('Re-run with --apply.');
  }

  await cfCall(`/zones/${zoneId}/purge_cache`, {
    method: 'POST',
    needs: 'Zone → Cache Purge → Purge',
    body: { purge_everything: true },
  });
  out(`purged the edge cache for ${apex}`);
}

const USAGE = `usage: node tools/zone-setup.mjs <command> [--apply]

  preflight       what this token can reach (reads only)
  zone-create     add the apex as a zone
  status          zone state, posture and DNS records
  harden          apply ZONE_SETTINGS
  records         apply tools/dns-plan.json
  custom-domain   attach the apex to the Pages project — this is the launch
  purge-cache     empty the edge cache for the zone (the recovery path needs this)`;

async function main([command]) {
  const apex = siteRecord().domain;
  const commands = { preflight, 'zone-create': zoneCreate, status, harden, records,
                     'custom-domain': customDomain, 'purge-cache': purgeCache };

  const run = commands[command];
  if (!run) throw new Error(USAGE);
  await run(apex);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2).filter((a) => a !== '--apply')).catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
