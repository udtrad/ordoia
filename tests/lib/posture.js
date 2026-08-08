/**
 * The deploy posture, as data.
 *
 * BRIEF.md §9 names the headers this site must carry and the widenings that would
 * quietly undo them. Both checks that care about it read these tables:
 *
 *   check 14 — against `_headers` as the build emits it
 *   check 15 — against what a host actually returns on the wire
 *
 * They are here rather than in check 14 because a second copy is a second thing to
 * keep in step, and the failure mode of drift is that the file-level check and the
 * wire-level check quietly stop agreeing about what the posture is.
 */

/** Directives that must be present, and the shape each must have. */
export const REQUIRED_HEADERS = [
  { name: 'Content-Security-Policy', must: /default-src 'self'/ },
  { name: 'Strict-Transport-Security', must: /max-age=\d{7,}/ },
  { name: 'Referrer-Policy', must: /no-referrer|strict-origin/ },
  { name: 'Permissions-Policy', must: /geolocation=\(\)/ },
  { name: 'X-Content-Type-Options', must: /nosniff/ },
];

/** Widenings that would quietly undo the posture. */
export const FORBIDDEN_IN_CSP = [
  { name: "script-src permitting inline or eval", re: /script-src[^;]*(?:'unsafe-inline'|'unsafe-eval')/ },
  { name: 'a wildcard source', re: /(?:^|[\s;])(?:default|script|style|img|font|connect|frame)-src[^;]*\*/ },
  { name: 'an off-origin host', re: /(?:https?:)?\/\/(?!')[a-z0-9.-]+\.[a-z]{2,}/i },
];

/**
 * Parse a `_headers` file into ordered blocks.
 *
 * The syntax is the one Netlify, Cloudflare Pages and Workers static assets all read:
 * an unindented path pattern, then indented `Name: value` lines beneath it.
 */
export function parseHeadersFile(text) {
  const blocks = [];
  let current = null;

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;

    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: new Map() };
      blocks.push(current);
      continue;
    }

    const idx = line.indexOf(':');
    if (current && idx > 0) {
      current.headers.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
    }
  }

  return blocks;
}
