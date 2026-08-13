/**
 * Is a rendered run actually where a reader can see it?
 *
 * ── Why this is a shared module and not two helpers ───────────────────────────────
 *
 * Checks 30 and 31 each grew their own answer to that question and each got it wrong in
 * a different direction, found by the red team on 2026-08-13:
 *
 *   - check 30 compared a run against `ul.getBoundingClientRect()` — the **border box** —
 *     and called anything outside it hidden. That is true for `overflow: hidden` and false
 *     the moment the rule becomes `overflow: clip` with an `overflow-clip-margin`, which
 *     paints outside the border box on purpose. Drilled: with a 12px clip margin every
 *     row-leading separator renders, is hit-testable, and the guard written to catch
 *     exactly that still passed 8/8.
 *   - check 31 asked only whether a run was inside the viewport **horizontally**. It
 *     captured each run's `top` and never read it. Drilled: clipping the reflowed grid
 *     vertically took four of five products off the page with no scrollbar, and the whole
 *     124-check suite stayed byte-identical to green.
 *
 * One oracle, one place to be wrong, one place to fix.
 *
 * ── The rule it implements ────────────────────────────────────────────────────────
 *
 * A run is visible when its rect still has positive area after being intersected with the
 * clip region of **every** ancestor that clips. An ancestor clips when its computed
 * `overflow-x` or `overflow-y` is not `visible`; its clip region is its padding box grown
 * by `overflow-clip-margin`, which is `0px` for `hidden` and `auto` and non-zero only for
 * `clip`. Reading the margin from the computed style rather than assuming zero is the
 * whole of the check-30 fix.
 *
 * Deliberately NOT `elementFromPoint`. That answers a different question — "is this the
 * topmost hit-testable thing at this coordinate, in the current scroll position" — which
 * makes the answer depend on scroll, on z-order and on whatever else happens to overlap.
 * A run below the fold on a long page is not hidden; it is scrolled past. Intersecting
 * clip regions is scroll-independent, which is the property both checks need.
 */

/**
 * Page-side source. Injected into `page.evaluate` by interpolation, because a function
 * passed to Playwright is serialised without its module scope and cannot close over an
 * import. Defines `__clipRegion(el)` and `__isVisible(rect, el)` in page scope.
 */
export const CLIP_ORACLE = `
/** A region nothing can intersect. Returned when an ancestor clips in a way this
    oracle cannot compute, so the answer is "not visible" rather than "unclipped". */
const __NOWHERE = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };

function __clipRegion(el) {
  // Start unbounded; every clipping ancestor narrows it.
  let region = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const cs = getComputedStyle(n);

    // \`clip-path\` clips, and it is NOT \`overflow\`. Until 2026-08-13 this loop read only
    // overflow, so a run inside \`clip-path: inset(50%)\` was reported fully visible —
    // proven by the adversarial pass, which added that one declaration to the grid's depth
    // label and watched check 33's visible arm stay green with the label gone from every
    // cell on both pages, all three CI gates at their committed numbers.
    //
    // Fail CLOSED rather than parse it. \`inset()\`, \`circle()\`, \`polygon()\`, \`path()\` and
    // a \`<clipPath>\` reference are not one grammar, and a partial parser that silently
    // mishandles the shapes it does not know is the vacuous-check shape again. The whole
    // site declares clip-path exactly once — \`.vh\`, styles.css L724, whose entire purpose
    // is to be unreadable — so "clipped by an unknown shape" and "hidden" coincide here.
    // If that stops being true the cost is a LOUD false finding naming the element, which
    // is the direction this repository has chosen every time.
    if (cs.clipPath && cs.clipPath !== 'none') return __NOWHERE;

    const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
    if (!clips) continue;

    // The padding box. getBoundingClientRect() is the BORDER box, so borders come off.
    const b = n.getBoundingClientRect();
    const bt = parseFloat(cs.borderTopWidth) || 0;
    const br = parseFloat(cs.borderRightWidth) || 0;
    const bb = parseFloat(cs.borderBottomWidth) || 0;
    const bl = parseFloat(cs.borderLeftWidth) || 0;

    // \`overflow-clip-margin\` grows the clip region outward. 0 for hidden/auto/scroll;
    // only \`clip\` can carry a real one. Chromium reports it as a length or ''.
    const m = parseFloat(cs.overflowClipMargin) || 0;

    const box = {
      left: b.left + bl - m,
      top: b.top + bt - m,
      right: b.right - br + m,
      bottom: b.bottom - bb + m,
    };
    // An axis that does not clip stays unbounded on that axis.
    if (cs.overflowX === 'visible') { box.left = -Infinity; box.right = Infinity; }
    if (cs.overflowY === 'visible') { box.top = -Infinity; box.bottom = Infinity; }

    region.left = Math.max(region.left, box.left);
    region.top = Math.max(region.top, box.top);
    region.right = Math.min(region.right, box.right);
    region.bottom = Math.min(region.bottom, box.bottom);
  }
  return region;
}

function __isVisible(rect, el, tol) {
  const t = typeof tol === 'number' ? tol : 0.5;
  const cs = getComputedStyle(el.nodeType === 1 ? el : el.parentElement);
  if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return false;
  const r = __clipRegion(el.nodeType === 1 ? el : el.parentElement);
  return rect.right > r.left + t && rect.left < r.right - t
      && rect.bottom > r.top + t && rect.top < r.bottom - t;
}
`;
