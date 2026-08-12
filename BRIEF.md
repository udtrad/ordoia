# BRIEF

You are the engineering lead responsible for shipping this site and for owning it
for the next six years. You are not being asked to redesign it. You are being
asked to do the harder thing: build it so that the claims it makes about itself
stay true after twenty deploys, three contributors and one framework migration.

Read the whole brief before you open an editor. The constraints in §2 are not
preferences — they are the product. §3 is the job.

## 1 · What you are being handed, and what the job is

Ordoia is a UK **third-party AI assurance practice**. It assesses LLM and agent
systems — grounding, reliability, production readiness — before they go in front of
clients, auditors or regulators. Its instrument is a published rubric, the
**Ordoia Assurance Levels (OAL 0–3)**: eight dimensions in four pairs, four levels,
free, ungated, CC BY 4.0.

The attached files are a complete design pass, hand-authored, semantic, responsive,
with a print stylesheet. Seven pages, one stylesheet, one SVG, a markdown scorecard,
and a rationale that tells you why every decision was made. **Treat the rationale as
a spec, not as commentary.**

What is missing is everything between a folder of HTML and a practice's permanent
public record:

- URL architecture, and the permanence guarantee that sits under it
- a build that cannot silently violate the design's own rules
- the scorecard as a real circulated artifact, in more than one format
- hosting, headers, privacy posture, and the absence of a cookie banner
- the seams that let phase 2 land as a diff rather than a rebuild

The governing idea, and the one you should be able to defend in a sentence:
**this site is an artifact of the practice, so it has to survive its own rubric.**
A rule that lives in `RATIONALE.md` is asserted. A rule that fails a build is
enforced. A rule with a test that runs on every deploy and reports is evidenced.
Take the site to OAL 2 everywhere and OAL 3 where it is cheap. If you cannot,
say which dimension and why — that answer is worth more than a clean report.

## 2 · Inherited invariants — do not improve these

Each of these is a truth claim or a load-bearing design decision. Violating one is
a defect of the same class as shipping a wrong price.

**Honesty constraints** (the practice is pre-entity, pre-insurance, pre-first-client):

- No client logos, testimonials, case studies, counts, or "trusted by" strip. Do not
  build a slot for one.
- No certification, accreditation, attestation or badge language or imagery. No
  seals, shields, crests or "certified" stamps.
- The word **independent** is not used. **Third-party** is, everywhere.
- **No aggregate score, ever.** No gauge, percentage, ring, traffic light, weighted
  average, or radar chart. No component whose output the eye can sum across
  dimensions. *If you need one number for a board, take the lowest* is on the page.
- No fabricated screenshots, dashboards, sample traces or invented metrics. No stock
  photography of people, no neural mesh, no orb, no robot.
- **Every score shown carries system, version, date and depth.** Dropping any of the
  four makes it something else — including in a decorative mock or a test fixture.
- No individual is named or pictured on marketing surfaces. Assessment artifacts do
  carry a named assessor, by design. **Build the assessor field as a list that renders
  one entry today and three later**, everywhere it appears.
- Prices are shown. £2,500 is the entry point and the primary CTA.
- **The rubric is not gated.** No email wall, no download form, no modal. The blank
  scorecard is ungated too — it is a download of an artifact, not a conversion event.

**Design invariants** (from `RATIONALE.md`, restated so you cannot miss them):

- **The measure.** Fixed scale OAL 0–3 drawn as physical distance, segments **2 : 5 : 2**
  (`--p0`–`--p3`). Identical on every dimension and every page. Never per-dimension,
  never data-driven, never animated into place.
- Two variants only. **Scale**: no stamp, no mark, wherever no assessment exists.
  **Score**: stamp mandatory with four values, only on artifacts. *The component does
  not render without them* — currently a convention. Make it a build failure (§3).
- **Colour.** `--floor` `#8A4A05` in exactly two situations: *lowest level assessed* on
  a scorecard, and a changelog entry classified *breaking*. Not links, buttons,
  wordmark, hover, focus, or error states.
- **The rule rule.** A free-standing horizontal rule is always a scale, never a divider.
  Lists carry no rules. Sections are separated by space.
- **Monospace** only where a human compares characters one at a time — hashes,
  references, addresses. Prices, dates, versions and levels are Archivo with tabular
  figures.
- **The rail** is reserved at the same width on every page and carries real values or
  nothing. Empty on Home, Services, Independence, About. Do not fill it to balance a
  layout.
- Absence is always labelled and always legible. *not assessed* and *not offered* are
  set at the same weight as the things that are present.

## 3 · The one place to take the engineering risk

**Make the constraints executable.** Build a check suite that runs on every commit and
blocks the deploy, and treat the suite as a deliverable equal to the site.

At minimum, and add to it:

| # | Check | Fails when |
|---|---|---|
| 1 | Colour rule | `--floor` or `#8A4A05` resolves onto any element outside `.legend .floor-line`, `.floor-mark`, `.class--breaking` |
| 2 | Score completeness | A `.measure` containing `.mark` or `.fill` lacks a `.stamp` carrying level, depth, version and working-paper reference |
| 3 | Banned lexicon | `independent`, `certified`, `accredited`, `attested`, `trusted by`, `overall score`, `average`, `%` on a level, in rendered output |
| 4 | Aggregate shapes | Any `<canvas>`, charting import, radar/gauge/ring markup, or numeric total across dimensions |
| 5 | Gate check | Any `<form>`, email input, modal, or third-party embed on a rubric or scorecard route |
| 6 | Third-party requests | Any runtime request to a host other than the site's own origin (this is how the fonts stay honest) |
| 7 | Contrast | Computed contrast on every text token pair below 4.5:1 — including `slate` on `raised`, and the *not offered* cells that already failed once at 1.4:1 |
| 8 | Greyscale survival | Rendered page desaturated: any information conveyed only by hue |
| 9 | Link integrity | Any internal link, anchor or version address that does not resolve, including in the frozen version snapshots |
| 10 | Version stamp | Any page rendering a level, threshold or dimension name without the OAL version identifier in scope |
| 11 | Print integrity | Scorecard and rubric render to A4 with no clipped measure, no orphaned pair heading, no lost stamp line |
| 12 | Copy provenance | Rendered copy diverges from the source-of-truth copy files without a corresponding entry in the change log (§8) |

Checks 3 and 4 will produce false positives eventually. Good. An override must be an
explicit, dated, one-line-reason allowance in a committed file — the same shape as a
deviation log in a working paper. Never a silenced rule.

Report the suite's result on every deploy and retain the results. That is the site's
own evidence, and it is the only place on this project where you get to be at OAL 3
cheaply.

## 4 · Stack

Decide it yourself against these constraints, then justify it in three sentences:

- Static output. No CMS, no server runtime, no database.
- **Content pages work with JavaScript disabled.** The rubric is a document, not a
  widget. Any JS is progressive enhancement and must be removable without loss of
  meaning.
- Zero third-party runtime requests. **Self-host and subset the fonts** — Archivo
  (variable, `wdth` axis retained: the display role uses `wdth 125` and loses its
  identity without it), Source Serif 4, IBM Plex Mono. This is a performance decision
  and a data-protection one: no request to a US font CDN means no third-party
  personal-data transfer, which is part of why this site can ship without a consent
  banner.
- The output must stay legible to a human reading View Source. Someone will paste this
  rubric into their own internal standards document — §11 item 4 — and a wall of hashed
  class names fails that.
- Prefer a generator that gives you components and data files (levels, dimensions,
  prices, assessors) over one that gives you an application. If plain HTML plus a
  small build script wins on these criteria, that is a legitimate answer; say so.

Budgets: no page over 150 KB compressed including fonts; no layout shift from webfont
swap; content visible without JS execution; LCP under 1.5 s on a mid-range mobile over 4G.

## 5 · URL architecture and the permanence guarantee

This is the hardest requirement in the brief and the one most likely to be got wrong
quietly.

- Clean paths, no `.html` extensions: `/`, `/services`, `/independence`, `/about`,
  `/scorecard`, `/changelog`.
- **`/oal/v1.0` is a permanent address.** It is printed on scorecards, in the changelog,
  and in the licence line. It must resolve, unchanged, indefinitely. `/oal` serves the
  current version and carries a canonical link to the versioned address.
- **Freeze each published version as a self-contained snapshot** — its own copy of the
  CSS, fonts and favicon, referenced by version-scoped paths. If `/oal/v1.0` is styled by
  the live stylesheet, then a colour change in 2028 silently alters a methodology
  document that scorecards have been issued against. That is the same defect class as
  restating a historical score. Snapshot directories are immutable: the build refuses to
  write to a version directory that already exists.

  > **Superseded 2026-08-12, and the original wording is left standing above because this
  > is the brief the site was built to, not a description of what it does.** Two words
  > here are no longer true of the implementation. *Self-contained*: `/oal/v1.0/` now
  > links a shared `/chrome.<sha>.css` alongside its own frozen stylesheet, so that a
  > header or footer change reaches a published address without a version event. *The
  > build refuses to write*: taken literally that is unimplementable — `_site/oal/v1.0/`
  > exists after the first build — so the enforceable form is byte identity against a
  > manifest, and what that manifest covers is the `<main>` fragment and the assets that
  > render it, not the delivered document. What survives unchanged is the requirement
  > this bullet exists for: a colour change in 2028 cannot alter a methodology document
  > that scorecards have been issued against. See `DEPLOY.md` *Publishing a rubric
  > version* and `CHANGES.md` rows 65-67.
- Redirects, `sitemap.xml`, `robots.txt`, a 404 that is a page rather than a host default.
- Long-lived immutable caching on version paths; short on current paths.
- Permanence has to survive the host. Keep the published versions in version control and
  as a downloadable archive, and submit each published version to a web archive on release.
  Write down what happens to `/oal/v1.0` if the domain lapses — one paragraph, in the repo.

## 6 · The scorecard is the product's travelling artifact

It gets forwarded, printed, photocopied and read cold by someone who will never visit
the site. Build it accordingly.

- Single source of truth for the eight dimensions, their pair groupings, their inspected
  and tested maxima, and their level descriptors. `scorecard.md`, `scorecard.html` and
  the rubric page are all generated from it. They currently agree; they will not stay
  in agreement by hand.
- Ship the blank scorecard as HTML, as a print-clean PDF, and as the markdown. Ungated.
  Stable filenames carrying the methodology version.
- The PDF is generated in the build, not exported by hand, and is checked: A4, no clipped
  measures, every *not assessed* track intact with its sentence on the track, the stamp
  lines legible at 100%, the whole thing readable in greyscale.
- A filled scorecard is future work, but design the data shape for it now: system name,
  version identifier, engagement dates, reference, coverage, depth, methodology version,
  tenure, per-dimension level plus depth plus basis plus working paper, lowest level
  assessed as a list, threshold positions, assessors as a list. Nothing renders a level
  without its four qualifiers.

## 7 · Craft floor

- WCAG AA minimum on all text, including the level scale, the stamp lines and the
  labelled absences. Visible keyboard focus. Reduced motion respected (the only
  animation is `.fill`, 240 ms — keep it that way).
- **Audit the measure's accessibility properly.** It is currently absolutely-positioned
  spans inside a `figure` with an `aria-label`. Test it with a screen reader and with the
  stylesheet disabled. A blind risk lead must be able to obtain the level, the depth, the
  version and the working-paper reference for every dimension. If that needs a visually
  hidden table or a caption per row, add one — this is the one place you are authorised to
  add markup without asking.
- Test at 200% zoom and 320 px width. The mobile measure rotates and the distance runs
  downward; the question inside the untravelled span is not optional at any breakpoint.
- Known latent defects to check before you inherit them: `.na` hardcodes
  `background: var(--raised)`, so a *not assessed* track placed on `--ground` will show a
  broken knockout; `.sheetpaper .na` appears to be a rule with no matching markup; the
  favicon hardcodes `#E6EAE7`. Decide the dark-mode policy explicitly — none, or one that
  preserves the entire contrast contract and the two-situation colour rule. "It mostly
  works" is not a decision.

## 8 · Copy is not yours

Much of this wording has been fought over for honesty and legal reasons, and the vault is
the source of truth.

- Hold the copy in content files, not in templates.
- **Nothing is silently rewritten.** Every departure gets an entry in a changes table with
  where, source, change and why — the format is already established in `RATIONALE.md`.
- Typos, broken markup and factual mismatches: fix and flag. Tone, rhythm and word choice:
  flag and leave.
- Two reconciliations are already outstanding and must be closed before either page ships:
  the services copy predates the widening of dimension 4 (*refusal* → *refusal and
  instruction-boundary robustness*) and the recast of dimension 8 (*cost and resource
  control* → *execution bounds and cost attribution*). **The rubric's names win.** Do not
  resolve this with a find-and-replace across seven files — this is exactly what the
  single source of truth in §6 is for.

## 9 · Hosting, privacy and ops

- Static host, custom domain, TLS, HSTS. Security headers: a CSP that permits only own
  origin (check 6 makes this achievable), `Referrer-Policy`, `Permissions-Policy`,
  `X-Content-Type-Options`.
- **No cookies. No client-side analytics. No tag manager. No chat widget. No pixel.**
  Consequently, no consent banner. If measurement is wanted, use privacy-preserving
  server-side logs with no personal data retained, and say plainly what is collected.
  A practice that publishes a redaction rule cannot run a tracker it has not disclosed.
- The only contact path is the `mailto:` CTA. No form, no capture, no autoresponder.
- Deploys are reproducible from a clean checkout, with pinned dependencies and a lockfile.
  Anyone should be able to rebuild the exact bytes of a published version six years from now.
- Uptime and certificate-expiry monitoring. A published version returning 404 is the most
  serious operational failure this site can have.

## 10 · Phase 2 must land as a diff

Later, with an entity and insurance in place, the site restores: readiness threshold
verdicts, a signed attestation page, published reliance tiers, **"independent" replacing
"third-party" in the hero**, the review becoming the primary CTA with the audit as its
entry point, additional named assessors, and eventually a benchmark page and careers.

Do not build any of it. Build the seams:

- Terminology in one place, so *third-party* → *independent* is a one-line change with a
  changelog entry, not a seven-file search.
- Products, prices, durations, coverage and depth in one data file. The coverage × depth
  grid renders from it, including the *not offered* cells.
- The CTA as one component with four fields, used twice today.
- Assessors as a list everywhere, rendering one entry without looking like it was built
  for one.
- Rubric versions additive by construction: publishing v1.1 adds a snapshot, a changelog
  entry and a current-pointer move, and touches nothing else.

Terms and Privacy are deliberately **not built** — neither can say anything true before
incorporation. The footer takes them back as one line each. Do not stub them, and do not
leave a link resolving to nothing.

## 11 · Deliverables

1. The repository: build, content, components, data, tests, deploy config, pinned deps.
2. The check suite of §3, with its results published on each deploy and retained.
3. `/oal/v1.0` frozen, self-contained and immutable, plus the process document for
   publishing v1.1. — *See the superseded note in §5 (2026-08-12): the directory is no
   longer self-contained (it links `/chrome.<sha>.css`) and the delivered document is not
   byte-identical. What is frozen is the rubric's content and its rendering.*
4. The scorecard in three formats, generated, ungated, print-verified.
5. An accessibility report against §7, naming what you tested with and what you changed.
6. A build-and-deploy architecture diagram — **straight-line, modular, professional; take
   the diagrams on infrasights.net as the visual benchmark.**
7. A short engineering rationale: your stack choice in three sentences, the risk you took,
   what you removed, and every copy change flagged in the established table format.
8. A list of what you did *not* do and why — the same discipline the site applies to itself.

## 12 · Not yours to decide — flag and stop

These are open at the practice level. Surface them; do not resolve them in code.

1. **The entity.** Terms and Privacy depend on it.
2. **The publication date**, currently `2026-08-07` throughout. It becomes a permanent
   address and a version stamp on every scorecard ever issued. Confirm before launch;
   build so that changing it is one edit in one place.
3. **Two missing failure-mode bullets** on the home page — instructions arriving as data,
   unbounded execution. The layout takes two more rows without changing. Leave room; do
   not write them.
4. **The commit-or-deploy reference on the scorecard face.** If it moves to working papers
   only, the field comes off the form and the reproducibility line on About needs softening.
5. Two settled-copy items already flagged and deliberately left: the *"In a system Ordoia
   built…"* passage sitting two paragraphs above a constraint saying Ordoia does not assess
   what it builds, and the singular *"led end-to-end by a named senior architect"*.

## 13 · How this will be judged

1. `/oal/v1.0` renders identically in 2032, styled by 2026's stylesheet.
2. A risk committee member reads the printed scorecard cold, in greyscale, and understands
   exactly what was and was not established.
3. Someone pastes the rubric into their own internal standards document and it survives
   the paste.
4. The sceptical CTO stays past forty seconds — the failure block and the hero measure are
   the only things holding them, so they load first and they load fast.
5. A contributor two years from now tries to add a summary score and the build stops them.
6. Nothing the site says about itself — no third-party requests, no tracking, no gate,
   permanent addresses — is true only by convention.

Ship it so it is enforced, not asserted. Then look in the mirror and remove one dependency.
