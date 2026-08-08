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
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

/** Where the checks look. `_site` when it exists, otherwise the repo root. */
export function resolveTarget() {
  const explicit = process.env.ORDOIA_TARGET;
  if (explicit) return path.resolve(REPO_ROOT, explicit);
  const built = path.join(REPO_ROOT, '_site');
  return existsSync(built) ? built : REPO_ROOT;
}

export const TARGET = resolveTarget();
export const IS_HANDOVER = TARGET === REPO_ROOT;

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
 * Serve the target on an ephemeral port.
 *
 * Resolution order for `/services` is `services.html`, then `services/index.html`
 * — so a clean URL works before the build produces one, and check 9 measures
 * link integrity rather than the server's willingness to guess.
 */
export async function serve(root = TARGET) {
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
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
        });
        res.end(body);
        return;
      } catch {
        /* try the next candidate */
      }
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
