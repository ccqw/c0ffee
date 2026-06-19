// crossword-layout.ts — the Hex Color crossword's layout core (ADR-0003:
// functional core / imperative shell). Pure derivation, no DOM and no color:
// an authored grid of Cells in, the derived Slots / Cell set / crossings out.
// The generator (C0FFEE-60) and the state reducer (C0FFEE-61) build on this;
// neither this module nor they touch the DOM.
//
// Domain (CONTEXT.md): a Cell is one grid square (one hex digit 0-F); a Slot is
// a straight run of Cells holding one color's Hex color address; a Cell shared
// by a crossing pair of Slots is dual-role. Because a Hex color address is six
// digits, every Slot is exactly SLOT_LENGTH Cells — the invariant that makes a
// length-4 or length-7 run a malformed Slot rather than a shorter/longer word.

/** A Slot holds one color's six-digit Hex color address, so it is exactly this
 *  many Cells long. The one length every Slot shares (CONTEXT.md: Slot). */
export const SLOT_LENGTH = 6;

/** The grid character that marks a Cell. Any other character (`.`, space) is a
 *  blank — the crossword's black square, which carries no Cell. */
const CELL = '#';

export type Direction = 'across' | 'down';

/** One grid square, addressed by zero-based row and column. */
export interface Cell {
  row: number;
  col: number;
}

/** A straight run of Cells (across or down) that holds one color's Hex color
 *  address. `number` is its standard crossword number; `cells` are ordered from
 *  the Slot's start to its end (left->right for across, top->bottom for down)
 *  and always number SLOT_LENGTH. */
export interface Slot {
  number: number;
  direction: Direction;
  cells: Cell[];
}

/** A crossing: the single Cell shared by a pair of Slots, naming the across and
 *  the down Slot that meet there. A crossing is always one across meeting one
 *  down — two Slots of the same direction can't overlap without merging into one
 *  run. The shared Cell is dual-role (CONTEXT.md: Cell). */
export interface Crossing {
  cell: Cell;
  across: number;
  down: number;
}

/** An authored crossword shape: a stable `id` plus the grid of Cells. The `id`
 *  is what a Puzzle link pairs with a seed (ADR-0009: a puzzle is shape-id +
 *  seed) — so it must stay stable once a shape ships, or old links break. */
export interface Shape {
  id: string;
  grid: string[];
}

/** The derived layout of an authored shape: every Slot, the full Cell set
 *  (row-major), and every crossing. */
export interface Layout {
  slots: Slot[];
  cells: Cell[];
  crossings: Crossing[];
}

// deriveLayout(grid) -> Layout
// Takes an authored grid (one string per row; `#` is a Cell, anything else a
// blank) and derives the Slots with standard crossword numbering, the full Cell
// set, and the crossings. Throws on a shape that can't hold valid Slots: a run
// that isn't exactly SLOT_LENGTH, or a Cell that belongs to no Slot — both are
// authoring mistakes, surfaced loudly rather than rendered as a broken puzzle.
export function deriveLayout(grid: string[]): Layout {
  const height = grid.length;
  const width = grid.reduce((w, row) => Math.max(w, row.length), 0);
  const filled = (row: number, col: number): boolean =>
    row >= 0 && row < height && col >= 0 && col < width && grid[row][col] === CELL;

  // Maximal-run length through each Cell in each direction. A run of length 1 is
  // a Cell that doesn't extend that way; only length-SLOT_LENGTH runs are Slots.
  const acrossLen = (row: number, col: number): number => {
    let start = col;
    while (filled(row, start - 1)) start--;
    let end = col;
    while (filled(row, end + 1)) end++;
    return end - start + 1;
  };
  const downLen = (row: number, col: number): number => {
    let start = row;
    while (filled(start - 1, col)) start--;
    let end = row;
    while (filled(end + 1, col)) end++;
    return end - start + 1;
  };

  // Validate every maximal run, and reject any Cell orphaned from all Slots.
  // (A length-1 run isn't a Slot; a 2..5 or 7+ run is a malformed Slot.)
  const cells: Cell[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!filled(row, col)) continue;
      cells.push({ row, col });
      const aLen = acrossLen(row, col);
      const dLen = downLen(row, col);
      const startsAcross = aLen > 1 && !filled(row, col - 1);
      const startsDown = dLen > 1 && !filled(row - 1, col);
      if (startsAcross && aLen !== SLOT_LENGTH) {
        throw new Error(
          `crossword-layout: across run at (${row},${col}) is ${aLen} Cells; a Slot must be exactly ${SLOT_LENGTH}`,
        );
      }
      if (startsDown && dLen !== SLOT_LENGTH) {
        throw new Error(
          `crossword-layout: down run at (${row},${col}) is ${dLen} Cells; a Slot must be exactly ${SLOT_LENGTH}`,
        );
      }
      if (aLen !== SLOT_LENGTH && dLen !== SLOT_LENGTH) {
        throw new Error(
          `crossword-layout: Cell (${row},${col}) is an orphan — it belongs to no Slot`,
        );
      }
    }
  }

  // Standard crossword numbering: scan row-major; a Cell that starts an across
  // Slot, a down Slot, or both takes the next number. A Cell starting both
  // shares one number across the two directions.
  const slots: Slot[] = [];
  let next = 1;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!filled(row, col)) continue;
      const startsAcross = acrossLen(row, col) === SLOT_LENGTH && !filled(row, col - 1);
      const startsDown = downLen(row, col) === SLOT_LENGTH && !filled(row - 1, col);
      if (!startsAcross && !startsDown) continue;
      const number = next++;
      if (startsAcross) {
        slots.push({
          number,
          direction: 'across',
          cells: Array.from({ length: SLOT_LENGTH }, (_, i) => ({ row, col: col + i })),
        });
      }
      if (startsDown) {
        slots.push({
          number,
          direction: 'down',
          cells: Array.from({ length: SLOT_LENGTH }, (_, i) => ({ row: row + i, col })),
        });
      }
    }
  }

  // A crossing is any Cell carried by both an across Slot and a down Slot.
  const acrossAt = slotIndexByCell(slots.filter((s) => s.direction === 'across'));
  const downAt = slotIndexByCell(slots.filter((s) => s.direction === 'down'));
  const crossings: Crossing[] = [];
  for (const { row, col } of cells) {
    const across = acrossAt.get(key(row, col));
    const down = downAt.get(key(row, col));
    if (across !== undefined && down !== undefined) {
      crossings.push({ cell: { row, col }, across, down });
    }
  }

  return { slots, cells, crossings };
}

// Maps each Cell key a set of Slots covers to that Slot's number, for the one
// direction the Slots share. Across and down are looked up separately, so a
// dual-role Cell resolves to its across number in one map and its down number
// in the other.
function slotIndexByCell(slots: Slot[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const s of slots) {
    for (const c of s.cells) index.set(key(c.row, c.col), s.number);
  }
  return index;
}

const key = (row: number, col: number): string => `${row},${col}`;
