import { test, expect } from 'vitest';
import { parseHex, formatHex, rgbToHsv, hsvToRgb, stickyHsv, bestTextColor, sanitizeHexInput, parseColorLink, formatColorLink, namedColor, NAMED_COLORS } from './color.ts';

// HSV uses h in [0,360), s and v in [0,1]. Helper for approximate comparison.
const close = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

test('parseHex: a plain 6-digit hex becomes an {r,g,b} value', () => {
  expect(parseHex('3A7BD5')).toEqual({ r: 58, g: 123, b: 213 });
});

test('parseHex: tolerates a leading #', () => {
  expect(parseHex('#3A7BD5')).toEqual({ r: 58, g: 123, b: 213 });
});

test('parseHex: expands 3-digit shorthand (f0a -> FF00AA)', () => {
  expect(parseHex('f0a')).toEqual({ r: 255, g: 0, b: 170 });
});

test('parseHex: returns null for malformed input', () => {
  expect(parseHex('xyz')).toBeNull();          // non-hex chars
  expect(parseHex('12345')).toBeNull();        // wrong length
  expect(parseHex('')).toBeNull();             // empty
  expect(parseHex('#GG0000')).toBeNull();      // invalid hex digits
  expect(parseHex(null)).toBeNull();           // not a string
  expect(parseHex(undefined)).toBeNull();
});

test('formatHex: an {r,g,b} value becomes an uppercase bare hex address', () => {
  expect(formatHex({ r: 58, g: 123, b: 213 })).toBe('3A7BD5');
});

test('formatHex: zero-pads single-digit channels', () => {
  expect(formatHex({ r: 0, g: 5, b: 16 })).toBe('000510');
});

test('parseHex and formatHex round-trip', () => {
  expect(formatHex(parseHex('FF6600')!)).toBe('FF6600');
});

test('rgbToHsv: pure red is hue 0, full sat & value', () => {
  const { h, s, v } = rgbToHsv({ r: 255, g: 0, b: 0 });
  expect(close(h, 0) && close(s, 1) && close(v, 1)).toBe(true);
});

test('rgb -> hsv -> rgb round-trips for assorted colors', () => {
  for (const c of [
    { r: 58, g: 123, b: 213 }, { r: 192, g: 255, b: 238 },
    { r: 255, g: 102, b: 0 }, { r: 17, g: 17, b: 17 }, { r: 0, g: 200, b: 100 },
  ]) {
    expect(hsvToRgb(rgbToHsv(c))).toEqual(c);
  }
});

test('rgbToHsv: a gray has zero saturation (hue undefined -> 0)', () => {
  const { s } = rgbToHsv({ r: 128, g: 128, b: 128 });
  expect(close(s, 0)).toBe(true);
});

test('rgbToHsv: black has zero value and zero saturation', () => {
  const { s, v } = rgbToHsv({ r: 0, g: 0, b: 0 });
  expect(close(s, 0) && close(v, 0)).toBe(true);
});

test('stickyHsv: a normal color just reports its own hue/sat/value', () => {
  const out = stickyHsv({ r: 255, g: 0, b: 0 }, { h: 200, s: 0.5, v: 0.5 });
  expect(close(out.h, 0) && close(out.s, 1) && close(out.v, 1)).toBe(true);
});

test('stickyHsv: a gray keeps the previous hue instead of resetting to 0', () => {
  const out = stickyHsv({ r: 128, g: 128, b: 128 }, { h: 210, s: 0.7, v: 0.4 });
  expect(close(out.h, 210)).toBe(true);          // hue preserved through the gray
  expect(close(out.s, 0)).toBe(true);            // saturation is genuinely 0 for a gray
});

test('stickyHsv: black keeps previous hue AND saturation', () => {
  const out = stickyHsv({ r: 0, g: 0, b: 0 }, { h: 150, s: 0.8, v: 0.5 });
  expect(close(out.h, 150) && close(out.s, 0.8) && close(out.v, 0)).toBe(true);
});

test('bestTextColor: dark text on light backgrounds, light text on dark', () => {
  expect(bestTextColor({ r: 255, g: 255, b: 0 })).toBe('#000');   // yellow -> black
  expect(bestTextColor({ r: 0, g: 0, b: 128 })).toBe('#fff');     // navy -> white
  expect(bestTextColor({ r: 255, g: 255, b: 255 })).toBe('#000'); // white -> black
  expect(bestTextColor({ r: 0, g: 0, b: 0 })).toBe('#fff');       // black -> white
  expect(bestTextColor({ r: 192, g: 255, b: 238 })).toBe('#000'); // mint -> black
});

test('sanitizeHexInput: valid hex passes through, normalized to uppercase', () => {
  expect(sanitizeHexInput('ff', 2)).toBe('FF');
  expect(sanitizeHexInput('C0', 2)).toBe('C0');
  expect(sanitizeHexInput('aB', 2)).toBe('AB'); // mixed case -> uppercase
});

test('sanitizeHexInput: strips non-hex characters', () => {
  expect(sanitizeHexInput('g', 2)).toBe('');     // a fully-invalid keystroke vanishes
  expect(sanitizeHexInput('a b', 2)).toBe('AB'); // stray space dropped
  expect(sanitizeHexInput('#f', 2)).toBe('F');   // a '#' is not a hex digit
});

test('sanitizeHexInput: clamps to maxLen', () => {
  expect(sanitizeHexInput('abc', 2)).toBe('AB'); // third char dropped
  expect(sanitizeHexInput('FFA', 2)).toBe('FF');
});

test('sanitizeHexInput: empty input stays empty', () => {
  expect(sanitizeHexInput('', 2)).toBe('');
});

test('sanitizeHexInput: kills the historical parseInt leniency', () => {
  // parseInt('1g', 16) === 1 and parseInt('1g3', 16) === 1 let partly-invalid
  // values sneak through. The filter strips the junk char instead of prefix-parsing.
  expect(sanitizeHexInput('1g', 2)).toBe('1');
  expect(sanitizeHexInput('1g3', 2)).toBe('13');
});

// C0FFEE-22 — the Color link codec. A bare URL fragment in, a Color value out
// (parse), or a Color value in, the canonical "#HEX" link out (format). The
// parser sniffs by SHAPE (CONTEXT.md → Color link): all-hex digits → Hex
// address; the CSS-keyword/Named-address branch is a deferred open seam.

test('parseColorLink: a bare 6-digit fragment becomes an {r,g,b} value', () => {
  expect(parseColorLink('3A7BD5')).toEqual({ r: 58, g: 123, b: 213 });
});

test('parseColorLink: tolerates a leading # (the URL fragment delimiter)', () => {
  // location.hash hands us "#3A7BD5"; the '#' is the fragment delimiter, not part
  // of the address, so the codec strips it before sniffing.
  expect(parseColorLink('#3A7BD5')).toEqual({ r: 58, g: 123, b: 213 });
});

test('parseColorLink: expands 3-digit shorthand (f0a -> FF00AA)', () => {
  expect(parseColorLink('f0a')).toEqual({ r: 255, g: 0, b: 170 });
});

test('parseColorLink: malformed or unknown fragments return null', () => {
  expect(parseColorLink('#zzz')).toBeNull();      // non-hex chars
  expect(parseColorLink('#12')).toBeNull();       // all-hex but wrong length
  expect(parseColorLink('12345')).toBeNull();     // all-hex but wrong length
  expect(parseColorLink('')).toBeNull();          // empty fragment
  expect(parseColorLink('#')).toBeNull();         // bare delimiter, nothing after
  expect(parseColorLink(null)).toBeNull();        // not a string
  expect(parseColorLink(undefined)).toBeNull();
});

test('parseColorLink: the sniff-by-shape boundary — a CSS keyword is the deferred seam, not hex', () => {
  // 'dodgerblue' has non-hex letters, so it is NOT sniffed as a Hex address. The
  // Named-address branch is an open seam (CONTEXT.md): deferred, so → null today,
  // never misread as hex. (all-hex vs keyword are character-disjoint.)
  expect(parseColorLink('dodgerblue')).toBeNull();
});

test('formatColorLink: an {r,g,b} value becomes a canonical #-prefixed uppercase link', () => {
  expect(formatColorLink({ r: 58, g: 123, b: 213 })).toBe('#3A7BD5');
});

test('formatColorLink: zero-pads single-digit channels', () => {
  expect(formatColorLink({ r: 0, g: 5, b: 16 })).toBe('#000510');
});

test('formatColorLink: emits a hash link only — never a ?hex= query', () => {
  // The retired query form (?hex=…) must never be produced: the canonical link is
  // hash-only (ADR-0001 amendment 2026-05-31). Guard the shape so a regression to
  // query-emitting can't slip through the codec.
  const link = formatColorLink({ r: 255, g: 102, b: 0 });
  expect(link.startsWith('#')).toBe(true);
  expect(link).not.toContain('?');
  expect(link).not.toContain('hex=');
});

// C0FFEE-50 — the Named color address (CONTEXT.md): the CSS keyword for a Color
// value, when one exists. A PARTIAL notation — present or absent, never a
// "closest match" — so namedColor returns the name on an exact hit and null
// otherwise. Backed by the full CSS named-color table, not a curated subset.

test('namedColor: an exact match returns the CSS keyword', () => {
  expect(namedColor('FF0000')).toBe('red');
  expect(namedColor('1E90FF')).toBe('dodgerblue');
  expect(namedColor('C0C0C0')).toBe('silver');
});

test('namedColor: the table is the full CSS set, not a curated few — deep cuts resolve', () => {
  expect(namedColor('663399')).toBe('rebeccapurple');
  expect(namedColor('FFEFD5')).toBe('papayawhip');
  expect(namedColor('00FA9A')).toBe('mediumspringgreen');
  expect(namedColor('B0C4DE')).toBe('lightsteelblue');
});

test('namedColor: a near-miss returns null — a partial answer would lie', () => {
  expect(namedColor('FF0001')).toBeNull(); // one off pure red: no name
  expect(namedColor('1E90FE')).toBeNull(); // one off dodgerblue: no name
  expect(namedColor('C0FFEE')).toBeNull(); // the namesake mint has no CSS name
});

test('namedColor: case/format-insensitive — the same tolerance as parseHex', () => {
  expect(namedColor('#FF0000')).toBe('red'); // leading # tolerated
  expect(namedColor('ff0000')).toBe('red');  // lowercase tolerated
  expect(namedColor('f00')).toBe('red');     // 3-digit shorthand expands
});

test('namedColor: malformed input returns null, never throws', () => {
  expect(namedColor('not-a-color')).toBeNull();
  expect(namedColor('')).toBeNull();
  expect(namedColor(null)).toBeNull();
  expect(namedColor(undefined)).toBeNull();
});

test('namedColor: alias hexes resolve to ONE canonical name — the additive secondaries win', () => {
  // CSS gives some hexes two keywords (aqua/cyan, fuchsia/magenta, gray/grey…).
  // A hex→name table must pick one; we pick the names the Additive Venn teaches
  // (R+G=yellow, G+B=cyan, R+B=magenta) and the American gray family.
  expect(namedColor('00FFFF')).toBe('cyan');    // not aqua
  expect(namedColor('FF00FF')).toBe('magenta'); // not fuchsia
  expect(namedColor('808080')).toBe('gray');    // not grey
  expect(namedColor('696969')).toBe('dimgray'); // the family follows
});

test('NAMED_COLORS: the full CSS table — 148 keywords collapse to 139 unique hexes', () => {
  // 148 CSS named colors minus the 9 alias pairs (aqua/fuchsia + 7 grey spellings)
  // = 139 entries. Pinning the count keeps the table honest: a dropped or
  // duplicated entry (object literals silently keep the last duplicate key)
  // changes this number.
  expect(Object.keys(NAMED_COLORS).length).toBe(139);
  // every key is a canonical bare uppercase 6-digit hex address
  for (const key of Object.keys(NAMED_COLORS)) {
    expect(key).toMatch(/^[0-9A-F]{6}$/);
  }
});

test('parseColorLink and formatColorLink round-trip through the # delimiter', () => {
  // Boundary values exercise the pad/uppercase/channel-slice logic: all-zero,
  // all-max, and a single-digit-pad channel (5 -> "05", 16 -> "10").
  for (const rgb of [
    { r: 255, g: 102, b: 0 },
    { r: 0, g: 0, b: 0 },       // -> #000000
    { r: 255, g: 255, b: 255 }, // -> #FFFFFF
    { r: 0, g: 5, b: 16 },      // -> #000510 (zero-pad path)
  ]) {
    expect(parseColorLink(formatColorLink(rgb))).toEqual(rgb);
  }
});
