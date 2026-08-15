/**
 * One computed-style oracle, for the two things that need to compare renderings.
 *
 * Check 27 asks whether the CHROME still renders when the frozen stylesheet is taken
 * away — it measures everything OUTSIDE `<main>`. `tools/frozen-render-diff.mjs` asks the
 * opposite question at re-freeze time: whether swapping the frozen stylesheet changes how
 * the frozen `<main>` renders. Same measurement, complementary populations, and before
 * this file they were going to be two copies of the same property list.
 *
 * That matters here more than it usually would. On 2026-08-13 checks 30 and 31 were found
 * blind to the same thing — `clip-path` — because each carried its own visibility
 * predicate, and the fix went into the shared oracle in `visibility.js` rather than into
 * either check. This is that rule applied before the drift rather than after it.
 *
 * Nothing here reads the DOM in Node. `capture` is serialised to the browser by
 * `page.evaluate`, so it must stay self-contained: no imports, no closures, no reliance on
 * anything but its arguments.
 */

/**
 * The properties an element can visibly differ by.
 *
 * Colour is load-bearing beyond its own row: `outline-color` and `border-color` follow
 * `currentColor`, so a lost `a { color: … }` shows up here as several diffs rather than
 * one. That is how the wordmark's focus ring turns UA-default blue without any rule
 * mentioning outlines.
 *
 * Geometry is deliberately ABSENT. Widths, heights and offsets move whenever the text
 * moves, and the rubric's text is exactly what a version event changes — so including
 * them would report the edit rather than the stylesheet. On 2026-08-13 that separation is
 * what let the re-freeze be read at all: 0 computed-style differences alongside 2,033
 * geometry deltas, every one of them downstream of the intro paragraph losing a line
 * (`CHANGES.md` row 115).
 */
export const VISUAL_PROPS = [
  'color', 'background-color', 'opacity', 'visibility', 'display', 'position',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variation-settings',
  'line-height', 'letter-spacing', 'word-spacing', 'text-transform', 'white-space',
  'text-decoration-line', 'text-decoration-color', 'text-decoration-thickness',
  'text-underline-offset', 'list-style-type', 'text-align',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-color', 'border-bottom-color', 'border-top-style', 'border-bottom-style',
  'outline-color', 'outline-width', 'outline-style', 'outline-offset',
  'gap', 'grid-column-start', 'flex-wrap', 'flex-direction', 'align-items', 'z-index',
];

/**
 * Capture computed styles, keyed by a path a reader can find in the markup.
 *
 * Runs IN THE BROWSER. Call it as `page.evaluate(capture, { props, scope })`.
 *
 * `scope` is `'chrome'` for everything outside `<main>`, or `'main'` for everything inside
 * it. `<html>` and `<body>` are in neither: they are ancestors of `<main>` rather than
 * members of either population, and which sheet owns the page background behind a frozen
 * document is a genuine design question no comparison should answer by implication.
 *
 * The key is a positional path rather than a selector, because two `<dd>` elements with
 * the same class are different elements and a comparison that collapsed them would report
 * one difference where there are two — or none where there is one.
 */
export function capture({ props, scope }) {
  const key = (el) => {
    const parts = [];
    for (let n = el; n && n.tagName && n.tagName !== 'BODY'; n = n.parentElement) {
      const nth = n.parentElement ? [...n.parentElement.children].indexOf(n) : 0;
      const cls = n.className ? `.${String(n.className).trim().split(/\s+/).join('.')}` : '';
      parts.unshift(`${n.tagName.toLowerCase()}${cls}[${nth}]`);
    }
    return parts.join(' > ');
  };
  const skip = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'NOSCRIPT']);
  const out = {};
  for (const el of document.querySelectorAll('body *')) {
    if (skip.has(el.tagName)) continue;
    const inMain = Boolean(el.closest('main'));
    if (scope === 'main' ? !inMain : inMain) continue;
    const cs = getComputedStyle(el);
    const rec = {};
    for (const p of props) rec[p] = cs.getPropertyValue(p);
    out[key(el)] = rec;
  }
  return out;
}

/**
 * Differences between two captures, as flat records.
 *
 * An element present in one capture and absent from the other is reported as its own
 * finding rather than skipped. A stylesheet cannot add or remove an element, so if that
 * ever fires the comparison is being handed two different documents and its answer about
 * styles would be meaningless — which is worth a loud finding, not a quiet one.
 */
export function diffCaptures(before, after) {
  const findings = [];
  let compared = 0;

  for (const el of Object.keys(before)) {
    if (!(el in after)) {
      findings.push({ el, prop: null, before: 'present', after: 'absent' });
      continue;
    }
    for (const [prop, was] of Object.entries(before[el])) {
      compared += 1;
      const now = after[el][prop];
      if (was !== now) findings.push({ el, prop, before: was, after: now });
    }
  }
  for (const el of Object.keys(after)) {
    if (!(el in before)) findings.push({ el, prop: null, before: 'absent', after: 'present' });
  }

  return { findings, compared };
}
