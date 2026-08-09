/**
 * One Cloudflare REST client, for every tool here that talks to the account.
 *
 * ── Why this exists ────────────────────────────────────────────────────────────────
 *
 * `tools/pages-api.mjs` grew its own `credentials()` and `call()` when the Pages rollback
 * was the only thing in this repository that touched the API. Stage 6 adds zone creation,
 * DNS records and zone settings, and a second copy of "read the token, build the URL,
 * decide what an error means" is a second place for those decisions to drift apart. The
 * repository's own rule, from `DEPLOY.md`: one claim verified in one place beats two copies
 * to keep in step.
 *
 * ── Why the caller names the permission it needs ───────────────────────────────────
 *
 * Cloudflare answers a token that lacks a grant with HTTP 403 and a numeric code. Mapping
 * those numbers to sentences would mean hardcoding a table of someone else's error codes
 * and trusting it to stay accurate — the same shape of assumption that has already misled
 * this project twice, and one that fails *silently* when it drifts, by printing a
 * confident wrong remedy.
 *
 * So the call site declares what the call requires, in the words the Cloudflare dashboard
 * uses, and a refusal quotes it back along with Cloudflare's own message. The remedy is
 * then derived from what we asked for rather than from what we guessed their code meant,
 * and it cannot go stale without the call itself changing.
 *
 * ── Secrets ────────────────────────────────────────────────────────────────────────
 *
 * The token is read from the environment, held in a local, and never written anywhere: not
 * to stdout, not into an error message, not into a URL, not into an argv. `describeError`
 * prints Cloudflare's own error array, which does not contain it. The environment is
 * populated from the macOS Keychain by the caller — see DEPLOY.md — so the token is not on
 * disk in this repository either.
 */

const API = 'https://api.cloudflare.com/client/v4';

const TIMEOUT_MS = Number(process.env.ORDOIA_API_TIMEOUT_MS || 20_000);

/**
 * The API token, or a thrown sentence saying where it comes from.
 *
 * Separate from the account id because three of the calls in Stage 6 — verifying the
 * token, listing accounts, finding a zone by name — are exactly the calls you make when
 * you do not yet know the account id, and requiring it there would make the preflight
 * unable to report the thing it exists to find out.
 */
export function apiToken() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error(
      'CLOUDFLARE_API_TOKEN is not in the environment. It is a repository secret in CI; ' +
        'locally it comes from the Keychain:\n' +
        '  export CLOUDFLARE_API_TOKEN=$(security find-generic-password ' +
        '-a ordoia -s cloudflare-setup-token -w)\n' +
        'Do not write it to a file in this repository.'
    );
  }
  return token;
}

/** The account id, or a thrown sentence. */
export function accountId() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!account) {
    throw new Error(
      'CLOUDFLARE_ACCOUNT_ID is not in the environment. ' +
        '`node tools/zone-setup.mjs preflight` prints it for every account this token can ' +
        'see, or it is the hex string in any dashboard URL.'
    );
  }
  return account;
}

/**
 * Both, in the shape `tools/pages-api.mjs` has always used.
 *
 * Reports both at once when both are missing. Calling `apiToken()` then `accountId()`
 * would throw on the first and take two runs to learn that neither is set, which is the
 * kind of small dishonesty a comment claiming otherwise makes permanent.
 */
export function credentials() {
  const missing = [];
  for (const [name, read] of [
    ['CLOUDFLARE_API_TOKEN', apiToken],
    ['CLOUDFLARE_ACCOUNT_ID', accountId],
  ]) {
    try {
      read();
    } catch (err) {
      missing.push(err.message);
    }
  }
  if (missing.length > 0) throw new Error(missing.join('\n\n'));

  return { token: apiToken(), account: accountId() };
}

/** Cloudflare's own errors, flattened. Never contains the token. */
export function describeError(status, body, needs) {
  const errors = (body?.errors ?? []).map((e) => `${e.code ?? '?'}: ${e.message ?? e}`);
  const said = errors.length > 0 ? ` — ${errors.join('; ')}` : '';

  // 403 is the refusal a missing grant produces, and 401 the one an expired or revoked
  // token produces. Anything else is a real API error and gets Cloudflare's words alone,
  // because appending a permission hint to, say, a validation failure sends the reader
  // to re-issue a token that was never the problem.
  const hint =
    needs && (status === 403 || status === 401)
      ? `\nThis call needs: ${needs}. Cloudflare refused it, so either the token does not ` +
        `carry that permission, or it does not carry it at the right scope — an account-level ` +
        `operation is not satisfied by a zone-scoped grant.`
      : '';

  return `Cloudflare returned HTTP ${status}${said}${hint}`;
}

/**
 * Call the Cloudflare API.
 *
 * `pathname` is everything after `/client/v4`, starting with a slash. `needs` is the
 * permission this call requires, in the dashboard's wording, and appears in the message
 * if Cloudflare refuses.
 */
export async function cfCall(pathname, { needs, ...init } = {}) {
  const token = apiToken();

  const headers = { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) };
  if (init.body !== undefined && typeof init.body !== 'string') {
    init.body = JSON.stringify(init.body);
    headers['content-type'] = 'application/json';
  }

  let res;
  try {
    res = await fetch(`${API}${pathname}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // A network failure gets its own sentence rather than an unhandled rejection three
    // frames away, for the reason check 15 gives about unreachable hosts.
    const why = err.name === 'TimeoutError' ? `no response in ${TIMEOUT_MS}ms` : err.message;
    throw new Error(`could not reach the Cloudflare API (${pathname}) — ${why}`);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Cloudflare returned HTTP ${res.status} and a body that is not JSON`);
  }

  if (!res.ok || body?.success !== true) {
    throw new Error(describeError(res.status, body, needs));
  }

  return body;
}

/**
 * Call, but report a refusal rather than throwing on it.
 *
 * The preflight needs to probe several surfaces and print a table of which ones answered.
 * Throwing on the first refusal would report one missing permission per run, and finding
 * out about four missing grants would take four attempts at the dashboard.
 */
export async function tryCall(pathname, options = {}) {
  try {
    return { ok: true, body: await cfCall(pathname, options) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
