import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHex, formatHex } from './color.js';

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
