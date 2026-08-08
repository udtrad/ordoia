# Assurance scorecard — blank, audit scope

Scored against the **Ordoia Assurance Levels, v1.0** (published 2026-08-07,
`ordoia.co.uk/oal/v1.0`, CC BY 4.0).

A score is a statement about a named system, under a named rubric version, on a
date, at a named depth. Dropping any of the four makes it something else.

A level established at inspected depth is a **finding**. The same level
established at tested depth is an **assessment**.

---

## Engagement

| Field | Value |
|---|---|
| System assessed | |
| Version identifier (commit or deploy reference) | |
| Engagement dates | |
| Engagement reference | |
| Coverage purchased | Four dimensions — 1, 2, 5, 7 |
| Depth purchased | Inspected |
| Methodology version | OAL v1.0, published 2026-08-07 |
| Engagement tenure | |

---

## Levels

Every dimension appears on every scorecard. A dimension outside the purchased
scope is printed as *not assessed*, never omitted and never blank, with the
maximum level that scope could have obtained.

### Truthfulness

| # | Dimension | Level | Depth | Basis | Working paper | Inspected max |
|---|---|---|---|---|---|---|
| 1 | Grounding and entailment | | inspected | finding | WP— | OAL 2 |
| 2 | Tool-use integrity | | inspected | finding | WP— | OAL 3 |

### Boundaries

| # | Dimension | Level | Depth | Basis | Working paper | Inspected max |
|---|---|---|---|---|---|---|
| 3 | Authorisation and data boundary | not assessed — outside audit scope | — | — | — | OAL 2 |
| 4 | Refusal and instruction-boundary robustness | not assessed — outside audit scope | — | — | — | OAL 2 |

### Change control

| # | Dimension | Level | Depth | Basis | Working paper | Inspected max |
|---|---|---|---|---|---|---|
| 5 | Evaluation discipline | | inspected | finding | WP— | OAL 3 |
| 6 | Model and upgrade control | not assessed — outside audit scope | — | — | — | OAL 3 |

### Operations

| # | Dimension | Level | Depth | Basis | Working paper | Inspected max |
|---|---|---|---|---|---|---|
| 7 | Observability and failure detection | | inspected | finding | WP— | OAL 3 |
| 8 | Execution bounds and cost attribution | not assessed — outside audit scope | — | — | — | OAL 3 |

---

## Lowest level assessed

**OAL —— on ————————** (enter every dimension tied at that level)

There is no overall score, no weighted average, no percentage and no traffic
light. An OAL 0 on authorisation is not offset by an OAL 3 on cost control. A
dimension printed as *not assessed* has no level and is never the lowest — it is
a scope, not a result. If you need one number for a board, take the lowest.

---

## Lowest levels first

Two or three lowest scores, one sentence each, in the buyer's language.

1.
2.
3.

## Threshold position

Readiness thresholds are applied by the client to its own system, and reported as
met or not met *on the evidence obtained* — a statement about this scorecard, not
a verdict about the system.

| Threshold | Position |
|---|---|
| Internal use — no dimension below OAL 2 | |
| Client-facing | Not evaluable at inspected depth |
| Auditor- or regulator-facing | Not evaluable at inspected depth |

Both unevaluable thresholds name OAL 3 at tested depth on dimensions that
inspection cannot reach.

## Limitations

Reproduced in full on every scorecard, not summarised. This rubric scores the
system, not the model. It does not establish that the system is secure, legally
compliant, or correct on the substance of the domain, and it does not establish
that a system at OAL 3 will not fail. It says nothing about periods outside the
engagement, or about versions of the system other than the one named above. Each
assessment is performed by a single assessor; there is no second reviewer on the
work, and no accreditation stands behind it. What stands behind it is a published
method, retained working papers, and a named person. Where the assessment covers
fewer than eight dimensions, or is performed at inspected depth, this scorecard
says so on its face and names the maximum level obtainable in that scope.

Full text: `ordoia.co.uk/oal/v1.0#limits`

## Defect register

Ranked, with reproduction steps, as an appendix.

## Assessors

Every assessment names the person who performed it and the methodology version it
was performed under. Both are published. Add a row per assessor.

| Assessor | Signature | Date |
|---|---|---|
| | | |
| | | |

Working papers supporting every level above are retained for six years. A
competent assessor given the same papers should reach the same level.

---

Ordoia · scorecard, audit scope · methodology OAL v1.0 · `ordoia.co.uk/scorecard`
