/**
 * Check 9 — link integrity.
 *
 * BRIEF.md §3 check 9: "Any internal link, anchor or version address that does
 * not resolve, including in the frozen version snapshots."
 * §5: "`/oal/v1.0` is a permanent address. It is printed on scorecards, in the
 * changelog, and in the licence line. It must resolve, unchanged, indefinitely."
 * §9: "A published version returning 404 is the most serious operational failure
 * this site can have."
 *
 * §10 adds a rule with the opposite sign: Terms and Privacy are deliberately not
 * built, and must not be stubbed — but must also not be left "resolving to
 * nothing". Both halves are checked. A dead link to a page that was never
 * written is the same defect as a dead link to one that was deleted.
 *
 * EXPECTED RED ON THE HANDOVER: oal.html links to `scorecard.md`, which the
 * handover ships but which no route serves, and the version address
 * `ordoia.co.uk/oal/v1.0` printed in three places has nothing behind it. (The
 * handover is frozen at the old domain; see `formerDomains` in src/_data/site.json.)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSource, withSite, printedAddresses } from '../lib/harness.js';
import { ledgerFor } from '../lib/allowances.js';

test('check 9 — every internal href resolves', async () => {
  const ledger = await ledgerFor(9);
  const broken = [];

  await withSite(async ({ origin, pages, browser }) => {
    const page = await browser.newPage();
    const checked = new Map();

    for (const { url } of pages) {
      await page.goto(origin + url, { waitUntil: 'load' });
      const hrefs = await page.evaluate(() =>
        [...document.querySelectorAll('a[href]')].map((a) => ({
          href: a.getAttribute('href'),
          text: (a.textContent || '').trim().slice(0, 50),
        }))
      );

      for (const { href, text } of hrefs) {
        if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
        if (/^(https?:)?\/\//i.test(href)) continue; // external, not ours to guarantee

        if (href.startsWith('#')) {
          const ok = await page.evaluate(
            (id) => Boolean(document.getElementById(id) || document.querySelector(`[name="${CSS.escape(id)}"]`)),
            href.slice(1)
          );
          if (!ok && !ledger.allows(url, href)) broken.push(`${url}: anchor ${href} ("${text}") has no target`);
          continue;
        }

        const [path, hash] = href.split('#');
        const target = new URL(path, origin + url).pathname;
        const key = target + (hash ? '#' + hash : '');
        if (checked.has(key)) {
          if (!checked.get(key) && !ledger.allows(url, href)) {
            broken.push(`${url}: ${href} ("${text}") -> ${checked.get(key) === false ? 'does not resolve' : '?'}`);
          }
          continue;
        }

        const res = await page.request.get(origin + target).catch(() => null);
        let ok = Boolean(res && res.ok());
        if (ok && hash) {
          const probe = await browser.newPage();
          await probe.goto(origin + target, { waitUntil: 'load' }).catch(() => {});
          ok = await probe
            .evaluate((id) => Boolean(document.getElementById(id)), hash)
            .catch(() => false);
          await probe.close();
        }
        checked.set(key, ok);
        if (!ok && !ledger.allows(url, href)) {
          broken.push(`${url}: ${href} ("${text}") -> ${target}${hash ? '#' + hash : ''} does not resolve`);
        }
      }
    }
    await page.close();
  });

  const unique = [...new Set(broken)].sort();
  assert.deepEqual(unique, [], `internal links that do not resolve:\n  ${unique.join('\n  ')}`);
  assert.deepEqual(ledger.unused().map((a) => a.id), [], 'stale check-9 allowances');
});

test('check 9 — every printed version address resolves', async () => {
  // Addresses appear as printed text, not only as hrefs: the licence line, the
  // changelog's permanent-address column, the scorecard footer. A scorecard
  // issued today prints `ordoia.com/oal/v1.0` on its face; in six years
  // somebody will type it in.
  const ledger = await ledgerFor(9);
  const printed = new Set();
  const unresolved = [];

  await withSource(({ sources }) => {
    for (const { html } of sources) printedAddresses(html, printed);
  });

  await withSite(async ({ origin, browser }) => {
    const page = await browser.newPage();
    for (const path of printed) {
      const bare = path.split('#')[0];
      const res = await page.request.get(origin + bare).catch(() => null);
      if (!(res && res.ok()) && !ledger.allows(bare, bare)) {
        // The path, not the domain: the match may have come from a former domain on the
        // frozen handover, and naming the current one here would be a claim about which
        // address was printed that this check did not actually establish.
        unresolved.push(`printed address ${path} does not resolve`);
      }
    }
    await page.close();
  });

  assert.ok(printed.size > 0, 'no version address is printed anywhere — the permanence guarantee has nothing to guarantee');
  assert.deepEqual(
    unresolved.sort(),
    [],
    `a printed permanent address 404s, which §9 names the most serious operational ` +
      `failure this site can have:\n  ${unresolved.join('\n  ')}`
  );
});

test('check 9 — Terms and Privacy are absent, not broken', async () => {
  // §10: deliberately not built. The failure mode to catch is a link that
  // resolves to nothing, not the absence of the page.
  const dangling = [];
  await withSource(({ sources }) => {
    for (const { url, html } of sources) {
      for (const m of html.matchAll(/<a[^>]+href\s*=\s*["']([^"']*)["'][^>]*>([^<]*(?:terms|privacy)[^<]*)</gi)) {
        const [, href, text] = m;
        if (!href || href === '#' || href === '') {
          dangling.push(`${url}: "${text.trim()}" links to nothing (href="${href}")`);
        }
      }
    }
  });
  assert.deepEqual(dangling, [], `Terms/Privacy links resolving to nothing:\n  ${dangling.join('\n  ')}`);
});
