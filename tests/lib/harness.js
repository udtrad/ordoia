/**
 * The check harness.
 *
 * One import for every check file. It resolves the target, serves it over a
 * real origin, and hands out a Playwright page.
 *
 * The target is deliberately switchable:
 *
 *   npm test              -> _site/   (the build; must be green)
 *   npm run test:handover -> .        (the verbatim designer handover; must be red)
 *
 * Running the same suite against both is what makes the red-then-green claim in
 * BRIEF.md §3 mean anything. A check that cannot fail on the handover is not a
 * check, it is a comment.
 */

import { createServer } from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHeadersFile, patternToRegExp } from './posture.js';

export const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

/**
 * Where the checks look. `_site` unless `ORDOIA_TARGET` names somewhere else.
 *
 * There is no fallback. An earlier version returned the repo root when `_site` was
 * missing, which meant a missing build was reported as eight failures about horizontal
 * overflow and Google Fonts preconnects — the handover's real defects — rather than as
 * "there is no build". The suite still exited non-zero, because the handover is red by
 * design, so the gate was never at risk; the operator was simply told the wrong thing and
 * sent after phantom CSS bugs. Guessing a target is not worth a misdiagnosis.
 */
export function resolveTarget() {
  const explicit = process.env.ORDOIA_TARGET;
  const target = explicit ? path.resolve(REPO_ROOT, explicit) : path.join(REPO_ROOT, '_site');

  if (!existsSync(target)) {
    throw new Error(
      explicit
        ? `ORDOIA_TARGET points at ${target}, which does not exist.`
        : `There is no build at ${target}. Run \`npm run build\` first, or \`npm run check\` ` +
          `to do both. To check the frozen handover instead, run \`npm run test:handover\`.`
    );
  }
  return target;
}

export const TARGET = resolveTarget();

/**
 * True only when the target *is* the repo root — which, since the fallback was removed,
 * can happen only by typing `ORDOIA_TARGET=.` (what `npm run test:handover` does).
 * It is no longer inferred from the filesystem, though the line still reads like it.
 */
export const IS_HANDOVER = TARGET === REPO_ROOT;

/**
 * The site record — the same file the build reads.
 *
 * The domain lives here and nowhere else in the checks. A check that hardcodes it
 * stops matching the day the domain changes, and a matcher that matches nothing
 * makes its assertion vacuous rather than red. That is not hypothetical: check 14
 * hardcoded `ordoia.co.uk` and passed silently when the domain became `ordoia.com`,
 * while check 9 — which guards its match count — failed as it should have.
 */
export const SITE = JSON.parse(readFileSync(path.join(REPO_ROOT, 'src/_data/site.json'), 'utf8'));

/** Escape a literal for interpolation into a RegExp. */
export function escapeRe(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every path printed as *text* against the site's own domain.
 *
 * These are the addresses a human types six years from now off a printed scorecard,
 * as opposed to the ones a browser follows from an href. §9 names one of these
 * returning 404 as the most serious operational failure this site can have.
 */
export function printedAddresses(html, into = new Set()) {
  // Former domains are matched too, so the frozen handover — which predates the move
  // to ordoia.com — is still read for what it actually says rather than reported empty.
  const domains = [SITE.domain, ...(SITE.formerDomains ?? [])].map(escapeRe).join('|');
  const re = new RegExp(`(?:${domains})(/[A-Za-z0-9._~\\-/]*)`, 'g');
  for (const m of html.matchAll(re)) {
    into.add(m[1].replace(/[.,;)]$/, '').split('#')[0]);
  }
  return into;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'graphify-out', '_site', 'tests']);

/** Every .html file under the target, as target-relative paths. */
export async function htmlFiles(dir = TARGET, base = TARGET) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...(await htmlFiles(full, base)));
    } else if (entry.name.endsWith('.html')) {
      out.push(path.relative(base, full));
    }
  }
  return out.sort();
}

/**
 * The URL each HTML file is served at.
 * `index.html` collapses to its directory, so the built site's clean URLs and
 * the handover's `about.html` both resolve without the checks caring which
 * shape they are looking at.
 */
export function urlFor(relPath) {
  const p = relPath.split(path.sep).join('/');
  if (p === 'index.html') return '/';
  if (p.endsWith('/index.html')) return '/' + p.slice(0, -'/index.html'.length) + '/';
  return '/' + p;
}

/** Routes that carry the rubric or the scorecard — check 5's scope. */
export function isRubricOrScorecardRoute(url) {
  return /(^|\/)(oal|scorecard|changelog)(\.html|\/|$)/.test(url);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
};

/**
 * Read `_headers` and `_redirects` out of a build, for the host-emulating mode below.
 *
 * Redirect syntax is `from  to  [status]`, one per line, `#` for comments — the shape
 * `src/_redirects` is written in.
 */
function loadHostConfig(root) {
  const blocksPath = path.join(root, '_headers');
  const redirectsPath = path.join(root, '_redirects');

  const blocks = existsSync(blocksPath) ? parseHeadersFile(readFileSync(blocksPath, 'utf8')) : [];
  const redirects = [];

  if (existsSync(redirectsPath)) {
    for (const raw of readFileSync(redirectsPath, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const [from, to, status] = line.split(/\s+/);
      if (from && to) redirects.push({ from, to, status: Number(status) || 301 });
    }
  }

  return { blocks, redirects };
}

/**
 * The headers a Cloudflare-shaped host would attach to one path.
 *
 * Two passes, because that is what the documentation describes: every matching block
 * contributes its headers, a repeated name is **joined with a comma** rather than
 * overridden, and only then do removal lines take effect.
 *
 * The comma-join is the part worth having. It is counter-intuitive, it is what made an
 * overlapping `Cache-Control` on the frozen version directory a real defect, and a local
 * origin that quietly let the narrower rule win would reproduce the intuition instead of
 * the host.
 */
function hostHeadersFor(config, pathname) {
  const matching = config.blocks.filter((b) => patternToRegExp(b.pattern).test(pathname));
  const out = new Map();

  for (const block of matching) {
    for (const [name, value] of block.headers) {
      out.set(name, out.has(name) ? `${out.get(name)}, ${value}` : value);
    }
  }
  for (const block of matching) {
    for (const name of block.removals) out.delete(name);
  }

  return Object.fromEntries(out);
}

/**
 * Serve the target on an ephemeral port.
 *
 * Resolution order for `/services` is `services.html`, then `services/index.html`
 * — so a clean URL works before the build produces one, and check 9 measures
 * link integrity rather than the server's willingness to guess.
 *
 * ── `applyHeaders` ──────────────────────────────────────────────────────────────────
 *
 * Off by default, which is what every check other than 15 wants: a plain file server, so
 * a check measures the build rather than the deploy configuration.
 *
 * On, it also applies `_headers`, `_redirects` and a real `404.html` — enough of a
 * Cloudflare-shaped host to run check 15 against without deploying. CHECKS.md claimed
 * check 15 had been proven green "against a local origin that applies `_headers` and
 * `_redirects`", and that origin was not in the repo, so the strongest discrimination
 * claim here could not be re-run by anyone reading it. `npm run test:live-local` is that
 * claim, made reproducible.
 *
 * **Stated limit, in the manner of checks 12 and 14: a local Node server is not
 * Cloudflare.** It reproduces the documented parsing of two config files. It does not
 * reproduce Email Address Obfuscation, Rocket Loader, Brotli, HTTP/2, the edge cache, or
 * anything zone-scoped — which is exactly why `ORDOIA_LIVE` against a real deployment
 * stays the only thing that settles §13 item 6.
 */
export async function serve(root = TARGET, { applyHeaders = false } = {}) {
  const config = applyHeaders ? loadHostConfig(root) : null;

  const server = createServer(async (req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);

    // "Redirects are applied before headers, so when a request matches both a redirect
    // and a header, the redirect takes priority." — Cloudflare Pages documentation.
    if (config) {
      const hit = config.redirects.find((r) => r.from === url);
      if (hit) {
        res.writeHead(hit.status, { location: hit.to });
        res.end();
        return;
      }
      // The host serves neither of its own config files.
      if (url === '/_headers' || url === '/_redirects') {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('404');
        return;
      }
    }

    const rel = url.replace(/^\/+/, '');
    const candidates = url.endsWith('/')
      ? [path.join(rel, 'index.html')]
      : [rel, rel + '.html', path.join(rel, 'index.html')];

    for (const candidate of candidates) {
      const full = path.resolve(root, candidate);
      // Never serve outside the target, whatever the request says.
      if (!full.startsWith(path.resolve(root))) continue;
      try {
        const info = await stat(full);
        if (!info.isFile()) continue;
        const body = await readFile(full);
        res.writeHead(200, {
          'content-type': MIME[path.extname(full)] || 'application/octet-stream',
          'content-length': body.length,
          ...(config ? hostHeadersFor(config, url) : {}),
        });
        res.end(body);
        return;
      } catch {
        /* try the next candidate */
      }
    }

    // A real 404 page, carrying the posture, when the host config is in play. Check 15
    // asserts both — a soft 404 tells crawlers every mistyped address is a real page, and
    // whether `_headers` reaches a 404 response is undocumented on Pages.
    const notFound = config ? path.resolve(root, '404.html') : null;
    if (notFound && existsSync(notFound)) {
      const body = await readFile(notFound);
      res.writeHead(404, {
        'content-type': MIME['.html'],
        'content-length': body.length,
        ...hostHeadersFor(config, url),
      });
      res.end(body);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Run `fn` with a served origin, the page list, and a Playwright browser.
 * Everything is torn down even when the check throws.
 */
export async function withSite(fn) {
  const { chromium } = await import('playwright');
  const site = await serve();
  const browser = await chromium.launch();
  try {
    const files = await htmlFiles();
    const pages = files.map((f) => ({ file: f, url: urlFor(f) }));
    return await fn({ ...site, pages, browser });
  } finally {
    await browser.close().catch(() => {});
    await site.close();
  }
}

/** Run `fn` without a browser — for checks that only need the source text. */
export async function withSource(fn) {
  const files = await htmlFiles();
  const sources = await Promise.all(
    files.map(async (f) => ({
      file: f,
      url: urlFor(f),
      html: await readFile(path.join(TARGET, f), 'utf8'),
    }))
  );
  return fn({ sources });
}
