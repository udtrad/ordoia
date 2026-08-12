/**
 * Check 29 — a version page states its true standing, at the time it is read.
 *
 * Ruled by the user 2026-08-12: *"version status renders live on every version page, and
 * updates whenever a valid version revision occurs."* `/oal/v1.0/` saying `Current` after
 * v1.1 publishes is a published claim becoming false by mechanism, and it is not
 * acceptable for one moment.
 *
 * ── What this was written against ──────────────────────────────────────────────────
 *
 * Measured on 2026-08-12: **no version page rendered a status at all.** `v.status` reached
 * exactly one place in the whole build — `src/changelog.njk`, a `<td>` in the version
 * index table. A reader landing on `/oal/v1.0/` from a search result was told the
 * methodology version, its publication date, its licence and its permanent address, and
 * nothing whatever about whether it was still the current one.
 *
 * So §3.6's framing — report where the stamp lives and what moving it cost — had no
 * answer. Nothing moved. The stamp did not exist, and this check is written red-first
 * against that: against the build it was written against it produced one finding per
 * published version.
 *
 * ── Why the status is chrome and not content ───────────────────────────────────────
 *
 * The rubric's words are frozen. The label describing that version's standing is a fact
 * *about* the document rather than part of it, and freezing it was never a design
 * decision — it was a side effect of having frozen the whole file. The freeze/chrome
 * split is the moment the unit changes from the file to a defined fragment, so the stamp
 * is excluded from the frozen fragment when that boundary is drawn. Moving it later would
 * mean editing frozen bytes: a version event over a label.
 *
 * That is why this check reads the stamp from outside `<main>` and would fail if it were
 * inside — see the last test.
 */

import test from 'node:test';
import { IS_HANDOVER, withSource, urlFor } from '../lib/harness.js';
import { survey } from '../lib/population.js';
import oal from '../../src/_data/oal.json' with { type: 'json' };

const HANDOVER_SKIP = 'the handover has no version pages — that is the point';

/** The stamp, wherever it sits, with its two data attributes and its rendered text. */
const STAMP = /<p class="vstatus"([^>]*)>([\s\S]*?)<\/p>/i;
const attr = (tag, name) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
const MAIN = /<main[^>]*>([\s\S]*?)<\/main>/i;
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** The page a published version is served at. */
const pageFor = (version) => `/oal/v${version}/`;

test('check 29 — exactly one declared version is Current', () => {
  const s = survey({ versions: 'versions declared in oal.json' });

  const current = [];
  for (const v of oal.versions) {
    s.count('versions');
    if (String(v.status).toLowerCase() === 'current') current.push(v.version);
  }

  if (current.length !== 1) {
    s.fail(
      `oal.json declares ${current.length} versions as Current (${current.join(', ') || 'none'}). ` +
        `Exactly one rubric version is the current one at any moment — that is what the word ` +
        `means, and check 21's fifth test is conditioned on it, so a record with none or two ` +
        `does not merely mislead a reader, it silently stops a freeze guarantee from applying.`
    );
  }

  if (current.length === 1 && current[0] !== oal.current) {
    s.fail(
      `oal.json's \`current\` says v${oal.current} but the version marked Current in ` +
        `\`versions\` is v${current[0]}. Two fields in one file disagreeing about which ` +
        `version is live is the single-source-of-truth failure this record exists to prevent.`
    );
  }

  s.report(
    'the versions record does not name exactly one current version. Publishing v1.1 must ' +
      'flip v1.0 everywhere in one edit — its own page, the changelog, /oal/ — with no ' +
      'page-by-page correction and no possibility of two surfaces disagreeing.'
  );
});

test('check 29 — every published version page renders its status from the record', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  const s = survey({
    versions: 'published versions whose page was read',
    stamps: 'rendered status stamps compared against the record',
  });

  await withSource(({ sources }) => {
    const byUrl = new Map(sources.map((x) => [x.url, x.html]));

    for (const v of oal.versions) {
      const url = pageFor(v.version);
      const html = byUrl.get(url);
      if (html === undefined) {
        s.count('versions');
        s.fail(
          `v${v.version} is declared in oal.json but the build produced no page at ${url}, ` +
            `so its status cannot be stated anywhere a reader will look.`
        );
        continue;
      }
      s.count('versions');

      const found = STAMP.exec(html);
      if (!found) {
        s.fail(
          `${url} renders no version status at all. A reader arriving from a search result ` +
            `is told the methodology version, its date, its licence and its permanent ` +
            `address, and nothing about whether it is still the one to score against.`
        );
        continue;
      }
      s.count('stamps');

      const [, tag, body] = found;
      const stated = attr(tag, 'data-status');
      const forVersion = attr(tag, 'data-version');

      if (forVersion !== v.version) {
        s.fail(`${url}: its stamp claims to describe v${forVersion}, not v${v.version}`);
      }
      if (stated !== v.status) {
        s.fail(
          `${url}: the stamp states \`${stated}\` and oal.json records \`${v.status}\`. The ` +
            `record is the one source of truth for standing; a page that restates it can ` +
            `only ever be a second place for it to be wrong.`
        );
      }
      if (!new RegExp(`\\b${v.status}\\b`, 'i').test(text(body))) {
        s.fail(
          `${url}: the stamp's data attribute says \`${v.status}\` but a reader sees ` +
            `"${text(body)}". The attribute is for this check; the words are for the reader, ` +
            `and only one of them is a published claim.`
        );
      }

      // §3.6: a superseded stamp names and links the version that superseded it. A reader
      // who lands on an old version from a search result must be one click from the
      // current one; that is the whole job of the stamp.
      if (String(v.status).toLowerCase() !== 'current') {
        const successor = v.supersededBy;
        if (!successor) {
          s.fail(
            `v${v.version} is \`${v.status}\` but its record carries no \`supersededBy\`, so ` +
              `the stamp cannot say what replaced it and the reader is left on a dead end.`
          );
        } else if (!new RegExp(`href="${pageFor(successor)}"`).test(body)) {
          s.fail(
            `${url}: the stamp says \`${v.status}\` but does not link ${pageFor(successor)}. ` +
              `Naming the successor without linking it makes the reader retype an address ` +
              `off a page that has just told them it is out of date.`
          );
        }
      }

      // The boundary this whole commit exists to draw. A stamp inside <main> is inside the
      // frozen fragment, which means it is frozen — and a frozen label describing a
      // changing standing is the defect, not the fix.
      const main = MAIN.exec(html)?.[1] ?? '';
      if (STAMP.test(main)) {
        s.fail(
          `${url}: the status stamp is inside <main>, which is the frozen fragment. It would ` +
            `freeze with the content, so publishing v1.1 could not update it without editing ` +
            `published bytes — a version event over a label.`
        );
      }
    }
  });

  s.report(
    'a published version page does not state its true standing. A version page saying ' +
      '`Current` after it has been superseded is a published claim becoming false by ' +
      'mechanism, on the one document the practice\'s credibility rests on.'
  );
});

test('check 29 — no other surface restates a status the record does not carry', async (t) => {
  if (IS_HANDOVER) return t.skip(HANDOVER_SKIP);

  /**
   * The hole found at Gate 0 on 2026-08-12.
   *
   * The changelog rail printed `Superseded: None` from a hand-typed copy fragment while
   * the index table three sections below rendered `{{ v.status }}` from the record.
   * Publishing v1.1 would have left the rail stating "None" and the table stating
   * "Superseded", on one page, both reading as authoritative — the shape CHECKS.md
   * records as worse than merely being out of date.
   */
  const s = survey({
    surfaces: 'rendered pages scanned for a restated version status',
    statuses: 'status words found and checked against the record',
  });

  const declared = new Set(oal.versions.map((v) => String(v.status).toLowerCase()));
  const supersededCount = oal.versions.filter(
    (v) => String(v.status).toLowerCase() !== 'current'
  ).length;

  await withSource(({ sources }) => {
    for (const { url, html } of sources) {
      if (!/^\/(changelog|oal)\//.test(url)) continue;
      s.count('surfaces');

      const body = text(html);
      for (const word of ['current', 'superseded', 'withdrawn']) {
        if (!new RegExp(`\\b${word}\\b`, 'i').test(body)) continue;
        s.count('statuses');
        if (word === 'superseded' && supersededCount === 0 && !declared.has('superseded')) {
          // Legitimate: the changelog explains what supersession means in prose. What is
          // not legitimate is a *count* stated as a literal.
          if (/Superseded\s*<\/dt>\s*<dd>\s*(\d+|None)\s*<\/dd>/i.test(html)) {
            const shown = /Superseded\s*<\/dt>\s*<dd>\s*([^<]*)<\/dd>/i.exec(html)?.[1]?.trim();
            if (shown !== String(supersededCount) && !(shown === 'None' && supersededCount === 0)) {
              s.fail(
                `${url}: states "Superseded: ${shown}" while oal.json records ` +
                  `${supersededCount}. A hand-typed count beside a rendered table is two ` +
                  `surfaces that can disagree, and both read as authoritative.`
              );
            }
          }
        }
      }
    }
  });

  s.report(
    'a page restates a version status that does not come from oal.json. One source of ' +
      'truth means publishing v1.1 is one edit; a second hand-maintained surface means it ' +
      'is one edit plus however many places somebody remembers.'
  );
});
