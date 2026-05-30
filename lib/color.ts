// color.ts — the functional core (ADR-0003: functional core / imperative shell).
// Pure functions, no DOM. ADR-0006 moved these from JS to TS so the domain is
// modeled in types: a Color value is an `Rgb`, never a loose object, and a hex
// address that lost its '#' can't be confused with one that kept it.

// --- domain types ---

/** A Color value: red, green, blue channels, each an integer 0–255. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** The same color in HSV: hue in [0,360), saturation & value in [0,1]. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

declare const hexBrand: unique symbol;
/**
 * A bare, uppercase, 6-digit hex Color address — no leading '#'. The branded
 * shape means only `formatHex` can mint one, so a hash-prefixed display string
 * (`#C0FFEE`) can never be mistaken for the address itself (`C0FFEE`).
 */
export type Hex = string & { readonly [hexBrand]: true };

/**
 * The ADR-0001 Color value interface every interactive exposes: read the live
 * value out as `{r,g,b}` (pull) or as a hex address. (Seed-in via the `hex`
 * attribute and notify-out via `colorchange` are the element's other two halves.)
 */
export interface ColorInterface {
  readonly value: Rgb;
  readonly hex: Hex;
}

/** Payload of the `colorchange` CustomEvent (ADR-0001 notify-out half). */
export interface ColorChangeDetail extends Rgb {
  readonly hex: Hex;
}

// --- pure functions ---

// parseHex(str) -> Rgb | null
// Turns a hex Color address into a Color value. Accepts the untrusted boundary
// input (an attribute value is `string | null`); anything malformed -> null.
export function parseHex(str: string | null | undefined): Rgb | null {
  if (typeof str !== 'string') return null;
  let hex = str.replace(/^#/, '');
  if (hex.length === 3) hex = hex.replace(/./g, '$&$&'); // f0a -> ff00aa
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

// rgbToHsv({r,g,b}) -> {h,s,v}   h in [0,360), s & v in [0,1]
// Note: hue is undefined for grays (returns 0) and sat undefined for black —
// callers that need stability across those edges use the sticky-hue helper.
export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn), d = mx - mn;
  let h = 0;
  if (d !== 0) {
    if (mx === rn) h = ((gn - bn) / d) % 6;
    else if (mx === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = mx === 0 ? 0 : d / mx;
  return { h, s, v: mx };
}

// hsvToRgb({h,s,v}) -> {r,g,b}
export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

// stickyHsv(rgb, prev) -> {h,s,v}
// Recomputes HSV from RGB, but preserves the previous meaningful hue/sat
// through ambiguous colors so HSV controls don't jump: a gray has no hue
// (keep prev.h), black has no hue or sat (keep prev.h and prev.s).
export function stickyHsv(rgb: Rgb, prev: Hsv = { h: 0, s: 0, v: 0 }): Hsv {
  const t = rgbToHsv(rgb);
  const mx = Math.max(rgb.r, rgb.g, rgb.b);
  const d = mx - Math.min(rgb.r, rgb.g, rgb.b);
  return {
    h: d === 0 ? prev.h : t.h,   // gray -> keep last hue
    s: mx === 0 ? prev.s : t.s,  // black -> keep last sat
    v: t.v,
  };
}

// bestTextColor({r,g,b}) -> "#000" | "#fff"
// Picks legible text for a background by WCAG relative luminance: un-gamma each
// channel to linear light, weight by human sensitivity (green >> red >> blue),
// then compare to the contrast midpoint. Same science as the gamma lesson.
export function bestTextColor({ r, g, b }: Rgb): '#000' | '#fff' {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.179 ? '#000' : '#fff';
}

// formatHex({r,g,b}) -> "RRGGBB"
// Writes a Color value as an uppercase, bare (no '#') hex Color address.
export function formatHex({ r, g, b }: Rgb): Hex {
  const pair = (n: number): string => n.toString(16).toUpperCase().padStart(2, '0');
  return (pair(r) + pair(g) + pair(b)) as Hex;
}
