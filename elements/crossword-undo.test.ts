// The undo/redo surface (C0FFEE-70): two icon keys in the keyrow —
// [undo][redo][delete][Check guess] — plus the hardware Cmd/Ctrl+Z chords. The
// history itself is the reducer's (patch-based, lock-pruned; see the core suite);
// this seam asserts the shell wiring: keys render and track the stacks' emptiness,
// taps and chords dispatch, and undo/redo return the solver to where the edit
// happened (the Slot re-selects, the cursor parks on the changed Cell).
import { test, expect } from 'vitest';
import { cellKey, slotKey } from '../lib/crossword-state.ts';
import {
  setupCrosswordSuite,
  mount,
  puzzle,
  firstSlot,
  click,
  tapCell,
  pressKey,
  pressPhysical,
  glyphAt,
  lockedAt,
  commitFirstSlot,
  solveSelected,
  clabel,
  labelOf,
  q,
  act,
} from './crossword-test-kit.ts';

setupCrosswordSuite();

const undoBtn = (el: HTMLElement): HTMLButtonElement =>
  q(el, '[data-act="undo"]') as HTMLButtonElement;
const redoBtn = (el: HTMLElement): HTMLButtonElement =>
  q(el, '[data-act="redo"]') as HTMLButtonElement;
const cursorAt = (el: HTMLElement): string | null =>
  q(el, '.cell.cur')?.getAttribute('data-cell') ?? null;

test('<c0ffee-crossword> keyrow: undo and redo keys sit before delete and Check, with accessible names', () => {
  const el = mount();
  const keys = [...el.shadowRoot!.querySelectorAll('.keyrow [data-act]')].map((n) =>
    n.getAttribute('data-act'),
  );
  expect(keys).toEqual(['undo', 'redo', 'delete', 'check']);
  expect(undoBtn(el).getAttribute('aria-label')).toBe('Undo');
  expect(redoBtn(el).getAttribute('aria-label')).toBe('Redo');
});

test('<c0ffee-crossword> undo/redo keys: disabled on a fresh board — nothing to step', () => {
  const el = mount();
  expect(undoBtn(el).disabled).toBe(true);
  expect(redoBtn(el).disabled).toBe(true);
});

test('<c0ffee-crossword> undo: a tap steps the last digit back and parks the cursor on its Cell', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  pressKey(el, 'A'); // cursor opens on cells[0], auto-advances to cells[1]
  expect(undoBtn(el).disabled).toBe(false);
  expect(redoBtn(el).disabled).toBe(true);
  act(el, 'undo');
  expect(glyphAt(el, cells[0])).toBeNull(); // the mistyped key cost nothing
  expect(cursorAt(el)).toBe(cells[0]); // returned to where the edit happened
  expect(undoBtn(el).disabled).toBe(true); // history drained...
  expect(redoBtn(el).disabled).toBe(false); // ...but the step is redoable
});

test('<c0ffee-crossword> redo: re-applies what undo stepped back, cursor on the changed Cell', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  pressKey(el, 'A');
  act(el, 'undo');
  act(el, 'redo');
  expect(glyphAt(el, cells[0])).toBe('A');
  expect(cursorAt(el)).toBe(cells[0]);
  expect(undoBtn(el).disabled).toBe(false);
  expect(redoBtn(el).disabled).toBe(true);
});

test('<c0ffee-crossword> a fresh edit after undo drops the redoable steps (redo disables)', () => {
  const el = mount();
  pressKey(el, 'A');
  act(el, 'undo');
  expect(redoBtn(el).disabled).toBe(false);
  pressKey(el, 'B'); // fork abandoned
  expect(redoBtn(el).disabled).toBe(true);
});

test('<c0ffee-crossword> hardware chords: Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z redoes', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  pressKey(el, 'A');
  pressPhysical(el, 'z', { metaKey: true });
  expect(glyphAt(el, cells[0])).toBeNull();
  pressPhysical(el, 'Z', { metaKey: true, shiftKey: true });
  expect(glyphAt(el, cells[0])).toBe('A');
  pressPhysical(el, 'z', { ctrlKey: true }); // the Windows/Linux chord
  expect(glyphAt(el, cells[0])).toBeNull();
  pressPhysical(el, 'Z', { ctrlKey: true, shiftKey: true });
  expect(glyphAt(el, cells[0])).toBe('A');
});

test('<c0ffee-crossword> undo works across Slots: the edited Slot re-selects, cursor on the Cell', () => {
  const p = puzzle();
  const across = firstSlot();
  const cells = across.cells.map(cellKey);
  const el = mount();
  pressKey(el, 'A'); // edit in the opening across Slot
  // wander off: select the crossing down Slot via a Cell unique to it
  const down = p.layout.slots.find((s) => s.direction === 'down')!;
  const xset = new Set(p.layout.crossings.map((x) => cellKey(x.cell)));
  tapCell(el, down.cells.map(cellKey).find((k) => !xset.has(k))!);
  expect(clabel(el)).toBe(labelOf(down));
  act(el, 'undo');
  expect(clabel(el)).toBe(labelOf(across)); // back to where the edit happened
  expect(glyphAt(el, cells[0])).toBeNull();
  expect(cursorAt(el)).toBe(cells[0]);
});

test('<c0ffee-crossword> a receipt restore is ONE undo step — one tap takes it back out', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  commitFirstSlot(el); // graded '000000', all wrong on 83BEF1 — nothing locks
  pressKey(el, '1'); // diverge; auto-advance moves the cursor off cells[0]
  pressKey(el, '2'); // diverge a second Cell too
  click(q(el, '.receipt')); // restore: both Cells return to '0' as one grouped step
  expect(glyphAt(el, cells[0])).toBe('0');
  expect(glyphAt(el, cells[1])).toBe('0');
  act(el, 'undo'); // ...and ONE undo brings the whole hypothesis back
  expect(glyphAt(el, cells[0])).toBe('1');
  expect(glyphAt(el, cells[1])).toBe('2');
});

test('<c0ffee-crossword> receipt captions stay honest through undo: diverge, undo back to "now"', () => {
  const el = mount();
  commitFirstSlot(el);
  pressKey(el, '1');
  expect(q(el, '.receipt .rcaption')!.textContent!.trim()).toBe('last');
  act(el, 'undo'); // digits move back TO the graded referent
  expect(q(el, '.receipt .rcaption')!.textContent!.trim()).toBe('now');
  expect(q(el, '.receipt .rundo')).toBeNull(); // the restore affordance left with it
});

test('<c0ffee-crossword> locks survive undo: solving a Slot prunes its history, keys disable', () => {
  const p = puzzle();
  const S = firstSlot();
  const cells = S.cells.map(cellKey);
  const target = p.targets[slotKey(S)];
  const el = mount();
  solveSelected(el, target); // six edits, then a fully-correct commit locks all six
  expect(undoBtn(el).disabled).toBe(true); // every step aged out with the locks
  act(el, 'undo'); // defensive: even a synthetic tap on the disabled key is inert
  cells.forEach((k, i) => {
    expect(glyphAt(el, k)).toBe(target[i].toUpperCase()); // earned knowledge stands
  });
  expect(lockedAt(el, cells[0])).toBe(true);
});

test('<c0ffee-crossword> Restart starts with a clean history — undo cannot reach the old game', () => {
  const el = mount();
  pressKey(el, 'A');
  expect(undoBtn(el).disabled).toBe(false);
  act(el, 'menu');
  act(el, 'restart');
  act(el, 'confirm-ok'); // newPuzzle(same Puzzle) — wipes entries AND history
  expect(undoBtn(el).disabled).toBe(true);
  expect(redoBtn(el).disabled).toBe(true);
});
