Changelog and version index. Prose only — see copy/home.md for the fragment format.

The entries themselves are in oal.json `versions`, because a changelog entry is a
property of a rubric version and not of this page. Publishing v1.1 adds a record
there and moves the current pointer; it does not touch this file (BRIEF.md §10).

@@ heading
Changelog and version index

@@ intro
Every assessment names the version it was performed under. A level means nothing without one, so every change to this rubric is dated, numbered and classified.

**Clarifying** changes cover wording, examples, added evidence guidance, and corrections that could not move any system's score. The test is strict: if an unchanged system could be scored differently before and after the change, it is not clarifying. **Breaking** changes cover anything that could move a score for an unchanged system — a changed level descriptor, a changed evidence requirement, a changed depth cap, a change to what a dimension covers, or a change to a threshold.

A score awarded under an earlier version stays awarded under that version. We do not restate historical scores against a new version. Where a breaking change would move a score, the entry says so, and the only way to hold a level under the new version is a new engagement.

@@ entries.heading
Entries

@@ entries.address
Permanent address `{domain}/oal/v{entryVersion}`.

@@ entries.note
One entry is not an empty changelog. It is dated, and it establishes the address at which this version will remain after it is superseded.

@@ index.heading
Version index

@@ index.caption
Every version, at its permanent address

@@ index.note
Superseded versions stay published at their own addresses indefinitely, so that a scorecard issued under an earlier version can still be read against the criteria it was awarded under.

@@ rail.superseded
None
