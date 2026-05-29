import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickActiveBeat, resolveTarget } from './lesson-runtime.js';

// beatPositions: array of {top, bottom} in document/viewport space.
// focusLine: the y the lesson treats as "active" (e.g. 40% down the viewport).

test('pickActiveBeat: returns the beat whose span contains the focus line', () => {
  const beats = [
    { top: 0, bottom: 100 },
    { top: 100, bottom: 200 },
    { top: 200, bottom: 300 },
  ];
  assert.equal(pickActiveBeat(beats, 50), 0);
  assert.equal(pickActiveBeat(beats, 150), 1);
  assert.equal(pickActiveBeat(beats, 250), 2);
});

test('pickActiveBeat: when no beat contains the line, picks the nearest', () => {
  const beats = [
    { top: 0, bottom: 100 },
    { top: 300, bottom: 400 }, // gap between 100 and 300
  ];
  assert.equal(pickActiveBeat(beats, 120), 0);   // closer to first
  assert.equal(pickActiveBeat(beats, 280), 1);   // closer to second
});

test('pickActiveBeat: clamps above the first and below the last beat', () => {
  const beats = [
    { top: 100, bottom: 200 },
    { top: 200, bottom: 300 },
  ];
  assert.equal(pickActiveBeat(beats, -50), 0);   // above everything -> first
  assert.equal(pickActiveBeat(beats, 999), 1);   // below everything -> last
});

test('pickActiveBeat: empty list returns -1', () => {
  assert.equal(pickActiveBeat([], 100), -1);
});

test('resolveTarget: routes a swatch value to the companion mirror', () => {
  const companion = { id: 'mirror' };
  const out = resolveTarget({ r: 255, g: 0, b: 0 }, companion);
  assert.deepEqual(out, { mirror: companion, value: { r: 255, g: 0, b: 0 } });
});

test('resolveTarget: no companion -> null (nothing to drive)', () => {
  assert.equal(resolveTarget({ r: 1, g: 2, b: 3 }, null), null);
});
