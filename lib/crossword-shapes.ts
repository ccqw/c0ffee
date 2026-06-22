// crossword-shapes.ts — the authored Hex Color crossword shapes the data v1 plays
// on. Pure data (ADR-0003 functional core): each Shape is a grid of Cells (`#` =
// Cell, `.` = blank) that deriveLayout (crossword-layout.ts) turns into Slots, a
// Cell set, and crossings. Shape generation stays deferred to the generator slice
// (C0FFEE-60); these are fixed, hand-authored shapes.
//
// Every Slot holds a six-digit Hex color address, so every run is exactly six Cells.
//
// COMPACT and SQUARE (C0FFEE-64 design review): a shape is a single 6x6 block, not a
// tall ladder — so the whole board fits a mobile screen beside the clue list and dock,
// no long scroll.
//
// EVEN-ALIGNED — the constraint that makes the woven board read as words. The face's
// basket-weave (elements/crossword.ts: weaveCell) pairs Cells by GRID parity: a Cell
// at an even column opens rightward into its neighbour, a Cell at an even row opens
// downward. For those visual pairs to coincide with the Channel digit-pairs a Slot is
// graded on ([0,1]=red, [2,3]=green, [4,5]=blue), every across Slot must START at an
// even column and every down Slot at an even row. A Slot that starts on an odd parity
// weaves its Cells across the Channel boundaries instead of along them — which is what
// made the earlier tall ladders look like broken, illegal shapes. crossword-shapes.test.ts
// guards this; deriveLayout (which is weave-agnostic, pure structure) does not.
//
// A Shape's `id` is half of a Puzzle link (ADR-0009: a puzzle is shape-id + seed), so
// once a shape ships its id is frozen — renaming it breaks old links.

import type { Shape } from './crossword-layout.ts';

export const SHAPES: readonly Shape[] = [
  {
    // The canonical compact crossword: a 6x6 lattice of two across rungs (rows 0, 3)
    // woven through three down rails (cols 0, 2, 4) — five interlocking Slots, every
    // start on an even parity. This is the prototype's reference grid
    // (docs/design/crossword-face/prototype), confirmed in the C0FFEE-64 design review.
    id: 'lattice-6',
    grid: [
      '######',
      '#.#.#.',
      '#.#.#.',
      '######',
      '#.#.#.',
      '#.#.#.',
    ],
  },
];
