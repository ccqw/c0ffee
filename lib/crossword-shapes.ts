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
// once a shape ships its id is frozen — renaming it breaks old links. The shape the
// game DEALS is the shell's DEFAULT_SHAPE (elements/crossword.ts): loom-6 since
// C0FFEE-85; earlier shapes stay authored purely so old links keep resolving.

import type { Shape } from './crossword-layout.ts';

export const SHAPES: readonly Shape[] = [
  {
    // The original compact crossword: a 6x6 lattice of two across rungs (rows 0, 3)
    // woven through three down rails (cols 0, 2, 4) — five interlocking Slots, every
    // start on an even parity. This is the prototype's reference grid
    // (docs/design/crossword-face/prototype), confirmed in the C0FFEE-64 design review.
    // Superseded as the dealt default by loom-6 (C0FFEE-85) but stays authored: its id
    // is half of every already-shared Puzzle link, and those must keep reproducing
    // byte-identical boards (ADR-0009).
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
  {
    // The balanced grid the game deals since C0FFEE-85: lattice-6 with a third across
    // rung along the bottom row, so the shape reads 3 across / 3 down (six Slots, nine
    // crossings) and each rail's last Cell joins the bottom rung as a little L — the
    // same weave language as the middle rung. Caitlin's ask while eyeballing C0FFEE-83:
    // "as many across as there are down".
    id: 'loom-6',
    grid: [
      '######',
      '#.#.#.',
      '#.#.#.',
      '######',
      '#.#.#.',
      '######',
    ],
  },
];

/** The aesthetic acceptance bounds a shape's dealt boards must meet: the widest
 *  allowed empty hue arc (degrees) and the minimum lightness (HSV V) span across the
 *  realized targets. The generator's attempt loop re-plans any filled board outside
 *  its shape's bounds ("throw back muddy boards"). */
export interface ShapeBounds {
  maxHueGapDeg: number;
  minVSpan: number;
}

// Bounds live HERE, beside the ids, because they are part of a shape's frozen identity
// (ADR-0009, 2026-07-09 amendment): (shapeId, seed) -> Puzzle is a shipped contract, and
// the acceptance loop changes which board a seed yields, so a shape's bounds — including
// their absence — are now-or-never, fixed the day the shape ships. loom-6 needs them:
// its nine crossings pin every across Slot's high nibble in all three Channels, and
// unbounded that collapses some palettes (measured over a 2,400-seed sweep: 15.6% of
// seeds over a 185-degree hue gap, 1.3% under 0.15 V span; lattice-6 baseline 0.2%/0%).
// lattice-6 shipped before bounds existed and is GRANDFATHERED bound-less — no entry —
// so every already-shared board stays byte-identical.
export const SHAPE_BOUNDS: Readonly<Record<string, ShapeBounds>> = {
  'loom-6': { maxHueGapDeg: 185, minVSpan: 0.15 },
};
