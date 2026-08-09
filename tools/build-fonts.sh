#!/usr/bin/env bash
#
# build-fonts.sh — regenerate the self-hosted, subset webfonts in src/fonts/.
#
# Everything this script needs is pinned: the upstream artefacts by URL + SHA-256,
# the toolchain by exact version. Running it on a clean checkout in six years should
# reproduce the committed .woff2 files byte for byte. If an upstream URL has rotted,
# the SHA-256 values below are still the contract — fetch the artefact from any
# mirror and check it against them.
#
# Requires: uv (https://docs.astral.sh/uv/), curl, unzip, shasum.
# Deliberately adds no npm dependency: the site's build must not carry a font
# toolchain it only needs when the fonts change.
#
# Usage:  tools/build-fonts.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO_ROOT/src/fonts"
# Downloads and intermediates land outside the repo so a build leaves no untracked
# files behind. Override with FONT_BUILD_WORK to keep a warm cache between runs.
WORK="${FONT_BUILD_WORK:-${TMPDIR:-/tmp}/ordoia-font-build}"

# ---------------------------------------------------------------------------
# Pinned toolchain.
# ---------------------------------------------------------------------------
FONTTOOLS="fonttools[woff]==4.63.0"     # brotli + zopfli extras; brotli is what writes woff2
PY="uvx --from $FONTTOOLS python"
SUBSET="uvx --from $FONTTOOLS pyftsubset"
INSTANCER="uvx --from $FONTTOOLS fonttools varLib.instancer"

# ---------------------------------------------------------------------------
# The build clock.
#
# Without this the header's byte-for-byte claim is simply false, and it was.
# `varLib.instancer` writes the current wall-clock time into the head table's
# `modified` field, so two runs of this script four seconds apart produced
# different bytes:
#
#   run 1   head.modified=3869118376   archivo-subset.woff2  48548 B
#   run 2   head.modified=3869118380   archivo-subset.woff2  48528 B
#
# — a twenty-byte swing downstream, because the timestamp perturbs what brotli
# does with the block that contains it. Neither run reproduced the committed
# file. `ibm-plex-mono` was byte-stable throughout, and it is the one face that
# never goes through the instancer, which is what located the cause.
#
# fontTools honours SOURCE_DATE_EPOCH, the reproducible-builds convention.
# Pinned rather than derived from the commit, so the value does not move when the
# history is rewritten, and overridable for anyone testing that it still bites.
# Verified: two consecutive runs with it set are byte-identical.
# ---------------------------------------------------------------------------
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1786147200}"   # 2026-08-08T00:00:00Z

# ---------------------------------------------------------------------------
# Pinned upstream sources.
#
# Archivo: BRIEF.md names "googlefonts/archivo", which does not exist. The design
# source is Omnibus-Type/Archivo; the *shipping binary* — the exact file
# fonts.gstatic.com was serving this site — is google/fonts ofl/archivo. We vendor
# the shipping binary, pinned to a commit, so the subset is a drop-in for what the
# pages already rendered with.
# ---------------------------------------------------------------------------
GF_COMMIT="95f4904fc8bcf26d3420fe315560c96417c6dec7"
ARCHIVO_URL="https://raw.githubusercontent.com/google/fonts/${GF_COMMIT}/ofl/archivo/Archivo%5Bwdth,wght%5D.ttf"
ARCHIVO_SHA="0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053"
ARCHIVO_OFL_URL="https://raw.githubusercontent.com/google/fonts/${GF_COMMIT}/ofl/archivo/OFL.txt"
ARCHIVO_OFL_SHA="108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b"

SERIF_URL="https://github.com/adobe-fonts/source-serif/releases/download/4.005R/source-serif-4.005_Desktop.zip"
SERIF_SHA="549fdb8f9a682bd06944298621404969f6de77c2e422ff3b8244a1dcd6a0c425"

PLEX_URL="https://github.com/IBM/plex/releases/download/%40ibm/plex-mono%402.5.0/ibm-plex-mono.zip"
PLEX_SHA="6d23f01257663d8cc49a0d64c22ced630b79e0e2a0ac08a0da86e9a38bbc481c"

# ---------------------------------------------------------------------------
# The character set.
#
# Derived from the rendered text of the seven pages at the repo root plus
# scorecard.md and the generated content in styles.css (see FONTS.md for the
# inventory and the script that produced it). Everything the site actually sets
# is in here; the rest is headroom that costs almost nothing:
#
#   U+0020-007E   full printable ASCII. The pages use 86 of these 95; carrying the
#                 other 9 means an editor can type "!" without a font rebuild.
#   U+00A0        NBSP                 — scorecard.html
#   U+00A3  GBP   POUND SIGN           — index.html, services.html (&pound;)
#   U+00B7  MID   MIDDLE DOT           — all seven pages (&middot;), 117 uses
#   U+00D7  MUL   MULTIPLICATION SIGN  — index.html, services.html (&times;)
#   U+2013  EN    EN DASH              — oal.html (&ndash;)
#   U+2014  EM    EM DASH              — all seven pages (&mdash;), 156 uses
#   U+2018-201A, U+201C-201D           — curly quotes. NOT currently used by any
#                 page (BRIEF.md §Part E says they are; that is not true of the
#                 handover content) but named in the brief and one apostrophe in
#                 new copy would otherwise fall back mid-paragraph.
#   U+2026  ELL   HORIZONTAL ELLIPSIS  — not currently used; same argument.
#   U+2193  DN    DOWNWARDS ARROW      — index.html, services.html (&darr;)
#   U+2265  GTE   GREATER-THAN OR EQUAL — not used by a page (only CHECKS.md);
#                 named in the brief.
#
# U+201B is deliberately absent: no upstream family here has the glyph.
#
# The sets themselves live in tools/font-subsets.json, because check 18 also reads
# them: it asserts the site renders nothing outside the declared set, and a build
# script and a check holding two copies of a character list is exactly the drift
# that check exists to catch. Read with node rather than the pinned python because
# node is already required to build the site and jq is not.
# ---------------------------------------------------------------------------
SUBSETS="$REPO_ROOT/tools/font-subsets.json"
UNICODES="$(node -p "require('$SUBSETS').shared.unicodes")"
ITALIC_UNICODES="$(node -p "require('$SUBSETS').italic.unicodes")"

# Default layout features plus the two the design depends on. tabular figures
# (tnum) and lining figures (lnum) back `font-variant-numeric: tabular-nums
# lining-nums` on body in styles.css; the level scale and the price grid are
# unreadable as columns without them.
FEATURES="tnum,lnum"

fetch() {  # fetch <url> <dest> <sha256>
  local url="$1" dest="$2" want="$3" got
  if [ -f "$dest" ]; then
    got="$(shasum -a 256 "$dest" | cut -d' ' -f1)"
    [ "$got" = "$want" ] && { echo "  cached  $(basename "$dest")"; return; }
    rm -f "$dest"
  fi
  echo "  fetch   $(basename "$dest")"
  curl -sSL --fail --max-time 600 -o "$dest" "$url"
  got="$(shasum -a 256 "$dest" | cut -d' ' -f1)"
  if [ "$got" != "$want" ]; then
    echo "SHA-256 MISMATCH for $url" >&2
    echo "  expected $want" >&2
    echo "  got      $got" >&2
    exit 1
  fi
}

mkdir -p "$WORK" "$OUT"

echo "== fetching pinned upstream artefacts =="
fetch "$ARCHIVO_URL"     "$WORK/Archivo[wdth,wght].ttf" "$ARCHIVO_SHA"
fetch "$ARCHIVO_OFL_URL" "$WORK/archivo-OFL.txt"        "$ARCHIVO_OFL_SHA"
fetch "$SERIF_URL"       "$WORK/source-serif.zip"       "$SERIF_SHA"
fetch "$PLEX_URL"        "$WORK/ibm-plex-mono.zip"      "$PLEX_SHA"

echo "== extracting =="
unzip -o -j -q "$WORK/source-serif.zip" \
  "source-serif-4.005_Desktop/VAR/SourceSerif4Variable-Roman.ttf" \
  "source-serif-4.005_Desktop/VAR/SourceSerif4Variable-Italic.ttf" \
  "source-serif-4.005_Desktop/LICENSE.md" -d "$WORK"
unzip -o -j -q "$WORK/ibm-plex-mono.zip" \
  "ibm-plex-mono/fonts/complete/ttf/IBMPlexMono-Regular.ttf" \
  "ibm-plex-mono/LICENSE.txt" -d "$WORK"

echo "== narrowing variable axes =="
# Archivo ships wght 100-900, wdth 62-125. The site uses weights 400/500/600/700
# and both ends of wdth: the display role is "wdth" 125, the utility role
# "wdth" 100. wdth is therefore NOT instanced away — clip the range to nothing and
# every heading on the site loses its identity. Only wght is narrowed.
$INSTANCER -q -o "$WORK/Archivo-limited.ttf" "$WORK/Archivo[wdth,wght].ttf" wght=400:700

# Source Serif 4 ships wght 200-900, opsz 8-60. Body copy is 400 with 600 for
# <strong>; opsz is kept whole because the browser drives it from font-size and
# the site sets type from 0.66rem to 2.9rem.
$INSTANCER -q -o "$WORK/SourceSerif4-Roman-limited.ttf" \
  "$WORK/SourceSerif4Variable-Roman.ttf" wght=400:700

# The italic is pinned to opsz=20 rather than kept variable. It is only ever set at
# body size, and one optical size is the correct design answer for a face that only
# renders at 17px. wght stays 400:700 so <strong> inside an italic run is a real
# semibold italic and not a synthesised one.
#
# Corrected 2026-08-09: this comment said the italic appears in "the .buyerq
# pull-quotes in oal.html (5 of them) and 4 inline <em> runs". Measured: .buyerq
# appears 8 times, and the <em> runs compute to Archivo — a roman-only family — so
# they are synthesised obliques that never fetch this file. The eight pull-quotes on
# the rubric page are the whole of the italic's use, which is what makes its narrow
# character set below knowable. See FONTS.md.
$INSTANCER -q -o "$WORK/SourceSerif4-Italic-limited.ttf" \
  "$WORK/SourceSerif4Variable-Italic.ttf" wght=400:700 opsz=20

echo "== subsetting =="
sub() {  # sub <in> <out> [unicodes]
  $SUBSET "$1" \
    --output-file="$2" \
    --flavor=woff2 \
    --unicodes="${3:-$UNICODES}" \
    --layout-features+="$FEATURES" \
    --name-IDs='*' \
    --notdef-outline \
    --drop-tables+=DSIG
  echo "  $(basename "$2")  $(wc -c < "$2" | tr -d ' ') bytes"
}

sub "$WORK/Archivo-limited.ttf"              "$OUT/archivo-subset.woff2"
sub "$WORK/SourceSerif4-Roman-limited.ttf"   "$OUT/source-serif-4-subset.woff2"
# The italic takes its own, much narrower set — see tools/font-subsets.json for the
# measurement behind it. It is the only face on the site whose declared characters are
# not the shared set, because it is the only one that renders a knowable handful of them.
sub "$WORK/SourceSerif4-Italic-limited.ttf"  "$OUT/source-serif-4-italic-subset.woff2" "$ITALIC_UNICODES"
sub "$WORK/IBMPlexMono-Regular.ttf"          "$OUT/ibm-plex-mono-400-subset.woff2"

echo "== licences =="
cp "$WORK/archivo-OFL.txt" "$OUT/OFL-Archivo.txt"
cp "$WORK/LICENSE.md"      "$OUT/OFL-SourceSerif4.md"
cp "$WORK/LICENSE.txt"     "$OUT/OFL-IBMPlexMono.txt"
chmod 644 "$OUT"/OFL-*

echo
echo "== result =="
ls -l "$OUT"
echo "woff2 total: $(cat "$OUT"/*.woff2 | wc -c | tr -d ' ') bytes"
