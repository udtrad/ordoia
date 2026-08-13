# Fonts

Self-hosted, subset webfaces. This file is the record of where each byte came from,
what was done to it, and how every number in `src/_includes/fonts.css` was derived.

Regenerate with `tools/build-fonts.sh`. Nothing here needs npm.

Why this exists: BRIEF.md §4 requires zero third-party runtime requests, and calls it
"a performance decision and a data-protection one: no request to a US font CDN means no
third-party personal-data transfer, which is part of why this site can ship without a
consent banner." Before this change all seven pages carried two preconnects and a
stylesheet link to `fonts.googleapis.com` / `fonts.gstatic.com`, and
`tests/checks/06-third-party-requests.test.js` was red because of it.

## Provenance

| Family | Upstream | Pin | File taken |
|---|---|---|---|
| Archivo | [`google/fonts`](https://github.com/google/fonts) `ofl/archivo` | commit `95f4904fc8bcf26d3420fe315560c96417c6dec7` | `Archivo[wdth,wght].ttf` (658,596 B, sha256 `0e094a7d…b05053`) |
| Source Serif 4 | [`adobe-fonts/source-serif`](https://github.com/adobe-fonts/source-serif) | release tag **`4.005R`** | `source-serif-4.005_Desktop.zip` (sha256 `549fdb8f…a0c425`) → `VAR/SourceSerif4Variable-Roman.ttf`, `VAR/SourceSerif4Variable-Italic.ttf` |
| IBM Plex Mono | [`IBM/plex`](https://github.com/IBM/plex) | release tag **`@ibm/plex-mono@2.5.0`** | `ibm-plex-mono.zip` (sha256 `6d23f012…bc481c`) → `fonts/complete/ttf/IBMPlexMono-Regular.ttf` |

Every URL and SHA-256 is in `tools/build-fonts.sh`, which fails loudly on a hash
mismatch. If an upstream URL rots, the hashes remain the contract.

**One correction to the brief.** BRIEF.md Part E names the repo `googlefonts/archivo`.
That repo does not exist — `https://api.github.com/repos/googlefonts/archivo` returns 404.
The design source is `Omnibus-Type/Archivo`; the *shipping binary*, and the exact file
`fonts.gstatic.com` was serving these pages, is `google/fonts` `ofl/archivo`. We vendor
the shipping binary so the subset is a drop-in for what the pages already rendered with.

Licences are committed beside the fonts, unmodified: `src/fonts/OFL-Archivo.txt`,
`OFL-SourceSerif4.md`, `OFL-IBMPlexMono.txt`. All three families are SIL OFL 1.1.

## What was built

| File | Bytes | Characters | Axes retained |
|---|---:|---:|---|
| `src/fonts/archivo-subset.woff2` | 48,560 | 110 | `wght` 400–700, **`wdth` 62–125** |
| `src/fonts/source-serif-4-subset.woff2` | 54,288 | 110 | `wght` 400–700, `opsz` 8–60 |
| `src/fonts/source-serif-4-italic-subset.woff2` | 10,852 | **34** | `wght` 400–700, `opsz` pinned to 20 |
| `src/fonts/ibm-plex-mono-400-subset.woff2` | 9,308 | 110 | static, 400 only |
| **total woff2** | **123,008** (120.1 KiB) | | |

sha256 of the committed subsets:

```
34122446523b187458dc74e434e83a7b098f02b1d39253703f335898fc68a8c0  archivo-subset.woff2
f697e17543bda18a79f3a1fb6ef31bf773bf4f94dbb7c4696228417c01064600  ibm-plex-mono-400-subset.woff2
cd6a8cff47f1721caa20b0c02506324d5d9f9817f6cb2868cd8f63dea28076fa  source-serif-4-italic-subset.woff2
c40a8d8f974d5bcebe471667e705395c7acf651ca69bed5ac91ca33ac64072ff  source-serif-4-subset.woff2
```

> **These hashes changed on 2026-08-09, and three of the four changed for a reason worth
> reading.** The italic was re-subset (see below). Archivo and the roman have the same
> character set as before and still moved a few bytes, because until that day this script
> was **not reproducible** — `varLib.instancer` wrote the wall-clock time into the head
> table, so two runs seconds apart produced different files and neither matched what was
> committed. `ibm-plex-mono` never moved, and being the one face that skips the instancer
> is what located the cause. `tools/build-fonts.sh` now pins `SOURCE_DATE_EPOCH`; two
> consecutive full runs are byte-identical, which is what the claim at the top of that
> script always said and did not deliver.

Worst-case page is the rubric, which uses all four faces: **120.1 KiB of font**, plus the
page and its stylesheets, against the 150 KiB budget — measured by check 17 on every run
rather than by hand once. The italic is the reason it fits.

The font subtotal is the durable number here; the page total is not, and this paragraph
stated one until 2026-08-12 (`139.1 KiB`, margin `10.9 KiB`). Every page now links a second
stylesheet — the derived `chrome.<sha>.css`, ~1.7 KiB gzipped — so the totals moved and this
text did not. Check 17 owns the arithmetic; ask it rather than restating an absolute that
any new linked asset invalidates.

### The commands

Two stages per family. `pyftsubset` cannot narrow an axis range, so `varLib.instancer`
runs first:

```sh
fonttools varLib.instancer -q -o Archivo-limited.ttf 'Archivo[wdth,wght].ttf' wght=400:700
# Source Serif roman:  wght=400:700          (opsz left whole)
# Source Serif italic: wght=400:700 opsz=20
# IBM Plex Mono:       static, no instancer stage

pyftsubset Archivo-limited.ttf \
  --output-file=src/fonts/archivo-subset.woff2 \
  --flavor=woff2 \
  --unicodes="U+0020-007E,U+00A0,U+00A3,U+00B7,U+00D7,U+2013,U+2014,U+2018-201A,U+201C-201D,U+2026,U+2193,U+2265" \
  --layout-features+=tnum,lnum \
  --name-IDs='*' --notdef-outline --drop-tables+=DSIG
```

Toolchain pinned to `fonttools[woff]==4.63.0` via `uvx`.

### The character set, derived not guessed

Taken from the rendered text of the seven pages (tags stripped, entities unescaped),
plus `scorecard.md` and the `content:` strings in `styles.css`. The sample is 57,007
characters, 78 distinct. Non-ASCII actually used, with counts:

| Codepoint | Char | Uses | Where |
|---|---|---:|---|
| U+00A0 | NBSP | 1 | scorecard.html |
| U+00A3 | £ | 20 | index.html, services.html (`&pound;`) |
| U+00B7 | · | 117 | all seven pages (`&middot;`) |
| U+00D7 | × | 2 | index.html, services.html (`&times;`) |
| U+2013 | – | 1 | oal.html (`&ndash;`) |
| U+2014 | — | 156 | all seven pages (`&mdash;`) |
| U+2193 | ↓ | 2 | index.html, services.html (`&darr;`) |

Everything else in the subset is headroom: full printable ASCII (the pages use 86 of the
95), the curly quotes, the ellipsis, and `≥`.

**A second correction to the brief.** Part E states the site uses `‘ ’ “ ”` and `≥`. It
does not — no page contains any of them; `≥` appears once, in `CHECKS.md`, which is not
shipped. They are in the subset anyway because the brief names them and because one
apostrophe typed into new copy would otherwise fall back mid-paragraph. `U+201B` is
deliberately absent: no upstream family here has the glyph.

### Italic: a real face, and why it is pinned to one optical size

A real italic is needed, not a synthesised oblique. `.buyerq` (`styles.css:395`) is
`font-style: italic` and appears **eight** times on the rubric page as full-paragraph
pull-quotes. Source Serif's italic is a separate alphabet — a single-storey *a*, a written
*g* — and shearing the roman gets none of that. Those eight questions are a designed
feature of the rubric page, not incidental emphasis.

> **Correction, 2026-08-09.** This section previously said `.buyerq` appears *five* times,
> that there were *four* inline `<em>` runs, and that **"all of them resolve to `--body`,
> i.e. Source Serif 4"**. Measured with Playwright across all nine pages: `.buyerq` appears
> eight times, there are **six** `<em>` runs (index 1, about 2, services 1, scorecard 2),
> and the `<em>` runs do **not** resolve to Source Serif. Their computed `font-family` is
> `Archivo, system-ui, -apple-system, sans-serif` — a roman-only family — so the browser
> synthesises an oblique and **fetches no italic file at all**. Only the eight `.buyerq`
> pull-quotes on `/oal/` and `/oal/v1.0/` ever load the italic woff2, which is why those
> are the only two pages that pay its weight. `tools/build-fonts.sh` carried the same
> "5 of them and 4 inline `<em>` runs" sentence and has been corrected too.

`opsz` is pinned to 20 on the italic. Italic on this site is only ever set at body size, so
one optical size is the correct design answer, and keeping the axis variable cost roughly
38 KB for a range nothing renders. `wght` stays 400–700 so `<strong>` inside an italic run
is a real semibold italic.

> The precise pair of figures this paragraph used to quote — "61,436 B against 23,412 B" —
> has been dropped rather than corrected. 23,412 was never the size of any committed file
> (the shipped italic was 23,428 B), and neither number is reproducible now: it predates
> both the `SOURCE_DATE_EPOCH` fix above and the character-set narrowing below. Quoting a
> figure nobody can re-derive is the defect this repo scores at OAL 1. The claim the
> paragraph rests on — that pinning `opsz` is worth tens of kilobytes — is sound and is
> what `varLib.instancer` is doing on line 145; the arithmetic to two significant figures
> is not something this file should assert without a way to check it.

### The italic character set, and why it is the only narrow one

The italic declares **34 codepoints** where every other face declares 110. It is the one
face whose rendered characters are knowable: eight pull-quotes of fixed copy on one page.
Measured, they use 31 — space, comma, question mark, em dash, the capitals *D I T W*, and
every lowercase letter except *j*, *x* and *z*. Those three are declared anyway, because
completing lowercase costs 1,068 B and removes the likeliest edit that would otherwise
fall back; completing uppercase would cost four times that for letters that can only begin
a sentence. `tools/font-subsets.json` carries the full measurement table.

This took the italic from **23,428 B to 10,852 B**, and the rubric pages from 151.5 KiB —
over §4's budget — to 139.1 KiB. It had to land before `/oal/v1.0` first published: §5
freezes that directory and `_headers` caches it `immutable`, so after the first production
deploy the font could never have been changed and the overage would have been permanent.

The obvious objection is fragility — new italic copy could use a glyph that is no longer
there, and a synthesised fallback mid-paragraph still looks approximately right to whoever
ships it. That objection is answered the way this repo answers all of them: **check 18**
loads every page, collects the characters actually rendered in a real italic face, and
fails the build if any of them is outside the declared set. The set is single-sourced in
`tools/font-subsets.json`, which both this script and that check read, so the two cannot
drift. Its stated limit is in the check's header: it proves the *declared* set covers the
copy, not that the shipped binary contains those glyphs.

Archivo and IBM Plex Mono are roman-only: `font-style: italic` appears exactly once in
`styles.css`, and no `<i>`, `<cite>`, `<address>`, `<var>` or `<dfn>` appears in any page,
so no italic ever resolves to those two families.

## Tabular figures

BRIEF.md requires the `tnum`/`lnum` features to survive because `body` sets
`font-variant-numeric: tabular-nums lining-nums`. What actually survives differs per
family, and the feature tag is the wrong thing to check. What matters is whether digits
end up the same width. Verified from the subsets:

| Family | `tnum` in subset GSUB | Digit advances | Verdict |
|---|---|---|---|
| Archivo | **yes** | default 575/576/577 (uneven) → `tnum` substitutes → **all 579** | tnum is doing real work and was retained |
| Source Serif 4 roman | no | **all 500** by default | already tabular |
| Source Serif 4 italic | no | **all 511** by default | already tabular |
| IBM Plex Mono | no | **all 600** | monospace; tabular by construction |

Source Serif 4's default figures *are* tabular lining. Its `tnum` and `lnum` lookups
contain no substitutions for the default digits at all — they only map the `.lf` and
`.tosf` alternates back. Once those alternates are subsetted away the lookups are empty
and `pyftsubset` prunes them, correctly. `font-variant-numeric: tabular-nums lining-nums`
still renders tabular lining figures because that is what the cmap points at.

IBM Plex Mono has no `tnum` upstream — it never did. It cannot be "retained".

Confirmed in the browser as well as in the tables: in the Archivo utility role,
`"1111111111"` and `"0000000000"` both render **104.766 px**.

## Metric matching

The goal is BRIEF.md's "no layout shift from webfont swap". Two things had to be
established before any number was written.

**First: every `line-height` in `styles.css` is unitless and explicit** — `body` 1.6
(line 46), `.display, h1-h4` 1.15 (line 56), `.note` 1.5 (line 92). A unitless
line-height makes the line box height `number × font-size`, independent of the font's
ascent and descent. So no ascent/descent override can change a block's height here, and
the swap cannot shift layout that way. The real risk is **horizontal**: if the fallback
sets text wider or narrower, lines wrap differently, line counts change, and everything
below moves. `size-adjust` is the lever that matters.

**Second: Chromium scales the metric overrides by `size-adjust`.** Measured, not assumed
— a face declaring `ascent-override:100% descent-override:0% line-gap-override:0%` gives
a `line-height:normal` strut of 100.000 px at `size-adjust:100%` and 50.000 px at
`size-adjust:50%`, a ratio of exactly 0.5000. So a target ascent `A` must be written as
`A / size-adjust`.

A methodology note, because it bit us: measuring at a large font size gives wrong answers
for Source Serif 4. At 100px the browser drives `opsz` to its 60 ceiling, where the
letterforms are 14% narrower than at text sizes. All widths below are measured at the
real 17px body size, over the longest real body paragraph on the site
(`services.html:79`).

### Source Serif 4 — matched, `font-display: swap`

The only family with a stable target. Its first fallback is Georgia, which ships on both
macOS and Windows with identical metrics, so the match holds cross-platform.

```
size-adjust  = Georgia width / Source Serif width = 2753.188 px / 2858.063 px = 0.96331
             -> size-adjust: 96.33%

Georgia hhea (unitsPerEm 2048, USE_TYPO_METRICS off, so hhea is what Chromium uses):
  ascender 1878/2048 = 0.9170 em      descender 449/2048 = 0.2192 em      lineGap 0
Overrides are scaled by size-adjust, so divide by it:
  ascent-override   = 0.9170 / 0.96331 = 0.9519  -> 95.19%
  descent-override  = 0.2192 / 0.96331 = 0.2275  -> 22.75%
  line-gap-override = 0      / 0.96331 = 0       -> 0%
```

Verified after applying, in Chromium:

| | width of the test paragraph | vs Georgia |
|---|---:|---:|
| Georgia | 2753.188 px | — |
| Source Serif 4 unadjusted | 2858.063 px | +3.809% |
| **Source Serif 4 adjusted** | 2770.016 px | **+0.611%** |

| | strut height at 1000px, `line-height:normal` | vs Georgia |
|---|---:|---:|
| Georgia | 1136 px | — |
| Source Serif 4 unadjusted | 1371 px | +20.7% |
| **Source Serif 4 adjusted** | 1136 px | **0.000%** |

Vertical is exact. The 0.611% horizontal residual is irreducible with a single scalar:
`size-adjust: 96.33%` makes the used size 16.38px, which moves `opsz` off 17 and widens
the glyphs slightly — a feedback loop between the two adjustments. 0.611% is under one
character across a 62ch measure.

**The italic carries the roman's descriptors verbatim, not its own.** Matched to Georgia
Italic independently it wants `size-adjust: 111.96%`, which would render an inline `<em>`
12% larger than the roman around it — a visible bug, and a 12% distortion of a face
chosen for its drawing. Staying in proportion with the roman is the binding constraint.
The cost is that the nine short italic runs can reflow on swap.

**Flagging a design consequence, per BRIEF.md §12.** `size-adjust: 96.33%` is permanent,
not swap-only: body prose renders at an effective 16.38px rather than the 17px set on
line 45, about 3.7% smaller than drawn. That is inherent to matching the webfont to the
fallback rather than the fallback to the webfont. The other direction — an
`@font-face { font-family: "Georgia"; src: local("Georgia"); size-adjust: 103.8% }` that
shadows the system font and leaves Source Serif at its designed size — is strictly better
for the design and would still be nothing but `@font-face` rules. It was not taken here
because Part E asks for the overrides on the webfaces and because shadowing a system font
name is a decision about the type, which is not mine. **This is worth a second opinion
before ship.**

### Archivo — not matchable, `font-display: optional`

Stated plainly: there is no honest metric match for Archivo, so none was written.

One `@font-face` carries one `size-adjust`, and Archivo serves two roles with two
different fallbacks at two different widths. Measured against the real page text at
100px:

| Role | wdth | First fallback | Fallback width | Archivo width | Off by |
|---|---|---|---:|---:|---:|
| `--util` | 100 | `system-ui` | 3169.594 px | 3350.609 px | **+5.71%** |
| `--display` | 125 | `Arial Narrow` | 2813.047 px | 4507.203 px | **+60.22%** |

From the font tables the same conflict is 94.6% versus 62.3% — **32.3 percentage points
apart**. No single value reconciles them. `system-ui` is also platform-dependent, so even
the utility figure is not a fixed target.

`font-display: optional` removes the shift rather than hiding it: the browser either has
the font inside its ~100 ms block period or renders that whole page load in the fallback
and never swaps. Zero layout shift either way, which is what the budget asks for.

### IBM Plex Mono — no stable target, `font-display: optional`

Same conclusion, different cause. The stack is `ui-monospace, "SFMono-Regular",
monospace`, all of which resolve to a different font with a different character cell on
every platform: SF Mono 0.618 em, Consolas 0.550 em, Courier New 0.600 em. There is no
single fallback to measure against, so there is no honest `size-adjust`. Mono is confined
to short inline `.mono` spans (hashes, references, addresses) at `0.85em`.

### Recommendation for whoever integrates this

`font-display: optional` means a cold first visit can render the wordmark and every
heading in Arial Narrow. RATIONALE.md makes the wordmark in Archivo Expanded the whole of
the brand mark. Adding a preload to the head of each page makes the ~100 ms block period
very likely to be met, since the file is same-origin and 48 KB:

```html
<link rel="preload" href="fonts/archivo-subset.woff2" as="font" type="font/woff2" crossorigin>
```

I have not added it — the HTML pages and templates are outside this task's scope.

## Verification actually run

- `document.fonts.check()` in headless Chromium 1.56.1 against the real
  `src/_includes/fonts.css` and the real font files over HTTP: **7/7 pass** —
  `700 1rem Archivo`, `600 1rem Archivo`, `400 1rem Archivo`, `1rem "Source Serif 4"`,
  `600 1rem "Source Serif 4"`, `italic 1rem "Source Serif 4"`, `1rem "IBM Plex Mono"`.
  All four woff2 responses 200, no failed or 4xx requests.
- Axis ranges read back from the built subsets with `TTFont(...)['fvar']`: Archivo
  `wght` 400–700 and **`wdth` 62–125**; Source Serif roman `wght` 400–700, `opsz` 8–60;
  italic `wght` 400–700 with no `opsz` axis; Plex Mono no `fvar`.
- Digit advances read from `hmtx` in each subset, plus a browser check that two
  ten-digit strings render identically wide.
- All 110 subset codepoints present in all four faces; `£ · × — – ↓ ≥ ’` spot-checked.

## Not verified, and known rough edges

- **Only Chromium was tested.** No Safari or Firefox run. The `size-adjust`/override
  interaction was verified empirically in Chromium only; the spec wording is ambiguous
  enough that it was worth measuring, and it is worth measuring again in Gecko/WebKit
  before ship.
- **Fallback metrics were read from this machine's macOS copies** of Georgia and Arial
  Narrow. Georgia is metrically identical on Windows; Arial Narrow is not universally
  present, but nothing depends on its numbers since Archivo is `optional`.
- **`system-ui` and `ui-monospace` do not resolve to SF Pro / SF Mono in headless
  Chromium here** — both measured as the same proportional fallback. Their numbers above
  come from the font tables, not the browser. This does not change any conclusion: both
  are platform-dependent by definition, which is the reason those two families are
  `optional`.
- **`fonttools varLib.instancer` is not byte-deterministic across runs** (two runs on the
  same input produced different SHA-256s and a ~50 byte size difference downstream);
  `pyftsubset` is deterministic. The shipped bytes are fixed regardless because the
  `.woff2` files are committed, but a rebuild will not reproduce them byte for byte.
- `pyftsubset` drops IBM Plex Mono's `meta` table with a warning: `meta NOT subset; don't
  know how to subset; dropped`. `meta` carries script/language design tags only.
- The 150 KB budget is met but tight on `oal.html`. Dropping Archivo's `wdth` floor from
  62 to 100 would save a further 13.8 KB (measured: 45,800 B against 32,020 B on an
  earlier build) and nothing on the site sets `wdth` below 100 — but BRIEF.md §4 fixes
  the range at 62–125, so it was left alone.

---

## Integration note — the metric adjustment was reversed

Added when `fonts.css` was inlined into `styles.css`.

The measurement above put `size-adjust: 96.33%` on the **Source Serif 4** face,
scaling the webfont down to Georgia's width. That removes the swap shift, and it
was correctly measured — but it is permanent. `styles.css` sets the body at 17px,
and a 96.33% size-adjust renders it at an effective 16.38px on every visit,
forever, to pay for a one-off loading artifact.

The adjustment now sits on the fallback instead:

```css
@font-face { font-family: "Source Serif 4"; src: url("fonts/source-serif-4-subset.woff2") format("woff2"); font-display: swap; }
@font-face { font-family: "Source Serif Fallback"; src: local("Georgia"); size-adjust: 103.81%; }
```

`--body` becomes `"Source Serif 4", "Source Serif Fallback", Georgia, …`, so
Georgia is scaled up to Source Serif rather than Source Serif scaled down to
Georgia. 103.81% is the reciprocal of the measured 96.33%.

No `ascent-override` / `descent-override` on the fallback: every `line-height` in
`styles.css` is unitless, so the line box is `font-size × line-height` and font
metrics cannot move it — which the original measurement had already established
as a 0.000% height delta.

**Re-measured after the change**, `/about/` in Chromium at 1280×900, comparing a
normal load against one with `**/*.woff2` aborted so the fallback face renders:

```
webfont   probe width: 622.344   para heights: 82,109,54,163,109,163
fallback  probe width: 626.156   para heights: 82,109,54,163,109,163

width delta on swap:  0.613%
per-paragraph height delta: 0, 0, 0, 0, 0, 0 px
```

Same match quality as the original direction (0.611% there, 0.613% here — the
difference is rounding on the reciprocal), with the design's 17px intact.

A `<link rel="preload">` for `archivo-subset.woff2` was added to the page layout,
as recommended, scoped to `assetBase` so the frozen `/oal/v1.0/` snapshot
preloads its own copy.

**Not verified:** Chromium only, as above. `local("Georgia")` resolving on Linux
hosts without Georgia installed falls through to the unadjusted `Georgia`,
`"Times New Roman"`, `serif` stack, which is the pre-existing behaviour.
