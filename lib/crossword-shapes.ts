// crossword-shapes.ts — the authored Hex Color crossword shapes the data v1
// plays on. Pure data (ADR-0003 functional core): each Shape is a grid of Cells
// (`#` = Cell, `.` = blank) that deriveLayout (crossword-layout.ts) turns into
// Slots, a Cell set, and crossings. Shape generation stays deferred to the
// generator slice (C0FFEE-60); these are fixed, hand-authored shapes.
//
// Every Slot holds a six-digit Hex color address, so every run is exactly six
// Cells. That rules out solid blocks (adjacent runs would merge into length-12),
// so each shape is a ladder: across "rungs" (a full six-Cell row) every fifth
// row, joined by length-6 down "rails" in mutually non-adjacent columns. Two
// rails in an otherwise-empty row must not touch, or they'd read as a stray
// short run — which deriveLayout rejects, and crossword-shapes.test.ts guards.
//
// A Shape's `id` is half of a Puzzle link (ADR-0009: a puzzle is shape-id +
// seed), so once a shape ships its id is frozen — renaming it breaks old links.

import type { Shape } from './crossword-layout.ts';

export const SHAPES: readonly Shape[] = [
  {
    id: 'ladder-14',
    grid: [
      '######',
      '#.#.#.',
      '#.#.#.',
      '#.#.#.',
      '#.#.#.',
      '######',
      '.#.#..',
      '.#.#..',
      '.#.#..',
      '.#.#..',
      '######',
      '#....#',
      '#....#',
      '#....#',
      '#....#',
      '######',
      '.#..#.',
      '.#..#.',
      '.#..#.',
      '.#..#.',
      '######',
    ],
  },
  {
    id: 'weave-15',
    grid: [
      '######',
      '#.#..#',
      '#.#..#',
      '#.#..#',
      '#.#..#',
      '######',
      '.#..#.',
      '.#..#.',
      '.#..#.',
      '.#..#.',
      '######',
      '#..#.#',
      '#..#.#',
      '#..#.#',
      '#..#.#',
      '######',
      '.#..#.',
      '.#..#.',
      '.#..#.',
      '.#..#.',
      '######',
    ],
  },
  {
    id: 'trellis-16',
    grid: [
      '######',
      '#....#',
      '#....#',
      '#....#',
      '#....#',
      '######',
      '.#..#.',
      '.#..#.',
      '.#..#.',
      '.#..#.',
      '######',
      '#....#',
      '#....#',
      '#....#',
      '#....#',
      '######',
      '.#..#.',
      '.#..#.',
      '.#..#.',
      '.#..#.',
      '######',
      '#....#',
      '#....#',
      '#....#',
      '#....#',
      '######',
    ],
  },
];
