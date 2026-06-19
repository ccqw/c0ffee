// crossword-state.ts — the Hex Color crossword's game-brain reducer (ADR-0003:
// functional core / imperative shell). A pure (state, action) -> state machine,
// no DOM and no time: the <c0ffee-crossword> shell (seam 4) holds one of these
// and dispatches actions; everything below is testable without a browser. Built
// on the layout (C0FFEE-58) and the grading rule (C0FFEE-59).
//
// Domain (CONTEXT.md): the solver selects a Slot, types a digit per Cell, and
// commits a Guess. Feedback is per Channel (crossword-guess): a correct Channel
// LOCKS its two Cells. Because a crossing Cell is shared (dual-role), locking it
// from one Slot's Channel makes it a known, locked digit of a DIFFERENT Channel
// in the crossing Slot — propagation is just the shared Cell, not extra logic.
// The puzzle is complete when every Cell is locked (every Channel of every Slot
// graded correct), and a Cell only ever locks by a correct-Channel commit, so
// "all locked" is the honest completion test.

import { gradeGuess, type GuessResult, type ChannelVerdict } from './crossword-guess.ts';
import { SLOT_LENGTH, type Cell, type Direction, type Layout, type Slot } from './crossword-layout.ts';

/** Names one Slot by its standard crossword number and direction (a number can
 *  name both an across and a down Slot, so direction disambiguates). */
export interface SlotRef {
  number: number;
  direction: Direction;
}

/** One Cell's play state: the digit the solver has typed (uppercase hex, or null
 *  when empty) and whether it is locked. A locked Cell holds its correct digit
 *  and can no longer be edited. */
export interface CellState {
  digit: string | null;
  locked: boolean;
}

/** Whether each Channel of a Slot is solved — both of the Channel's Cells locked
 *  (so graded correct). Derived after every action; never set by hand. */
export interface ChannelSolved {
  red: boolean;
  green: boolean;
  blue: boolean;
}

/** A playable puzzle: the derived `layout` plus one target Hex color address per
 *  Slot, keyed by `${number}-${direction}`. The generator (C0FFEE-60) produces
 *  the targets (crossing-consistent); the reducer treats them as the latent
 *  answers and never surfaces them in the URL (ADR-0001 is the Color link, not
 *  this). */
export interface Puzzle {
  layout: Layout;
  targets: Record<string, string>;
}

/** The full game state. `cells` is keyed by `${row},${col}` and `verdicts` /
 *  `solved` by `${number}-${direction}`. `complete` is true once every Cell is
 *  locked. */
export interface CrosswordState {
  puzzle: Puzzle;
  cells: Record<string, CellState>;
  selected: SlotRef | null;
  verdicts: Record<string, GuessResult | null>;
  solved: Record<string, ChannelSolved>;
  complete: boolean;
}

/** The actions the shell dispatches: pick the active Slot, type a digit into a
 *  Cell, commit the selected Slot's Guess, or start a fresh puzzle. */
export type CrosswordAction =
  | { type: 'select'; slot: SlotRef }
  | { type: 'setDigit'; cell: Cell; digit: string }
  | { type: 'commit' }
  | { type: 'newPuzzle'; puzzle: Puzzle };

// The three Channels and the Cell indices they occupy within a Slot's six Cells:
// red is the first hex pair, green the middle, blue the last — the same split
// parseHex makes of a six-digit address (CONTEXT.md: Channel).
const CHANNELS: ReadonlyArray<readonly [keyof GuessResult, number, number]> = [
  ['red', 0, 1],
  ['green', 2, 3],
  ['blue', 4, 5],
];

const cellKey = (cell: Cell): string => `${cell.row},${cell.col}`;
const slotKey = (ref: SlotRef): string => `${ref.number}-${ref.direction}`;
const isHexDigit = (ch: string): boolean => /^[0-9a-fA-F]$/.test(ch);

// initCrossword(puzzle) -> the fresh state for a puzzle: every Cell empty and
// unlocked, no Slot selected, nothing solved. Validates the puzzle up front —
// every Slot needs a target that parses to a six-digit color — so a generator
// bug surfaces loudly here rather than as a mis-grade mid-game.
export function initCrossword(puzzle: Puzzle): CrosswordState {
  for (const slot of puzzle.layout.slots) {
    const target = puzzle.targets[slotKey(slot)];
    // A target fills SLOT_LENGTH Cells one digit each, so it must be exactly six
    // hex digits — not parseHex's looser 3-digit shorthand, which would expand
    // and leave a Slot unsolvable. (A leading # is tolerated, as elsewhere.)
    if (typeof target !== 'string' || !/^#?[0-9a-fA-F]{6}$/.test(target)) {
      throw new Error(
        `crossword-state: Slot ${slotKey(slot)} has no valid six-digit target Hex color address: ${target}`,
      );
    }
  }

  const cells: Record<string, CellState> = {};
  for (const cell of puzzle.layout.cells) cells[cellKey(cell)] = { digit: null, locked: false };

  const verdicts: Record<string, GuessResult | null> = {};
  for (const slot of puzzle.layout.slots) verdicts[slotKey(slot)] = null;

  return finalize({ puzzle, cells, selected: null, verdicts, solved: {}, complete: false });
}

// crosswordReducer(state, action) -> next state. Pure: returns a new state for
// every change, and the same `state` reference for a no-op (an unselected or
// partial commit, a write to a locked Cell) so callers can skip needless work.
export function crosswordReducer(state: CrosswordState, action: CrosswordAction): CrosswordState {
  switch (action.type) {
    case 'newPuzzle':
      return initCrossword(action.puzzle);

    case 'select': {
      if (!findSlot(state.puzzle.layout, action.slot)) {
        throw new Error(`crossword-state: no Slot ${slotKey(action.slot)} in this puzzle`);
      }
      return { ...state, selected: action.slot };
    }

    case 'setDigit': {
      const cell = cellAt(state, action.cell);
      if (!isHexDigit(action.digit)) {
        throw new Error(`crossword-state: '${action.digit}' is not a hex digit (0-9, A-F)`);
      }
      if (cell.locked) return state; // a locked Cell holds its correct digit; ignore edits
      const key = cellKey(action.cell);
      const cells = { ...state.cells, [key]: { ...cell, digit: action.digit.toUpperCase() } };
      return finalize({ ...state, cells });
    }

    case 'commit': {
      if (!state.selected) return state;
      const slot = findSlot(state.puzzle.layout, state.selected);
      if (!slot) return state;
      const digits = slot.cells.map((c) => cellAt(state, c).digit);
      if (digits.some((d) => d === null)) return state; // can't grade a partial Guess
      const result = gradeGuess(state.puzzle.targets[slotKey(state.selected)], digits.join(''));

      // Lock both Cells of every Channel that graded correct. A shared Cell so
      // locked is, by its coordinate, the same Cell in the crossing Slot — that
      // is the dual-role propagation, with no extra step.
      const cells = { ...state.cells };
      for (const [channel, i, j] of CHANNELS) {
        if (result[channel] !== ('correct' satisfies ChannelVerdict)) continue;
        for (const idx of [i, j]) {
          const key = cellKey(slot.cells[idx]);
          cells[key] = { ...cells[key], locked: true };
        }
      }
      const verdicts = { ...state.verdicts, [slotKey(state.selected)]: result };
      return finalize({ ...state, cells, verdicts });
    }
  }
}

// finalize(state) -> state with `solved` and `complete` recomputed from the
// locked Cells, the single source of truth. A Channel is solved when both its
// Cells are locked; the puzzle is complete when every Cell is locked (since a
// Cell locks only on a correct-Channel commit, that is exactly "every Channel of
// every Slot correct").
function finalize(state: CrosswordState): CrosswordState {
  const solved: Record<string, ChannelSolved> = {};
  for (const slot of state.puzzle.layout.slots) {
    const lockedAt = (idx: number): boolean => cellAt(state, slot.cells[idx]).locked;
    solved[slotKey(slot)] = {
      red: lockedAt(0) && lockedAt(1),
      green: lockedAt(2) && lockedAt(3),
      blue: lockedAt(4) && lockedAt(5),
    };
  }
  const complete = Object.values(state.cells).every((c) => c.locked);
  return { ...state, solved, complete };
}

function findSlot(layout: Layout, ref: SlotRef): Slot | undefined {
  return layout.slots.find((s) => s.number === ref.number && s.direction === ref.direction);
}

// The one Cell accessor. Throws with domain context for a Cell that isn't in the
// grid, so the layout-cells-cover-every-Slot-Cell invariant fails loud (and
// consistently) wherever it is read — not as a bare TypeError deep in `commit`.
function cellAt(state: CrosswordState, cell: Cell): CellState {
  const cs = state.cells[cellKey(cell)];
  if (!cs) throw new Error(`crossword-state: no Cell at (${cell.row},${cell.col})`);
  return cs;
}

// Re-export so the shell can size its keypad/grid to the one Slot length without
// reaching back into the layout module.
export { SLOT_LENGTH };
