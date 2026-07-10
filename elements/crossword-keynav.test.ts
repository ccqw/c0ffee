// C0FFEE-66 — slice 3/4 navigation + full keyboard: clue-list routing (tap a clue
// to select its Slot), per-clue neutral verdict marks (contract #5), prev/next that
// walks layout.slots and skips fully-locked Slots, and a physical keyboard that
// mirrors the touch model (hex entry, Backspace=clearDigit, Enter=commit, arrows
// move the cursor / toggle direction at a crossing, Tab/Shift-Tab=prev/next). These
// assert the action wiring + projected state; the focus-ring + real keyboard feel get
// the browser eyeball. The assistive-tech layer (ARIA grid, roving focus) is C0FFEE-63.
import { test, expect } from 'vitest';
import { cellKey, slotKey } from '../lib/crossword-state.ts';
import {
  setupCrosswordSuite,
  mount,
  puzzle,
  firstSlot,
  tapCell,
  tapClue,
  pressKey,
  pressCheck,
  pressPhysical,
  pressNav,
  cursorKey,
  glyphAt,
  lockedAt,
  clabel,
  slotRowEl,
  rowState,
  labelOf,
  openClues,
  solveSelected,
} from './crossword-test-kit.ts';

setupCrosswordSuite();

test('<c0ffee-crossword> the host is keyboard-focusable (tabindex 0) so keys can drive the puzzle', () => {
  const el = mount();
  expect(el.getAttribute('tabindex')).toBe('0');
});

test('<c0ffee-crossword> clue rows are <button>s carrying their Slot, and a tap routes selection', () => {
  const down = puzzle().layout.slots.find((s) => s.direction === 'down')!;
  const el = mount();
  openClues(el); // C0FFEE-73: rows live in the clue pane
  const rows = [...el.shadowRoot!.querySelectorAll('.cluerow')] as HTMLElement[];
  expect(rows.length).toBe(puzzle().layout.slots.length);
  expect(rows.every((r) => r.tagName === 'BUTTON')).toBe(true);
  expect(rows.every((r) => !!r.getAttribute('data-slot'))).toBe(true);
  // tapping a down clue selects that Slot AND auto-returns to the entry pane (the element
  // opens on the first across Slot in the entry pane)
  tapClue(el, slotKey(down));
  expect(clabel(el)).toBe(labelOf(down));
});

test('<c0ffee-crossword> a clue-list tap inits the cursor to the Slot’s first editable Cell', () => {
  const down = puzzle().layout.slots.find((s) => s.direction === 'down')!;
  const el = mount();
  tapClue(el, slotKey(down));
  // the first non-locked empty Cell of the freshly-selected Slot (all empty on a fresh board)
  expect(cursorKey(el)).toBe(cellKey(down.cells[0]));
});

test('<c0ffee-crossword> the prev/next clue-nav controls are real <button>s', () => {
  const el = mount();
  expect(el.shadowRoot!.querySelector('[data-nav="prev"]')?.tagName).toBe('BUTTON');
  expect(el.shadowRoot!.querySelector('[data-nav="next"]')?.tagName).toBe('BUTTON');
});

test('<c0ffee-crossword> a not-yet-checked clue reads unguessed; a solved one reads match', () => {
  const p = puzzle();
  const S = firstSlot(); // the element opens on S, selected, in the entry pane
  const el = mount();
  // fresh: S has been graded by nothing, so its clue-panel row is the unguessed state
  openClues(el);
  expect(rowState(el, slotKey(S))).toBe('unguessed');
  // Escape returns to the entry pane with the selection unchanged; solve S there
  pressPhysical(el, 'Escape');
  solveSelected(el, p.targets[slotKey(S)]);
  // re-open the clue pane: S now reads match (every Channel solved)
  openClues(el);
  expect(rowState(el, slotKey(S))).toBe('match');
});

test('<c0ffee-crossword> keyboard: hex digits fill cells (auto-advance) and Enter commits the Slot', () => {
  const p = puzzle();
  const S = firstSlot();
  const target = p.targets[slotKey(S)];
  const cells = S.cells.map(cellKey);
  const el = mount();
  target.split('').forEach((d) => pressPhysical(el, d));
  cells.forEach((k, i) => expect(glyphAt(el, k)).toBe(target[i].toUpperCase())); // all six landed
  pressPhysical(el, 'Enter'); // commit -> grades + locks (a correct, generator-derived Guess)
  // a fully-solved Slot retires the receipt — the bar's centered check carries it (§6b)
  expect(el.shadowRoot!.querySelector('.receipt')).toBeNull();
  expect(el.shadowRoot!.querySelector('.barcheck')).toBeTruthy();
  // the commit locked the Slot: its crossing Cells stamp the padlock (C0FFEE-68 —
  // the Slot's own matched pairs lock bare)
  const crossingKeys = new Set(p.layout.crossings.map((x) => cellKey(x.cell)));
  const crossing = cells.filter((k) => crossingKeys.has(k));
  expect(crossing.length).toBeGreaterThan(0);
  crossing.forEach((k) => expect(lockedAt(el, k)).toBe(true));
});

test('<c0ffee-crossword> keyboard: lowercase hex is accepted (uppercased like the keypad)', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  pressPhysical(el, 'a');
  expect(glyphAt(el, cells[0])).toBe('A');
});

test('<c0ffee-crossword> keyboard: Backspace clears the cursor Cell, stepping back over emptied Cells', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  pressPhysical(el, 'A'); // cells[0]=A, cursor->cells[1]
  pressPhysical(el, 'B'); // cells[1]=B, cursor->cells[2] (empty)
  pressPhysical(el, 'Backspace'); // empty cursor -> step back, clear cells[1]
  expect(glyphAt(el, cells[1])).toBeNull();
  expect(cursorKey(el)).toBe(cells[1]);
});

test('<c0ffee-crossword> keyboard: arrows along the Slot axis move the cursor one editable Cell', () => {
  const cells = firstSlot().cells.map(cellKey); // first Slot is across -> horizontal
  const el = mount();
  expect(cursorKey(el)).toBe(cells[0]);
  pressPhysical(el, 'ArrowRight');
  expect(cursorKey(el)).toBe(cells[1]);
  pressPhysical(el, 'ArrowLeft');
  expect(cursorKey(el)).toBe(cells[0]);
});

test('<c0ffee-crossword> keyboard: the cross-axis arrow at a crossing toggles direction, keeping the cursor', () => {
  const p = puzzle();
  const crossingKeys = p.layout.crossings.map((x) => cellKey(x.cell));
  const cells = firstSlot().cells.map(cellKey); // across
  const xKey = cells.slice(1).find((k) => crossingKeys.includes(k))!;
  const el = mount();
  let guard = 0;
  while (cursorKey(el) !== xKey && guard++ < 10) pressPhysical(el, 'ArrowRight');
  expect(cursorKey(el)).toBe(xKey);
  expect(clabel(el)).toContain('Across');
  pressPhysical(el, 'ArrowDown'); // cross-axis at a crossing -> the perpendicular down Slot
  expect(clabel(el)).toContain('Down');
  expect(cursorKey(el)).toBe(xKey); // cursor kept on the shared Cell
});

test('<c0ffee-crossword> keyboard: Tab selects the next Slot, Shift-Tab the previous', () => {
  const el = mount();
  const start = clabel(el);
  pressPhysical(el, 'Tab');
  expect(clabel(el)).not.toBe(start); // advanced off the opening Slot
  pressPhysical(el, 'Tab', { shiftKey: true });
  expect(clabel(el)).toBe(start); // and back
});

test('<c0ffee-crossword> prev/next walks layout.slots and SKIPS a fully-locked Slot', () => {
  const p = puzzle();
  const S = firstSlot(); // lock this one fully
  const el = mount();
  solveSelected(el, p.targets[slotKey(S)]);
  // S is fully locked — projected as padlocks on its crossing Cells (C0FFEE-68; the
  // nav skip below is the behavioral proof the whole Slot is locked)
  const crossingKeys = new Set(p.layout.crossings.map((x) => cellKey(x.cell)));
  const sCrossings = S.cells.map(cellKey).filter((k) => crossingKeys.has(k));
  expect(sCrossings.length).toBeGreaterThan(0);
  expect(sCrossings.every((k) => lockedAt(el, k))).toBe(true);

  // from EVERY other Slot, pressing next never lands on the locked S (it is skipped)
  for (const e of p.layout.slots) {
    if (slotKey(e) === slotKey(S)) continue;
    tapClue(el, slotKey(e));
    pressNav(el, 'next');
    expect(clabel(el)).not.toBe(labelOf(S));
  }
});

test('<c0ffee-crossword> a solved puzzle replaces the dock (and its prev/next nav) with the completion card', () => {
  // Pre-C0FFEE-67 this asserted prev/next no-ops on a fully-solved board. That state
  // is no longer reachable through the dock: once complete, the dock — keypad AND the
  // prev/next clue-nav — is replaced by the completion card (scene 04). So the honest
  // assertion now is that the nav surface is gone, supplanted by the completion card.
  const p = puzzle();
  const crossingKeys = new Set(p.layout.crossings.map((x) => cellKey(x.cell)));
  const el = mount();
  for (const slot of p.layout.slots) {
    if (el.shadowRoot!.querySelector('.completion')) break;
    const target = p.targets[slotKey(slot)];
    const sel = slot.cells.map(cellKey).find((k) => !crossingKeys.has(k))!;
    tapCell(el, sel);
    slot.cells.forEach((c, i) => {
      const k = cellKey(c);
      if (lockedAt(el, k)) return;
      if (cursorKey(el) !== k) tapCell(el, k);
      pressKey(el, target[i]);
    });
    pressCheck(el);
  }
  expect(el.shadowRoot!.querySelector('.completion')).toBeTruthy();
  expect(el.shadowRoot!.querySelector('[data-nav]')).toBeNull(); // the prev/next nav is gone
});

test('<c0ffee-crossword> keyboard: a Cmd/Ctrl modifier chord is left for the browser, not typed', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  pressPhysical(el, 'c', { metaKey: true }); // Cmd+C must copy, not type 'C' into the puzzle
  pressPhysical(el, 'f', { ctrlKey: true }); // Ctrl+F must reach find
  expect(glyphAt(el, cells[0])).toBeNull(); // nothing was typed
  expect(cursorKey(el)).toBe(cells[0]); // and the cursor did not advance
});

test('<c0ffee-crossword> a graded-but-unsolved clue reads wrong, painted with your guess color', () => {
  const p = puzzle();
  const S = firstSlot();
  const target = p.targets[slotKey(S)];
  // a six-digit Guess that differs from the target in the red Channel only (flip digit 0),
  // so green + blue lock but the Slot is not fully solved -> the 'wrong' row state
  const wrong = (target[0] === '0' ? '1' : '0') + target.slice(1);
  const el = mount();
  wrong.split('').forEach((d) => pressPhysical(el, d));
  pressPhysical(el, 'Enter');
  openClues(el);
  const row = slotRowEl(el, slotKey(S));
  expect(rowState(el, slotKey(S))).toBe('wrong');
  // the "you" swatch carries the player's own six-digit guess color (not the latent answer)
  expect(row.querySelector('.youswatch')!.getAttribute('style')).toContain(`#${wrong}`);
});

test('<c0ffee-crossword> keyboard: arrows clamp at the Slot ends (no wrap)', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount(); // opens with the cursor on cells[0]
  pressPhysical(el, 'ArrowLeft'); // at the start already -> clamp, no wrap to the end
  expect(cursorKey(el)).toBe(cells[0]);
  let guard = 0;
  while (cursorKey(el) !== cells[5] && guard++ < 10) pressPhysical(el, 'ArrowRight');
  expect(cursorKey(el)).toBe(cells[5]);
  pressPhysical(el, 'ArrowRight'); // at the end -> clamp, no wrap to cells[0]
  expect(cursorKey(el)).toBe(cells[5]);
});

test('<c0ffee-crossword> keyboard: Escape releases focus (the escape hatch from Tab-nav capture)', () => {
  const el = mount();
  el.focus();
  expect(document.activeElement).toBe(el);
  pressPhysical(el, 'Escape');
  expect(document.activeElement).not.toBe(el); // blurred -> the keyboard is no longer trapped
});

test('<c0ffee-crossword> keyboard: an arrow on a fully-locked Slot (no cursor) is a safe no-op', () => {
  const p = puzzle();
  const S = firstSlot();
  const el = mount();
  solveSelected(el, p.targets[slotKey(S)]); // S fully locked
  tapClue(el, slotKey(S)); // re-select the solved Slot — its cursor resolves to null
  expect(cursorKey(el)).toBeNull();
  const label = clabel(el);
  pressPhysical(el, 'ArrowRight'); // must not throw
  pressPhysical(el, 'ArrowDown');
  expect(clabel(el)).toBe(label); // selection unchanged
  expect(cursorKey(el)).toBeNull();
});
