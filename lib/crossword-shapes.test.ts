import { test, expect } from 'vitest';
import { SHAPES } from './crossword-shapes.ts';
import { deriveLayout, SLOT_LENGTH } from './crossword-layout.ts';

// The data v1 shapes must each be a valid Hex Color crossword: derive without
// throwing, hold 14-16 Slots, every Slot exactly SLOT_LENGTH, and every crossing
// a single Cell shared by one across and one down Slot.

test('ships 2-3 authored shapes', () => {
  expect(SHAPES.length).toBeGreaterThanOrEqual(2);
  expect(SHAPES.length).toBeLessThanOrEqual(3);
});

test('every shape has a unique, non-empty id (a Puzzle link pairs with it)', () => {
  const ids = SHAPES.map((s) => s.id);
  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
});

test.each(SHAPES.map((s) => [s.id, s] as const))(
  'shape %s: derives, 14-16 Slots, all exactly six Cells',
  (_id, shape) => {
    const { slots } = deriveLayout(shape.grid); // throws on a malformed shape
    expect(slots.length).toBeGreaterThanOrEqual(14);
    expect(slots.length).toBeLessThanOrEqual(16);
    for (const s of slots) expect(s.cells.length).toBe(SLOT_LENGTH);
  },
);

test.each(SHAPES.map((s) => [s.id, s] as const))(
  'shape %s: every crossing is one across Slot meeting one down Slot at a shared Cell',
  (_id, shape) => {
    const { slots, crossings, cells } = deriveLayout(shape.grid);
    const cellKey = (c: { row: number; col: number }) => `${c.row},${c.col}`;
    const cellSet = new Set(cells.map(cellKey));
    expect(crossings.length).toBeGreaterThan(0);
    for (const x of crossings) {
      expect(cellSet.has(cellKey(x.cell))).toBe(true);
      const across = slots.find((s) => s.number === x.across && s.direction === 'across');
      const down = slots.find((s) => s.number === x.down && s.direction === 'down');
      expect(across).toBeDefined();
      expect(down).toBeDefined();
      // The shared Cell is carried by both Slots — that is what dual-role means.
      expect(across!.cells.map(cellKey)).toContain(cellKey(x.cell));
      expect(down!.cells.map(cellKey)).toContain(cellKey(x.cell));
    }
  },
);
