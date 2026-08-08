# The check suite

BRIEF.md §3 asks for the site's constraints to be executable: a suite that runs
on every commit, blocks the deploy, and has its results retained. This file is
the standing record of what the suite is and what it found.

The governing idea, in the brief's own terms: a rule in `RATIONALE.md` is
**asserted**. A rule that fails a build is **enforced**. A rule with a test that
runs on every deploy and reports is **evidenced**.

## Running it

```bash
npm test              # against _site/ — the build. Must be green.
npm run test:handover # against . — the verbatim designer handover. Must be red.
```

One suite, two targets. Running it against the handover is not a formality: a
check that cannot fail on the unbuilt site is not a check, it is a comment. The
red baseline below is the evidence that the suite works.

## Baseline — the verbatim handover, 2026-08-08

Commit `3b93f1b`, before any build code existed. **36 tests, 28 pass, 8 fail.**

| Check | Result | What it found |
|---|---|---|
| 0 · detector controls | pass | The claim/disclaimer detector catches all seven planted claims and permits all nine disclaimers. |
| 1 · colour rule | pass | `--floor` resolves nowhere outside its two situations — and is genuinely present on `.floor-line`, so the check is not passing by the colour's absence. |
| 2 · score completeness | pass | No measure shows a level without all four qualifiers. `.mark--reader` is exempt by construction, not by allowance. |
| 3 · banned lexicon | pass | After the detector was made claim-shaped. One dated allowance remains. |
| 4 · aggregate shapes | pass | No canvas, no charting import, no total, and the measure's geometry is identical on every instance. |
| 5 · gate check | pass | No form, no email input, no modal, no third-party embed. The only contact path is `mailto:`. |
| 6 · third-party requests | **FAIL** | All seven pages preconnect to `fonts.googleapis.com` and `fonts.gstatic.com` and load a stylesheet from the former. The no-consent-banner posture is not yet true. |
| 7 · contrast | **FAIL** | Text passes everywhere. The measure's own line does not: `.measure__rule` at **1.51:1** and, on not-assessed scorecard rows, `.tick` at **1.00:1** — the same colour as the rule it sits on, so literally invisible. |
| 8 · greyscale survival | pass | Both `--floor` sites name themselves in words, so nothing is carried by hue alone. |
| 9 · link integrity | **FAIL** | Every internal href resolves. The printed permanent address `ordoia.co.uk/oal/v1.0` does not — and §9 names a published version returning 404 the most serious operational failure this site can have. |
| 10 · version stamp | **FAIL** | `services.html` states depths, readiness thresholds and dimension names — the entire commercial offer — and carries no OAL version identifier anywhere. This one was not predicted. |
| 11 · print integrity | pass | Nothing overflows A4, every stamp and *not assessed* sentence survives print emulation, and the scorecard renders to a real PDF. |
| 12 · copy provenance | **FAIL** | There is no copy source of truth outside the templates and no change log, so §8's "nothing is silently rewritten" is currently unenforceable by construction. |

### Three findings worth stating plainly

**The measure's own line fails 1.4.11.** `--untravelled` `#C3CAC6` is 1.37:1 on
`--ground` and 1.51:1 on `--raised`. `RATIONALE.md`'s fix was real — it moved
*text* off the token, and `.grid .none` is correctly set in `--slate` — but the
token still draws the scale itself. The worst case is a not-assessed scorecard
row, where the minor ticks are drawn in the same colour as the rule they sit on
and measure 1.00:1. Resolution: a scoped `--track` token at ≥3:1 for the rule and
ticks only, leaving `--untravelled` its existing job on decorative borders.

**`services.html` has no version.** Every other page anchors its claims to OAL
v1.0. The services page — the one a buyer reads before spending £2,500 — names
four depths, three readiness thresholds and eight dimension names against no
version at all. A level means nothing without one, and neither does a price.

**`RATIONALE.md` overstates one contrast figure.** It gives `ink` on `ground` as
14.7:1; the sRGB computation is 14.42:1. Both pass AA by a wide margin, so
nothing shipped is wrong — the number in the document is. Logged in `CHANGES.md`
rather than silently corrected.

## The override mechanism

`tests/allowances.json`. Entries carry `id`, `check`, `page`, `match`, a one-line
`reason`, a `dated` field and `addedBy` — the shape of a deviation log in a
working paper.

Two properties are enforced in `tests/lib/allowances.js`:

- **A malformed allowance fails the suite.** An override that cannot be read is
  worse than no override, because it looks like diligence.
- **An allowance that matches nothing fails the suite.** A deviation log that
  accumulates entries for violations that no longer exist has stopped being a
  record of judgement.

A check may consult the file. **No check may be disabled by it.**

One allowance is live: check 3 on `/independence`, for the sentence *"Independent
is a word for a practice with apparatus behind it"* in the section named "The
word we do not use". Banning the word there would delete the disclosure the
invariant exists to produce.

## What the suite taught about itself

Three checks were wrong on their first run, and each was wrong in the same
direction — measuring the shape of the text rather than the claim it makes.

1. **Check 3** flagged fourteen passages, every one a *disclaimer*: "We do not
   certify, attest, accredit or approve", "Not an accreditation, and not a
   badge", "There is no overall score, no weighted average". Banning those would
   have deleted the honesty disclosures §2 exists to produce. Detection moved to
   `tests/lib/lexicon.js` and became claim-shaped — a banned term counts only in
   a sentence with no negation. Because that rule is permissive, check 0 plants
   seven claim-shaped strings and asserts they are still caught.

2. **Check 4** matched `d3` against `id="d3"` — the anchor for dimension 3 — and
   read "1 of 8" as a total when it is an ordinal position. Library names are now
   recognised only in import and `src` positions, and only denominators that
   could be a sum of levels count. Controls pinned in the same file.

3. **Check 8** judged every colour-inheriting descendant separately, so the
   `<span class="mono">` inside `.floor-line` looked like an unlabelled swatch
   when the label was in its own parent. Now only outermost coloured elements are
   judged.

The pattern is worth keeping in view: each of these would have shipped as a
passing check that silently measured nothing, which is the OAL 1 failure the
rubric describes — a behaviour requested in a comment with nothing verifying it.

## Not yet built

Checks are in place for all twelve items in §3. What pass 1 has not yet done, and
what therefore keeps checks 6, 7, 9, 10 and 12 red:

- self-hosted subset fonts (check 6)
- the `--track` token (check 7)
- clean URLs and the `/oal/v1.0` snapshot (check 9)
- the version stamp on the services page (check 10)
- `src/_data/copy/` and `CHANGES.md` (check 12)
