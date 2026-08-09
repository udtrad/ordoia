/**
 * Wait until an origin is serving the build in this working tree.
 *
 *   node tools/wait-for-origin.mjs https://ci-preview.ordoia.pages.dev
 *
 * ── The race this closes, measured rather than supposed ────────────────────────────
 *
 * On 2026-08-09, deploying to a Pages project and immediately fetching the project alias
 * gave a 404 for the file that had just been uploaded, while the deployment's own
 * `<hash>.pages.dev` URL served it correctly. Polled: 404 at t+3s, 200 by t+8s. The
 * hostname lags the deployment.
 *
 * `deploy.yml` runs check 15 in the step straight after `pages deploy`, so that lag lands
 * inside the gate. On the preview stage a spurious failure is merely annoying — it refuses
 * to promote, which is the safe direction. **On the production stage it is not**: the
 * workflow responds to a failed production check by rolling production back. A few seconds
 * of alias lag would therefore roll back a perfectly good deployment, and the job summary
 * would explain the rollback in terms of bad bytes that were never bad.
 *
 * ── Why it compares bytes rather than waiting for a 200 ────────────────────────────
 *
 * A 200 only says *something* is being served, and the something that was being served
 * before the deploy is a 200 too. The condition check 15 actually needs is that the origin
 * is serving *this* build, so that is the condition waited for: the home page, byte for
 * byte against `_site/index.html`. That is check 15's first and strongest assertion,
 * narrowed to one page and given a deadline.
 *
 * The two ways this can end are kept distinct on purpose, because they call for opposite
 * actions:
 *
 *   never reachable          — the host or the hostname is the problem
 *   reachable, wrong bytes   — the deploy did not take. That is a real failure and not a
 *                              race, and the message says so rather than blaming the wait.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');

const TIMEOUT_MS = Number(process.env.ORDOIA_WAIT_TIMEOUT_MS || 90_000);
const INTERVAL_MS = Number(process.env.ORDOIA_WAIT_INTERVAL_MS || 3_000);
const FETCH_TIMEOUT_MS = Number(process.env.ORDOIA_LIVE_TIMEOUT_MS || 10_000);

/** The page compared. The home page is in every deploy and is not cached long. */
export const WAIT_PATH = '/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll `origin` until it serves `expected` at `WAIT_PATH`.
 *
 * Returns `{ ok, attempts, elapsedMs, reason }`. It never throws for a network failure —
 * an unreachable host early on is the normal case this exists for, not an error.
 */
export async function waitForOrigin(origin, expected, { now = () => Date.now() } = {}) {
  const url = origin.replace(/\/+$/, '') + WAIT_PATH;
  const started = now();
  let attempts = 0;
  let reason = 'never attempted';

  while (now() - started < TIMEOUT_MS) {
    attempts += 1;
    try {
      // Cache-busted. The edge cached a deleted file across a rollback during the drill and
      // answered `cf-cache-status: HIT`, so a plain fetch here could confirm bytes that are
      // no longer what the origin holds — the wait would pass on the strength of the thing
      // it is meant to be waiting out.
      const res = await fetch(`${url}?_wait=${started}-${attempts}`, {
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (res.status !== 200) {
        reason = `HTTP ${res.status}`;
      } else if (Buffer.from(await res.arrayBuffer()).equals(expected)) {
        return { ok: true, attempts, elapsedMs: now() - started, reason: 'serving this build' };
      } else {
        reason = 'reachable, but serving different bytes';
      }
    } catch (err) {
      reason = err.name === 'TimeoutError' ? `no response in ${FETCH_TIMEOUT_MS}ms` : err.message;
    }

    await sleep(INTERVAL_MS);
  }

  return { ok: false, attempts, elapsedMs: now() - started, reason };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const origin = process.argv[2];
  if (!origin) {
    process.stderr.write('usage: node tools/wait-for-origin.mjs <origin>\n');
    process.exit(1);
  }

  const expected = await readFile(path.join(REPO_ROOT, '_site', 'index.html'));
  const { ok, attempts, elapsedMs, reason } = await waitForOrigin(origin, expected);
  const took = `${attempts} attempt${attempts === 1 ? '' : 's'}, ${Math.round(elapsedMs / 1000)}s`;

  if (ok) {
    process.stdout.write(`${origin} is serving this build (${took})\n`);
  } else {
    process.stderr.write(
      `${origin} did not serve this build within ${Math.round(TIMEOUT_MS / 1000)}s ` +
        `(${took}). Last: ${reason}.\n` +
        (reason.includes('different bytes')
          ? 'The host answered, so this is not the propagation lag this step exists for — ' +
            'the deploy did not take, or something rewrote the page. Do not re-run and hope.\n'
          : 'The hostname never served the page. Check the deploy step above actually ' +
            'produced the URL this was pointed at.\n')
    );
    process.exit(1);
  }
}
