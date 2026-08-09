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

One suite, four targets. Running it against anything other than the build is not a
formality: a check that cannot fail on the unbuilt site is not a check, it is a comment,
and a check that passes against an *empty* site is not even that. The baselines below are
the evidence that the suite works.

`test:live-local` is the only one that exercises check 15 without a deployment; it boots
`_site` behind a Cloudflare-shaped origin, so nothing skips and the suite reports 59/59.

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

| Target | Command | Tests | Pass | Fail | Skip |
|---|---|---:|---:|---:|---:|
| the build | `npm test` | 59 | 52 | 0 | 7 |
| a local origin | `npm run test:live-local` | 59 | 59 | 0 | 0 |
| the handover | `npm run test:handover` | 59 | 37 | **8** | 14 |
| an empty directory | `npm run test:empty` | 59 | 15 | **37** | 7 |

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

## Not yet built

Checks are in place for all twelve items in §3, plus check 0's controls and check
13. Deferred, with the reason:

- **Version immutability.** `/oal/v1.0/` is self-contained — its own stylesheet,
  fonts and favicon at version-scoped paths — but its content is still generated
  from the live `oal.json`. `requirePublishableVersion` in `eleventy.config.js`
  stops the build the moment a second version is published, so this cannot ship
  wrong silently. The freeze itself, and the v1.1 publishing process document,
  are pass 2.
- **The accessibility report (§11.5)**, web-archive submission on each published
  version, the domain-lapse paragraph (§5), the architecture diagram (§11.6) and the
  did-not-do list (§11.8).

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
