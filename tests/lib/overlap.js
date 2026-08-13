/**
 * Rectangle overlap, as arithmetic.
 *
 * Separated from every browser call for the same reason `compareToManifest` is separated
 * from the filesystem: check 23 can then prove it detects a collision without needing a
 * page that has one. A detector whose only evidence is "it went green on the fixed site"
 * has not been shown to detect anything.
 *
 * The units are CSS pixels from `getBoundingClientRect()`, read in the page and handed
 * back as plain numbers. Nothing here knows what a browser is.
 */

/**
 * Sub-pixel slack, in CSS pixels.
 *
 * Adjacent boxes routinely share an edge, and fractional layout puts that shared edge a
 * few hundredths of a pixel inside both of them. Anything at or below this is contact,
 * not collision. 1px is what check 13 already uses for its horizontal-overflow test, and
 * a second threshold that disagreed with it would be a bug waiting to be argued about.
 */
export const TOLERANCE = 1;

/**
 * How far two rectangles intersect on each axis.
 *
 * Negative means separated by that distance, which is the ordinary case and is worth
 * returning rather than discarding: the amount of clearance is what makes a finding
 * readable ("55.4px of overlap" rather than "overlaps").
 */
export function intersection(a, b) {
  return {
    vertical: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
    horizontal: Math.min(a.right, b.right) - Math.max(a.left, b.left),
  };
}

/**
 * Do these two boxes print over each other?
 *
 * Both axes must overlap. Requiring both is the whole point — two paragraphs stacked in
 * normal flow share a horizontal band and overlap on the x-axis completely, and they are
 * not a collision. It is the pair that overlaps on x *and* y that is unreadable.
 */
export function collides(a, b) {
  const { vertical, horizontal } = intersection(a, b);
  return vertical > TOLERANCE && horizontal > TOLERANCE;
}

/**
 * Do these two runs print with no word separator between them?
 *
 * The other half of `collides`. That one asks whether two boxes are printed *over* each
 * other; this one asks whether they are printed *against* each other — which is what a
 * template concatenating an inline element with the text beside it produces, and what the
 * live site did from draft 6 until 2026-08-13: `<span class="depth">Tested</span>not
 * offered` rendered as `Testednot offered` at every width above 46rem.
 *
 * `a` is the left-hand run. Three conditions, and each of them is load-bearing:
 *
 *   same line     vertical overlap, so two stacked blocks sharing a column are not a
 *                 finding. This is the axis check 31 captured and never read.
 *   word to word   the junction is a letter or a digit on both sides. Whitespace on
 *                 either side is a separator, and so is punctuation: `<strong>finding</
 *                 strong>. A score…` prints with nothing between the two runs and is
 *                 correct English. The first version of this tested only for whitespace
 *                 and reported fourteen of those across five pages alongside the two real
 *                 ones — over-broad, and narrowed against the measurement rather than
 *                 guessed at.
 *   edges touch    |gap| within TOLERANCE. The upper bound is what makes a rendered space
 *                 — or an nbsp, or a margin — not a finding. The LOWER bound keeps this
 *                 disjoint from `collides`: a real overlap is a collision, reported once,
 *                 by check 23, with the amount.
 *
 * Runs carry `first` / `last` because a soft-wrapped text node renders one rect per line
 * and only its outermost edges are junctions with other content. An interior edge is where
 * one word continues onto the next line, and treating it as a junction reports every
 * wrapped paragraph on the site.
 *
 * **The stated limit.** Requiring a word character on both sides means a run ending in
 * punctuation cannot open a finding: `£`+`2,500` and `Tested`+`(not offered)` would both
 * pass. That is the cost of not reporting every abbreviation and every parenthesis on the
 * site, and it is a real hole rather than a tidy edge case. Nothing else covers it.
 */
const JOINS = /[\p{L}\p{N}]/u;

export function abuts(a, b) {
  if (!a.last || !b.first) return false;
  if (intersection(a.rect, b.rect).vertical <= TOLERANCE) return false;
  if (!JOINS.test(a.text.slice(-1)) || !JOINS.test(b.text.slice(0, 1))) return false;
  const gap = b.rect.left - a.rect.right;
  return gap >= -TOLERANCE && gap <= TOLERANCE;
}

/** A box with no area cannot be read, and cannot be collided with either. */
const hasArea = (p) => p.rect.width > 0 && p.rect.height > 0;

/**
 * Every colliding pair among `parts`, as sentences.
 *
 * `parts` is `[{ label, text, rect }]` — whatever the caller decided counts as a
 * text-bearing part. This function does not know about `.span` or `.stamp`, so the
 * selector list stays in the check where a reader will see it next to the rationale.
 *
 * Pairs are compared once each (j starts at i+1), and the count of comparisons is
 * returned alongside the findings so the caller can declare it as a population. A
 * detector that compared zero pairs and reported no collisions has to be able to say so.
 */
export function collisions(parts, describe = (p) => p.label) {
  const usable = parts.filter(hasArea);
  const findings = [];
  let compared = 0;

  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const a = usable[i];
      const b = usable[j];
      compared++;
      if (!collides(a.rect, b.rect)) continue;

      const { vertical, horizontal } = intersection(a.rect, b.rect);
      findings.push(
        `${describe(a)} is printed over ${describe(b)} — ` +
          `${vertical.toFixed(1)}px x ${horizontal.toFixed(1)}px of overlap` +
          (a.text ? ` — "${a.text}…"` : '')
      );
    }
  }

  return { findings, compared };
}
