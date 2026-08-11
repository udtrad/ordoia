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
