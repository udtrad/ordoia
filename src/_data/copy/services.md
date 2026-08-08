Services. Prose only — see copy/home.md for the fragment format.

The two dimension lists in the audit card are NOT written out here. They are rendered
from products.json `auditCoverage` against oal.json, because BRIEF.md §8 names exactly
this sentence as an outstanding reconciliation and says the rubric's names win. See
CHANGES.md #1.

@@ heading
Services

@@ sub
Every engagement scores your system against the same eight dimensions, on the same four levels. What changes is coverage and depth.

@@ version
Every level, depth and readiness threshold named on this page is defined by the Ordoia Assurance Levels, v{version}, published {published} at `{domain}/oal/v{version}`.

@@ grid.heading
Where to start

@@ grid.body
Coverage is how many dimensions. Depth is how far we go on each. They are two separate axes, and the price follows both.

@@ grid.note
The cells marked *not offered* are not gaps waiting to be filled. Tested and sustained depth are only sold across all eight dimensions, because a partial adversarial pass would produce a scorecard whose silences a reader could not interpret.

@@ grid.paths
There is no wrong entry point and no penalty for starting small. The audit ({audit.price}) plus a later top-up of the remaining four dimensions ({topup.price}) reaches exactly the same place as a baseline taken directly ({baseline.price}). Every assessment can be followed by any other.

@@ audit.heading
1 · Agent grounding and readiness audit

@@ audit.terms
One week · {audit.price} fixed · four dimensions · inspected depth

@@ audit.lede
The fastest way to find out whether your agent is telling the truth.

@@ audit.scope
We read the code and configuration, run a probe set against your system, and score four of the eight dimensions: {audit.inScope}.

@@ audit.outofscope
The remaining four — {audit.outOfScope} — appear on your scorecard as **not assessed**. They can't be established honestly in a week without adversarial testing, and we would rather name the gap than imply coverage. You can add them later at inspected depth for {topup.price}, or take them at tested depth as part of a review.

@@ audit.method
Method note: we've built grounded retrieval against live public registers, including Companies House, using a verified-or-null discipline — a record is returned only when it can be traced to a source, never because it is plausible.

@@ audit.receive
**You receive:** a four-dimension scored assessment against our published rubric, a ranked defect register with reproduction steps, and a deterministic eval harness you own and keep.

@@ audit.harness
The harness is yours to run and extend. We don't score you with it — our findings come from a separate probe set that stays with us, because an assessor who grades your system using the instrument they handed you is grading their own work.

@@ audit.link
See the blank audit scorecard

@@ review.heading
2 · Agent production readiness review

@@ review.terms
Three weeks · {review.price}, fixed before we start · eight dimensions · tested depth

@@ review.lede
All eight dimensions, established adversarially rather than by inspection.

@@ review.body
Paraphrase sets run against your refusal paths. Deny-case scoring against real identities — testing that the system refuses correctly, not only that it answers correctly. Fault injection against every tool: forced errors, timeouts and malformed returns, with the user-visible behaviour asserted for each. Upgrade candidates compared against your eval set before promotion. Per-turn token economics and data egress mapped against your actual use cases.

@@ review.threshold
This is the depth at which a readiness decision — internal use, client-facing, auditor-facing — can actually be evidenced rather than asserted.

@@ review.method
Method note: our evaluation harness pattern scores the distribution across repeated runs rather than a single sample, because a test that passes once tells you nothing about a non-deterministic system.

@@ review.receive
**You receive:** the full eight-dimension assessment at tested depth, a defect register with evidence, a prioritised remediation plan your own engineers can execute, a written readiness position against each threshold, and an eval suite wired for CI.

@@ review.addressed
Reports are addressed to you. If you need to put an assessment in front of a third party — your own client, an investor, a regulator — tell us at scoping, so it can be scoped and priced properly rather than assumed.

@@ retainer.heading
3 · Agent reliability retainer

@@ retainer.terms
From £3,000/month · six-month minimum · eight dimensions · sustained depth

@@ retainer.lede
For systems already in front of users. The question is no longer what level you're at — it's whether you're still there.

@@ retainer.body
Each month we re-establish your scores and report six measures: level movement with cause; eval-set currency, including cases added from real traffic and incidents and cases retired as obsolete; upgrade events and what moved when your vendor shipped; alert hygiene, including stale rules that no longer describe the system; **detection lead** — defects found by monitoring or regression run versus defects reported by your users; and open defect aging by severity.

@@ retainer.lead
Detection lead is the number to watch. It answers, in one ratio, whether the assurance is working.

@@ retainer.baseline
The retainer needs a baseline to trend against. It follows a review, or opens with a baseline month — all eight dimensions at inspected depth, {baseline.price}, delivered as month one. Take a review within three months of a baseline and we credit half the baseline fee against it.

@@ retainer.receive
**You receive:** a monthly reliability report you can put in front of a risk committee, and the tenure disclosed on the face of every one — how long we've been engaged, because a long relationship is a thing a reader should be able to weigh.

@@ how.heading
How we work

@@ how.body
Fixed scope, fixed price, named deliverables, and a written go/no-go at the end of every engagement. Every engagement is led end-to-end by a named senior architect — no handoff to a delivery team you never met.

We don't sell day rates. We don't take greenfield "build us an agent" work where nobody owns the data governance. We don't price by volume of code.

@@ how.subheading
On doing this yourselves

@@ how.yourselves
Your engineers can build this, and the good ones do. A team that knows the business can write a better eval set than an outsider can — they know what a correct answer looks like. Point an agent at your own repository and it will find missing mechanisms too: the fallback that lives in a prompt, the index built without an identity filter, the model version floating on an alias.

None of that produces an assessment anyone else can rely on.

What we sell is not the finding. It is that the finding came from somewhere other than the team that built the system, under a method that was fixed before we looked, retained in working papers, and signed by a named person who stands behind it. Your board, your client's procurement team and your regulator all apply the same discount to self-assessment, and they apply it for the same reason companies who can read their own accounts still pay to have them audited.

So the honest division is this. Build the harness — you will build a better one than we would, and we would rather assess a system that has one. Bring us in for the part you structurally cannot do for yourself.

@@ how.link
What {partyWord} means here

@@ start.heading
Start

@@ start.note
Or a 30-minute scoping call, at no charge, to establish whether the audit is the right entry point for your system. Read [the rubric](/oal/) first — most people who read it will never contact us, and that is the intention.
