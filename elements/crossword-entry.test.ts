// C0FFEE-65 — slice 2/4 playable: keypad, within-slot cursor, clearDigit, tap
// selection + re-tap direction toggle, live mix, per-Channel verdict chips, toasts.
// happy-dom can't paint, so these assert the action wiring + projected state, not
// pixels (the design fidelity + toast motion get the browser eyeball).
import { test, expect, vi } from 'vitest';
import { cellKey, slotKey } from '../lib/crossword-state.ts';
import { gradeGuess } from '../lib/crossword-guess.ts';
import {
  setupCrosswordSuite,
  mount,
  puzzle,
  firstSlot,
  tapCell,
  pressKey,
  pressDelete,
  pressCheck,
  cursorKey,
  glyphAt,
  lockedAt,
} from './crossword-test-kit.ts';

setupCrosswordSuite();

// cellKey / slotKey are imported from the core — the same encoders the reducer indexes
// by, so the test can never assert against a key shape that drifts from production.

test('<c0ffee-crossword> renders a hex keypad — 16 digit keys plus delete and check', () => {
  const el = mount();
  expect(el.shadowRoot!.querySelectorAll('[data-key]').length).toBe(16);
  expect(el.shadowRoot!.querySelector('[data-act="delete"]')).toBeTruthy();
  expect(el.shadowRoot!.querySelector('[data-act="check"]')).toBeTruthy();
});

test('<c0ffee-crossword> a keypad press fills the cursor Cell and auto-advances', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount(); // opens on the first Slot, cursor on its first Cell
  expect(cursorKey(el)).toBe(cells[0]);
  pressKey(el, 'A');
  expect(glyphAt(el, cells[0])).toBe('A'); // the digit landed
  expect(cursorKey(el)).toBe(cells[1]); // …and the cursor stepped forward
});

test('<c0ffee-crossword> delete clears the filled cursor Cell in place, then steps back over emptied Cells', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  pressKey(el, 'A'); // cells[0]=A, cursor->cells[1]
  pressKey(el, 'B'); // cells[1]=B, cursor->cells[2] (empty)
  pressDelete(el); // cursor Cell empty -> step back, clear cells[1]
  expect(glyphAt(el, cells[1])).toBeNull();
  expect(cursorKey(el)).toBe(cells[1]);
  pressDelete(el); // cells[1] now empty under cursor -> step back, clear cells[0]
  expect(glyphAt(el, cells[0])).toBeNull();
  expect(cursorKey(el)).toBe(cells[0]);
});

test('<c0ffee-crossword> delete on a filled cursor Cell clears it in place (cursor stays)', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  pressKey(el, 'A'); // cells[0]=A, cursor->cells[1]
  tapCell(el, cells[0]); // move cursor back onto the filled Cell
  expect(cursorKey(el)).toBe(cells[0]);
  pressDelete(el); // filled -> clear in place
  expect(glyphAt(el, cells[0])).toBeNull();
  expect(cursorKey(el)).toBe(cells[0]);
});

test('<c0ffee-crossword> re-tapping the active crossing Cell toggles direction', () => {
  const p = puzzle();
  const crossingKeys = p.layout.crossings.map((x) => cellKey(x.cell));
  const across = firstSlot(); // first Slot is across
  const cells = across.cells.map(cellKey);
  // a crossing Cell that is NOT the initial cursor (cells[0]) — so the first tap
  // MOVES the cursor onto it and the second tap is the re-tap that toggles
  const xKey = cells.slice(1).find((k) => crossingKeys.includes(k));
  expect(xKey).toBeTruthy();

  const el = mount();
  expect(el.shadowRoot!.querySelector('.clabel')!.textContent).toContain('Across');
  tapCell(el, xKey!); // move cursor onto the crossing (it is in the active Slot)
  tapCell(el, xKey!); // re-tap -> toggle to the perpendicular (down) Slot
  expect(el.shadowRoot!.querySelector('.clabel')!.textContent).toContain('Down');
  expect(cursorKey(el)).toBe(xKey); // cursor position kept across the toggle
});

test('<c0ffee-crossword> tapping a Cell that belongs only to another Slot selects that Slot', () => {
  const p = puzzle();
  const crossingKeys = new Set(p.layout.crossings.map((x) => cellKey(x.cell)));
  const down = p.layout.slots.find((s) => s.direction === 'down')!;
  const uniq = down.cells.map(cellKey).find((k) => !crossingKeys.has(k));
  expect(uniq).toBeTruthy();

  const el = mount(); // opens on the across Slot
  tapCell(el, uniq!);
  expect(el.shadowRoot!.querySelector('.clabel')!.textContent).toContain('Down');
});

test('<c0ffee-crossword> the you-half stays the "?" placeholder until ALL six Cells are filled', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  // fresh: the empty "?" placeholder
  expect(el.shadowRoot!.querySelector('.half.mix')!.textContent).toContain('?');
  // type only the first five — a partial Guess is NOT a color, so still "?"
  cells.slice(0, 5).forEach((k, i) => {
    tapCell(el, k);
    pressKey(el, 'ABCDE'[i]);
  });
  expect(el.shadowRoot!.querySelector('.half.mix')!.textContent).toContain('?');
  expect(el.shadowRoot!.querySelector('.half.mix.filled')).toBeNull();
  // the sixth digit completes the address — now the mix resolves and the fills touch
  tapCell(el, cells[5]);
  pressKey(el, 'F');
  const mix = el.shadowRoot!.querySelector('.half.mix') as HTMLElement;
  expect(mix.classList.contains('filled')).toBe(true);
  expect(mix.getAttribute('style')).toContain('#ABCDEF');
});

test('<c0ffee-crossword> checking an incomplete Slot warns and does not grade', () => {
  const el = mount();
  pressKey(el, 'A'); // one digit only
  pressCheck(el);
  expect(el.shadowRoot!.querySelector('.toast.warn')).toBeTruthy();
  expect(el.shadowRoot!.querySelector('.receipt')).toBeNull(); // no verdict yet
  // the warn path must NOT dispatch commit: nothing locks (a render-side proxy like
  // "no receipt" would still pass a refactor that committed-then-suppressed-it)
  expect(lockedAt(el, firstSlot().cells.map(cellKey)[0])).toBe(false);
});

test('<c0ffee-crossword> a commit renders the checked receipt matching the grader, and a toast', () => {
  const p = puzzle();
  const slot = firstSlot();
  const target = p.targets[slotKey(slot)];
  const guess = '000000';
  const el = mount();
  slot.cells.forEach((c) => {
    tapCell(el, cellKey(c));
    pressKey(el, '0');
  });
  pressCheck(el);

  // the receipt's digit pairs carry the graded verdicts, one per Channel (§6b)
  const result = gradeGuess(target, guess);
  const pairs = el.shadowRoot!.querySelectorAll('.receipt .rpair');
  expect(pairs.length).toBe(3);
  const verdictOf = (ch: string): string | null =>
    el.shadowRoot!.querySelector(`.rpair[data-ch="${ch}"]`)!.getAttribute('data-verdict');
  expect(verdictOf('r')).toBe(result.red);
  expect(verdictOf('g')).toBe(result.green);
  expect(verdictOf('b')).toBe(result.blue);

  const allCorrect = result.red === 'correct' && result.green === 'correct' && result.blue === 'correct';
  expect(el.shadowRoot!.querySelector(allCorrect ? '.toast.win' : '.toast.wrong')).toBeTruthy();
});

test('<c0ffee-crossword> a full tap-driven solve locks every Cell (reaches the complete state)', () => {
  const p = puzzle();
  const crossingKeys = new Set(p.layout.crossings.map((x) => cellKey(x.cell)));
  const el = mount();

  for (const slot of p.layout.slots) {
    // a correctly-solved crossing can complete the puzzle before the last Slot in the
    // loop (the final cells lock via propagation); once complete the dock is replaced by
    // the completion card (C0FFEE-67), so stop driving the now-absent keypad.
    if (el.shadowRoot!.querySelector('.completion')) break;
    const target = p.targets[slotKey(slot)];
    // select this Slot by tapping a Cell that belongs only to it
    const sel = slot.cells.map(cellKey).find((k) => !crossingKeys.has(k))!;
    tapCell(el, sel);
    // fill each not-yet-locked Cell with its target digit, left/top to right/end
    slot.cells.forEach((c, i) => {
      const k = cellKey(c);
      if (lockedAt(el, k)) return; // a crossing already locked by an earlier Slot
      if (cursorKey(el) !== k) tapCell(el, k); // position without re-tap toggling
      pressKey(el, target[i]);
    });
    pressCheck(el);
  }

  // complete == every Cell locked (the reducer's honest completion test), projected
  // as the solved board variant (recolor + bloom, C0FFEE-67). The lock badges retire
  // with the rest of the play chrome (C0FFEE-82) — the solved-board content itself is
  // asserted in the celebration-cleanup tests (crossword-chrome.test.ts).
  expect(el.shadowRoot!.querySelector('.board.solved')).toBeTruthy();
  // a fully-solved Slot has no editable Cell, so the cursor resolves to null (no caret)
  expect(el.shadowRoot!.querySelector('.cell.cur')).toBeNull();
});

test('<c0ffee-crossword> a keypad press on the last Cell clamps the cursor there — no wrap, no auto-commit', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  cells.forEach((k, i) => {
    tapCell(el, k);
    pressKey(el, 'ABCDEF'[i]);
  });
  expect(cursorKey(el)).toBe(cells[5]); // parked on the last Cell, not wrapped to cells[0]
  expect(el.shadowRoot!.querySelectorAll('.chip').length).toBe(0); // reaching the end did NOT commit
});

test('<c0ffee-crossword> delete steps back OVER a locked crossing Cell to the previous editable one', () => {
  const p = puzzle();
  const xset = new Set(p.layout.crossings.map((x) => cellKey(x.cell)));
  const across = firstSlot();
  const aCells = across.cells.map(cellKey);
  // an INTERIOR crossing (index >= 2) so a lock can sit between two editable Cells
  const xIdx = aCells.findIndex((k, i) => i >= 2 && xset.has(k));
  expect(xIdx).toBeGreaterThanOrEqual(2);
  const xCell = aCells[xIdx];
  const down = p.layout.slots.find(
    (s) => s.direction === 'down' && s.cells.some((c) => cellKey(c) === xCell),
  )!;

  const el = mount();
  // 1. solve the crossing down Slot so xCell locks
  const dTarget = p.targets[slotKey(down)];
  tapCell(el, down.cells.map(cellKey).find((k) => !xset.has(k))!);
  down.cells.forEach((c, i) => {
    const k = cellKey(c);
    if (cursorKey(el) !== k) tapCell(el, k);
    pressKey(el, dTarget[i]);
  });
  pressCheck(el);
  expect(lockedAt(el, xCell)).toBe(true);

  // 2. back on the across Slot, fill the Cell just before the lock, advancing PAST the lock
  tapCell(el, aCells[0]); // re-selects the across Slot
  tapCell(el, aCells[xIdx - 1]);
  pressKey(el, '7'); // fills xIdx-1; cursor auto-advances over the locked xIdx to xIdx+1
  expect(cursorKey(el)).toBe(aCells[xIdx + 1]);

  // 3. delete from the empty cursor: it must step back OVER the lock, clearing xIdx-1
  pressDelete(el);
  expect(glyphAt(el, aCells[xIdx - 1])).toBeNull(); // the editable Cell before the lock cleared
  expect(lockedAt(el, xCell)).toBe(true); // the lock was stepped over, never cleared
  expect(cursorKey(el)).toBe(aCells[xIdx - 1]);
});

test('<c0ffee-crossword> a commit toast clears itself after its timeout', () => {
  vi.useFakeTimers();
  try {
    const el = mount();
    pressKey(el, 'A'); // one digit
    pressCheck(el); // incomplete -> warn toast
    expect(el.shadowRoot!.querySelector('.toast')).toBeTruthy();
    vi.advanceTimersByTime(3000); // past TOAST_MS
    expect(el.shadowRoot!.querySelector('.toast')).toBeNull(); // transient — it cleared
  } finally {
    vi.useRealTimers();
  }
});
