import { test, expect } from 'vitest';
import { SHAPES, SHAPE_BOUNDS } from './crossword-shapes.ts';
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

// C0FFEE-85 — loom-6 balances the grid: a third across rung along the bottom row, so
// the shape reads 3 across / 3 down and every rail's last Cell is an L-shaped join
// (the same weave language as the middle rung). The generic guards above cover it via
// test.each; these pin the balance itself.
test('loom-6 balances the grid: three across rungs, three down rails, nine crossings', () => {
  const loom = SHAPES.find((s) => s.id === 'loom-6');
  expect(loom).toBeDefined();
  const { slots, crossings } = deriveLayout(loom!.grid);
  expect(slots.filter((s) => s.direction === 'across').length).toBe(3);
  expect(slots.filter((s) => s.direction === 'down').length).toBe(3);
  expect(crossings.length).toBe(9);
});

// C0FFEE-85 / ADR-0009 amendment — a shape's aesthetic acceptance bounds live with its
// id and freeze with it. loom-6's nine crossings pin every across Slot's high nibbles in
// all three Channels, so some seeds realize a muddy palette; its declared bounds make
// the generator throw those boards back. lattice-6 shipped before bounds existed and is
// grandfathered bound-less — enforcing bounds on it would silently rewrite already-shared
// boards, exactly what ADR-0009 forbids.
test('acceptance bounds are declared with the shape id, loom-6 bounded, lattice-6 grandfathered', () => {
  expect(SHAPE_BOUNDS['loom-6']).toEqual({ maxHueGapDeg: 185, minVSpan: 0.15 });
  expect(SHAPE_BOUNDS['lattice-6']).toBeUndefined();
  // every declared bound names an authored shape (no orphan bounds)
  const ids = SHAPES.map((s) => s.id);
  for (const id of Object.keys(SHAPE_BOUNDS)) expect(ids).toContain(id);
});

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
