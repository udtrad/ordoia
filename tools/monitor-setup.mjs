/**
 * The external monitors, read and applied.
 *
 * ── Why the configuration is in the repository and the monitor is not ──────────────
 *
 * `canary.yml` cannot be the liveness answer: GitHub disables scheduled workflows after
 * 60 days of repository inactivity, and this site is finished by design, so the quiet
 * period that switches the canary off is the expected state. It switches off exactly when
 * it becomes the only thing watching. DEPLOY.md records the two rejected in-repo fixes.
 *
 * So the *running* moves out to Better Stack. The *configuration* does not: four monitors
 * described in someone's memory of a web form is the same failure this practice sells
 * against. `tools/monitors.json` is the plan, this applies it, and check 24 reads the
 * account back and fails if it has drifted.
 *
 * ── The shape is deliberately `zone-setup.mjs`'s ───────────────────────────────────
 *
 * `status` prints what is there against what is wanted and changes nothing. `--apply`
 * makes the account match. Running it twice changes nothing the second time, and running
 * it after someone edits the Better Stack UI puts it back. That is the same contract
 * `records` has for DNS, and there is no reason for a second one.
 *
 * ── Secrets ────────────────────────────────────────────────────────────────────────
 *
 * The token is read from the environment, held in a local, and never written anywhere:
 * not to stdout, not into an error message, not into a URL, not into an argv where `ps`
 * would show it. The environment is populated from the macOS Keychain by the caller — see
 * DEPLOY.md — so it is not on disk in this repository either. This is the rule the
 * Cloudflare tooling already follows and the reason it was written down.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const API = 'https://uptime.betterstack.com/api/v2';
const TIMEOUT_MS = Number(process.env.ORDOIA_API_TIMEOUT_MS || 20_000);

export const PLAN = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'tools/monitors.json'), 'utf8')
);

/**
 * The fields this repository has an opinion about.
 *
 * Anything Better Stack adds that is not in here is left alone — the plan says what must
 * be true, not what must be absent, and a tool that reverted every unlisted field would
 * fight the UI over things nobody here has decided.
 */
export const COMPARED = [
  'url',
  'monitor_type',
  'required_keyword',
  'check_frequency',
  'follow_redirects',
  'verify_ssl',
  'ssl_expiration',
  'domain_expiration',
  'email',
];

/** The API token, or a thrown sentence saying where it comes from. */
export function apiToken() {
  const token = process.env.BETTERSTACK_API_TOKEN;
  if (!token) {
    throw new Error(
      'BETTERSTACK_API_TOKEN is not in the environment. Locally it comes from the ' +
        'Keychain:\n' +
        '  export BETTERSTACK_API_TOKEN=$(security find-generic-password ' +
        '-a ordoia -s betterstack-api-token -w)\n' +
        'Do not write it to a file in this repository.'
    );
  }
  return token;
}

/**
 * One request. Better Stack's errors come back as JSON with an `errors` field; that is
 * what gets printed, because it does not contain the token and we did not write it.
 */
export async function call(method, endpoint, body) {
  const token = apiToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : null;

    if (!res.ok) {
      throw new Error(
        `Better Stack ${method} ${endpoint} returned ${res.status}: ` +
          `${JSON.stringify(json?.errors ?? json ?? '(no body)')}`
      );
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Every monitor on the account, following pagination.
 *
 * Paging is followed rather than assumed away. A first page that happens to hold all four
 * monitors today is not a promise about a page that holds three of them tomorrow, and a
 * missing monitor is the finding check 24 exists to make — so reading a truncated list
 * and calling it "the account" would manufacture exactly that finding out of nothing.
 */
export async function listMonitors() {
  const out = [];
  let url = '/monitors';
  while (url) {
    const page = await call('GET', url);
    for (const m of page.data ?? []) out.push({ id: m.id, ...m.attributes });
    const next = page.pagination?.next;
    url = next ? next.replace(API, '') : null;
  }
  return out;
}

/** The plan, with defaults folded in, as the API wants it. */
export function wanted() {
  return PLAN.monitors.map((m) => ({ ...PLAN.defaults, ...m }));
}

/**
 * A monitor's identity, for matching an existing one to a planned one.
 *
 * URL plus type plus keyword, not the name. Names are prose and someone will improve one;
 * the triple is what the monitor actually *does*, and two monitors doing the same thing
 * are the same monitor however they are labelled.
 */
export const identity = (m) => `${m.monitor_type} ${m.url} ${m.required_keyword ?? ''}`.trim();

/**
 * How the account differs from the plan.
 *
 * Missing monitors are listed first and separately, because they are the failure that
 * matters: a deleted monitor is the one state in which everything still *looks* configured
 * and nothing is watching. Check 22 learned the same lesson about absent zone settings —
 * a target that is not in the response is a failure, never a pass.
 */
export function diff(existing, plan) {
  const byIdentity = new Map(existing.map((m) => [identity(m), m]));
  const missing = [];
  const drifted = [];

  for (const want of plan) {
    const found = byIdentity.get(identity(want));
    if (!found) {
      missing.push(want);
      continue;
    }
    const fields = COMPARED.filter(
      (f) => want[f] !== undefined && String(found[f]) !== String(want[f])
    ).map((f) => `${f}: ${JSON.stringify(found[f])} should be ${JSON.stringify(want[f])}`);
    if (fields.length) drifted.push({ found, want, fields });
  }

  return { missing, drifted };
}

async function main([command, ...rest]) {
  const apply = rest.includes('--apply');
  const plan = wanted();

  if (command !== 'status' && command !== 'apply') {
    throw new Error(
      'usage: node tools/monitor-setup.mjs status\n' +
        '       node tools/monitor-setup.mjs apply --apply\n' +
        '`status` reads and prints. `apply` needs --apply to write, so a mistyped ' +
        'command cannot change the account.'
    );
  }

  const existing = await listMonitors();
  const { missing, drifted } = diff(existing, plan);

  process.stdout.write(
    `Better Stack: ${existing.length} monitor(s) on the account, ${plan.length} in the plan\n`
  );
  for (const m of missing) process.stdout.write(`  MISSING  ${identity(m)}\n`);
  for (const d of drifted) {
    process.stdout.write(`  DRIFTED  ${identity(d.want)}\n`);
    for (const f of d.fields) process.stdout.write(`             ${f}\n`);
  }
  if (!missing.length && !drifted.length) {
    process.stdout.write('  every planned monitor exists and matches\n');
  }

  if (command === 'status') return;
  if (!apply) {
    process.stdout.write('\nnothing written — re-run with --apply\n');
    return;
  }

  for (const m of missing) {
    const created = await call('POST', '/monitors', m);
    process.stdout.write(`  created  ${identity(m)} (id ${created?.data?.id})\n`);
  }
  for (const d of drifted) {
    await call('PATCH', `/monitors/${d.found.id}`, d.want);
    process.stdout.write(`  updated  ${identity(d.want)}\n`);
  }
  process.stdout.write('done\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
