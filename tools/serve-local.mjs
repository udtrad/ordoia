/**
 * Run the suite against a local origin that applies the deploy configuration.
 *
 *   npm run test:live-local
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────────
 *
 * CHECKS.md recorded that check 15 had been proven green "against a local origin that
 * applies `_headers` and `_redirects`". That origin was never committed. So the repo's
 * strongest discrimination claim — the check that guards §13 item 6, the one that runs in
 * CI immediately after a deploy — rested on evidence nobody reading the file could
 * reproduce. In a repo whose product is provenance, that is the defect it sells against.
 *
 * This is that origin, committed. It boots the build behind `serve(..., { applyHeaders:
 * true })`, points `ORDOIA_LIVE` at it, and runs the whole suite — so check 15's seven
 * assertions stop being skipped and start being evidence.
 *
 * It is also how every tightening in tests/lib/posture.js gets demonstrated without a
 * deploy, and it reproduces the one piece of Cloudflare behaviour that is both documented
 * and counter-intuitive: two blocks matching one request have their headers **joined with
 * a comma**, not overridden.
 *
 * ── What it cannot establish ────────────────────────────────────────────────────────
 *
 * **A local Node server is not Cloudflare.** Stated here in the manner checks 12 and 14
 * state their own limits, because the gap is the whole point of check 15 existing:
 *
 *   - no Email Address Obfuscation, no Rocket Loader, nothing zone-scoped — and those are
 *     precisely the failures check 15 was written to catch
 *   - no Brotli, no HTTP/2, no edge cache
 *   - `_headers` parsing here follows the documentation; the host's parser is the host's
 *
 * Green here means the artifact and the configuration agree. Only
 * `ORDOIA_LIVE=https://ordoia.com npm test` means the site does.
 */

import { spawn } from 'node:child_process';
import { serve, TARGET, REPO_ROOT } from '../tests/lib/harness.js';

const site = await serve(TARGET, { applyHeaders: true });

console.log(`[live-local] serving ${TARGET} with _headers and _redirects at ${site.origin}`);
console.log('[live-local] a local Node server is not Cloudflare — see the header of this file\n');

const child = spawn(
  process.execPath,
  ['--test', '--test-reporter=spec', 'tests/checks/*.test.js'],
  {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, ORDOIA_LIVE: site.origin },
  }
);

// The server holds the event loop open, so it has to come down on every exit path or the
// command hangs green — which in CI is indistinguishable from a check that never finished.
const shutdown = async (code) => {
  await site.close();
  process.exit(code);
};

child.on('exit', (code, signal) => shutdown(signal ? 1 : (code ?? 1)));
child.on('error', async (err) => {
  console.error(`[live-local] could not start the test runner: ${err.message}`);
  await shutdown(1);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal);
    shutdown(1);
  });
}
