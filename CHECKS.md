# The check suite

BRIEF.md §3 asks for the site's constraints to be executable: a suite that runs
on every commit, blocks the deploy, and has its results retained. This file is
the standing record of what the suite is and what it found.

The governing idea, in the brief's own terms: a rule in `RATIONALE.md` is
**asserted**. A rule that fails a build is **enforced**. A rule with a test that
runs on every deploy and reports is **evidenced**.

## Running it

```bash
npm run build           # eleventy -> _site/
npm test                # against _site/ — the build. Must be green.
npm run test:handover   # against . — the verbatim designer handover. Must be red.
npm run test:empty      # against an empty directory — Baseline D. Must be red.
npm run test:live-local # against a local origin applying _headers and _redirects.
npm run check           # build then test; this is the deploy gate.
```

Two more need credentials, so they are opt-in and skip without them:

```bash
ORDOIA_LIVE=https://ordoia.com npm test   # check 15 — the bytes a host actually returns
ORDOIA_ZONE_CHECK=1 npm test              # check 22 — the zone configuration underneath
```

One suite, six targets. Running it against anything other than the build is not a
formality: a check that cannot fail on the unbuilt site is not a check, it is a comment,
and a check that passes against an *empty* site is not even that. The baselines below are
the evidence that the suite works.

`test:live-local` is the only one that exercises check 15 without a deployment; it boots
`_site` behind a Cloudflare-shaped origin, so nothing skips.

**Current figures, 2026-08-11**, after checks 25 and 26 were added, check 21 gained a
fifth test and check 23 gained two:

| Target | Tests | Pass | Fail | Skip |
|---|---:|---:|---:|---:|
| build | 88 | 79 | 0 | 9 |
| `test:live-local` | 88 | 86 | 0 | 2 |
| handover (B) | 88 | 59 | **9** | 20 |
| empty (D) | 88 | 34 | **45** | 9 |

<details>
<summary>The eight added tests, and where each delta went</summary>

Every target was predicted before it was run, and one prediction was wrong in a way that
found a defect — see the handover note below.

| Added | build | handover (B) | empty (D) |
|---|---|---|---|
| check 26, 2 tests | +2 pass | +2 pass | +2 pass |
| check 21, 5th test | +1 pass | +1 skip | +1 fail |
| check 25, 3 tests | +3 pass | +2 pass, +1 skip | +2 pass, +1 fail |
| check 23, 2 tests | +2 pass | +2 pass | +2 fail |

Checks 25's second half and **all of check 26 read `src/` rather than the target**, so
they answer identically on every target — which is why the handover gains passes rather
than failures from them. Check 21's fifth test and check 23's two new tests reach the
built site, so Baseline D turns them red through the population rule: an empty target
means an empty population, and `report()` refuses to pass on nothing.

</details>

The previous figures, for comparison: build **80 / 71 / 0 / 9**, `test:live-local`
**80 / 78 / 0 / 2**, handover **80 / 53 / 9 / 18**, empty **80 / 30 / 41 / 9**.

With `ORDOIA_MONITOR_CHECK=1` and credentials the build target is **88 / 80 / 0 / 8**.

**The number to watch when adding a check is the handover's failure count, not the pass
count.** It had been 8 across four sessions and fifteen added tests, and that was the
evidence none of them was measuring the build's shape by accident.

**On 2026-08-11 it moved for the first time: 8 → 9.** The ninth is **check 23**, and the
move is the point rather than a regression in the rule. The handover carries the measure's
span/stamp collision in its own `styles.css` — the defect came in with the design and was
faithfully rebuilt — so a check that detects it must fail there. This is the first added
check in five sessions to find a *new* way to fail against a frozen build, which is exactly
the evidence that it measures a defect rather than a shape. A check that added a handover
failure without being able to name the bytes causing it would be the opposite finding.

**Later the same day it held at 9 across eight more tests — but only after a wrong
prediction was chased down.** Checks 25 and 26, check 21's fifth test and check 23's two
new tests were all predicted to leave the handover's failure count alone. The measurement
said **12**, and the three new failures were checks 2, 4 and 9.

None of them was a defect. Pinning `index.html` put an `.html` file inside `versions/`
for the first time, the handover target *is* the repo root, and `htmlFiles()` did not skip
`versions/` — so the handover run began scanning a fully-built rubric page and judging it
against the **handover's own stylesheet**. Two unrelated artifacts compared to each other.
Those bytes are frozen and could never be fixed in response, so the reds would have been
permanent noise on the one number this section says to watch. `versions/` now sits in
`SKIP_DIRS` beside `_site`, for the same reason: it holds output, not source. Check 21
still holds every byte of it to the manifest, which is a stronger claim than any of the
checks that were firing.

The generalisable part is not the fix. It is that **the prediction was written down before
the run**, so a three-failure move was visible as a disagreement rather than absorbed as
the new normal. Had the number simply been recorded after the fact, the handover baseline
would have carried three permanent unexplained failures and the sentence at the top of this
section would have quietly stopped being true.

The other movements, each with its reason: Baseline D 39 → 41 (check 23's two site-touching
tests fail against an empty directory, correctly); skips +1 everywhere (check 24's live test
needs `ORDOIA_MONITOR_CHECK=1`); `test:live-local` skips 1 → 2 for the same reason. Baseline
D's earlier 38 → 39 has its own known and predicted reason — see *Check 21 changed
category*.

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

**One invariant that belongs here and deliberately is not: the version freeze.** By the
rule above, §5's "a published version's bytes do not change" should fail in the build. Half
of a frozen version directory is not rendered at all — `styles.css`, `favicon.svg` and four
version-scoped `.woff2` files are passthrough copies, which no Eleventy transform sees — so
a build-time guard would cover `index.html` and leave the fonts unguarded, and the fonts are
exactly what the 2026-08-09 re-subset changed. It is check 21 instead, and `npm run check`
builds before it tests, so nothing reaches a deploy either way. Stated here rather than
left for someone to notice the exception.

## Baseline A — the build, 2026-08-08

**45 tests, 45 pass, 0 fail.** This is the gate.

Since 2026-08-08 the suite reports **52 tests, 45 pass, 0 fail, 7 skipped**. The seven
are check 15, which needs a live host and skips unless `ORDOIA_LIVE` is set. That is
deliberate: a check that needs the network must not be able to block a build by being
offline. `npm test` remains hermetic and remains the gate.

**Updated 2026-08-09: 55 tests, 48 pass, 0 fail, 7 skipped.** Three tests were added by
check 16; the seven skips are unchanged.

**Updated again, 2026-08-09 (stage 2 and 3): 59 tests, 52 pass, 0 fail, 7 skipped.** Four
tests added — check 14's posture controls, check 17, and check 18's two. The seven skips
are still check 15 and still only under `npm test`; `npm run test:live-local` runs the
whole suite with **59 pass, 0 fail, 0 skipped**, which is the first time every check in
this repo has been green in one run.

**Updated again, 2026-08-09 (stages 4, 5 and 8): 69 tests, 62 pass, 0 fail, 7 skipped.**
Ten tests added — check 19's four on the workflows, check 20's three on the recovery path,
check 21's three on the version freeze. The seven skips are still check 15 and still only
under `npm test`. `npm run test:live-local` remains **69 pass, 0 fail, 0 skipped**.

| Target | Command | Tests | Pass | Fail | Skip |
|---|---|---:|---:|---:|---:|
| the build | `npm test` | 69 | 62 | 0 | 7 |
| a local origin | `npm run test:live-local` | 69 | 69 | 0 | 0 |
| the handover | `npm run test:handover` | 69 | 45 | **8** | 16 |
| an empty directory | `npm run test:empty` | 69 | 24 | **38** | 7 |

All four re-measured on 2026-08-09 after stages 4, 5 and 8, not carried forward. The
handover's **eight failures are unchanged**, which is the number worth watching: ten new
tests were added and none of them found a new way to fail against the frozen handover, so
none of them is measuring the build's shape by accident.

## Baseline D — the empty target, 2026-08-09

```bash
npm run test:empty     # ORDOIA_TARGET=tests/fixtures/empty-target
```

Baselines A, B and C each prove something a check *found*. D proves the opposite and
harder thing: that a check handed **nothing** says so, instead of reporting green because
it found no violations among no subjects.

`tests/fixtures/empty-target/` contains no HTML, so `htmlFiles()` returns `[]` and every
check whose population is the built site has nothing to look at.

**Before the population fix:**

```
33 pass, 12 fail, 7 skipped — against a directory containing nothing at all
```

Eight of those passes were honest — check 0 and three controls tests never touch the
site, and two of check 12's tests read the repo root rather than the target.
**Twenty-three were site-touching checks reporting green having examined an empty page
list**, including `07 — the measure itself meets 3:1`, the check that found the 1.00:1
invisible tick, and `15 — the bytes served are the bytes built`.

**After:**

```
13 pass, 35 fail, 7 skipped
```

The thirteen are exactly the tests that never reach the site: check 0's five, three
controls tests, check 12's two file-readers, and check 16's three source-scanners.
**Zero site-touching tests pass vacuously.** Each of the thirty-five names the population
that came back empty.

**Re-measured after stage 2 and 3: 15 pass, 37 fail, 7 skipped of 59.** The two extra
passes are check 14's posture controls and check 18's range-parser controls, both of which
read the repo rather than the target and are correctly out of scope. The two extra failures
are the site-touching halves of checks 17 and 18. The property this baseline exists to
protect is unchanged and was re-verified by listing every passing test by name: **nothing
that reaches the site passes against a directory with nothing in it.**

**Re-measured after stages 4, 5 and 8: 24 pass, 38 fail, 7 skipped of 69.** Nine of the ten
new tests pass here and are correctly out of scope — checks 19, 20 and 21 read
`.github/workflows/`, planted fixtures and `oal.json` rather than the built site. The one
new failure is check 20's probe against the target, which is the only one of the ten that
reaches it. **The property this baseline exists to protect is unchanged.**

Check 21 is worth a sentence of its own, because it will move. It passes here **today**
only because no version is frozen, so it never reads the target at all; from the commit
that publishes v1.0 it becomes site-touching and will fail against an empty directory like
everything else. A check that changes category on a future commit should say so before it
does, rather than have someone discover the shift and wonder which behaviour was intended.

Baseline D is a committed fixture and a named script rather than a demonstration someone
performed once, so unlike a one-off it cannot rot.

**What Baseline D does not prove.** With zero pages the selectors are never queried, so
it cannot show that a *renamed selector* goes red. That needs the per-selector protocol —
break the selector, run against the real build, observe. Recorded below for check 7:

| Check | Population | How it was zeroed | Before the guard | After |
|---|---|---|---|---|
| 7 — load-bearing graphic | `.measure__rule`, `.measure__rule .tick` | renamed to `.measure__rule-XX` | **3 pass, 0 fail** | **red**, naming the empty population |

Row 1 is the whole argument for this work in one line: the committed check that found the
worst defect in the baseline, reporting green against the real site with its selector
renamed.

## Baseline C — the live host, 2026-08-08

Check 15 was written and run **before anything was deployed**, against
`https://ordoia.com` while it still pointed at registrar parking:

```bash
ORDOIA_LIVE=https://ordoia.com npm test
# → 7 tests, 0 pass, 7 fail
```

All seven failed, each naming the address it could not reach. That is the red baseline;
a live check that passes against a site which does not exist is measuring nothing, which
is the same lesson check 0 exists to enforce.

**Red is only half the proof.** A check that can only fail is as useless as one that can
only pass, so the same seven were run against the real build served over a local origin
that applies `_headers` and `_redirects` the way a host does: **7 pass, 0 fail.** The
check therefore discriminates — it is not merely reporting that `ordoia.com` is
undeployed. What it has *not* yet seen is Cloudflare, which is the remaining gap and the
reason it runs on every deploy rather than once.

> **That origin was not in the repo, and this paragraph was therefore unreproducible until
> 2026-08-09.** The strongest discrimination claim in this file rested on a server someone
> ran once and did not commit — which is, precisely, a provenance claim the reader cannot
> check. It is now `npm run test:live-local` (`tools/serve-local.mjs`), and the whole suite
> runs against it green with nothing skipped:
>
> ```bash
> npm run test:live-local
> # → 59 tests, 59 pass, 0 fail, 0 skipped
> ```
>
> It reproduces the one piece of documented Cloudflare behaviour that is counter-intuitive
> — two blocks matching one request have their headers **joined with a comma**, not
> overridden — which is how the `Cache-Control` defect in "What the suite taught about
> itself" was demonstrated rather than argued. **A local Node server is still not
> Cloudflare**, and that limit is stated in the runner's own header: no Email Address
> Obfuscation, no Rocket Loader, no Brotli, nothing zone-scoped. Green here means the
> artifact and the configuration agree. Only `ORDOIA_LIVE=https://ordoia.com` means the
> site does.

**A defect in the check, found by running it.** The first version had no request timeout
and took **95 seconds per assertion** against a parked domain that accepted the
connection and then went silent — a check that hangs is worse than one that fails,
because in CI it burns the job's whole budget and reports nothing about why. The second
version had the timeout but reported the error as `23`: a timed-out `fetch` raises a
`DOMException` whose numeric `code` is 23, and reading `code` before `name` threw away
the only fact worth having. Both fixed, both recorded here rather than quietly.

## Baseline E — the live Cloudflare zone, 2026-08-09

```bash
ORDOIA_ZONE_CHECK=1 npm test     # check 22, against the real zone
```

Check 22 reads the layer check 15 cannot: the zone configuration itself. It was written
before the zone existed and run against it **the minute it was created, unhardened**, which
made the red baseline a real defect rather than a planted one.

**Red — a fresh zone, nothing touched:**

| Setting | Found | Wanted |
|---|---|---|
| `email_obfuscation` | `on` | `off` |
| `automatic_https_rewrites` | `on` | `off` |
| `replace_insecure_js` | `on` | `off` |
| `server_side_exclude` | `on` | `off` |
| `ssl` | `full` | `strict` |
| `always_use_https` | `off` | `on` |
| `min_tls_version` | `1.0` | `1.2` |
| `speed_brain` | **absent from the response** | `off` |

Plus an empty DNS record set, which the population guard caught before it reached the
findings — Cloudflare imported **no** records from the registrar, contrary to the assumption
that its zone scan brings them over.

**Green after `node tools/zone-setup.mjs harden --apply`: 11/11 targets matched, 5 records
observed.** Re-run after the zone went `active`, because the settings had been applied while
it was `pending` and a value that sticks on a pending zone is an assumption until it is read
back on an active one: still 11/11.

### Two findings the table would not have had if it had been written from documentation

**`replace_insecure_js` and `server_side_exclude` were both on**, and neither was in
`DEPLOY.md` before the zone was read. The first rewrites HTML to substitute Cloudflare-hosted
JavaScript libraries; the second removes marked content per visitor, so one URL can serve
different documents to different readers. Both are no-ops on this site and both are off now,
because "what it published is what it published" should not depend on there happening to be
no JavaScript.

**`speed_brain` is real but is not in the settings listing.** `GET /zones/{id}/settings`
returned 56 settings without it; `GET /zones/{id}/settings/speed_brain` returned it, editable,
with a value. **The fail-closed branch is what caught this** — the naive evaluator, "for each
setting the API returned, is it what we wanted?", would have reported green having never
looked at it. That branch was mutation-tested before the zone existed: replacing it with
`continue` turns the controls red naming the case.

Cloudflare documents Speed Brain as *enabled by default* on Free. This zone reported `off`,
unmodified. It is pinned anyway: a default that disagrees with its own documentation is a
default that can change.

### The rollback drill, and the deployments listing shape

Run on the real `ordoia` project before the custom domain was attached. Observed:

```text
GET /accounts/{a}/pages/projects/ordoia/deployments?env=production&per_page=25
  result: [ { id, environment: "production", created_on: <ISO-8601>,
              latest_stage: { name: "deploy", status: "success" } }, … ]   newest first
```

`?env=production` filters as documented, `created_on` sorts lexicographically, and rolling
back to the deployment already serving is refused with `8000039` rather than silently
accepted. **Three defects it found are recorded in `DEPLOY.md`** — the wrong rollback target
after a rollback, the edge serving stale bytes afterwards, and the hostname lagging its
deployment.

### Check 21 changed category, as predicted

The previous session recorded that check 21 *"passes under Baseline D today only because
nothing is frozen, so it never reads the target; from the commit that publishes v1.0 it
becomes site-touching and will fail there like everything else"*. `versions/v1.0.json` was
written on 2026-08-09 and it did: Baseline D went from 38 failures to 39, and the new one is
`check 21 — every frozen version still generates the bytes it was published with`. Recorded
here because a baseline that moves for a known reason and is not written down is
indistinguishable from one that moved for an unknown one.

## Baseline B — the verbatim handover, 2026-08-08

Commit `3b93f1b`, before any build code existed. **45 tests, 32 pass, 8 fail, 5
skipped** — check 14's five tests skip on the handover rather than fail, because the
handover ships no deploy configuration at all and "this folder of HTML has no CSP" is
a fact about the brief, not a defect to report five times.

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
| 14 · deploy posture | skipped | Parses `_headers` and `_redirects`, and asserts robots, sitemap, a real 404 and all three scorecard formats. Skipped on the handover, which has none of them. |

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

7. **Check 14** was written last and immediately failed the work that had just been
   done. `@page` in the print stylesheet declared a margin but no page size, so
   Chromium fell back to its locale default and the generated scorecard came out
   **US Letter, 612×792pt** — a UK assurance practice's travelling artifact on the
   wrong paper, in an artifact whose whole purpose is being printed and forwarded.
   The check reads the MediaBox out of the generated file rather than trusting the
   `format: 'A4'` flag that asked for it, which is the only reason it was visible.
   Check 12 caught a second one in the same build: the pointer to the other two
   scorecard formats had been typed into a template rather than a copy file.

8. **Check 14 went vacuous the moment the domain changed**, and check 9 did not.
   Both located printed permanent addresses with a hardcoded `/ordoia\.co\.uk/`.
   When `ordoia.co.uk` became `ordoia.com`, check 9 failed loudly — it asserts
   `printed.size > 0`, so an empty match set trips *"no version address is printed
   anywhere"*. Check 14 had no such guard: its match set went empty, so its list of
   unrouted addresses went empty, so **its assertion passed while asserting nothing**
   — on the one check that defends §9's worst-case failure.

   Demonstrated rather than reasoned about: the domain was changed, the suite run,
   and check 14 observed passing 45/45 while check 9 failed. The guard was then
   added and shown to fail against a domain matching nothing, before the domain was
   single-sourced. Both checks now read `SITE.domain` from `src/_data/site.json`
   through `printedAddresses()` in the harness, and `formerDomains` keeps the frozen
   handover legible — without it, baseline B still reported 8 failures but check 9
   failed for the wrong reason, which is its own kind of wrong.

9. **Number 8 was not one defect. It was twenty-three, and the fix had been applied to
   two of them.** On 2026-08-09 the suite was pointed at an empty directory — the obvious
   experiment, never run — and **33 of 52 tests passed against nothing at all**. Setting
   aside check 0 and the controls, twenty-three site-touching checks reported green having
   examined an empty page list. Among them: `07 — the measure itself meets 3:1`, the check
   that found the 1.00:1 invisible tick, and `15 — the bytes served are the bytes built`,
   which runs in CI immediately after a deploy.

   The generalisation that made it tractable: **vacuity is never `findings === 0`, it is
   always `population === 0`.** Every check here asserts that a list of violations is
   empty; the bug is never the numerator, it is that the denominator was empty too. Once
   those are separated the apparent exceptions dissolve — check 9's "Terms and Privacy are
   absent" has population *pages scanned*, check 6's "zero off-origin requests" has
   population *requests observed*, and both legitimately expect zero findings. No check
   needed exempting. Several needed their population named correctly.

   `tests/lib/population.js` makes naming it compulsory rather than available: `survey()`
   requires at least one declared population, and `report()` checks every one is non-empty
   *before* it looks at the findings. A helper you can forget to call is hand-guarding with
   extra steps — which is precisely how check 14 shipped without the guard while check 9
   had it. Check 16 then enforces the rule on every future check.

10. **Check 14 was reading a header from the wrong block, and would have certified eight
    unprotected pages.** It found each required header with
    `lines.find(l => l.startsWith(name + ':'))` — the first occurrence of a name *anywhere
    in the file*, whatever path it was scoped to. A Content-Security-Policy declared only
    under `/oal/v1.0/*` therefore satisfied check 14 for the entire site, including the
    eight pages carrying the £2,500 CTA. Demonstrated rather than reasoned about: the
    shipped `_headers` was mutated to scope its CSP that way, and the old evaluator's
    logic was replayed over the result — **it returned `missing: []`**, while the new one
    fails with `/* — Content-Security-Policy is absent`.

    The fix is not a better search. Check 14 and check 15 each wrote their own evaluator
    over a table they *shared*, which is not sharing — it is one table with two readers who
    disagree. Both now call `evaluateHeaders(get)` in `tests/lib/posture.js`; check 14
    backs it with the parsed `/*` block, check 15 with a live `Headers` object.

    Two more defects fell out of writing it down. The HSTS matcher was `/max-age=\d{7,}/`,
    which accepts `max-age=1000000` — **eleven and a half days wearing the shape of a
    two-year commitment**; a digit count is not a duration, and the floor is now parsed and
    compared. And `FORBIDDEN_IN_CSP`'s off-origin pattern was anchored on `//`, so
    `script-src example.com` — a bare authority, valid CSP, loads an off-origin script —
    went through unflagged. Enumerating forbidden shapes dates the way enumerating edge
    features does, so the rule is now an allowlist of what keeps the policy on our own
    origin, with `style-src-attr 'unsafe-inline'` as the one shipped exception and a
    controls test pinning both directions.

11. **The `_headers` file had a latent defect that check 15 was structurally unable to
    catch.** Cloudflare's documentation is explicit and counter-intuitive: *"An incoming
    request which matches multiple rules' URL patterns will inherit **all** rules'
    headers"*, and *"if a header is applied twice in the `_headers` file, the values are
    **joined with a comma separator**"*. Overlapping declarations concatenate; they do not
    override.

    `/oal/v1.0/styles.css` matched both `/oal/v1.0/*` and `/*`, and both declared a
    `Cache-Control`. Served, that is:

    ```
    public, max-age=600, must-revalidate, public, max-age=31536000, immutable
    ```

    Two max-ages and a `must-revalidate`, on the one directory that can never be corrected
    after publication. **And check 15 asserts that value matches `/immutable/`, which it
    does** — so the wire-level check would have reported the freeze intact over a broken
    one. Lesson 8 arriving by a new route: not an empty population this time, but an
    assertion too weak to distinguish the string it wanted from a string containing it.

    Fixed structurally rather than by strengthening the regex: no header name may be
    declared in two blocks that can match one request (`overlappingDeclarations()`), and
    `/*` now declares no `Cache-Control` at all, so every path matches exactly one. Current
    paths take the host default, `public, max-age=0, must-revalidate` — shorter than the
    600s that was declared, so §5's "short on current paths" holds a fortiori. Demonstrated
    against `npm run test:live-local`, which reproduces the comma-join.

The pattern is worth keeping in view: each of these would have shipped as a
passing check that silently measured nothing, which is the OAL 1 failure the
rubric describes — a behaviour requested in a comment with nothing verifying it.
Number 8 is the sharpest case, because the check did not break — it kept passing.
Number 9 is the most uncomfortable, because the lesson had already been learned, written
down here, and applied to two of the seventeen places it applied to. **A lesson recorded
and not generalised is a lesson the next reader has to learn again** — so it is now a
check rather than a paragraph.

## What check 12 can and cannot establish

The vault is not in this repository; `src/_data/` is the repo's copy of it. So
check 12 cannot establish "the rendered copy matches the vault". It establishes
that no prose has been written into a template rather than a content file, which
is §8's first sentence and the precondition for the rest. Divergence from the
vault is caught by review against `CHANGES.md`.

Stated here rather than left to be discovered, on the same principle the rubric
applies to its own depth caps.

## The deploy path, made executable — checks 19, 20 and 21

Until 2026-08-09 this repository checked everything it published and nothing about how it
published it. `.github/workflows/` decided which bytes reached the domain and no test read
it; `/oal/v1.0/`'s immutability was a sentence in `BRIEF.md` §5 with no mechanism behind
it. Three checks close that, and each was written red first.

**Check 19 — the workflows.** Three defects, each a shape this suite has already been
bitten by:

| Found | Why it is the same lesson twice |
|---|---|
| `deploy.yml:26` and `canary.yml:47` each wrote the domain out by hand | Lesson 8. The domain moved once already, on 2026-08-08, and the copy that was missed — check 14 — went on passing while asserting nothing. `harness.js` says the domain "lives here and nowhere else in the checks"; the workflows were outside the sentence's reach. |
| Five `uses:` on floating major tags, and `wranglerVersion` unset | This repo pins Eleventy to `3.1.2` and subsets its fonts from a SHA-pinned Adobe release. The deploy path was the one unpinned thing in it, and it is the part that touches production. |
| `pages deploy` with no `--branch` | Measured against wrangler 4.120.0: it then reads `git rev-parse --abbrev-ref HEAD`, and the Pages code path — unlike the Workers one — has no CI fallback to `GITHUB_REF_NAME`. Under `actions/checkout`'s detached HEAD that returns the literal `HEAD`, so every "production" deploy would have landed as a preview while the deploy step went green. |

Red before the fix, naming all eight offending lines; green after. It is lexical and fails
closed, in the manner of check 16: it strips full-line comments only, and asserts its own
parsing assumptions rather than quietly scanning less.

**A claim in the launch-blocker plan was wrong and is withdrawn.** The plan stated that
`wrangler-action@v4` *"has no `wranglerVersion`"*. It has — the input is in `action.yml` at
the pinned tag. The drift was real but the cause was that the input was never set. Third
plan claim in three sessions overturned by looking.

**Check 20 — the recovery path.** Rollback and the probe only ever execute in an
emergency, which is how they rot unnoticed. So the logic is split from the network: the
selection of a rollback target and the probe's verdict are both exercised here, against
planted listings and planted origins. `probe()` reports *what it asserted* as well as what
it found, because `findings: []` reads identically for "the site is healthy" and "this
function stopped checking things", and check 20 pins the difference.

> **Nothing here has met the real Cloudflare API.** There is no account. Check 20 proves
> that given a listing the right deployment is chosen — never that a listing comes back in
> that shape. `DEPLOY.md` carries the drill on a throwaway project that settles it, and it
> has not been run.

**Check 21 — the version freeze.** §5 says *"the build refuses to write to a version
directory that already exists"*. Taken literally that is unimplementable: `_site/oal/v1.0/`
exists after the first build, so such a rule would refuse the second and every one after.
The sentence is about published bytes, so the enforceable form is byte identity against a
manifest taken at publication — which, unlike the literal reading, can be checked on every
commit rather than once.

**v1.0 has been frozen since 2026-08-10.** This paragraph said "nothing is frozen today"
for two days after that stopped being true — the same shape as row 42, a correction landing
in one place and not the others, and worth leaving recorded rather than quietly fixed.

**What "the published bytes" means changed on 2026-08-12** (`CHANGES.md` row 65). The
frozen unit is the `<main>` fragment plus the assets that render it — `main.html`,
`styles.css`, `fonts/`, `favicon.svg` — and **not** the delivered `index.html`, whose
chrome now renders live so that a footer change reaches a published address without a
version event. The manifest therefore hashes `versions/v<n>/` rather than the build: a
manifest over the build would go red on every legitimate chrome change, which is the
un-editable-stylesheet failure (row 40) one file over.

Six tests, and none of the five was dropped:

| Test | Asserts |
|---|---|
| stored bytes intact | `hashTree(versions/v<n>/)` equals the manifest |
| fragment is published content | `main.html` is a byte-exact substring of the retained published document, and is the whole of its `<main>` |
| served from stored bytes | the built page's `<main>` equals `main.html`, and each pinned asset equals its stored copy |
| no superseded version unfrozen | unchanged |
| controls | unchanged — changed, added, removed and empty-manifest cases |
| one document, two addresses | while a version is `Current`, `/oal/` and `/oal/v<n>/` state the same `<main>` prose. It now **announces when it stops applying**: a superseded version produces `deliberately not asserting for v1.0 (Superseded)` in the output, so a lapsed assertion can be told from a satisfied one |

The second test is the one that makes the re-cut honest rather than asserted. Redefining a
frozen unit is only safe if the content bytes are the same content bytes, and "we checked
at the time" is exactly the one-off proof this repository has been bitten by. The document
v1.0 was published as is retained whole at `versions/v1.0.published-index.html`, its sha256
`0289c300dd07…` is in the manifest, and both halves are re-checked on every commit.

Proven end to end on 2026-08-09 rather than argued:

| Step | Observed |
|---|---|
| `node tools/freeze-version.mjs 1.0` | 10 files recorded |
| check 21 against the untouched build | **3 pass, 0 fail** |
| one byte appended to `_site/oal/v1.0/styles.css` | **red** — `v1.0: styles.css differs from what was published — 4374153caf5d became e2b99002655a` |
| freezing a second time | refused, naming the existing manifest |
| manifest deleted, `npm run build` | green again |

The manifest was then removed, because v1.0 is not published. The mechanism ships; the act
does not, and `DEPLOY.md` holds it as a publication step.

## Presence is not legibility — check 23

**Check 13 tested the untravelled span for the whole life of the site, and passed, while
the span was printed through the paragraph below it.**

Check 13 asks whether the question is present: not `display: none`, not `visibility:
hidden`, not collapsed to zero area, not empty. Every answer was yes. All four can be true
of text that no one can read, because something else is drawn on top of it. That gap is
the entire reason check 23 exists, and it is worth stating as a rule rather than as an
anecdote: **a check that asks whether an element exists has not asked whether it can be
used.**

The defect: `.span` was `position: absolute` inside a `.measure__rule` of `height: 1px`,
so it hung out of flow, and `.stamp` followed the rule in normal flow. `.measure--q`
reserved 6.5rem at the *figure's* bottom edge — past the stamp rather than between them.
Measured at 36.5–55.4px of overlap on three of the five measures, at every width from
760px up. See `CHANGES.md` row 39.

**Why the geometry is in `tests/lib/overlap.js` and not in the browser.** The same reason
`compareToManifest` is separated from the filesystem: the detector can then be proven
against synthetic rectangles, including the case a one-axis detector gets wrong — two
paragraphs stacked in normal flow overlap completely on x and are not a collision. A
detector whose only evidence is "it went green on the fixed page" has shown nothing.

**The control that carries the check.** The third test re-injects the pre-fix declarations
and asserts the collision comes back. It is what keeps the selectors honest: if a future
refactor renames `.span` or `.stamp`, the main test goes quietly green and this one goes
loudly red, naming the fact that the check can no longer be shown to detect the defect it
was written for.

**Viewports 1280, 800, 640, 320.** Check 13 samples 1280, 640 and 320 — and 640 and 320
are both below the 46rem breakpoint, where the measure rotates and this defect does not
exist. Its viewport list had one desktop sample. 800 is the second, in the band where a
fixed-height reservation breaks first.

## The monitor the repository cannot run — check 24

§9's liveness cannot live here. GitHub disables scheduled workflows after 60 days of
repository quiet; this site is finished by design, so quiet is the expected state and
`canary.yml` switches off exactly when it becomes the only thing watching. The two in-repo
fixes were considered and rejected — see `DEPLOY.md` and `canary.yml`'s header.

What does not have to leave is the *configuration*. `tools/monitors.json` is the plan,
`tools/monitor-setup.mjs` applies it, and check 24 reads the account back.

**A planned monitor missing from the API response is a failure, not a pass.** This is
check 22's absent-setting branch moved one layer out, and it matters more here: the naive
evaluator — "for each monitor the account returned, is it right?" — reports green against
an account with no monitors at all. Deletion is how monitoring actually dies, because
monitors are removed by people tidying dashboards rather than by systems failing. The
controls prove the branch: an empty account must produce four findings, not zero.

**Two errors in `DEPLOY.md` found by measuring the live site rather than re-reading the
table.** It asserted `mailto:hello@ordoia.com` on `/oal/v1.0`, which contains that string
**zero** times — the monitor would have alerted on its first run — and it printed the
address without its trailing slash, which 301s. Both corrected; check 24 now asserts both
properties so the table cannot drift back.

**What check 24 does not establish**: that anyone reads the alerts, that the monitor has
not been paused at the provider, or that it is running right now. It runs when the suite
runs. It moves the claim from *"a monitor was set up once"* to *"a monitor matching this
file existed the last time anyone looked"*, which is an improvement and not a closure. The
residual in `canary.yml`'s header stands.

## Not yet built

Checks are in place for all twelve items in §3, plus check 0's controls and check
13. Deferred, with the reason:

- **The accessibility report (§11.5)**, web-archive submission on each published
  version, the domain-lapse paragraph (§5), the architecture diagram (§11.6), the
  did-not-do list (§11.8) and the v1.1 publishing-process document (§11.3). All six are
  documents rather than mechanisms, and all six are still unwritten. The domain-lapse
  *paragraph* is unwritten; since 2026-08-11 the domain-lapse *alert* exists, because
  `domain_expiration` came free on the Better Stack monitor object — check 24.
- **Full content-pinning of a version snapshot.** Since 2026-08-11 the passthrough assets
  (`styles.css`, the fonts) are served from bytes stored at publication under
  `versions/v1.0/`, so the living stylesheet can change without restating a published
  document. **Closed 2026-08-11 by `CHANGES.md` row 50**: `index.html` and `favicon.svg`
  are pinned too, so the snapshot is immutable by construction across its whole surface.
  What remains open is narrower — pinning made the freeze silent about *rubric* edits,
  since a change to `oal.md` now moves `/oal/` and leaves the snapshot alone. Check 21's
  fifth test closes that by holding a `Current` version's two addresses to the same prose,
  and it lapses on its own the moment v1.0 is superseded.

  **Reopened and re-cut on 2026-08-12** (`CHANGES.md` row 65). Pinning the whole document
  froze the page's *chrome* as well as its content, and the site spent a day serving two
  different footers. The frozen unit is now the `<main>` fragment plus the assets that
  render it; the document is rendered live. "Immutable across its whole surface" was the
  wrong goal, stated confidently one session before it was measured to be wrong.

**Check 27 — one chrome.** R1: a visitor must see the same header and footer on every page
they can reach, `/oal/v1.0/` included, and must keep seeing them after a future chrome
change without a version event. Denominator: the 9 rendered HTML pages. Written red-first
and it produced exactly one finding, naming `/oal/v1.0/` and quoting the launch footer it
was still serving. A fourth test asserts the isolation the split rests on — **no selector
in the derived chrome stylesheet matches anything inside `<main>`**, measured against the
rendered DOM rather than argued from the source.

Two things it found about itself, both worth keeping: the first draft normalised away the
footer's self-link on *every* region, which made four correct pages compare as different
because the masthead keeps its links; and the first nav rule asserted "every route less
this page's own", which is what one might reasonably expect `layout.njk` to implement and
is not what it does — only `/scorecard/` and `/changelog/` are conditional. Both were
caught by running it, not by reading it.

It also reports, as a diagnostic on every run, that `grid.njk` puts `class="skip"` — the
skip-link class — on the coverage grid's visually hidden corner heading, where `.vh` is the
class that exists for that and says so. Harmless while both stylesheets are the live
design; a latent hazard now that a class shared between chrome and content is the only way
the scope boundary can be crossed. Left for Commit B, because Commit A lands on unchanged
content so that its byte comparison means something.

**Check 28 — no HTML document is cached in a way that can hide a redesign.** R3. Denominator:
the same 9 pages. The primary arm runs against the local host emulator so it gates CI
hermetically and reproduces the documented comma-join; the live arm runs under `ORDOIA_LIVE`
and adds the thing no emulator can establish — that revalidation actually happens, by asking
twice and requiring a **304**. Written red-first: one finding, `/oal/v1.0/` at
`max-age=31536000, immutable`. A second test asserts the frozen version's *assets* keep
their immutable caching, so this is not "no immutable anywhere" — that would trade a real
R2 guarantee for a cosmetic R3 one.

**Check 29 — a version page states its true standing.** Denominator: published versions.
Written red-first, and it failed through the *population rule* rather than through a
finding, which is the strongest form available: there were no status stamps to compare, so
the check had measured nothing.

**Check 30 — the footer field strip.** Denominators: 9 pages for the generated-content and
contrast arms, 9 pages × 4 viewports for the wrapping arm, 9 pages × 2 mobile viewports for
the target arm. Added 2026-08-13 with Commit B, and the reason it did not exist earlier is
the finding: **the footer was measured by nothing.** Check 12's `PROSE` is `main`-scoped,
check 23's selector lives inside `figure.measure`, and check 7 calls `getComputedStyle`
with no pseudo-element argument — so the strip had no contrast check, no collision check
and no provenance check, and its separator was drawn with `content:` in the one place
`getComputedStyle` cannot follow.

Extending check 12 to cover it was measured and rejected on the number: the strip renders
**106 blocks into check 12's own selectors and 0 units**, because no field reaches the
eight-word floor. A field strip is not prose and check 12 was never going to protect it.

The wrapping arm is the one worth reading. §5.4 asks for the separator bound to the field
*before* it, and measurement says that cannot satisfy the rule it was given for: **the strip
wants 766px against a 592px column at 1280 and 272px at 320**, so it is two to four rows at
every width and has never been one line. A trailing separator dangles at the end of every
wrapped row exactly as a leading one hangs in the left margin. The separator is therefore
out of flow in the column gap with the list clipping its own overflow, which leaves it
visible only between two fields on one row — and the check reads **text-node client rects
intersected with the clip box**, so it judges what a reader sees rather than what the
markup says. Five drills, each red → green → red on revert: clip removed, binding reversed,
`::after` restored, 44px target dropped, separator recoloured to `--untravelled`.

Two numbers that were claimed in a comment and then measured rather than left as claims:
a row-leading separator is clipped by 4px, and a row-leading link's focus ring clears the
same edge by **3px** — drilled by reordering the fields so the address leads a row.

**Check 31 — a product's name and price are on screen together.** Denominator: the five
products in `products.json`. Added 2026-08-13 with Commit D, and its interest is the gap it
covers between two checks that were both green: **check 13 asserts the page does not push
sideways, and it passed for the entire period this defect was live.** The page genuinely did
not overflow — row 14's scroller absorbed it — while at 320px the retainer sat entirely
outside the scroll box at rest, name and price both. A layout check cannot see that, because
nothing about the layout is wrong. So this invariant is written about the **reader**: at
rest, with nothing scrolled, can you see a product and what it costs at the same time?

Runs are located by searching the rendered text for each product's own name and its own
price, taken from `products.json` through the same `renderPrice` the templates use. That is
the anti-pattern this branch has hit six times, avoided on purpose: had the check asked for
`.grid td .prod`, the reflow that fixes the defect could have stopped emitting `.prod` and
emptied the population, and the check would have gone quiet rather than red.

The second test is separate and it is the one that would otherwise be missed — **a stacked
layout that drops an axis passes every co-visibility assertion ever written.** Coverage and
depth are what this table is for, so each is asserted to be on screen in its own right.

Four drills. Reflow removed entirely, depth label hidden and coverage head hidden all turn
it red on the arm they should. The fourth is recorded because it did **not**: restoring the
scroller leaves the check green, since the reflowed table measures 272px inside a 272px box
and there is nothing left to scroll. `overflow-x: visible` is therefore inert for today's
content and is kept for the failure mode rather than the failure — an unbreakable run that
outgrew the column would be hidden silently by a scroll container and reported loudly by
check 13 without one.

It also holds the changelog rail's superseded list to the record. **That sentence was
false when it was first written here** — the rail was still a hand-typed copy fragment
reading `None`, `src/changelog.njk` had not been touched, and the check's third test
guarded its comparison with `supersededCount === 0 && !declared.has('superseded')`, so it
switched itself off at exactly the moment a version became Superseded and the rail could
first be wrong. Both are now true and both are drilled: the rail derives through a
`supersededVersions` filter, and forcing it back to `None` with v1.0 superseded turns the
check red naming the disagreement. Recorded as `CHANGES.md` row 71 rather than quietly
corrected, for the same reason rows 28, 30 and 42 were — **a document that claims a fix
which does not exist is worse than one that is merely out of date.**

Closed on 2026-08-10, and this list said otherwise until 2026-08-11: **the rollback
drill**. It was run against the real `ordoia` project before the custom domain was
attached, and it overturned two of the three things `DEPLOY.md` claimed about the recovery
path — see *The rollback drill, and the deployments listing shape* above, which has
recorded the observed responses since that session. This section went on saying the
Cloudflare API calls "have never run" while the same document, three hundred lines
earlier, printed what they returned. **A document that contradicts itself is worse than
one that is merely out of date: both halves look authoritative.** Logged as `CHANGES.md`
row 42 rather than quietly corrected, for the same reason rows 28 and 30 were.

Closed since 2026-08-09: **version immutability** is no longer pass-2 work. §5's rule is
executable as check 21 and `tools/freeze-version.mjs`, and the freeze is a publication
step in `DEPLOY.md` rather than an intention. `requirePublishableVersion` still guards the
other direction.

Closed since: the scorecard PDF is generated by `tools/build-pdf.mjs` as part of
`npm run build` and checked by check 14; `_headers`, `_redirects`, `sitemap.xml`,
`robots.txt` and a real 404 page all ship, and check 14 parses the first two rather
than trusting them.

**Also closed: the gap check 14 documented in its own header.** Check 15 asserts on the
wire what check 14 asserts in the file — byte-equality between what the build made and
what the host serves, the headers actually sent, a real 404 rather than a soft one, and
every printed permanent address resolving. It replaces the four `curl` commands
`DEPLOY.md` used to carry: one claim, verified in one place, rather than two copies to
keep in step. It runs after every deploy and weekly thereafter.

## The budget miss, closed — and made executable

§4 sets "no page over 150 KB compressed including fonts". This was recorded here as prose,
measured once by hand, and four of the nine pages were never in the table. **Check 17 now
measures it on every run** — the real request set under `networkidle`, gzip -9 on text and
raw bytes on binary, against a declared 153,600-byte budget — and prints the whole table.

| Page | 2026-08-08, as recorded | Now, measured by check 17 |
|---|---|---|
| `/about/`, `/independence/`, `/` | 110–112 KB | 110.0 – 111.8 KiB |
| `/404.html` | *not recorded* | 117.9 KiB |
| `/changelog/`, `/scorecard/`, `/services/` | 118–121 KB | 118.4 – 121.1 KiB |
| `/oal/` and `/oal/v1.0/` | **151.3 KB — 1.3 KB over** | **139.1 KiB — 10.9 KiB under** |

**The recorded figures were substantially right, and one recorded claim that was doubted
turned out to be correct.** A draft of the launch-blocker plan asserted that six pages pull
the Source Serif italic and that `/scorecard/` and `/services/` were really ~144 KiB rather
than the recorded 118–121. Measured with Playwright, per page, against the actual request
set: **that is false and the claim is withdrawn.** Only `/oal/` and `/oal/v1.0/` ever fetch
the italic woff2 — exactly as this section already said. Six pages fetch the *mono*, and
six pages *render* italic text, and those are two different sets of six, neither of which
is "pulls the italic file". The four non-rubric italic runs are `<em>` inside `.note`,
which compute to Archivo and are synthesised obliques that fetch nothing.

**The miss is closed by narrowing the italic**, not by moving the budget: 110 declared
codepoints to 34, 23,428 B to 10,852 B. The fragility that argued against taking this lever
last time — new italic copy using a glyph the subset no longer carries, falling back
silently mid-paragraph — is now check 18, which fails the build naming the character. See
FONTS.md and `tools/font-subsets.json` for the measurement behind choosing 34 rather than
the 31 that render or the 68 that would have been comfortable.

It had to land before `/oal/v1.0` first publishes. §5 freezes that directory and `_headers`
caches it `immutable`; after the first production deploy the font could never be changed
and the overage would have been permanent.

### A reproducibility claim that was false

`tools/build-fonts.sh` opens by saying a clean checkout should reproduce the committed
`.woff2` files byte for byte in six years. Running it produced files matching neither the
commit nor each other:

```
run 1   archivo-subset.woff2  48,548 B   head.modified=3869118376
run 2   archivo-subset.woff2  48,528 B   head.modified=3869118380
```

`varLib.instancer` writes the current wall-clock time into the head table. `ibm-plex-mono`
was byte-stable throughout and is the only face that skips the instancer, which is what
located it. Fixed by pinning `SOURCE_DATE_EPOCH`; verified by running the whole script
twice and diffing the hashes. **Nine of the ten lessons below were found by running the
suite. This one was found by not believing a comment.**
