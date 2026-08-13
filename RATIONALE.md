# Pass two — rationale

## The signature

**The measure.** One component, on every page that has anything to measure: a
fixed scale from OAL 0 to OAL 3 drawn as a physical distance, with the span from
*asserted* to *enforced* drawn two and a half times either neighbour, and the
question that has to be answered to cross that span printed inside it.

Two variants, and the distinction is itself the brand statement:

- **Scale** — no stamp, no mark. Used wherever no assessment exists: the home
  page, the rubric, the self-scoring section. Nothing is being claimed about
  anybody's system.
- **Score** — the stamp is mandatory and carries four values (level, depth,
  version, working paper) against a header that names the system and the date.
  Used only on artifacts. The component does not render without them.

The ratio is fixed and identical on every dimension and every page. A
per-dimension difficulty curve would be an invented datum and the first thing a
competent reader would test.

## The risk

The scale is non-linear. The same graphic that reports a level also refuses to
let you average it, because there is no consistent unit to average.

This would be a chart crime if it were a chart. It is a ruler, and the axis is
difficulty, not count. Distorting an axis to prevent a false total is the
opposite of distorting one to imply a true one. The defence is printed on the
page rather than kept in this document, at the foot of the measure on the home
page and the rubric page, because the objection will be raised where the graphic
is, not where the rationale is.

## What was removed

- **A footer strip of content hashes and a build reference.** Evidence-cosplay:
  hashes with nothing on the other end to verify.
- **The working-paper reference tags on the marketing pages** (`H-1`, `F-1`,
  `S-1`). Same defect, one typeface over — a reference to a paper that does not
  exist, in a system whose whole claim is that every reference resolves. The rail
  stays, reserved at the same width on every page, and carries real values or
  nothing. On the home page it is empty. That is the argument in structural form:
  the apparatus appears at the moment it becomes true.
- **The hatched fill on not-assessed rows.** Hatching is the language of hazard
  and of blocked-out area, and it implies withholding. Replaced with the
  full-length unmarked track, with the sentence *not assessed — outside audit
  scope* printed **on** the track at the position a mark would occupy. The
  sentence is the mark.
- **The floor mark from not-assessed rows.** A row that was never assessed has no
  level, so it cannot be the lowest one. The floor is now a named field —
  *lowest level assessed* — that takes every dimension tied at that level, and it
  is the only place on the scorecard where the dimensions are compared.
- **A blank signature rule on any marketing surface.**
- **Terms and Privacy.** Not built. Neither can say anything true before the
  entity decision. The footer takes them back as one line each.

## The colour rule

One colour, `#8A4A05`, in exactly two situations: the *lowest level assessed*
field on a scorecard, and a changelog entry classified *breaking*. Not on links,
not on buttons, not on the wordmark, not on hover.

This forecloses the traffic light structurally rather than by instruction. There
is one colour and it does not mean *bad* — it means *this is the one you must not
average away*. A scorecard photocopied in greyscale loses nothing that matters.

## The rule rule

A free-standing horizontal rule on this site is always a scale, never a divider.
Sections are separated by space. Lists — the failure modes, the constraints, the
eight questions, the changelog — carry no rules at all. The only other lines on
the site are a table's own structure, which encodes rows rather than decorating
them.

This cost something. The constraints list and the eight questions both looked
better ruled, and the discipline is worth more than the two pages.

## Contrast

`floor` on `ground` is 5.65:1, `slate` on `ground` 6.2:1, `ink` on `ground`
14.42:1. All pass AA at body size, including the level scale and the stamp lines.
`untravelled` is used for borders and fills only and never carries text — the
*not offered* cells in the price grid are set in `slate`, because a labelled
absence that is hard to read is not a labelled absence. The measure's own rule
and its minor ticks are drawn in `track` `#7A827E` — 3.25:1 on `ground`, 3.57:1
on `raised` — and not in `untravelled`: a scale line is a load-bearing graphic
under WCAG 1.4.11, not decoration. Both corrections are logged in `CHANGES.md`.

## Type

Archivo Expanded for display, Source Serif 4 for prose, Archivo for utility with
tabular figures. Monospace appears only where a human must compare characters one
at a time — hashes, references, addresses. Prices, dates, versions and levels are
Archivo, not mono, because mono-everywhere is how a practice accidentally becomes
a dev-tools brand.

## Wordmark and favicon

The word in Archivo Expanded, no mark. *Ordo* is explicable, not legible, and
four ascending marks would be a badge under §7 as well as fossilising a level
count a v2.0 breaking change could alter.

The favicon is the wordmark's `o`, set expanded so it is a wide ellipse rather
than a circle, cropped left and right by the frame. A measure at 16px is a line
with a dot, which is a loading indicator. An instrument does not survive 16px; a
letterform does.

---

# Copy changes, flagged

Nothing was silently rewritten. Every departure from the settled copy in the
vault is listed here.

| # | Where | Source | Change | Why |
|---|---|---|---|---|
| 1 | Home, failure block | failure-block draft 3 | "wrong on four percent of real queries" → "wrong on a meaningful fraction of real queries" | Draft 3's own open-items list flags the figure as illustrative. An unlabelled invented metric breaks §7. **This change is already merged in services-page copy draft 4 — no decision needed, noted for completeness.** |
| 2 | Home, closing block | brand review §D2 | `X-1` "No clients yet. No certification. No badges." → "What stands behind a score" | Reciting absences puts three words in the reader's head that would not otherwise enter it, and at phase 2 the block would have to be deleted rather than extended. Wording drawn from OAL §I. |
| 3 | Rubric page | OAL v1.0 §F | The line "Worked example: a public agent repository scored against dimensions 3 and 5" **removed** from the version footer | Handover §3: EntAssistant is not cited and nothing replaces it. This is the only place in the settled copy that still assumes it. |
| 4 | Services page | draft 4 | "a written readiness position against each gate" → "against each threshold" | "Gate" is retained language from the pre-phase-0 draft; OAL v1.0 §E renames these readiness thresholds throughout. Terminology only. |
| 5 | Services, audit card | draft 4 | "authorisation, refusal robustness, upgrade control, cost" → "…, execution bounds" | Dimension 8 was recast in OAL v1.0 as execution bounds and cost attribution. Draft 4 predates the recast. |
| 6 | Everywhere | draft 4 | Dimension names follow OAL v1.0, not draft 4: "refusal robustness" → "refusal and instruction-boundary robustness"; "cost and resource control" → "execution bounds and cost attribution" | The rubric widened dimension 4 and recast dimension 8. Draft 4 predates both, and the two documents currently disagree in the vault. |
| 7 | Home / Services CTA | draft 4 | Secondary CTA "Book a 30-minute scoping call" removed from Home; retained on Services as a plain line, not a button | Handover §2: Home carries one CTA. |
| 8 | Independence page | draft 4 | The seven constraints reordered so the single-assessor disclosure is fifth, not last | Handover §1: it is a per-engagement quality-control disclosure, not a confession, and must not sit adjacent to the credential paragraph or in the terminal position where it reads as a retraction. |
| 9 | Coverage × depth grid | draft 4 | The empty cells are labelled rather than blank, and carry one line of explanation. Each cell also names its own depth, so above 46rem they read **"Tested not offered"** and **"Sustained not offered"**, and below it the depth label stacks above **"not offered"** | Absence is labelled everywhere, including in the commercial ladder. The line is new copy. **This row has been falsified twice by rendering changes, and nothing compares it to the page.** It read *"the empty cells now read 'not offered'"* while draft 6 published `Testednot offered` (`CHANGES.md` row 119), and the 2026-08-13 restoration of the in-cell label changed the true reading again. Stated at both widths here because a single reading of this cell has never survived a reflow. |
| 10 | Scorecard | OAL v1.0 §D | "not assessed (outside audit scope; maximum obtainable at inspected depth: OAL 2)" split into a track label and a stamp line | Layout only; both halves are preserved verbatim in meaning. |

## Two items I did not change, and think you should look at

- **"In a system Ordoia built…"** (home, failure block). It is method evidence
  rather than a client case study, so it clears §7 as written. But it is the
  only narrative on the site that functions like a case study, and it sits two
  paragraphs above a constraints link that says Ordoia does not assess systems it
  has built. A reader who notices both will ask. It is settled copy, so I have
  left it.
- **"Every engagement is led end-to-end by a named senior architect"** (services,
  How we work). Singular, and it reads as one person to a careful reader. The
  roster instruction in the handover is structural, and this line is the one
  place the copy itself is sized to one of something.

## Still open, and not mine

1. **The entity.** Terms, privacy and the footer cannot be written. K3 in the
   review.
2. **The publication date** on the rubric and in the changelog is set to
   2026-08-07 throughout and needs confirming before launch — it becomes a
   permanent address and a version stamp on every scorecard issued.
3. **The failure block's two missing bullets** (instructions arriving as data;
   unbounded execution), OAL v1.0 §K open question 1. Until they are added, the
   page's six named failures do not fully motivate dimensions 4 and 8. The
   layout takes two more rows without changing.
4. **The commit or deploy reference on the scorecard face** (OAL §K5). It is
   currently a header field. If it moves to working papers only, the field comes
   off the form and the reproducibility claim on the About page needs softening.
