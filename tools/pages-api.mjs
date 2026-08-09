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
 * into an error message, not into a URL, not into an argv. That handling lives once, in
 * `tools/cf-api.mjs`, which prints Cloudflare's own error array and nothing else.
 */

import { fileURLToPath } from 'node:url';
import { cfCall, credentials } from './cf-api.mjs';

/** The Pages project. Not the domain — that is `src/_data/site.json` and `site-origin.mjs`. */
export const PROJECT = process.env.CLOUDFLARE_PAGES_PROJECT || 'ordoia';

/** What both operations below require, in the wording the Cloudflare dashboard uses. */
const NEEDS = 'Account → Cloudflare Pages → Edit';

/**
 * Call the Pages project surface.
 *
 * The token, the timeout, the JSON handling and the error wording live in `cf-api.mjs`
 * now, because Stage 6 added three more callers and a second copy of those decisions is a
 * second place for them to drift. `credentials()` is called for its side effect of
 * throwing a useful sentence when either variable is missing: `cfCall` alone would report
 * only the token, and the account id is the one people forget.
 */
async function call(pathname, init = {}) {
  const { account } = credentials();
  return cfCall(`/accounts/${account}/pages/projects/${PROJECT}${pathname}`, {
    needs: NEEDS,
    ...init,
  });
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
 * The deployment actually **serving** production.
 *
 * ── Why this is not "the newest successful production deployment" ──────────────────
 *
 * It was, until the rollback drill was run against the real API on 2026-08-09 and the
 * model turned out to be wrong. Deploy A, deploy B, roll back to A, and Cloudflare reports:
 *
 *   project.latest_deployment    = B     the most recent upload
 *   project.canonical_deployment = A     what the hostname actually serves
 *   deployments?env=production   = [B, A]   newest first, B still "success"
 *
 * The old implementation scanned that listing and returned **B** — a deployment that had
 * been rolled away from, quite possibly *because it was bad*. `deploy.yml` captures this
 * value before promoting so it has something to roll back to, so the consequence is precise
 * and nasty: after any rollback, the next failed deploy would "recover" to the bytes that
 * were rejected last time, report success, and the probe would pass, because the probe only
 * asks whether *a* healthy page is being served. This function's previous comment warned
 * that rolling back to the wrong deployment "looks like a recovery". It was describing its
 * own behaviour.
 *
 * `canonical_deployment` is the authority. Verified by rolling back and then fetching with
 * a cache-busting query string: the canonical deployment's bytes were the ones served.
 *
 * Returns `null` when the project has never deployed — the caller must treat that as "no
 * rollback available" rather than an error, or the first ever deploy fails on the absence
 * of a past.
 */
export function selectServingDeployment(project, listing) {
  if (!project || !('canonical_deployment' in project)) {
    throw new Error(
      'the Pages project response has no `canonical_deployment` field — the API shape ' +
        'changed. Refusing to fall back to the newest deployment: that is the wrong answer ' +
        'after a rollback, and it is wrong in the direction that looks like a recovery.'
    );
  }

  const canonical = project.canonical_deployment;
  if (canonical === null || canonical === undefined) return null;

  const { id } = canonical;
  if (typeof id !== 'string' || id === '') {
    throw new Error('`canonical_deployment` carries no usable id — the API shape changed');
  }

  // Cross-check against the listing, best-effort. The listing is one page of production
  // deployments; a long-serving canonical deployment can legitimately fall off the end of
  // it, so absence is not an error. Presence in a state that is not a successful
  // production deploy is, because then two Cloudflare responses disagree about their own
  // project and neither can be trusted to recover it.
  const result = listing?.result;
  if (!Array.isArray(result)) {
    throw new Error('the deployments listing had no `result` array — the API shape changed');
  }

  const seen = result.find((d) => d?.id === id);
  if (seen && !isRollbackTarget(seen)) {
    throw new Error(
      `Cloudflare reports ${id} as the canonical production deployment, but the deployments ` +
        `listing shows it as environment=${seen.environment}, ` +
        `stage=${seen.latest_stage?.name}/${seen.latest_stage?.status}. Two answers from the ` +
        `same API disagree; rolling back on either would be a guess.`
    );
  }

  return id;
}

/** The id of the deployment currently serving production, or null. */
export async function currentProduction() {
  const [project, listing] = await Promise.all([
    call(''),
    call('/deployments?env=production&per_page=25'),
  ]);
  return selectServingDeployment(project.result, listing);
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
