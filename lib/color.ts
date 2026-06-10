// color.ts — the functional core (ADR-0003: functional core / imperative shell).
// Pure functions, no DOM. ADR-0006 moved these from JS to TS so the domain is
// modeled in types: a Color value is an `Rgb`, never a loose object, and a hex
// address that lost its '#' can't be confused with one that kept it.

// --- domain types ---

/** A Color value: red, green, blue channels. By convention each is an integer
 *  0–255 — that range is a caller contract, not enforced by the type. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** The same color in HSV. By convention hue in [0,360), saturation & value in
 *  [0,1] — again a caller contract, not type-enforced. */
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
  // Readonly<Rgb> so a consumer can read the live value but can't reach in and
  // mutate the element's single source of truth, bypassing its setters.
  readonly value: Readonly<Rgb>;
  readonly hex: Hex;
}

/** Payload of the `colorchange` CustomEvent (ADR-0001 notify-out half). A
 *  snapshot — fully immutable, so a listener can't scribble on it. */
export interface ColorChangeDetail extends Readonly<Rgb> {
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

// --- Color link codec (C0FFEE-22) ---
// A Color link is a Color address carried in a URL hash (CONTEXT.md). These two
// pure fns are the hash-only, total-for-hex codec; the Named/RGB/HSV notations
// are future seams that extend the parser's shape-sniff without touching callers.

// parseColorLink(fragment) -> Rgb | null
// Reads a bare URL hash fragment (the part after '#'; a leading '#' is tolerated
// since location.hash includes it) and sniffs the address BY SHAPE: a run of hex
// digits is a Hex address. The CSS-keyword/Named-address branch is a deferred open
// seam — all-hex and keyword inputs are character-disjoint, so a keyword falls
// through to null today rather than being misread as hex. Malformed -> null.
export function parseColorLink(fragment: string | null | undefined): Rgb | null {
  if (typeof fragment !== 'string') return null;
  const bare = fragment.replace(/^#/, '');
  // Shape sniff: all hex digits -> Hex address. parseHex enforces 3-or-6 length,
  // so an all-hex-but-wrong-length fragment (#12) still resolves to null.
  if (/^[0-9a-fA-F]+$/.test(bare)) return parseHex(bare);
  // Named-address (CSS keyword) branch — deferred (CONTEXT.md → Color link). null.
  return null;
}

// formatColorLink({r,g,b}) -> "#RRGGBB"
// Writes the canonical Color link: the uppercase Hex address prefixed with the
// URL fragment delimiter '#'. The '#' is the fragment delimiter, not a hex sigil —
// it only coincides with CSS's hex '#'. Hash-only: never a '?hex=' query. The
// `#${string}` return type keeps the link distinguishable from a bare Hex address
// at the boundary — the same '#C0FFEE' ≠ 'C0FFEE' distinction the Hex brand draws.
export function formatColorLink(rgb: Rgb): `#${string}` {
  return `#${formatHex(rgb)}`;
}

// --- Named color address (C0FFEE-50) ---
// The CSS color keyword for a Color value, when one exists (CONTEXT.md). A
// PARTIAL notation: most Color values have no name, so the lookup returns the
// name on an exact hit and null otherwise — never a "closest match", because a
// partial answer would lie. The full CSS table, hex → keyword: 148 keywords
// collapse to 139 entries because 9 hexes carry two spellings (aqua/cyan,
// fuchsia/magenta, and the 7 gray/grey pairs); we keep one canonical name per
// hex — the additive secondaries the Venn teaches (cyan, magenta) and the
// gray family. The future named-color gallery (C0FFEE-13) reads this same table.
export const NAMED_COLORS: Readonly<Record<string, string>> = {
  'F0F8FF': 'aliceblue',
  'FAEBD7': 'antiquewhite',
  '7FFFD4': 'aquamarine',
  'F0FFFF': 'azure',
  'F5F5DC': 'beige',
  'FFE4C4': 'bisque',
  '000000': 'black',
  'FFEBCD': 'blanchedalmond',
  '0000FF': 'blue',
  '8A2BE2': 'blueviolet',
  'A52A2A': 'brown',
  'DEB887': 'burlywood',
  '5F9EA0': 'cadetblue',
  '7FFF00': 'chartreuse',
  'D2691E': 'chocolate',
  'FF7F50': 'coral',
  '6495ED': 'cornflowerblue',
  'FFF8DC': 'cornsilk',
  'DC143C': 'crimson',
  '00FFFF': 'cyan', // also 'aqua'
  '00008B': 'darkblue',
  '008B8B': 'darkcyan',
  'B8860B': 'darkgoldenrod',
  'A9A9A9': 'darkgray', // also 'darkgrey'
  '006400': 'darkgreen',
  'BDB76B': 'darkkhaki',
  '8B008B': 'darkmagenta',
  '556B2F': 'darkolivegreen',
  'FF8C00': 'darkorange',
  '9932CC': 'darkorchid',
  '8B0000': 'darkred',
  'E9967A': 'darksalmon',
  '8FBC8F': 'darkseagreen',
  '483D8B': 'darkslateblue',
  '2F4F4F': 'darkslategray', // also 'darkslategrey'
  '00CED1': 'darkturquoise',
  '9400D3': 'darkviolet',
  'FF1493': 'deeppink',
  '00BFFF': 'deepskyblue',
  '696969': 'dimgray', // also 'dimgrey'
  '1E90FF': 'dodgerblue',
  'B22222': 'firebrick',
  'FFFAF0': 'floralwhite',
  '228B22': 'forestgreen',
  'DCDCDC': 'gainsboro',
  'F8F8FF': 'ghostwhite',
  'FFD700': 'gold',
  'DAA520': 'goldenrod',
  '808080': 'gray', // also 'grey'
  '008000': 'green',
  'ADFF2F': 'greenyellow',
  'F0FFF0': 'honeydew',
  'FF69B4': 'hotpink',
  'CD5C5C': 'indianred',
  '4B0082': 'indigo',
  'FFFFF0': 'ivory',
  'F0E68C': 'khaki',
  'E6E6FA': 'lavender',
  'FFF0F5': 'lavenderblush',
  '7CFC00': 'lawngreen',
  'FFFACD': 'lemonchiffon',
  'ADD8E6': 'lightblue',
  'F08080': 'lightcoral',
  'E0FFFF': 'lightcyan',
  'FAFAD2': 'lightgoldenrodyellow',
  'D3D3D3': 'lightgray', // also 'lightgrey'
  '90EE90': 'lightgreen',
  'FFB6C1': 'lightpink',
  'FFA07A': 'lightsalmon',
  '20B2AA': 'lightseagreen',
  '87CEFA': 'lightskyblue',
  '778899': 'lightslategray', // also 'lightslategrey'
  'B0C4DE': 'lightsteelblue',
  'FFFFE0': 'lightyellow',
  '00FF00': 'lime',
  '32CD32': 'limegreen',
  'FAF0E6': 'linen',
  'FF00FF': 'magenta', // also 'fuchsia'
  '800000': 'maroon',
  '66CDAA': 'mediumaquamarine',
  '0000CD': 'mediumblue',
  'BA55D3': 'mediumorchid',
  '9370DB': 'mediumpurple',
  '3CB371': 'mediumseagreen',
  '7B68EE': 'mediumslateblue',
  '00FA9A': 'mediumspringgreen',
  '48D1CC': 'mediumturquoise',
  'C71585': 'mediumvioletred',
  '191970': 'midnightblue',
  'F5FFFA': 'mintcream',
  'FFE4E1': 'mistyrose',
  'FFE4B5': 'moccasin',
  'FFDEAD': 'navajowhite',
  '000080': 'navy',
  'FDF5E6': 'oldlace',
  '808000': 'olive',
  '6B8E23': 'olivedrab',
  'FFA500': 'orange',
  'FF4500': 'orangered',
  'DA70D6': 'orchid',
  'EEE8AA': 'palegoldenrod',
  '98FB98': 'palegreen',
  'AFEEEE': 'paleturquoise',
  'DB7093': 'palevioletred',
  'FFEFD5': 'papayawhip',
  'FFDAB9': 'peachpuff',
  'CD853F': 'peru',
  'FFC0CB': 'pink',
  'DDA0DD': 'plum',
  'B0E0E6': 'powderblue',
  '800080': 'purple',
  '663399': 'rebeccapurple',
  'FF0000': 'red',
  'BC8F8F': 'rosybrown',
  '4169E1': 'royalblue',
  '8B4513': 'saddlebrown',
  'FA8072': 'salmon',
  'F4A460': 'sandybrown',
  '2E8B57': 'seagreen',
  'FFF5EE': 'seashell',
  'A0522D': 'sienna',
  'C0C0C0': 'silver',
  '87CEEB': 'skyblue',
  '6A5ACD': 'slateblue',
  '708090': 'slategray', // also 'slategrey'
  'FFFAFA': 'snow',
  '00FF7F': 'springgreen',
  '4682B4': 'steelblue',
  'D2B48C': 'tan',
  '008080': 'teal',
  'D8BFD8': 'thistle',
  'FF6347': 'tomato',
  '40E0D0': 'turquoise',
  'EE82EE': 'violet',
  'F5DEB3': 'wheat',
  'FFFFFF': 'white',
  'F5F5F5': 'whitesmoke',
  'FFFF00': 'yellow',
  '9ACD32': 'yellowgreen',
};

// namedColor(hexAddress) -> CSS keyword | null
// Accepts the same untrusted hex-address shapes as parseHex (leading '#',
// lowercase, 3-digit shorthand) by normalizing through the parse/format pair,
// then looks up the canonical address. Exact match only.
export function namedColor(str: string | null | undefined): string | null {
  const rgb = parseHex(str);
  return rgb ? NAMED_COLORS[formatHex(rgb)] ?? null : null;
}

// sanitizeHexInput(raw, maxLen) -> filtered uppercase hex string
// The boundary filter for a hex digit box: drop everything that isn't a hex
// digit, clamp to maxLen, normalize to the console's uppercase display. What
// survives IS exactly what's valid, so the shell can write it straight back to
// the box — there's no leftover junk for the box to show that the value dropped.
// Replaces the shell's old parseInt path, whose prefix-leniency (parseInt('1g',
// 16) === 1) let partly-invalid input through.
export function sanitizeHexInput(raw: string, maxLen: number): string {
  return raw.replace(/[^0-9a-fA-F]/g, '').slice(0, maxLen).toUpperCase();
}
