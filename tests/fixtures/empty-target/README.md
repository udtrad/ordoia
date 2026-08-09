# The empty target

This directory is deliberately empty of HTML, and it is a test fixture, not an oversight.

`npm run test:empty` points the whole suite at it. `htmlFiles()` then returns `[]`, so every
check whose population is the built site has nothing to look at. Each one should go **red**,
naming the population that came back empty.

That is **Baseline D**, and it is the standing proof that this suite's checks discriminate.
Baselines A (the build, green), B (the frozen handover, red) and C (a live host) each prove
something a check *found*. D proves the opposite and harder thing: that a check which is
handed nothing says so, instead of reporting green because it found no violations among no
subjects.

## Why it exists

`CHECKS.md` lesson 8: check 14 collected printed addresses with a hardcoded `ordoia.co.uk`,
the domain became `ordoia.com`, the match set went empty, and the assertion defending §9's
worst-case failure **kept passing while asserting nothing**. Check 9, which guarded its
match count, failed as it should have.

That fix was applied to two checks. On 2026-08-09 the suite was run against an empty
directory to find out how far the shape reached:

```
33 pass, 12 fail, 7 skipped — against a directory containing nothing at all
```

Eight of those passes were honest: check 0 and three controls tests never touch the site, and
two of check 12's tests read files from the repo root rather than the target. **Twenty-three
were site-touching checks reporting green having examined an empty page list.**

Fixing twenty-three instances by hand would have been the tenth time this lesson was learned.
`tests/lib/population.js` and check 16 make it the last: a check must declare what it
measured before it is allowed to assert that it found no violations.

## Keeping it honest

A one-off demonstration rots. This is a committed fixture and a named script, so the claim is
re-runnable by anyone, at any commit, in about twenty seconds.

Markdown here is invisible to the suite — `htmlFiles()` collects `.html` only — so this file
documents the fixture without becoming part of it.
