import { test, expect } from 'vitest';
import { SHAPES } from './crossword-shapes.ts';
import { deriveLayout, SLOT_LENGTH } from './crossword-layout.ts';

// The data v1 shapes must each be a valid, COMPACT Hex Color crossword: derive without
// throwing, fit a square 6x6 (so the board fits a mobile screen), every Slot exactly
// SLOT_LENGTH, every crossing a single Cell shared by one across and one down Slot, and
// every Slot start on an even parity so the board's basket-weave pairs along the Channel
// digit-pairs rather than across them (the C0FFEE-64 design-review constraint).

test('ships at least one authored shape', () => {
  expect(SHAPES.length).toBeGreaterThanOrEqual(1);
});

test('every shape has a unique, non-empty id (a Puzzle link pairs with it)', () => {
  const ids = SHAPES.map((s) => s.id);
  expect(ids.every((id) => id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
});

test.each(SHAPES.map((s) => [s.id, s] as const))(
  'shape %s: a compact 6x6, derives, every Slot exactly six Cells',
  (_id, shape) => {
    // square and compact: 6 rows, each 6 columns wide (fits a mobile screen)
    expect(shape.grid.length).toBe(SLOT_LENGTH);
    for (const row of shape.grid) expect(row.length).toBe(SLOT_LENGTH);
    const { slots } = deriveLayout(shape.grid); // throws on a malformed shape
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(s.cells.length).toBe(SLOT_LENGTH);
  },
);

test.each(SHAPES.map((s) => [s.id, s] as const))(
  'shape %s: every Slot starts on an even parity (weave pairs land on Channel digit-pairs)',
  (_id, shape) => {
    const { slots } = deriveLayout(shape.grid);
    for (const slot of slots) {
      const start = slot.cells[0];
      // across pairs by column parity, down by row parity (elements/crossword.ts weaveCell)
      const startParity = slot.direction === 'across' ? start.col : start.row;
      expect(startParity % 2, `Slot ${slot.number}-${slot.direction} starts even`).toBe(0);
    }
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
