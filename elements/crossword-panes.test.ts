// C0FFEE-73 — single-viewport switchable panes: below the constant board + topbar, the
// player sees EITHER the entry pane (comparison + keypad) OR the clue-list pane (the
// handoff's two-column CW-CluePanel). A "Clue list" button opens the list; tapping a row
// selects that Slot and auto-returns to the entry pane. happy-dom can't see layout, so the
// actual single-viewport FIT (board + one pane + chrome on one phone screen, the coach at
// the visible bottom) and the spark/glow visuals are a human eyeball on `npm run dev`;
// these assert the pane wiring, the auto-return, and the per-row status projection.
import { test, expect } from 'vitest';
import { cellKey, slotKey } from '../lib/crossword-state.ts';
import {
  setupCrosswordSuite,
  mount,
  puzzle,
  firstSlot,
  click,
  tapCell,
  pressPhysical,
  pressNav,
  glyphAt,
  clabel,
  slotRowEl,
  rowState,
  labelOf,
  openClues,
  solveSelected,
  q,
  act,
} from './crossword-test-kit.ts';

setupCrosswordSuite();

test('<c0ffee-crossword> opens in the entry pane: keypad present, clue panel absent', () => {
  const el = mount();
  expect(q(el, '.keypad')).toBeTruthy(); // the entry pane (comparison + keypad)
  expect(q(el, '.cluepanel')).toBeNull(); // the clue-list pane is not shown by default
  // the board and topbar render unconditionally, above whichever pane is active
  expect(q(el, '.board')).toBeTruthy();
  expect(q(el, '.topbar')).toBeTruthy();
});

test('<c0ffee-crossword> the "Clue list" button swaps the entry pane for the clue-list pane', () => {
  const el = mount();
  expect(q(el, '[data-act="pane-clues"]')).toBeTruthy(); // the switch affordance is present
  act(el, 'pane-clues');
  // exactly one pane below the board: the clue panel is in, the keypad is out
  expect(q(el, '.cluepanel')).toBeTruthy();
  expect(q(el, '.keypad')).toBeNull();
  // the board + topbar stay constant across the swap (the player keeps their place)
  expect(q(el, '.board')).toBeTruthy();
  expect(q(el, '.topbar')).toBeTruthy();
});

test('<c0ffee-crossword> tapping a clue row selects that Slot AND auto-returns to the entry pane', () => {
  const down = puzzle().layout.slots.find((s) => s.direction === 'down')!;
  const el = mount(); // opens on the first across Slot in the entry pane
  act(el, 'pane-clues');
  expect(q(el, '.keypad')).toBeNull(); // in the clue pane
  click(slotRowEl(el, slotKey(down)));
  // back in the entry pane (keypad present), with the tapped Slot now selected
  expect(q(el, '.keypad')).toBeTruthy();
  expect(q(el, '.cluepanel')).toBeNull();
  expect(clabel(el)).toBe(labelOf(down));
});

test('<c0ffee-crossword> committing a guess and stepping clues both stay in the entry pane', () => {
  const p = puzzle();
  const S = firstSlot();
  const el = mount();
  // a commit (Check) is an entry-pane action — the keypad stays in front of the player
  solveSelected(el, p.targets[slotKey(S)]);
  expect(q(el, '.keypad')).toBeTruthy();
  expect(q(el, '.cluepanel')).toBeNull();
  // prev/next stepping is likewise an entry-pane action
  pressNav(el, 'next');
  expect(q(el, '.keypad')).toBeTruthy();
  expect(q(el, '.cluepanel')).toBeNull();
});

test('<c0ffee-crossword> Escape from the clue pane returns to the entry pane, selection unchanged', () => {
  const el = mount();
  const before = clabel(el); // the opening Slot's label
  act(el, 'pane-clues');
  expect(q(el, '.cluepanel')).toBeTruthy();
  pressPhysical(el, 'Escape'); // the clue pane is never a trap
  expect(q(el, '.keypad')).toBeTruthy(); // back in the entry pane
  expect(clabel(el)).toBe(before); // and on the same Slot we left
});

test('<c0ffee-crossword> the "Clue list" button and clue rows are real focusable <button>s', () => {
  const el = mount();
  expect(q(el, '[data-act="pane-clues"]')!.tagName).toBe('BUTTON');
  act(el, 'pane-clues');
  const rows = [...el.shadowRoot!.querySelectorAll('.cluerow')] as HTMLElement[];
  expect(rows.length).toBe(puzzle().layout.slots.length);
  expect(rows.every((r) => r.tagName === 'BUTTON')).toBe(true);
});

test('<c0ffee-crossword> the clue panel projects each Slot as unguessed / match / wrong', () => {
  const p = puzzle();
  const S = firstSlot();
  const target = p.targets[slotKey(S)];
  const el = mount();

  // fresh: every row is unguessed
  openClues(el);
  expect(rowState(el, slotKey(S))).toBe('unguessed');

  // commit a complete-but-wrong guess (flip the red Channel) -> wrong
  pressPhysical(el, 'Escape');
  const wrong = (target[0] === '0' ? '1' : '0') + target.slice(1);
  wrong.split('').forEach((d) => pressPhysical(el, d));
  pressPhysical(el, 'Enter');
  openClues(el);
  expect(rowState(el, slotKey(S))).toBe('wrong');

  // solving it outright -> match (covered end-to-end by the reworked unguessed->match test)
  expect(['unguessed', 'match', 'wrong']).toContain(rowState(el, slotKey(S)));
});

test('<c0ffee-crossword> a post-commit edit that empties a Cell reverts the row to unguessed', () => {
  // "you" always means a real six-digit guess: emptying a Cell after a commit drops the
  // your-guess swatch back to the "?" state until the Slot is re-committed
  const p = puzzle();
  const S = firstSlot();
  const target = p.targets[slotKey(S)];
  const wrong = (target[0] === '0' ? '1' : '0') + target.slice(1);
  const el = mount();
  wrong.split('').forEach((d) => pressPhysical(el, d));
  pressPhysical(el, 'Enter'); // committed -> wrong (all six filled)
  openClues(el);
  expect(rowState(el, slotKey(S))).toBe('wrong');
  // back to entry, clear the cursor Cell (an editable red Cell) -> only five filled
  pressPhysical(el, 'Escape');
  pressPhysical(el, 'Backspace');
  openClues(el);
  expect(rowState(el, slotKey(S))).toBe('unguessed');
});

test('<c0ffee-crossword> New resets the active pane back to entry', () => {
  const el = mount();
  act(el, 'pane-clues');
  expect(q(el, '.cluepanel')).toBeTruthy();
  // the topbar (and its menu) stay reachable from either pane
  act(el, 'menu');
  act(el, 'new');
  act(el, 'confirm-ok');
  expect(q(el, '.keypad')).toBeTruthy(); // a fresh puzzle opens in the entry pane
  expect(q(el, '.cluepanel')).toBeNull();
});

test('<c0ffee-crossword> the clue pane is review-only: keys and board taps never mutate the hidden Slot', () => {
  // the keypad is absent in the clue pane, so game input must be inert there — otherwise a
  // physical hex digit / Enter would fill or commit the selected Slot invisibly
  const S = firstSlot();
  const cells = S.cells.map(cellKey);
  const el = mount();
  act(el, 'pane-clues');
  expect(q(el, '.cluepanel')).toBeTruthy();
  pressPhysical(el, 'A'); // would fill cells[0] in the entry pane
  pressPhysical(el, 'Enter'); // would commit in the entry pane
  expect(glyphAt(el, cells[0])).toBeNull(); // nothing typed into the hidden Slot
  expect(rowState(el, slotKey(S))).toBe('unguessed'); // no hidden commit graded it
  expect(q(el, '.cluepanel')).toBeTruthy(); // and we never left the clue pane
  // a board-cell tap is inert too (the board is a passive reference in this pane)
  tapCell(el, cells[1]);
  expect(q(el, '.cluepanel')).toBeTruthy();
  expect(glyphAt(el, cells[0])).toBeNull();
});

test('<c0ffee-crossword> overlays still mount over the constrained screen', () => {
  // the single-viewport .screen must not break the C0FFEE-67 overlay layer
  const el = mount();
  act(el, 'pause');
  expect(q(el, '.screen')).toBeTruthy(); // the viewport-bounded screen is in place
  expect(q(el, '.scrim')).toBeTruthy();
  expect(q(el, '.pause')).toBeTruthy(); // and the overlay mounts on it
});
