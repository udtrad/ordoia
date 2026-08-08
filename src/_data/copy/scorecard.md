The blank scorecard. Prose only — see copy/home.md for the fragment format.

The eight rows, their pair headings, their inspected maxima and which four are in
scope are NOT here: they come from oal.json and products.json `auditCoverage`, so that
this form, the markdown scorecard and the rubric page cannot drift (BRIEF.md §6).

BRIEF.md §12.4 is open and touches this file: whether the commit-or-deploy reference
stays on the scorecard face. It is currently the second header field. If it moves to
working papers only, that field comes off `fields` below and the reproducibility
sentence on the About page needs softening.

@@ eyebrow
Scorecard · blank · audit scope

@@ heading
Assurance scorecard

@@ note
Scored against the Ordoia Assurance Levels, v{version}. Eight dimensions are printed on every scorecard. Four are scored at this scope; four are printed as not assessed, with the maximum level the purchased depth could have obtained. A level established at inspected depth is a **finding**. A score is a statement about a named system, under a named rubric version, on a date, at a named depth — dropping any of the four makes it something else.

@@ fields.label
Engagement header

@@ fields
- System assessed
- Version identifier (commit or deploy reference)
- Engagement dates
- Engagement reference
- Coverage purchased | Four dimensions — {auditCoverage}
- Depth purchased | Inspected
- Methodology version | OAL v{version}, published {published}
- Engagement tenure

@@ na.label
not assessed — outside audit scope

@@ stamp.scored
Level **——** · inspected · finding · OAL v{version} · working paper **WP——** · maximum obtainable at inspected depth: OAL {max}

@@ stamp.notassessed
No level. Maximum obtainable at inspected depth had it been in scope: OAL {max}.

@@ stamp.available
Available as a baseline top-up at inspected depth, or at tested depth as part of a review.

@@ floor.line
**Lowest level assessed:** `OAL ——` on `———————————————`  (enter every dimension tied at that level)

@@ vh.pending
to be entered on issue

@@ floor.hint
(enter every dimension tied at that level)

@@ floor.note
This field is the only place on the scorecard where the dimensions are compared, and it takes the lowest rather than the average. There is no overall score, no weighted average, no percentage and no traffic light. An OAL 0 on authorisation is not offset by an OAL 3 on cost control. A dimension printed as *not assessed* has no level and is never the lowest — it is a scope, not a result.

@@ lowest.heading
Lowest levels first

@@ lowest.note
The two or three lowest scores, restated in one sentence each in the buyer's language.

@@ threshold.heading
Threshold position

@@ threshold.note
Readiness thresholds are applied by the client to its own system. Reported as met or not met *on the evidence obtained*, which is a statement about this scorecard rather than a verdict about the system.

@@ threshold.rows
- Internal use — no dimension below OAL 2
- Client-facing | Not evaluable at inspected depth
- Auditor- or regulator-facing | Not evaluable at inspected depth
- Reason | Both name OAL 3 at tested depth on dimensions inspection cannot reach.

@@ limitations.heading
Limitations

@@ limitations.note
Reproduced in full on every scorecard, not summarised. This rubric scores the system, not the model. It does not establish that the system is secure, legally compliant, or correct on the substance of the domain, and it does not establish that a system at OAL 3 will not fail. It says nothing about periods outside the engagement, or about versions of the system other than the one named above. Each assessment is performed by a single assessor; there is no second reviewer on the work, and no accreditation stands behind it. What stands behind it is a published method, retained working papers, and a named person. Where the assessment covers fewer than eight dimensions, or is performed at inspected depth, this scorecard says so on its face and names the maximum level obtainable in that scope.

@@ limitations.address
Full text: `{domain}/oal/v{version}#limits`

@@ defects.heading
Defect register

@@ defects.note
Ranked, with reproduction steps, as an appendix to this scorecard.

@@ assessors.heading
Assessors

@@ assessors.note
Every assessment names the person who performed it and the methodology version it was performed under. Both are published. Add a row for each assessor on the engagement.

@@ assessors.slotname
Assessor · name

@@ assessors.slotsig
Signature and date

@@ assessors.papers
Working papers supporting every level above are retained for six years. A competent assessor given the same papers should reach the same level.

@@ footline
Ordoia · scorecard, audit scope · methodology OAL v{version}

@@ about.heading
About this form

@@ about.body
This is the audit-scope scorecard, blank. It carries no levels because no system has been assessed on it — the four in-scope rows have an unmarked scale for the level to be entered, and the four out-of-scope rows are printed as not assessed with the maximum level that scope could have obtained.

Print it, circulate it, or use it to score yourself against [the published rubric](/oal/). The scorecard is a tool and you may take it without giving us anything. The rubric is the standard and is not gated either.

@@ about.link
The eight self-scoring questions

@@ about.formats
Also as [a print-clean PDF]({pdf}) and [markdown]({markdown}), both ungated, both carrying the methodology version in the filename.

@@ md.intro
A score is a statement about a named system, under a named rubric version, on a date, at a named depth. Dropping any of the four makes it something else.

A level established at inspected depth is a **finding**. The same level established at tested depth is an **assessment**.

@@ md.levels.note
Every dimension appears on every scorecard. A dimension outside the purchased scope is printed as *not assessed*, never omitted and never blank, with the maximum level that scope could have obtained.

@@ md.floor.note
There is no overall score, no weighted average, no percentage and no traffic light. An OAL 0 on authorisation is not offset by an OAL 3 on cost control. A dimension printed as *not assessed* has no level and is never the lowest — it is a scope, not a result. If you need one number for a board, take the lowest.

@@ md.lowest.note
Two or three lowest scores, one sentence each, in the buyer's language.

@@ md.threshold.note
Readiness thresholds are applied by the client to its own system, and reported as met or not met *on the evidence obtained* — a statement about this scorecard, not a verdict about the system.

@@ md.threshold.close
Both unevaluable thresholds name OAL 3 at tested depth on dimensions that inspection cannot reach.

@@ md.defects.note
Ranked, with reproduction steps, as an appendix.

@@ md.assessors.note
Every assessment names the person who performed it and the methodology version it was performed under. Both are published. Add a row per assessor.
