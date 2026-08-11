Home. Prose only — BRIEF.md §8: the copy is held in content files, not in templates.

Fragments are delimited by a line beginning `@@ `. Everything between one delimiter
and the next is markdown. `{token}` is substituted from site.json, terminology.json,
oal.json and products.json at build time — see the `copy` filter in eleventy.config.js.
Nothing else in these files is interpreted.

@@ hero.heading
Your agent works in the demo. The question is what it does in front of a client.

@@ hero.sub
{partyWordCap} assurance for LLM and agent systems. We assess grounding, reliability and production readiness for financial services, private equity and professional services firms who have already built or bought one — and now have to put it in front of clients, auditors or regulators.

@@ measure.caption
one of eight dimensions

@@ measure.tag
to cross this span, answer

@@ measure.stamp
A demo shows you OAL 1. A production incident shows you the difference. The gaps are drawn to difficulty, not to equal intervals — the span from asserted to enforced is the one where systems fail, and it is the same width on every dimension.

@@ measure.link
The full rubric

@@ failures.heading
The failures nobody demos

@@ failures.intro
Agent systems don't fail loudly. They fail quietly, correctly formatted, and confidently.

@@ failures.body
A code reviewer can read your codebase and find a bug on a line. What they can't tell you is that your agent is wrong on a meaningful fraction of real queries, that retrieval quietly stopped returning the right documents last Tuesday, or that it answered correctly in March and doesn't now because your vendor shipped a new model. Those failures aren't in the code. They only appear at runtime, across many samples, and over time — which is where we look.

@@ failures.eyebrow
What that looks like in practice

@@ failures.list
- **Answers that aren't entailed by what reached the context window.** Fluent, sourced-looking, and not supported by anything actually retrieved.
- **Tool calls that fail and get narrated as success.** The API returned an error; the agent told the user the booking was made.
- **Retrieval that ignores who is asking.** Access control is enforced at the application boundary, then bypassed by an index built without it.
- **Refusal paths that hold in testing and fold under paraphrase.** The guardrail was requested in a prompt rather than enforced in code — so it holds until someone rephrases.
- **Non-determinism mistaken for a passing test.** The same input passes on Tuesday and fails on Thursday. A single run tells you nothing.
- **Instructions that arrive as data and get followed anyway.** A page in your knowledge base contains the sentence "ignore your previous instructions", and nothing between the index and the model tells it apart from something your user asked for.
- **Silent regression on model upgrade.** Your vendor deprecates a version, behaviour shifts, and nothing in your pipeline is watching the shape of the answers.
- **Execution that runs until something else stops it.** One message sends the agent round a tool loop nobody put a ceiling on, and the first report anyone reads is the invoice.

@@ failures.ordinary
The same instrumented pass finds the ordinary defects too. In a system Ordoia built, it surfaced an agent serving fabricated company records as live results because the offline fallback was instructed in the prompt rather than enforced in code — and, separately, a signup path where every account created would have been locked out around twenty-four hours later. Neither was reported by anyone. Both were found by looking.

@@ failures.instrument
We find these because we instrument systems to be found out: OpenTelemetry tracing through the full agent path into Langfuse and Grafana, evaluation harnesses that run each case many times and score the distribution rather than the sample, and alerting tuned to the shape of the answers rather than uptime. Instrumentation is how we gather evidence — it is not what we sell. What we sell is the assessment it makes possible.

@@ scoreyourself.heading
Score yourself in five minutes

@@ scoreyourself.body
Eight questions, one per dimension, written so that you recognise your own system. Answer them honestly and you will know roughly where you sit before anyone quotes you a price. If your answer to most of them is a sentence in a prompt, you are at OAL 1 — which is where most systems in production are, and is not a moral failing. It is a position you can now name.

@@ scoreyourself.link
The eight questions

@@ instrument.heading
The instrument is published

@@ instrument.body
Every engagement scores your system against the same eight dimensions, on the same four levels — from a behaviour that is merely asserted in a prompt, to one enforced in code, to one evidenced by continuous verification. The rubric is published in full, free, with no email wall, because a prospect recognising their own system at OAL 1 is the whole qualification mechanism and a gate blocks precisely that recognition.

The dimensions describe how a system behaves, not what industry it serves. We concentrate in financial services, private equity and professional services because that is where the obligation to evidence a decision is heaviest — nothing in the rubric is sector-specific.

We publish no aggregate score. An OAL 0 on authorisation is not offset by an OAL 3 on cost control, and a single number would invite exactly that trade. You get a level per dimension, the depth of evidence behind each one, and the reasoning. If you need one number for a board, take the lowest.

@@ instrument.link
The Ordoia Assurance Levels, v{version}

@@ prices.heading
What it costs

@@ prices.body
Coverage and depth are two separate axes: how many dimensions, and how far we go on each. Prices are fixed before we start and are never contingent on the score.

@@ basis.heading
About these prices

@@ basis.list
- Prices exclude VAT.
- VAT is added at the prevailing UK rate where applicable.
- Fees are fixed before we start, and are never contingent on the score.

@@ prices.link
What each engagement includes

@@ standing.heading
What stands behind a score

@@ standing.body
Not an accreditation, and not a badge. A published method, fixed before we look and versioned so that a score can be checked against the criteria it was awarded under. Working papers retained for six years, on the standard that a competent assessor given the same papers should reach the same level. And a named person on every assessment, printed on the face of the scorecard alongside the methodology version.

Your board, your client's procurement team and your regulator all apply the same discount to self-assessment, and they apply it for the same reason companies who can read their own accounts still pay to have them audited.

@@ standing.link
What {partyWord} means here
