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
import { SLOT_LENGTH, type Cell, type Direction, type Layout, type Puzzle, type Slot } from './crossword-layout.ts';

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

/** One Cell's part of an undoable Step: the digit it held before the edit and
 *  the digit the edit wrote (null = empty either way). */
export interface CellPatch {
  cell: Cell;
  before: string | null;
  after: string | null;
}

/** One undoable edit (CONTEXT.md: Undo): a setDigit/clearDigit is a one-patch
 *  Step; a restore is one grouped Step covering its whole Slot. `slot` is the
 *  Slot the solver was working when the edit happened — undo/redo re-select it,
 *  so cross-Slot recovery is always visible. */
export interface Step {
  slot: SlotRef;
  patches: CellPatch[];
}

/** The full game state. `cells` is keyed by `${row},${col}` and `verdicts` /
 *  `solved` / `graded` by `${number}-${direction}`. `complete` is true once
 *  every Cell is locked. `graded` pins each Slot's last-graded six digits (the
 *  receipt referent, C0FFEE-71 — recorded by `commit`, read by `restore`).
 *  `undo` / `redo` are the edit history (C0FFEE-70): patch-based, never
 *  snapshots, so a lock is never revertable — commit prunes patches on
 *  now-locked Cells, keeping every stacked Step fully applicable (enabled =
 *  stack non-empty = the tap visibly changes the board). */
export interface CrosswordState {
  puzzle: Puzzle;
  cells: Record<string, CellState>;
  selected: SlotRef | null;
  verdicts: Record<string, GuessResult | null>;
  solved: Record<string, ChannelSolved>;
  graded: Record<string, string>;
  undo: Step[];
  redo: Step[];
  complete: boolean;
}

/** The actions the shell dispatches: pick the active Slot, type a digit into a
 *  Cell, clear a Cell's digit, commit the selected Slot's Guess, step the edit
 *  history back/forward, put the selected Slot's graded digits back, or start
 *  a fresh puzzle. */
export type CrosswordAction =
  | { type: 'select'; slot: SlotRef }
  | { type: 'setDigit'; cell: Cell; digit: string }
  | { type: 'clearDigit'; cell: Cell }
  | { type: 'commit' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'restore' }
  | { type: 'newPuzzle'; puzzle: Puzzle };

// The three Channels and the Cell indices they occupy within a Slot's six Cells:
// red is the first hex pair, green the middle, blue the last — the same split
// parseHex makes of a six-digit address (CONTEXT.md: Channel).
const CHANNELS: ReadonlyArray<readonly [keyof GuessResult, number, number]> = [
  ['red', 0, 1],
  ['green', 2, 3],
  ['blue', 4, 5],
];

/** The canonical key encoders, the single source of truth for how a Cell and a
 *  Slot serialize. `cells` is keyed by `cellKey` and `verdicts`/`solved` by
 *  `slotKey`, so the shell MUST reuse these (not re-derive the format) or its
 *  `state.cells[...]` lookups would silently drift from what the reducer indexes
 *  by. Exported for exactly that reason (C0FFEE-65). */
export const cellKey = (cell: Cell): string => `${cell.row},${cell.col}`;
export const slotKey = (ref: SlotRef): string => `${ref.number}-${ref.direction}`;
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

  return finalize({
    puzzle,
    cells,
    selected: null,
    verdicts,
    solved: {},
    graded: {},
    undo: [],
    redo: [],
    complete: false,
  });
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
      const digit = action.digit.toUpperCase();
      // Writing the digit the Cell already holds is a no-op — and MUST be (C0FFEE-70):
      // a phantom Step whose undo changes nothing would break "an enabled key always
      // visibly acts" (enabled is exactly stack-non-empty).
      if (cell.digit === digit) return state;
      const key = cellKey(action.cell);
      const cells = { ...state.cells, [key]: { ...cell, digit } };
      return finalize(
        pushStep(state, cells, {
          slot: slotContext(state, action.cell),
          patches: [{ cell: action.cell, before: cell.digit, after: digit }],
        }),
      );
    }

    case 'clearDigit': {
      const cell = cellAt(state, action.cell); // fail-loud on an off-grid Cell, like setDigit
      if (cell.locked) return state; // a locked Cell holds its correct digit; ignore clears
      if (cell.digit === null) return state; // already empty — nothing to clear
      const key = cellKey(action.cell);
      const cells = { ...state.cells, [key]: { ...cell, digit: null } };
      // Re-finalize for symmetry with setDigit; clearing an unlocked Cell can never
      // change `solved`/`complete` (those read locks, not digits), but routing through
      // the one chokepoint keeps the no-drift guarantee structural, not incidental.
      return finalize(
        pushStep(state, cells, {
          slot: slotContext(state, action.cell),
          patches: [{ cell: action.cell, before: cell.digit, after: null }],
        }),
      );
    }

    case 'undo':
      return applyStep(state, 'undo');

    case 'redo':
      return applyStep(state, 'redo');

    case 'restore': {
      if (!state.selected) return state;
      const slot = findSlot(state.puzzle.layout, state.selected);
      const graded = state.graded[slotKey(state.selected)];
      if (!slot || !graded) return state; // nothing graded — nothing to restore
      // Patch every unlocked Cell that diverges from the graded referent. Locked Cells
      // already hold their graded digit (a Cell only locks when its Channel graded
      // correct), so skipping them loses nothing.
      const patches: CellPatch[] = [];
      slot.cells.forEach((cell, i) => {
        const cs = cellAt(state, cell);
        if (!cs.locked && cs.digit !== graded[i]) {
          patches.push({ cell, before: cs.digit, after: graded[i] });
        }
      });
      if (patches.length === 0) return state; // already at the referent — no phantom Step
      const cells = { ...state.cells };
      for (const p of patches) cells[cellKey(p.cell)] = { ...cells[cellKey(p.cell)], digit: p.after };
      // ONE grouped Step: the whole Slot comes back together, and one undo takes it
      // back out together (CONTEXT.md: Restore).
      return finalize(pushStep(state, cells, { slot: state.selected, patches }));
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
      // Pin the receipt referent: these are exactly the six digits this verdict graded
      // (C0FFEE-71) — the one source of truth `restore` and the receipt's diverged
      // predicate read.
      const graded = { ...state.graded, [slotKey(state.selected)]: digits.join('') };
      // Lock-death pruning (C0FFEE-70): a commit is not undoable, so history that the
      // new locks have overtaken quietly ages out. Locks never unlock, so pruning once
      // is final — every surviving Step stays fully applicable. Commit clears nothing
      // else (it edits no digits), so redo survives a commit — pruned, like undo.
      const lockedNow = (p: CellPatch): boolean => cells[cellKey(p.cell)].locked;
      const prune = (steps: Step[]): Step[] =>
        steps
          .map((s) => ({ ...s, patches: s.patches.filter((p) => !lockedNow(p)) }))
          .filter((s) => s.patches.length > 0);
      return finalize({
        ...state,
        cells,
        verdicts,
        graded,
        undo: prune(state.undo),
        redo: prune(state.redo),
      });
    }
  }
}

// The next state after an edit Step: the rewritten cells land, the Step goes onto the
// undo stack, and the redo stack drops — a fresh edit abandons the redoable fork
// (CONTEXT.md: Undo, "a fresh edit forks the timeline").
function pushStep(state: CrosswordState, cells: Record<string, CellState>, step: Step): CrosswordState {
  return { ...state, cells, undo: [...state.undo, step], redo: [] };
}

// Pop the top Step off one history stack, write its `before` (undo) / `after` (redo)
// digits back, and move it to the opposite stack. Re-selects the Step's Slot so the
// solver returns to where the edit happened; the shell parks the cursor on the changed
// Cell. Pruning-at-commit guarantees every stacked patch's Cell is unlocked — but that
// is a proof obligation on every future action, so it is enforced here fail-loud (the
// cellAt convention) rather than trusted: a locked target means some action locked
// Cells without pruning, and silently overwriting an earned digit is the one thing
// this feature must never do. Empty stack -> the same reference (the no-op convention).
function applyStep(state: CrosswordState, dir: 'undo' | 'redo'): CrosswordState {
  const from = state[dir];
  const step = from[from.length - 1];
  if (!step) return state;
  const cells = { ...state.cells };
  for (const p of step.patches) {
    const cs = cellAt(state, p.cell); // fail-loud on an off-grid Cell, like setDigit
    if (cs.locked) {
      throw new Error(
        `crossword-state: ${dir} Step targets locked Cell (${p.cell.row},${p.cell.col}) — history was not pruned at commit`,
      );
    }
    cells[cellKey(p.cell)] = { ...cs, digit: dir === 'undo' ? p.before : p.after };
  }
  const rest = from.slice(0, -1);
  const onto = [...state[dir === 'undo' ? 'redo' : 'undo'], step];
  return finalize({
    ...state,
    cells,
    selected: step.slot,
    undo: dir === 'undo' ? rest : onto,
    redo: dir === 'undo' ? onto : rest,
  });
}

// The Slot context an edit Step records: the selected Slot when the edited Cell is
// one of its Cells (the Slot the solver was actually working — how a dual-role Cell
// resolves), else the Cell's own Slot (across preferred, mirroring the shell's tap
// rule) so a direct reducer drive without a selection still yields a re-selectable
// Step. Every grid Cell belongs to at least one Slot (the layout invariant).
function slotContext(state: CrosswordState, cell: Cell): SlotRef {
  const { layout } = state.puzzle;
  const holds = (s: Slot): boolean => s.cells.some((c) => c.row === cell.row && c.col === cell.col);
  if (state.selected) {
    const sel = findSlot(layout, state.selected);
    if (sel && holds(sel)) return state.selected;
  }
  const here = layout.slots.filter(holds);
  const pick = here.find((s) => s.direction === 'across') ?? here[0];
  return { number: pick.number, direction: pick.direction };
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
// reaching back into the layout module. `Puzzle` moved down into crossword-layout
// (it is just Layout + targets) and is re-exported here so existing importers of
// `Puzzle` from this module keep working (C0FFEE-60, decision 4).
export { SLOT_LENGTH };
export type { Puzzle };
