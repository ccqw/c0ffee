import { test, expect, describe } from 'vitest';
import { deriveLayout, type Slot } from './crossword-layout.ts';
import { initCrossword, crosswordReducer, type Puzzle, type SlotRef } from './crossword-state.ts';

// A small interlocking fixture (the design doc's frozen sample, renumbered to
// what deriveLayout's standard numbering actually assigns):
//   1-Across (row 0, cols 0-5)  target 3A7BD5
//   1-Down   (col 0, rows 0-5)  target 3C9F6E   shares Cell (0,0) = '3'
//   2-Across (row 3, cols 0-5)  target FA8C00   shares Cell (3,0) = 'F'
// The shared Cell (3,0) is dual-role: 1-Down's green-low digit (index 3 of 9F)
// and 2-Across's red-high digit (index 0 of FA) - same value 'F', two Channels.
const GRID = ['######', '#.....', '#.....', '######', '#.....', '#.....'];
const LAYOUT = deriveLayout(GRID);
const TARGETS: Record<string, string> = {
  '1-across': '3A7BD5',
  '1-down': '3C9F6E',
  '2-across': 'FA8C00',
};
const PUZZLE: Puzzle = { layout: LAYOUT, targets: TARGETS };

const ONE_ACROSS: SlotRef = { number: 1, direction: 'across' };
const ONE_DOWN: SlotRef = { number: 1, direction: 'down' };
const TWO_ACROSS: SlotRef = { number: 2, direction: 'across' };

const slotOf = (ref: SlotRef): Slot =>
  LAYOUT.slots.find((s) => s.number === ref.number && s.direction === ref.direction)!;

// Type a whole Hex color address into a Slot's six Cells, left/top to right/end,
// skipping Cells that are already locked (setDigit ignores them anyway).
function fill(state: ReturnType<typeof initCrossword>, ref: SlotRef, hex: string) {
  let next = state;
  slotOf(ref).cells.forEach((cell, i) => {
    next = crosswordReducer(next, { type: 'setDigit', cell, digit: hex[i] });
  });
  return next;
}

const select = (s: ReturnType<typeof initCrossword>, slot: SlotRef) =>
  crosswordReducer(s, { type: 'select', slot });
const commit = (s: ReturnType<typeof initCrossword>) => crosswordReducer(s, { type: 'commit' });

describe('initial state', () => {
  test('every Cell starts empty and unlocked, nothing selected or complete', () => {
    const s = initCrossword(PUZZLE);
    expect(s.selected).toBe(null);
    expect(s.complete).toBe(false);
    expect(s.cells['0,0']).toEqual({ digit: null, locked: false });
    expect(s.cells['3,0']).toEqual({ digit: null, locked: false });
    // a Cell exists for every Cell the layout derives, and no others.
    expect(Object.keys(s.cells).length).toBe(LAYOUT.cells.length);
  });
});

describe('select + setDigit', () => {
  test('select sets the active Slot', () => {
    const s = select(initCrossword(PUZZLE), ONE_ACROSS);
    expect(s.selected).toEqual(ONE_ACROSS);
  });

  test('setDigit writes a Cell, normalised to uppercase', () => {
    const s = crosswordReducer(initCrossword(PUZZLE), {
      type: 'setDigit',
      cell: { row: 0, col: 0 },
      digit: 'a',
    });
    expect(s.cells['0,0'].digit).toBe('A');
  });

  test('setDigit on a locked Cell is ignored', () => {
    let s = select(initCrossword(PUZZLE), ONE_ACROSS);
    s = commit(fill(s, ONE_ACROSS, '3A0000')); // red 3A correct -> (0,0),(0,1) lock
    const locked = s.cells['0,0'];
    expect(locked.locked).toBe(true);
    const after = crosswordReducer(s, { type: 'setDigit', cell: { row: 0, col: 0 }, digit: '9' });
    expect(after.cells['0,0']).toEqual(locked); // unchanged, still '3'
  });
});

describe('clearDigit', () => {
  test('clears an unlocked Cell back to empty', () => {
    let s = crosswordReducer(initCrossword(PUZZLE), {
      type: 'setDigit',
      cell: { row: 0, col: 0 },
      digit: 'A',
    });
    expect(s.cells['0,0'].digit).toBe('A');
    s = crosswordReducer(s, { type: 'clearDigit', cell: { row: 0, col: 0 } });
    expect(s.cells['0,0']).toEqual({ digit: null, locked: false });
  });

  test('clearing an already-empty Cell is a harmless no-op (still empty)', () => {
    const s = initCrossword(PUZZLE);
    const after = crosswordReducer(s, { type: 'clearDigit', cell: { row: 0, col: 0 } });
    expect(after.cells['0,0']).toEqual({ digit: null, locked: false });
  });

  test('refuses to clear a locked Cell — it holds its correct digit', () => {
    let s = select(initCrossword(PUZZLE), ONE_ACROSS);
    s = commit(fill(s, ONE_ACROSS, '3A0000')); // red 3A correct -> (0,0),(0,1) lock
    const locked = s.cells['0,0'];
    expect(locked.locked).toBe(true);
    const after = crosswordReducer(s, { type: 'clearDigit', cell: { row: 0, col: 0 } });
    expect(after.cells['0,0']).toEqual(locked); // unchanged, still locked '3'
  });

  test('re-finalizes: clearing never un-completes a puzzle (completion is read off locks, not digits)', () => {
    // Solve everything, then clear a (now locked) Cell: clearDigit no-ops on locks, so
    // complete stays true — the proof that finalize reads locks, not the digit touched.
    let s = initCrossword(PUZZLE);
    s = commit(fill(select(s, ONE_ACROSS), ONE_ACROSS, '3A7BD5'));
    s = commit(fill(select(s, ONE_DOWN), ONE_DOWN, '3C9F6E'));
    s = commit(fill(select(s, TWO_ACROSS), TWO_ACROSS, 'FA8C00'));
    expect(s.complete).toBe(true);
    const after = crosswordReducer(s, { type: 'clearDigit', cell: { row: 0, col: 0 } });
    expect(after.complete).toBe(true); // locked Cell untouched; completion holds
  });

  test('clearDigit rejects a Cell that is not in the grid (fail-loud, like setDigit)', () => {
    const s = initCrossword(PUZZLE);
    expect(() =>
      crosswordReducer(s, { type: 'clearDigit', cell: { row: 9, col: 9 } }),
    ).toThrow();
  });
});

describe('commit: per-Channel grading + locking', () => {
  test('a correct red Channel locks both its Cells; wrong Channels do not lock', () => {
    let s = select(initCrossword(PUZZLE), ONE_ACROSS);
    s = commit(fill(s, ONE_ACROSS, '3A0000')); // red 3A correct; green/blue wrong
    expect(s.cells['0,0'].locked).toBe(true); // red high digit
    expect(s.cells['0,1'].locked).toBe(true); // red low digit
    expect(s.cells['0,2'].locked).toBe(false); // green untouched
    expect(s.cells['0,4'].locked).toBe(false); // blue untouched
  });

  test('the commit records a per-Channel verdict (higher/lower/correct)', () => {
    let s = select(initCrossword(PUZZLE), ONE_ACROSS);
    s = commit(fill(s, ONE_ACROSS, '3A0000'));
    // target 3A7BD5 vs guess 3A0000: red equal, green 00<7B, blue 00<D5.
    expect(s.verdicts['1-across']).toEqual({ red: 'correct', green: 'higher', blue: 'higher' });
  });

  test('per-Slot per-Channel solved status reflects locked Cells', () => {
    let s = select(initCrossword(PUZZLE), ONE_ACROSS);
    s = commit(fill(s, ONE_ACROSS, '3A0000'));
    expect(s.solved['1-across']).toEqual({ red: true, green: false, blue: false });
  });
});

describe('dual-role propagation across a crossing', () => {
  test("solving one Slot's Channel locks the shared Cell in the crossing Slot's other Channel", () => {
    let s = select(initCrossword(PUZZLE), ONE_DOWN);
    // guess 009F00 on 1-Down: green 9F correct (cells (2,0),(3,0)); red/blue wrong.
    s = commit(fill(s, ONE_DOWN, '009F00'));
    expect(s.solved['1-down'].green).toBe(true);
    expect(s.solved['1-down'].red).toBe(false);
    expect(s.cells['3,0'].locked).toBe(true);
    expect(s.cells['3,0'].digit).toBe('F');

    // (3,0) is 2-Across's red high digit (index 0). It now reads locked there,
    // in a DIFFERENT Channel than the green Channel that solved it.
    const twoAcrossRedHigh = slotOf(TWO_ACROSS).cells[0];
    expect(twoAcrossRedHigh).toEqual({ row: 3, col: 0 });
    expect(s.cells['3,0'].locked).toBe(true);
    // but 2-Across's red is not solved: only one of its two Cells is locked.
    expect(s.solved['2-across'].red).toBe(false);
    expect(s.complete).toBe(false);
  });
});

describe('completion', () => {
  test('fires only when every Channel of every Slot is correct - not before', () => {
    let s = initCrossword(PUZZLE);

    s = commit(fill(select(s, ONE_ACROSS), ONE_ACROSS, '3A7BD5'));
    expect(s.complete).toBe(false); // 1-Down and 2-Across still open

    s = commit(fill(select(s, ONE_DOWN), ONE_DOWN, '3C9F6E'));
    expect(s.complete).toBe(false); // 2-Across still open

    s = commit(fill(select(s, TWO_ACROSS), TWO_ACROSS, 'FA8C00'));
    expect(s.complete).toBe(true); // every Cell now locked
  });
});

describe('newPuzzle', () => {
  test('resets the grid, selection, verdicts and completion', () => {
    let s = select(initCrossword(PUZZLE), ONE_ACROSS);
    s = commit(fill(s, ONE_ACROSS, '3A7BD5'));
    s = crosswordReducer(s, { type: 'newPuzzle', puzzle: PUZZLE });
    expect(s.selected).toBe(null);
    expect(s.complete).toBe(false);
    expect(s.cells['0,0']).toEqual({ digit: null, locked: false });
    expect(s.verdicts['1-across']).toBe(null);
  });
});

describe('no-op guards', () => {
  test('commit with no Slot selected leaves state untouched', () => {
    const s = initCrossword(PUZZLE);
    expect(crosswordReducer(s, { type: 'commit' })).toBe(s);
  });

  test('commit on a partially filled Slot does not grade', () => {
    let s = select(initCrossword(PUZZLE), ONE_ACROSS);
    s = crosswordReducer(s, { type: 'setDigit', cell: { row: 0, col: 0 }, digit: '3' });
    s = commit(s);
    expect(s.verdicts['1-across']).toBe(null);
    expect(s.cells['0,0'].locked).toBe(false);
  });
});

describe('fail-loud on programmer error', () => {
  test('setDigit rejects a non-hex digit', () => {
    const s = initCrossword(PUZZLE);
    expect(() => crosswordReducer(s, { type: 'setDigit', cell: { row: 0, col: 0 }, digit: 'G' })).toThrow();
  });

  test('setDigit rejects a Cell that is not in the grid', () => {
    const s = initCrossword(PUZZLE);
    expect(() => crosswordReducer(s, { type: 'setDigit', cell: { row: 9, col: 9 }, digit: '1' })).toThrow();
  });

  test('select rejects a Slot that does not exist', () => {
    const s = initCrossword(PUZZLE);
    expect(() => crosswordReducer(s, { type: 'select', slot: { number: 99, direction: 'across' } })).toThrow();
  });

  test('initCrossword rejects a missing or malformed target', () => {
    expect(() => initCrossword({ layout: LAYOUT, targets: { '1-across': '3A7BD5' } })).toThrow();
    expect(() =>
      initCrossword({ layout: LAYOUT, targets: { ...TARGETS, '1-across': 'zzzzzz' } }),
    ).toThrow();
  });

  test('initCrossword rejects a 3-digit shorthand target (a Slot fills six Cells)', () => {
    expect(() =>
      initCrossword({ layout: LAYOUT, targets: { ...TARGETS, '1-across': '3A7' } }),
    ).toThrow();
  });
});
