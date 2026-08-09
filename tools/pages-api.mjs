/**
 * The two Cloudflare Pages operations the deploy needs and wrangler does not have.
 *
 *   node tools/pages-api.mjs current-production   ->  deployment=<id>   (or deployment=)
 *   node tools/pages-api.mjs rollback <id>        ->  rolls production back to <id>
 *
 * ── Why the REST API and not the CLI ───────────────────────────────────────────────
 *
 * Measured against wrangler 4.120.0, not assumed: `wrangler rollback` is a Workers
 * command — its own help says "Rollback a deployment for a Worker" — and
 * `wrangler pages deployment` offers `list`, `create`, `tail` and `delete` and no
 * rollback. There is no Pages rollback in the CLI to call.
 *
 * The REST surface, from Cloudflare's API reference:
 *
 *   GET  /accounts/{account_id}/pages/projects/{project}/deployments?env=production
 *   POST /accounts/{account_id}/pages/projects/{project}/deployments/{id}/rollback
 *
 * The POST takes no body. Listing goes through the same surface rather than through
 * `wrangler pages deployment list --json`, because the REST response shape is documented
 * and wrangler's JSON shape is not; one documented surface beats two, one of them inferred.
 *
 * ── What is proven and what is not ─────────────────────────────────────────────────
 *
 * `selectRollbackTarget` is pure and is covered by check 20 against fixtures built to the
 * documented response shape. **The network calls have never run.** There is no Cloudflare
 * account yet, so nothing here has met the real API, and saying otherwise would be the
 * defect this repository exists to argue against. DEPLOY.md carries the drill that settles
 * it, and it must be run on a throwaway project before this path is trusted.
 *
 * ── Secrets ────────────────────────────────────────────────────────────────────────
 *
 * The token is read from the environment and never written anywhere — not to stdout, not
 * into an error message, not into a URL. `logError` below prints Cloudflare's own error
 * array, which does not contain it.
 */

import { fileURLToPath } from 'node:url';

const API = 'https://api.cloudflare.com/client/v4';

/** The Pages project. Not the domain — that is `src/_data/site.json` and `site-origin.mjs`. */
export const PROJECT = process.env.CLOUDFLARE_PAGES_PROJECT || 'ordoia';

const TIMEOUT_MS = Number(process.env.ORDOIA_API_TIMEOUT_MS || 20_000);

function credentials() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) {
    throw new Error(
      'CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must both be in the environment. ' +
        'They are repository secrets in CI; locally, export them for the shell that runs ' +
        'this and do not write them to a file.'
    );
  }
  return { token, account };
}

async function call(pathname, init = {}) {
  const { token, account } = credentials();
  const res = await fetch(`${API}/accounts/${account}/pages/projects/${PROJECT}${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Cloudflare returned HTTP ${res.status} and a body that is not JSON`);
  }

  if (!res.ok || body?.success !== true) {
    const errors = (body?.errors ?? []).map((e) => `${e.code ?? '?'}: ${e.message ?? e}`);
    throw new Error(
      `Cloudflare returned HTTP ${res.status}${errors.length ? ` — ${errors.join('; ')}` : ''}`
    );
  }

  return body;
}

/**
 * Is this deployment one production could be rolled back to?
 *
 * Cloudflare's documentation is explicit that only successfully built **production**
 * deployments are valid rollback targets — a preview deployment is not one. That matters
 * here more than it looks: this pipeline uploads a preview immediately before promoting,
 * so "the most recent deployment" is reliably the wrong answer.
 */
function isRollbackTarget(d) {
  return (
    d?.environment === 'production' &&
    d?.latest_stage?.name === 'deploy' &&
    d?.latest_stage?.status === 'success' &&
    typeof d?.id === 'string'
  );
}

/**
 * The deployment currently serving production, from a listing.
 *
 * Returns `null` when there is none — the first deploy of a new project, where there is
 * genuinely nothing behind us. The caller has to treat that as "no rollback available"
 * rather than as an error, or the very first deploy fails on the absence of a past.
 *
 * ── The ordering assumption, asserted rather than trusted ──────────────────────────
 *
 * The API returns deployments newest first, so the first valid candidate is the live one.
 * That is an assumption about someone else's service, and this function is the only place
 * it is made — so when every candidate carries `created_on`, it is checked. Rolling back
 * to the wrong deployment is worse than not rolling back at all: it looks like a recovery.
 */
export function selectRollbackTarget(listing) {
  const result = listing?.result;
  if (!Array.isArray(result)) {
    throw new Error('the deployments listing had no `result` array — the API shape changed');
  }

  const candidates = result.filter(isRollbackTarget);
  if (candidates.length === 0) return null;

  const [first] = candidates;

  if (candidates.every((d) => typeof d.created_on === 'string')) {
    const newest = candidates.reduce((a, b) => (a.created_on >= b.created_on ? a : b));
    if (newest.id !== first.id) {
      throw new Error(
        `the deployments listing is no longer newest-first: the first production ` +
          `deployment is ${first.id} (${first.created_on}) but the newest is ${newest.id} ` +
          `(${newest.created_on}). Rolling back on this listing would promote the wrong ` +
          `bytes, which reads as a recovery.`
      );
    }
  }

  return first.id;
}

/** The id of the deployment currently in production, or null. */
export async function currentProduction() {
  return selectRollbackTarget(await call('/deployments?env=production&per_page=25'));
}

/** Put `id` back in production. Cloudflare takes no body for this. */
export async function rollbackTo(id) {
  if (!id) throw new Error('rollbackTo needs a deployment id');
  await call(`/deployments/${encodeURIComponent(id)}/rollback`, { method: 'POST' });
}

const USAGE = 'usage: node tools/pages-api.mjs current-production | rollback <deployment-id>';

async function main([command, arg]) {
  if (command === 'current-production') {
    const id = await currentProduction();
    // Always emitted, even when empty: a step output that is sometimes absent turns into
    // an empty string in the next expression anyway, and an explicit blank is readable in
    // the log as "there was nothing to roll back to".
    process.stdout.write(`deployment=${id ?? ''}\n`);
    if (!id) {
      process.stderr.write(
        'no successful production deployment exists yet — nothing to roll back to. ' +
          'Expected exactly once, on the first ever deploy of this project.\n'
      );
    }
    return;
  }

  if (command === 'rollback') {
    if (!arg) throw new Error(USAGE);
    await rollbackTo(arg);
    process.stdout.write(`rolled production back to ${arg}\n`);
    return;
  }

  throw new Error(USAGE);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
