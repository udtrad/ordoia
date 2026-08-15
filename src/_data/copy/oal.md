The rubric page. Prose only — see copy/home.md for the fragment format.

The four levels, the eight dimensions with their descriptors, evidence tables, depth
caps and self-check questions are NOT here. They are the instrument, and they live in
src/_data/oal.json so that this page, scorecard.html and scorecard.md are generated
from one record (BRIEF.md §6). What is here is the prose around them.

@@ note
The Ordoia Assurance Levels state how far a behaviour has travelled from being asked for to being proved: undefined, asserted, enforced, evidenced. Version {version}, published {published} at `{domain}/oal/v{version}`. Published under Creative Commons Attribution 4.0.

@@ intro
Every assessment we perform scores a system against eight dimensions, on the same four levels. Both are published here in full. Read them before you talk to us, and score yourself — the rubric is written to be used without us.

@@ scale.caption
The scale

@@ scale.pair
the same four levels on every dimension

@@ scale.tag
the distance

@@ scale.question
Between asking a system to behave and building it so that it cannot do otherwise. A demo shows you OAL 1. A production incident shows you the difference.

@@ scale.stamp
The gaps are drawn to difficulty, not to equal intervals. The span from asserted to enforced is drawn two and a half times the others because that is where systems fail. The ratio is fixed and identical on every dimension.

@@ levels.heading
The four levels

@@ ladder.heading
Asserted, enforced, evidenced

@@ ladder.body
Almost every agent system we have looked at asks for its most important properties in a prompt. Answer only from the retrieved documents. Never confirm a booking you didn't make. Don't discuss anything outside this user's account. Refuse if someone asks for that.

Those are requests. The model usually honours them, which is the problem: a request honoured most of the time is indistinguishable, in a demo, from a guarantee. The distance between OAL 1 and OAL 2 is the distance between asking a system to behave and building it so it cannot do otherwise. The distance between OAL 2 and OAL 3 is the distance between believing that on the day it was built and knowing it on the day you were asked.

Most systems that fail in front of a client score OAL 1 across the board. OAL 1 and OAL 3 look identical in a demo. That is the entire problem.

@@ dimensions.heading
The eight dimensions

@@ dimensions.body
Four pairs. The pairing is how the scorecard is read, and the dimensions within a pair are not interchangeable.

@@ dimensions.caption
The eight dimensions in their four pairs

@@ depth.heading
What our depth of evidence can and cannot establish

@@ depth.intro
The dimensions never change between engagements. What changes is how strongly we can stand behind each score, and we print that on the scorecard rather than leaving it to be assumed.

@@ depth.caption
Depth

@@ depth.body
Inspection can establish that a mechanism exists and is wired in. It cannot establish that the mechanism is sufficient against inputs you did not think of. So on three dimensions — grounding, authorisation, and refusal robustness — **we do not award OAL 3 at inspected depth, at any price.** Their top level asks whether a system holds across an open input space, and reading your test set tells us about your imagination rather than your system.

That constraint is printed here rather than discovered later, because it is the honest basis on which one engagement costs more than another.

@@ depth.gridcaption
Maximum level obtainable, by dimension and depth

@@ depth.note
On the five dimensions where both depths reach OAL 3, tested depth still buys something: at inspected depth the assessor confirms the mechanism is in place; at tested depth the assessor watches it work. Same level, different basis — a finding versus an assessment.

@@ reader.caption
Where most systems sit

@@ reader.pair
and what it takes to move

@@ reader.tag
to cross this span, answer

@@ reader.stamp
The open mark is where you place yourself, not a score we have issued. If your answer to most of the eight questions below is a sentence in a prompt, you are at OAL 1 — which is where most systems in production are, and is not a moral failing. It is a position you can now name.

@@ scoreyourself.heading
Score yourself in five minutes

@@ scoreyourself.body
One question per dimension. Answer them honestly and you will know roughly where you sit before anyone quotes you a price.

@@ reading.heading
How to read a score

@@ reading.body
A score is a statement about a named system, under a named rubric version, on a date, at a named depth. Dropping any of the four makes it something else. No score appears anywhere on this site or on any artifact we issue without all four, which is why the grammar is printed here rather than demonstrated with a system that does not exist.

@@ reading.grammar
- The level | One of OAL 0 to OAL 3, for one dimension. Never for a system.
- The depth | Inspected, tested or sustained. A level established at inspected depth is a **finding**. The same level established at tested depth is an **assessment**. A finding is what we saw in the artifacts; an assessment is what we established by trying to break it.
- The version | The rubric version the assessment was performed under. A score awarded under an earlier version stays awarded under that version; we do not restate historical scores.
- The system and the date | A commit or deploy reference and the engagement dates. A score without a version identifier is a score of nothing in particular.

@@ reading.close
A score quoted without its depth is quoted wrongly.

@@ reading.link
[See the blank scorecard](/scorecard/) — the artifact these are printed on.

@@ nototal.heading
We do not publish a total

@@ nototal.body
There is no overall score, no weighted average, no percentage and no traffic light for the system as a whole. An OAL 0 on authorisation is not offset by an OAL 3 on cost control, and a single number would invite exactly that trade — which is how a system arrives in front of a regulator with a good average and an open door.

You get a level per dimension, the depth of evidence behind each one, and the reasoning. Anything that averages the dimensions is marketing, not assessment. If you need one number for a board, take the lowest.

@@ limits.heading
Limits

@@ limits.body
This rubric scores the system, not the model. A frontier model inside an unenforced system scores OAL 1. Equally, a high score is not a statement that the model is safe, unbiased, or suitable for your purpose.

It does not establish that your system is secure. It examines the retrieval layer's treatment of identity and the boundary your data crosses; it is not a penetration test, a code security review, or an infrastructure assessment.

It does not establish legal or regulatory compliance with any regime, and no level here maps to any regulator's requirement. We are not lawyers.

It does not establish that your system's answers are correct on the substance of your domain. Grounding scores whether an answer is traceable to what was retrieved, not whether what was retrieved was right.

It does not establish that a system at OAL 3 will not fail. It establishes that a class of failure is enforced against and monitored for, which changes how quickly you find out — not whether it can happen.

It says nothing about periods outside the engagement, or about versions of the system other than the one examined, whose reference is on the scorecard.

It is performed by a single assessor. There is no second reviewer on the work, and no accreditation stands behind it. What stands behind it is a published method, retained working papers, and a named person. We would rather you knew that than inferred it.

Where the assessment covers fewer than eight dimensions, or is performed at inspected depth, the scorecard says so on its face and names the maximum level obtainable in that scope.

@@ why.heading
Why this is published

@@ why.body
The UK government's Trusted Third-Party AI Assurance Roadmap names unclear quality standards as the first barrier facing this market, and no accredited certification currently exists to fill it. We are not filling it either — that is work for a standards body, and we are one practice.

What a single practice can do is publish its instrument. This rubric is dated, numbered, and changelogged. Every assessment we issue names the version it was performed under. The criteria are written so that someone who is not us can check them: every OAL 2 and OAL 3 award points at a named artifact — a code path, a configuration, a test run, a trace — rather than at our opinion. If a criterion could only be satisfied by our say-so, it would be decoration, and we have removed the ones that were.

You can hold us to it, and so can anyone you show the scorecard to.

@@ use.heading
Use it

@@ use.body
Published under Creative Commons Attribution 4.0. Copy it, quote it, put it in your internal standards, adapt it. Attribution to Ordoia and a link to this page is the only condition, and it applies to derivatives too.

The level names are ours: a scoring scale adapted from this one should not describe its scores as Ordoia Assurance Levels or as OAL, because the value of the term to everybody depends on it meaning one thing.

@@ use.note
The Ordoia Assurance Levels state how far a behaviour has travelled from being asked for to being proved: undefined, asserted, enforced, evidenced. Version {version}, published {published}, at `{domain}/oal/v{version}`. Licensed CC BY 4.0.

@@ changes.heading
How this document changes

@@ changes.body
Every assessment names the version it was performed under. A level means nothing without one.

**Clarifying changes** (v1.0 to v1.1) cover wording, examples, added evidence guidance, and corrections that could not move any system's score. The test is strict: if an unchanged system could be scored differently before and after the change, it is not clarifying.

**Breaking changes** (v1.0 to v2.0) cover anything that could move a score for an unchanged system: a changed level descriptor, a changed evidence requirement, a changed depth cap, a change to what a dimension covers, or a change to a threshold.

**Before a version takes effect**, there is a third case, and it is the one this version is in. A version is published at its permanent address ahead of its effective date so that it can be read and challenged before anyone is scored against it. Until that date, and until the first scorecard is issued under it, its text may be amended in place rather than superseded — because no score exists that an amendment could move. Every such amendment is dated in the changelog, its reason written before the edit rather than after, and it names any change that would have been breaking had the version been in effect. After the effective date, or after the first scorecard, whichever comes first, the only routes are v1.1 and v2.0.

Every entry in the changelog is classified as one or the other, with a one-line reason. An assurance framework that revises silently is not an assurance framework. Superseded versions stay published, at permanent addresses, indefinitely.

@@ changes.link
Changelog and version index

@@ rail.contents
Contents

@@ rail.toc
- #levels | The four levels
- #dimensions | The eight dimensions
- #depth | Depth of evidence
- #reading | How to read a score
- #score-yourself | Score yourself
- #no-total | No total
- #limits | Limits
- #use | Use it

@@ evidence.caption
Evidence required

@@ evidence.column
What an assessor must see

@@ selfcheck.label
Self-check
