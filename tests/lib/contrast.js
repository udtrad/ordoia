/**
 * WCAG 2.1 relative luminance and contrast ratio.
 *
 * Pure, dependency-free, and deliberately separate from the checks that use it
 * so the arithmetic can be asserted on its own. BRIEF.md §3 check 7 is the only
 * check whose verdict is a number rather than a presence/absence, so the number
 * has to be trustworthy before the check means anything.
 */

/** sRGB channel (0-255) -> linear-light value. WCAG 2.1 relative luminance. */
function linearise(channel8bit) {
  const c = channel8bit / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Parse a colour into [r, g, b, a].
 * Accepts `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(...)` and `rgba(...)` — which is
 * everything `getComputedStyle` returns in Chromium, plus the hex forms the
 * stylesheet is authored in.
 */
export function parseColour(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();

  if (value === 'transparent') return [0, 0, 0, 0];

  const hex = value.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    if (h.length === 6) h += 'ff';
    if (h.length !== 8) return null;
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      parseInt(h.slice(6, 8), 16) / 255,
    ];
  }

  const fn = value.match(/^rgba?\(([^)]+)\)$/);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const [r, g, b] = parts.slice(0, 3).map((p) =>
      p.endsWith('%') ? Math.round((parseFloat(p) / 100) * 255) : parseFloat(p)
    );
    const rawAlpha = parts[3];
    const a =
      rawAlpha === undefined
        ? 1
        : rawAlpha.endsWith('%')
          ? parseFloat(rawAlpha) / 100
          : parseFloat(rawAlpha);
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return [r, g, b, a];
  }

  return null;
}

/** Composite a possibly-translucent foreground over an opaque backdrop. */
export function flatten([r, g, b, a], backdrop) {
  if (a >= 1) return [r, g, b, 1];
  const [br, bg, bb] = backdrop;
  return [
    r * a + br * (1 - a),
    g * a + bg * (1 - a),
    b * a + bb * (1 - a),
    1,
  ];
}

/** WCAG relative luminance of an opaque colour. */
export function luminance([r, g, b]) {
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/**
 * Contrast ratio between two colours, 1 to 21.
 * A translucent foreground is composited over the background first; a
 * translucent background is composited over `page` (default white), because a
 * ratio computed against an alpha channel is not a ratio anyone can see.
 */
export function contrastRatio(fg, bg, page = [255, 255, 255, 1]) {
  const f = typeof fg === 'string' ? parseColour(fg) : fg;
  const b = typeof bg === 'string' ? parseColour(bg) : bg;
  if (!f || !b) return null;

  const solidBg = flatten(b, page);
  const solidFg = flatten(f, solidBg);

  const l1 = luminance(solidFg);
  const l2 = luminance(solidBg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * WCAG AA thresholds.
 *
 * `large` is >=24px, or >=18.66px when bold — the 1.4.3 definition, applied
 * from computed styles rather than guessed from a class name.
 */
export const AA_BODY = 4.5;
export const AA_LARGE = 3.0;
export const AA_NON_TEXT = 3.0; // 1.4.11, for graphics required to understand content

export function isLargeText(fontSizePx, fontWeight) {
  const size = parseFloat(fontSizePx);
  const weight = parseInt(fontWeight, 10) || 400;
  if (Number.isNaN(size)) return false;
  return size >= 24 || (size >= 18.66 && weight >= 700);
}

export function requiredRatio(fontSizePx, fontWeight) {
  return isLargeText(fontSizePx, fontWeight) ? AA_LARGE : AA_BODY;
}
