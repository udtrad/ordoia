# Copy changes, flagged

BRIEF.md §8: the vault is the source of truth for this wording, and **nothing is
silently rewritten**. Every departure from the designer handover — commit `3b93f1b`,
byte-identical to the eleven files handed over — is listed here with where, source,
change and why. The format is the one `RATIONALE.md` already establishes.

`RATIONALE.md`'s own table records the ten changes the *design* pass made against the
vault copy. This table records what *engineering* changed against the design pass. The
two are cumulative and neither supersedes the other.

The rule §8 sets is applied throughout: typos, broken markup and factual mismatches are
**fixed and flagged**; tone, rhythm and word choice are **flagged and left**. Where a
row below says *flag and leave*, nothing was changed and the row exists so that the
next person does not have to rediscover it.

| # | Where | Source | Change | Why |
|---|---|---|---|---|
| 1 | Services, audit card | handover `services.html` L79 | "authorisation, refusal robustness, upgrade control, execution bounds" → the four full dimension names, rendered from `oal.json` | §8 names this exact sentence as an outstanding reconciliation and says **the rubric's names win**. The card's previous sentence already used full names, so the two halves of one paragraph disagreed. Both lists now render from `products.json` `auditCoverage` against the rubric's own names, so the reconciliation cannot be re-broken by an edit. Not a find-and-replace — the mechanism §6 exists for. |
| 2 | Services, under the page title | new copy | Added one `.note` line naming OAL v1.0, its publication date and its permanent address | Check 10 found that the services page states four depths, three readiness thresholds and eight dimension names against **no version identifier anywhere**. It is the page a buyer reads before spending £2,500, and a level means nothing without a version. This was not predicted by the brief; it was found by the suite. |
| 3 | Home, coverage × depth grid | handover `index.html` L128 vs `services.html` L58 | "the audit plus the top-up reaches exactly the same place as a baseline taken directly" → "audit plus top-up reaches…" (the services wording) | The same grid cell was hand-authored twice and the two copies had drifted. §6 requires one record; one had to win. The services wording was taken because the grid is that page's primary instrument and the cell is terse by design. Wording only — the claim is identical. |
| 4 | Rubric page, layout | handover `oal.html` L97, L398 | Added `.body { grid-column: 2 }` to `styles.css` | **Broken markup, fixed.** Two of the rubric page's `.sheet` blocks ship no `<aside class="rail">`, so `.body` auto-placed into the rail's column and the entire rubric — four levels, eight dimensions, depth grid, limits — rendered **152px wide** on desktop. Measured at 1280px, on the handover, before any build code. Every other page carries an empty rail and was unaffected. Stating the column is the fix that cannot be undone by omitting a rail again. |
| 5 | Everywhere, the measure | `RATIONALE.md` "Contrast" | New `--track` token `#7A827E` for `.measure__rule` and the minor `.tick`s; `--untravelled` keeps its existing job on table rules, field underlines and CTA dividers | `--untravelled` `#C3CAC6` is **1.37:1** on `--ground` and 1.51:1 on `--raised` — and on a *not assessed* scorecard row the minor ticks were the same colour as the rule they sat on, measuring **1.00:1**. The design pass's fix was real but moved only *text* off the token. `--track` is 3.25:1 on `--ground` and 3.57:1 on `--raised`, computed not quoted, and asserted at build time. |
| 6 | Everywhere, `.na` and `.mark--reader` | `BRIEF.md` §7 known latent defects | `background: var(--raised)` → `var(--surface)`, a context-driven property | §7 names this: a *not assessed* track placed on `--ground` showed a broken knockout. The reader's open mark had the same defect in reverse — filled with `--ground` on a `--raised` band, it read as a disc of the wrong grey rather than as an open mark. One property, set by the surface. |
| 7 | `styles.css` | `BRIEF.md` §7 | Deleted `.sheetpaper .na` | The brief lists it as "a rule with no matching markup". It is not: `<article class="paper sheetpaper">` exists in `scorecard.html`. It is a **redundant no-op duplicate** of `.na`, which is a different and smaller defect. Deleted as dead CSS; the record is corrected here. |
| 8 | `favicon.svg` | `BRIEF.md` §7 | The hardcoded `#E6EAE7` and `#171A1A` now come from `styles.css`, read at build time | §7 names the hardcoded value as a latent defect. Parameterising it into a second file would only move it, so the stylesheet stays the single source and the build parses the tokens out of it. Drift is now impossible rather than unlikely. |
| 9 | `RATIONALE.md` | measurement | "`ink` on `ground` 14.7:1" is **14.42:1** | Documentation only. Both figures pass AA by a wide margin, so nothing shipped was ever wrong — the number in the document was. Logged rather than silently corrected, because a rationale that quietly self-corrects is the thing this table exists to prevent. |
| 10 | Scorecard, the stamp and the *lowest level assessed* line | handover `scorecard.html` L68, L196 | Moved from template literals into `copy/scorecard.md` fragments | §8: copy is held in content files, not templates. These two lines are the most scrutinised wording on the artifact and were the last prose still assembled in markup. Text unchanged; `<b>` became `<strong>` as a consequence of markdown rendering, and `.stamp b` gained `.stamp strong` so it styles identically. |
| 11 | Every measure | `BRIEF.md` §7 | Added a visually hidden description list per scorecard measure, naming dimension, level, depth, basis, methodology version, working paper and the depth cap | §7 authorises added markup here explicitly: "a blind risk lead must be able to obtain the level, the depth, the version and the working-paper reference for every dimension". The visible stamp already carried all four as text, but ran them together with `·` separators and no labels. This names them. |
| 12 | Body type | `BRIEF.md` §4 | Self-hosted subset fonts replace three `<link>`s to `fonts.googleapis.com` / `fonts.gstatic.com`; `--body` gains a metric-matched `"Source Serif Fallback"` | §4's zero-layout-shift budget. The fallback is adjusted to the webfont rather than the webfont to the fallback: the other direction removes the same shift but renders the design's 17px body at an effective 16.38px permanently. Measured after the change — 0.613% width delta, 0px height delta across six real paragraphs. See `FONTS.md`. |
| 13 | Rubric page, every dimension | handover `oal.html` L156 and `styles.css` | `.selfcheck .eyebrow` gains `display: block` | **Broken markup, fixed.** The label was inline, so it ran straight into the question with no space: *"Self-checkIf you deleted the sentence…"*, on all eight dimensions. Its own `margin-bottom: 0.35rem` is inert on an inline element, which is the tell that a block was always intended. Measured on the handover before any build code. |
| 14 | Every data table | `BRIEF.md` §7 | Tables wrapped in a focusable `.scroller` with `overflow-x: auto` | §7 asks for 320px and 200% zoom to be tested. At 320px the coverage × depth grid pushed the whole page 58–61px sideways on Home and Services, and the version index 7px on the changelog — so every paragraph on those pages needed horizontal scrolling to finish. WCAG 1.4.10 exempts data tables from reflow because they need two dimensions; it does not exempt the page. The table scrolls in its own box now and the page does not. Found by check 13. |
| 15 | `RATIONALE.md` | measurement | "`untravelled` is used for rules and fills only" now records that the measure's rule and ticks are drawn in the new `--track` | The document described a token that no longer draws the instrument. Corrected in place, with the change logged here rather than made quietly — the same standard the table itself sets. |

## Flagged and left — nothing was changed

| # | Where | Source | What | Why it was left |
|---|---|---|---|---|
| A | About vs Independence | handover `about.html` L46, `independence.html` L39 | The same sentence appears on both pages, with *"nobody asks whether their tracing vendor is **third-party**"* on About and *"…is **independent**"* on Independence | Word choice in settled copy. §8 is explicit: tone, rhythm and word choice are flagged and left. Both readings are defensible — the Independence page is discussing the word *independent*, which is arguably why it uses it there — and resolving it is a copy decision, not an engineering one. |
| B | Home, failure block | `RATIONALE.md` "Two items I did not change" | *"In a system Ordoia built…"* sits two paragraphs above a constraints link saying Ordoia does not assess systems it has built | Already flagged by the design pass. Settled copy, and the passage is method evidence rather than a client case study, so it clears §2 as written. A reader who notices both will still ask. |
| C | Services, How we work | `RATIONALE.md` "Two items I did not change" | *"led end-to-end by a named senior architect"*, singular | Already flagged by the design pass. It is the one place the copy itself is sized to one of something, while the roster instruction elsewhere is structural. |
| D | Footer | `BRIEF.md` §10, §12.1 | Terms and Privacy are absent rather than present-and-disabled | §10 forbids stubbing them and forbids a link resolving to nothing; §12.1 makes the entity a flag-and-stop. The handover's footer names neither, which satisfies both rules today. Adding a line about them would be new copy on a stopped decision. |

## Still not ours to decide

Unchanged from `BRIEF.md` §12 and `RATIONALE.md`. Restated because they are now one
edit each rather than a search:

1. **The entity.** Terms and Privacy stay unbuilt.
2. **The publication date `2026-08-07`.** It becomes a permanent address and a version
   stamp on every scorecard ever issued. It is one value in
   [`src/_data/site.json`](src/_data/site.json) and every page reads it from there.
   **Confirm before launch.**
3. **The two missing failure-mode bullets** on Home — instructions arriving as data,
   unbounded execution. The list is a copy fragment and takes two more rows without a
   layout change. Not written.
4. **The commit-or-deploy reference on the scorecard face.** Currently the second
   header field in `copy/scorecard.md`. If it moves to working papers only, that line
   comes off `fields` and the reproducibility sentence on About needs softening.
