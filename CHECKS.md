# The check suite

BRIEF.md §3 asks for the site's constraints to be executable: a suite that runs
on every commit, blocks the deploy, and has its results retained. This file is
the standing record of what the suite is and what it found.

The governing idea, in the brief's own terms: a rule in `RATIONALE.md` is
**asserted**. A rule that fails a build is **enforced**. A rule with a test that
runs on every deploy and reports is **evidenced**.

## Running it

```bash
npm run build          # eleventy -> _site/
npm test               # against _site/ — the build. Must be green.
npm run test:handover  # against . — the verbatim designer handover. Must be red.
npm run check          # build then test; this is the deploy gate.
```

One suite, two targets. Running it against the handover is not a formality: a
check that cannot fail on the unbuilt site is not a check, it is a comment. The
two baselines below are the evidence that the suite works.

## Where the enforcement lives

Not all of it is in this directory. Six invariants are enforced by the build
itself, in `eleventy.config.js`, because a rule that fails at the moment somebody
edits the wrong value is better than one that fails two minutes later:

| Build failure | Defends |
|---|---|
| a `score` measure without level, depth, version and working paper | §2 — "the component does not render without them" |
| a depth cap whose prose disagrees with its own `inspectedMax` | §6 — a mis-sold engagement |
| the four pairs not covering all eight dimensions exactly once | §6 — the pairing is how the scorecard is read |
| a copy fragment referenced by a key that does not exist | §8 — a typo becomes an empty div otherwise |
| a design token the build needs but `styles.css` does not define | §7 — the favicon is generated from them |
| `--track` below 3:1 on either surface it is drawn on | §7 — the same assertion check 7 makes on the page |
| a `/oal/vX.Y/` snapshot generated from a rubric it was not published with | §5, §13.1 — restating a historical methodology |

The build defends the pages it renders; the suite defends the ones it does not. A
hand-written `.measure` in a future page would slip past the macro and be caught
by check 2.

## Baseline A — the build, 2026-08-08

**40 tests, 40 pass, 0 fail.** This is the gate.

## Baseline B — the verbatim handover, 2026-08-08

Commit `3b93f1b`, before any build code existed. **40 tests, 32 pass, 8 fail.**

| Check | Handover | What it establishes |
|---|---|---|
| 0 · detector controls | pass | The claim/disclaimer detector catches all seven planted claims and permits all nine disclaimers. |
| 1 · colour rule | pass | `--floor` resolves nowhere outside its two situations — and is genuinely present on `.floor-line`, so the check is not passing by the colour's absence. |
| 2 · score completeness | pass | No measure shows a level without all four qualifiers. `.mark--reader` is exempt by construction, not by allowance. |
| 3 · banned lexicon | pass | After the detector was made claim-shaped. One dated allowance remains. |
| 4 · aggregate shapes | pass | No canvas, no charting import, no total, and the measure's geometry is identical on every instance. |
| 5 · gate check | pass | No form, no email input, no modal, no third-party embed. The only contact path is `mailto:`. |
| 6 · third-party requests | **FAIL** | All seven pages preconnect to `fonts.googleapis.com` and `fonts.gstatic.com` and load a stylesheet from the former. |
| 7 · contrast | **FAIL** | Text passes everywhere. The measure's own line does not: `.measure__rule` at **1.51:1** and, on not-assessed scorecard rows, `.tick` at **1.00:1** — the same colour as the rule it sits on. |
| 8 · greyscale survival | pass | Both `--floor` sites name themselves in words, so nothing is carried by hue alone. |
| 9 · link integrity | **FAIL** | Every internal href resolves. The printed permanent address `ordoia.co.uk/oal/v1.0` does not. |
| 10 · version stamp | **FAIL** | `services.html` states depths, readiness thresholds and dimension names and carries no OAL version identifier anywhere. Not predicted. |
| 11 · print integrity | pass | Nothing overflows A4, every stamp and *not assessed* sentence survives print emulation, and the scorecard renders to a real PDF. |
| 12 · copy provenance | **FAIL** | No copy source outside the templates and no change log, so §8 is unenforceable by construction. |
| 13 · column integrity | **FAIL** | Two `.sheet` blocks on the rubric page ship no rail, so `.body` auto-placed into the rail's column and the whole rubric rendered **152px wide**. Also 58–61px of horizontal page overflow at 320px. Neither was predicted. |

### Four findings worth stating plainly

**The rubric page rendered in the rail's column.** `.sheet` is a two-column grid
and `.body` carried no explicit column, so on the two sheets that ship no
`<aside class="rail">` it auto-placed into the 9.5rem rail. Every level
descriptor, every dimension, the depth grid and the limits rendered at **152px**
on a 1280px desktop. Measured, on the handover, at commit `3b93f1b`. Nothing in
checks 1–12 could see it: contrast passed, print passed (the print stylesheet
sets the column explicitly), links passed, all the copy was present. The page was
correct in every respect except being readable. Check 13 exists because of it.

**The measure's own line fails 1.4.11.** `--untravelled` `#C3CAC6` is 1.37:1 on
`--ground` and 1.51:1 on `--raised`. `RATIONALE.md`'s fix was real — it moved
*text* off the token — but the token still drew the scale itself. The worst case
is a not-assessed scorecard row, where the minor ticks are the same colour as the
rule they sit on and measure 1.00:1. Resolved with a scoped `--track` token at
3.25:1 / 3.57:1, asserted both at build time and by check 7.

**`services.html` had no version.** The page a buyer reads before spending £2,500
named four depths, three readiness thresholds and eight dimension names against
no version at all.

**`RATIONALE.md` overstated one contrast figure** — `ink` on `ground` as 14.7:1
where the sRGB computation gives 14.42:1. Both pass AA by a wide margin, so
nothing shipped was wrong; the number in the document was. Corrected in place
*and* logged in `CHANGES.md`, because §8's rule for a factual mismatch is fix and
flag, and a rationale that quietly self-corrects is the defect this suite exists
to prevent.

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

Six checks were wrong on their first run, and every one was wrong in the same
direction — measuring the shape of the markup rather than what a reader gets.

1. **Check 3** flagged fourteen passages, every one a *disclaimer*. Detection
   moved to `tests/lib/lexicon.js` and became claim-shaped: a banned term counts
   only in a sentence with no negation. Because that rule is permissive, check 0
   plants seven claim-shaped strings and asserts they are still caught.

2. **Check 4** matched `d3` against `id="d3"` and read "1 of 8" as a total.
   Library names are now recognised only in import and `src` positions, and only
   denominators that could be a sum of levels count.

3. **Check 8** judged every colour-inheriting descendant separately, so a
   `<span>` inside `.floor-line` looked like an unlabelled swatch. Now only
   outermost coloured elements are judged.

4. **Check 7** measured a text element's background by walking up the DOM to the
   first ancestor with one. The measure's labels and span are absolutely
   positioned *inside* `.measure__rule` — a one-pixel strip — but drawn 2.5rem
   away from it. Raising the rule's contrast to 3.25:1 then failed the text that
   hangs off it, against a background it is not drawn on. An ancestor now counts
   only if its box actually covers the element. Strictly more accurate: it can
   never excuse a background that is really there.

5. **Check 6** treated every off-origin URL in the markup as a subresource, and
   so failed §5's own requirement that `/oal` carry a canonical link. It now
   reads tag by tag: `<a href>` is a link a human clicks and `<link
   rel=canonical>` is metadata, and neither fires a request.

6. **Check 12** was rebuilt. Its first draft cut each page's prose into
   twelve-word windows and required each to appear in the copy source — which
   measured *adjacency*, not provenance, and could never pass on a page that
   interleaves hand-written prose with generated rubric content. The unit is now
   the sentence, which is also the unit §8 protects. Sentences carrying an
   interpolated value are matched as skeletons: every literal word must match, in
   order, with only the value free. Both relaxations are permissive, so a
   controls test plants five rewrites — including a one-word change and a
   reordering — that must still be caught.

   The skeleton rule had to be anchored to the whole unit before it was safe.
   Unanchored, the scorecard stamp's `OAL v{version}` field contributed a
   skeleton whose only literal was "oal v", which matched any sentence containing
   those characters. The controls caught it. That is what they are for.

The pattern is worth keeping in view: each of these would have shipped as a
passing check that silently measured nothing, which is the OAL 1 failure the
rubric describes — a behaviour requested in a comment with nothing verifying it.

## What check 12 can and cannot establish

The vault is not in this repository; `src/_data/` is the repo's copy of it. So
check 12 cannot establish "the rendered copy matches the vault". It establishes
that no prose has been written into a template rather than a content file, which
is §8's first sentence and the precondition for the rest. Divergence from the
vault is caught by review against `CHANGES.md`.

Stated here rather than left to be discovered, on the same principle the rubric
applies to its own depth caps.

## Not yet built

Checks are in place for all twelve items in §3, plus check 0's controls and check
13. Deferred, with the reason:

- **Version immutability.** `/oal/v1.0/` is self-contained — its own stylesheet,
  fonts and favicon at version-scoped paths — but its content is still generated
  from the live `oal.json`. `requirePublishableVersion` in `eleventy.config.js`
  stops the build the moment a second version is published, so this cannot ship
  wrong silently. The freeze itself, and the v1.1 publishing process document,
  are pass 2.
- **The scorecard PDF as a build artifact.** Check 11 renders one and asserts it
  is a real multi-page A4 PDF; it is not yet written to `_site/` under a stable
  versioned filename.
- **The accessibility report (§11.5)**, CSP and security headers (§9),
  `sitemap.xml`, `robots.txt`, the real 404, web-archive submission, the
  architecture diagram (§11.6) and the did-not-do list (§11.8).

## One budget miss, measured

§4 sets "no page over 150 KB compressed including fonts". Measured over the wire
on a cold load, with only the faces each page actually fetches:

| Page | Over the wire | |
|---|---|---|
| `/about/`, `/independence/`, `/` | 110–112 KB | |
| `/scorecard/`, `/services/`, `/changelog/` | 118–121 KB | |
| `/oal/` and `/oal/v1.0/` | **151.3 KB** | **1.3 KB over** |

The two rubric pages are the only ones that pull the Source Serif italic (23.4
KB), which the eight `.buyerq` pull-quotes use. The lever, if the budget is hard,
is to subset the italic to the characters that actually appear in italic on the
site rather than the full latin range — roughly 60 glyphs against the current
subset. It is not taken here because it trades a stated budget against a fragile
asset, and that is a decision rather than an oversight.
