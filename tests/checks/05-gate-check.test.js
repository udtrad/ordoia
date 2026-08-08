/**
 * Check 5 — the gate check.
 *
 * BRIEF.md §2: "The rubric is not gated. No email wall, no download form, no
 * modal. The blank scorecard is ungated too — it is a download of an artifact,
 * not a conversion event."
 *
 * §9: "The only contact path is the mailto: CTA. No form, no capture, no
 * autoresponder."
 *
 * The commercial argument for the gate is the usual one and it is wrong here:
 * index.html says a prospect recognising their own system at OAL 1 *is* the
 * qualification mechanism, and a gate blocks precisely that recognition. So this
 * check is enforced hardest on the rubric and scorecard routes, and applied in a
 * weaker form everywhere else.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withSource, isRubricOrScorecardRoute } from '../lib/harness.js';
import { ledgerFor } from '../lib/allowances.js';

const GATES = [
  { name: '<form>', re: /<form[\s>]/i },
  { name: 'email input', re: /<input[^>]*type\s*=\s*["']?email/i },
  { name: 'text/submit input', re: /<input[^>]*type\s*=\s*["']?(text|submit)/i },
  { name: '<dialog> / modal', re: /<dialog[\s>]|\bclass\s*=\s*["'][^"']*\bmodal\b/i },
  { name: '<iframe>', re: /<iframe[\s>]/i },
  { name: '<embed> / <object>', re: /<(embed|object)[\s>]/i },
  { name: 'third-party script', re: /<script[^>]+src\s*=\s*["']https?:\/\//i },
];

test('check 5 — no gate on any route', async () => {
  const ledger = await ledgerFor(5);
  const violations = [];

  await withSource(({ sources }) => {
    for (const { url, html } of sources) {
      for (const { name, re } of GATES) {
        const m = html.match(re);
        if (!m) continue;
        if (ledger.allows(url, m[0])) continue;
        const scope = isRubricOrScorecardRoute(url) ? 'RUBRIC/SCORECARD ROUTE' : 'route';
        violations.push(`${url} (${scope}): ${name} — "${m[0].slice(0, 60)}"`);
      }
    }
  });

  assert.deepEqual(violations, [], `a gate stands between a reader and an artifact:\n  ${violations.join('\n  ')}`);
  assert.deepEqual(ledger.unused().map((a) => a.id), [], 'stale check-5 allowances');
});

test('check 5 — the only contact path is mailto:', async () => {
  const violations = [];
  const mailtos = [];

  await withSource(({ sources }) => {
    for (const { url, html } of sources) {
      for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
        const href = m[1];
        if (href.startsWith('mailto:')) {
          mailtos.push(`${url} -> ${href}`);
          continue;
        }
        // Anything pointing at a form-hosting or capture service.
        if (/\b(typeform|hubspot|mailchimp|convertkit|calendly|cal\.com|tally\.so|formspree|getform|netlify\/forms|docs\.google\.com\/forms)\b/i.test(href)) {
          violations.push(`${url}: capture service link — ${href}`);
        }
      }
    }
  });

  assert.deepEqual(violations, [], `a capture path exists:\n  ${violations.join('\n  ')}`);
  assert.ok(
    mailtos.length > 0,
    'no mailto: anywhere — the site has no contact path at all, which is a different failure ' +
      'from having a gated one but is still a failure'
  );
});
