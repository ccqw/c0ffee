import { test, expect } from 'vitest';
import { deriveLayout, SLOT_LENGTH, type Layout } from './crossword-layout.ts';

// The Hex Color crossword's layout core (ADR-0003 functional core): an authored
// grid of Cells in -> derived Slots, Cell set, and crossings out. No DOM, no
// color, no Guess. A Slot holds one color's six-digit Hex color address, so every
// derived Slot is exactly SLOT_LENGTH (6) Cells (CONTEXT.md: Slot / Cell).

// The "ring" — a hollow 6x6 square. Hand-verifiable: four length-6 Slots
// (1-Across, 1-Down, 2-Down, 3-Across) meeting at the four corner Cells.
const RING = [
  '######',
  '#....#',
  '#....#',
  '#....#',
  '#....#',
  '######',
];

const slot = (layout: Layout, number: number, direction: 'across' | 'down') =>
  layout.slots.find((s) => s.number === number && s.direction === direction);

test('SLOT_LENGTH is 6 — a Slot holds a six-digit Hex color address', () => {
  expect(SLOT_LENGTH).toBe(6);
});

test('ring: derives exactly four length-6 Slots', () => {
  const { slots } = deriveLayout(RING);
  expect(slots.length).toBe(4);
  for (const s of slots) expect(s.cells.length).toBe(SLOT_LENGTH);
});

test('ring: standard crossword numbering (1-Across, 1-Down, 2-Down, 3-Across)', () => {
  const layout = deriveLayout(RING);
  // (0,0) starts both an across and a down Slot -> shares the number 1.
  expect(slot(layout, 1, 'across')?.cells[0]).toEqual({ row: 0, col: 0 });
  expect(slot(layout, 1, 'down')?.cells[0]).toEqual({ row: 0, col: 0 });
  // (0,5) starts only a down Slot -> 2; (5,0) starts only an across Slot -> 3.
  expect(slot(layout, 2, 'down')?.cells[0]).toEqual({ row: 0, col: 5 });
  expect(slot(layout, 3, 'across')?.cells[0]).toEqual({ row: 5, col: 0 });
  // No 2-Across / 3-Down: the interior Cells never start a Slot.
  expect(slot(layout, 2, 'across')).toBeUndefined();
  expect(slot(layout, 3, 'down')).toBeUndefined();
});

test('ring: a Slot carries its Cells in reading order (start -> end)', () => {
  const layout = deriveLayout(RING);
  expect(slot(layout, 1, 'across')?.cells).toEqual([
    { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 },
    { row: 0, col: 3 }, { row: 0, col: 4 }, { row: 0, col: 5 },
  ]);
  expect(slot(layout, 2, 'down')?.cells).toEqual([
    { row: 0, col: 5 }, { row: 1, col: 5 }, { row: 2, col: 5 },
    { row: 3, col: 5 }, { row: 4, col: 5 }, { row: 5, col: 5 },
  ]);
});

test('ring: the full Cell set is the 20 border Cells, row-major', () => {
  const { cells } = deriveLayout(RING);
  expect(cells.length).toBe(20); // 6x6 perimeter
  expect(cells[0]).toEqual({ row: 0, col: 0 });
  expect(cells[cells.length - 1]).toEqual({ row: 5, col: 5 });
  // The hollow interior carries no Cell.
  expect(cells).not.toContainEqual({ row: 2, col: 2 });
});

test('ring: four corner crossings, each naming its one shared Cell and two Slots', () => {
  const { crossings } = deriveLayout(RING);
  expect(crossings.length).toBe(4);
  expect(crossings).toContainEqual({ cell: { row: 0, col: 0 }, across: 1, down: 1 });
  expect(crossings).toContainEqual({ cell: { row: 0, col: 5 }, across: 1, down: 2 });
  expect(crossings).toContainEqual({ cell: { row: 5, col: 0 }, across: 3, down: 1 });
  expect(crossings).toContainEqual({ cell: { row: 5, col: 5 }, across: 3, down: 2 });
});

test('a crossing is always one across Slot meeting one down Slot', () => {
  const { crossings, slots } = deriveLayout(RING);
  const byNumDir = (n: number, d: 'across' | 'down') =>
    slots.some((s) => s.number === n && s.direction === d);
  for (const x of crossings) {
    expect(byNumDir(x.across, 'across')).toBe(true);
    expect(byNumDir(x.down, 'down')).toBe(true);
  }
});

// --- malformed shapes: an authored grid that can't hold valid Slots is rejected ---

test('rejects a run that is not exactly six Cells (no Slot can hold it)', () => {
  // A length-4 across run cannot hold a six-digit Hex color address.
  expect(() => deriveLayout(['####'])).toThrow(/6|six/i);
});

test('rejects a run longer than six Cells', () => {
  expect(() => deriveLayout(['#######'])).toThrow(/6|six/i);
});

test('rejects an orphan Cell that belongs to no Slot', () => {
  // A lone Cell with no length-6 run through it in either direction.
  expect(() => deriveLayout([
    '######',
    '......',
    '..#...',
  ])).toThrow(/orphan|belongs|no Slot/i);
});

test('treats any non-hash character as a blank Cell', () => {
  // A row of spaces/dots around a length-6 run still derives one across Slot.
  const { slots } = deriveLayout(['.######.']);
  expect(slots.length).toBe(1);
  expect(slots[0]).toMatchObject({ number: 1, direction: 'across' });
  expect(slots[0].cells[0]).toEqual({ row: 0, col: 1 });
});
