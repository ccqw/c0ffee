import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHex, formatHex, rgbToHsv, hsvToRgb, stickyHsv, bestTextColor } from './color.js';

// HSV uses h in [0,360), s and v in [0,1]. Helper for approximate comparison.
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('parseHex: a plain 6-digit hex becomes an {r,g,b} value', () => {
  assert.deepEqual(parseHex('3A7BD5'), { r: 58, g: 123, b: 213 });
});

test('parseHex: tolerates a leading #', () => {
  assert.deepEqual(parseHex('#3A7BD5'), { r: 58, g: 123, b: 213 });
});

test('parseHex: expands 3-digit shorthand (f0a -> FF00AA)', () => {
  assert.deepEqual(parseHex('f0a'), { r: 255, g: 0, b: 170 });
});

test('parseHex: returns null for malformed input', () => {
  assert.equal(parseHex('xyz'), null);          // non-hex chars
  assert.equal(parseHex('12345'), null);        // wrong length
  assert.equal(parseHex(''), null);             // empty
  assert.equal(parseHex('#GG0000'), null);      // invalid hex digits
  assert.equal(parseHex(null), null);           // not a string
  assert.equal(parseHex(undefined), null);
});

test('formatHex: an {r,g,b} value becomes an uppercase bare hex address', () => {
  assert.equal(formatHex({ r: 58, g: 123, b: 213 }), '3A7BD5');
});

test('formatHex: zero-pads single-digit channels', () => {
  assert.equal(formatHex({ r: 0, g: 5, b: 16 }), '000510');
});

test('parseHex and formatHex round-trip', () => {
  assert.equal(formatHex(parseHex('FF6600')), 'FF6600');
});

test('rgbToHsv: pure red is hue 0, full sat & value', () => {
  const { h, s, v } = rgbToHsv({ r: 255, g: 0, b: 0 });
  assert.ok(close(h, 0) && close(s, 1) && close(v, 1));
});

test('rgb -> hsv -> rgb round-trips for assorted colors', () => {
  for (const c of [
    { r: 58, g: 123, b: 213 }, { r: 192, g: 255, b: 238 },
    { r: 255, g: 102, b: 0 }, { r: 17, g: 17, b: 17 }, { r: 0, g: 200, b: 100 },
  ]) {
    assert.deepEqual(hsvToRgb(rgbToHsv(c)), c);
  }
});

test('rgbToHsv: a gray has zero saturation (hue undefined -> 0)', () => {
  const { s } = rgbToHsv({ r: 128, g: 128, b: 128 });
  assert.ok(close(s, 0));
});

test('rgbToHsv: black has zero value and zero saturation', () => {
  const { s, v } = rgbToHsv({ r: 0, g: 0, b: 0 });
  assert.ok(close(s, 0) && close(v, 0));
});

test('stickyHsv: a normal color just reports its own hue/sat/value', () => {
  const out = stickyHsv({ r: 255, g: 0, b: 0 }, { h: 200, s: 0.5, v: 0.5 });
  assert.ok(close(out.h, 0) && close(out.s, 1) && close(out.v, 1));
});

test('stickyHsv: a gray keeps the previous hue instead of resetting to 0', () => {
  const out = stickyHsv({ r: 128, g: 128, b: 128 }, { h: 210, s: 0.7, v: 0.4 });
  assert.ok(close(out.h, 210));          // hue preserved through the gray
  assert.ok(close(out.s, 0));            // saturation is genuinely 0 for a gray
});

test('stickyHsv: black keeps previous hue AND saturation', () => {
  const out = stickyHsv({ r: 0, g: 0, b: 0 }, { h: 150, s: 0.8, v: 0.5 });
  assert.ok(close(out.h, 150) && close(out.s, 0.8) && close(out.v, 0));
});

test('bestTextColor: dark text on light backgrounds, light text on dark', () => {
  assert.equal(bestTextColor({ r: 255, g: 255, b: 0 }), '#000');   // yellow -> black
  assert.equal(bestTextColor({ r: 0, g: 0, b: 128 }), '#fff');     // navy -> white
  assert.equal(bestTextColor({ r: 255, g: 255, b: 255 }), '#000'); // white -> black
  assert.equal(bestTextColor({ r: 0, g: 0, b: 0 }), '#fff');       // black -> white
  assert.equal(bestTextColor({ r: 192, g: 255, b: 238 }), '#000'); // mint -> black
});
