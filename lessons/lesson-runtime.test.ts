import { test, expect } from 'vitest';
import { pickActiveBeat, resolveTarget } from './lesson-runtime.ts';

// beatPositions: array of {top, bottom} in document/viewport space.
// focusLine: the y the lesson treats as "active" (e.g. 40% down the viewport).

test('pickActiveBeat: returns the beat whose span contains the focus line', () => {
  const beats = [
    { top: 0, bottom: 100 },
    { top: 100, bottom: 200 },
    { top: 200, bottom: 300 },
  ];
  expect(pickActiveBeat(beats, 50)).toBe(0);
  expect(pickActiveBeat(beats, 150)).toBe(1);
  expect(pickActiveBeat(beats, 250)).toBe(2);
});

test('pickActiveBeat: when no beat contains the line, picks the nearest', () => {
  const beats = [
    { top: 0, bottom: 100 },
    { top: 300, bottom: 400 }, // gap between 100 and 300
  ];
  expect(pickActiveBeat(beats, 120)).toBe(0);   // closer to first
  expect(pickActiveBeat(beats, 280)).toBe(1);   // closer to second
});

test('pickActiveBeat: clamps above the first and below the last beat', () => {
  const beats = [
    { top: 100, bottom: 200 },
    { top: 200, bottom: 300 },
  ];
  expect(pickActiveBeat(beats, -50)).toBe(0);   // above everything -> first
  expect(pickActiveBeat(beats, 999)).toBe(1);   // below everything -> last
});

test('pickActiveBeat: empty list returns -1', () => {
  expect(pickActiveBeat([], 100)).toBe(-1);
});

test('resolveTarget: routes a swatch value to the companion mirror', () => {
  const companion = { id: 'mirror' };
  const out = resolveTarget({ r: 255, g: 0, b: 0 }, companion);
  expect(out).toEqual({ mirror: companion, value: { r: 255, g: 0, b: 0 } });
});

test('resolveTarget: no companion -> null (nothing to drive)', () => {
  expect(resolveTarget({ r: 1, g: 2, b: 3 }, null)).toBeNull();
});
