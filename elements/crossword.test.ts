// Shell smoke test (ADR-0006) for <c0ffee-crossword>, slice 1 of 4 (C0FFEE-64):
// the read-only render. happy-dom can't paint, so this asserts the rendered shadow
// DOM projects the shipped core's CrosswordState + Layout — the woven board, the
// Across/Down clue list, the clue-vs-your-mix comparison, and the active-Slot
// channel-pair outlines. The real weave fidelity + ADR-0007 color contract get a
// human browser eyeball (this slice is HITL); this covers the structural wiring.
import { test, expect, beforeAll, vi } from 'vitest';
import { generatePuzzle } from '../lib/crossword-generator.ts';
import { initCrossword, cellKey, slotKey } from '../lib/crossword-state.ts';
import { gradeGuess } from '../lib/crossword-guess.ts';

// Registering the custom element is a module side effect (customElements.define).
beforeAll(async () => {
  await import('./crossword.ts');
});

// The element generates its own puzzle from a fixed shape + seed; the tests regenerate
// the same pair to derive expected counts and values (the generator is the ADR-0009
// deterministic seam, so this matches exactly what the element renders). Nothing is
// hard-coded — the expectations track the core.
const SHAPE = 'lattice-6';
const SEED = 1;
const puzzle = () => generatePuzzle(SHAPE, SEED);

function mount(): HTMLElement {
  const el = document.createElement('c0ffee-crossword');
  document.body.appendChild(el);
  return el;
}

test('<c0ffee-crossword> registers and renders a board inside a shadow root', () => {
  const el = mount();
  expect(el.shadowRoot).toBeTruthy();
  expect(el.shadowRoot!.querySelector('.board')).toBeTruthy();
});

test('<c0ffee-crossword> renders one positioned Cell per Layout Cell', () => {
  const expected = initCrossword(puzzle()).puzzle.layout.cells.length;
  const el = mount();
  expect(el.shadowRoot!.querySelectorAll('.cell').length).toBe(expected);
});

test('<c0ffee-crossword> renders the Across/Down clue list, split by direction', () => {
  const slots = puzzle().layout.slots;
  const across = slots.filter((s) => s.direction === 'across').length;
  const down = slots.filter((s) => s.direction === 'down').length;
  const el = mount();
  const root = el.shadowRoot!;

  // one chip per Slot overall, AND the two direction groups carry their own counts
  // (a total-only assertion would pass even if the direction filter were broken)
  expect(root.querySelectorAll('.cluerow').length).toBe(slots.length);
  const groups = root.querySelectorAll('.cluegroup');
  expect(groups.length).toBe(2);
  expect([...root.querySelectorAll('.cluegroup h2')].map((h) => h.textContent)).toEqual(['Across', 'Down']);
  expect(groups[0].querySelectorAll('.cluerow').length).toBe(across);
  expect(groups[1].querySelectorAll('.cluerow').length).toBe(down);
});

test('<c0ffee-crossword> labels each Slot with a clue number on the board periphery', () => {
  // the handoff design puts numbers OUTSIDE the cells: one per Slot (a corner that
  // starts both an across and a down shows its number on both edges), positioned with a
  // negative offset (down above the top edge, across left of the left edge)
  const slots = puzzle().layout.slots;
  const el = mount();
  const nums = [...el.shadowRoot!.querySelectorAll('.num')] as HTMLElement[];
  expect(nums.length).toBe(slots.length); // one per Slot, NOT deduped to start Cells
  // every label sits outside the board via a negative offset, never inside a Cell
  expect(nums.every((n) => /(top|left):-\d/.test(n.getAttribute('style') ?? ''))).toBe(true);
});

test('<c0ffee-crossword> renders the comparison: the clue painted its target, an empty mix', () => {
  const p = puzzle();
  // the element opens on the lowest-numbered Slot, across before down
  const first = [...p.layout.slots].sort(
    (a, b) => a.number - b.number || (a.direction < b.direction ? -1 : 1),
  )[0];
  const target = p.targets[`${first.number}-${first.direction}`];

  const el = mount();
  const root = el.shadowRoot!;
  expect(root.querySelectorAll('.stage').length).toBe(2);
  // clue stage carries the literal target Color value, pinned to the seed (contract #1)
  const clue = root.querySelector('.stage.clue') as HTMLElement;
  expect(clue.getAttribute('style')).toContain(`#${target}`);
  // mix empty -> the "?" placeholder, since slice 1 takes no input yet
  expect(root.querySelector('.stage.mix')!.textContent).toContain('?');
});

test('<c0ffee-crossword> opens on an active Slot, outlined in three channel pairs (contract #2)', () => {
  // connectedCallback selects the first Slot, so its three R/G/B pair outlines render;
  // a regression that left nothing selected would drop these to 0
  const el = mount();
  expect(el.shadowRoot!.querySelectorAll('.pair').length).toBe(3);
});

test('<c0ffee-crossword> hand-rolls one clue chip per Slot (opts out of ADR-0001 — no nested swatch)', () => {
  const slots = puzzle().layout.slots.length;
  const el = mount();
  // the clue chips are plain painted boxes the element owns, one per Slot...
  expect(el.shadowRoot!.querySelectorAll('.box').length).toBe(slots);
  // ...not <c0ffee-swatch>, whose click-to-load would hijack the hash with a clue color
  expect(el.shadowRoot!.querySelector('c0ffee-swatch')).toBeNull();
});

// C0FFEE-65 — slice 2/4 playable: keypad, within-slot cursor, clearDigit, tap
// selection + re-tap direction toggle, live mix, per-Channel verdict chips, toasts.
// happy-dom can't paint, so these assert the action wiring + projected state, not
// pixels (the design fidelity + toast motion get the browser eyeball).

// cellKey / slotKey are imported from the core — the same encoders the reducer indexes
// by, so the test can never assert against a key shape that drifts from production.

// The Slot the element opens on: lowest number, across before down (mirrors firstSlot).
function firstSlot() {
  return [...puzzle().layout.slots].sort(
    (a, b) => a.number - b.number || (a.direction < b.direction ? -1 : 1),
  )[0];
}

const click = (node: Element | null): void => {
  if (!node) throw new Error('test tried to click a missing node');
  node.dispatchEvent(new Event('click', { bubbles: true }));
};
const cellEl = (el: HTMLElement, key: string): HTMLElement =>
  el.shadowRoot!.querySelector(`[data-cell="${key}"]`) as HTMLElement;
const tapCell = (el: HTMLElement, key: string): void => click(cellEl(el, key));
const pressKey = (el: HTMLElement, ch: string): void =>
  click(el.shadowRoot!.querySelector(`[data-key="${ch}"]`));
const pressDelete = (el: HTMLElement): void => click(el.shadowRoot!.querySelector('[data-act="delete"]'));
const pressCheck = (el: HTMLElement): void => click(el.shadowRoot!.querySelector('[data-act="check"]'));
const cursorKey = (el: HTMLElement): string | null =>
  el.shadowRoot!.querySelector('.cell.cur')?.getAttribute('data-cell') ?? null;
const glyphAt = (el: HTMLElement, key: string): string | null =>
  cellEl(el, key).querySelector('.glyph')?.textContent ?? null;
const lockedAt = (el: HTMLElement, key: string): boolean => !!cellEl(el, key).querySelector('.lock');

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

test('<c0ffee-crossword> the your-mix swatch stays the "?" placeholder until ALL six Cells are filled', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  // fresh: the empty "?" placeholder
  expect(el.shadowRoot!.querySelector('.stage.mix')!.textContent).toContain('?');
  // type only the first five — a partial Guess is NOT a color, so still "?"
  cells.slice(0, 5).forEach((k, i) => {
    tapCell(el, k);
    pressKey(el, 'ABCDE'[i]);
  });
  expect(el.shadowRoot!.querySelector('.stage.mix')!.textContent).toContain('?');
  expect(el.shadowRoot!.querySelector('.stage.mix.filled')).toBeNull();
  // the sixth digit completes the address — now the mix paints
  tapCell(el, cells[5]);
  pressKey(el, 'F');
  const mix = el.shadowRoot!.querySelector('.stage.mix') as HTMLElement;
  expect(mix.classList.contains('filled')).toBe(true);
  expect(mix.getAttribute('style')).toContain('#ABCDEF');
});

test('<c0ffee-crossword> checking an incomplete Slot warns and does not grade', () => {
  const el = mount();
  pressKey(el, 'A'); // one digit only
  pressCheck(el);
  expect(el.shadowRoot!.querySelector('.toast.warn')).toBeTruthy();
  expect(el.shadowRoot!.querySelectorAll('.chip').length).toBe(0); // no verdict yet
  // the warn path must NOT dispatch commit: nothing locks (a render-side proxy like
  // "no chips" would still pass a refactor that committed-then-suppressed-chips)
  expect(lockedAt(el, firstSlot().cells.map(cellKey)[0])).toBe(false);
});

test('<c0ffee-crossword> a commit renders per-Channel verdict chips matching the grader, and a toast', () => {
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

  const result = gradeGuess(target, guess);
  const chips = el.shadowRoot!.querySelectorAll('.chip');
  expect(chips.length).toBe(3);
  const verdictOf = (ch: string): string | null =>
    el.shadowRoot!.querySelector(`.chip[data-ch="${ch}"]`)!.getAttribute('data-verdict');
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

  // complete == every Cell locked (the reducer's honest completion test)
  expect(el.shadowRoot!.querySelectorAll('.lock').length).toBe(p.layout.cells.length);
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

// C0FFEE-66 — slice 3/4 navigation + full keyboard: clue-list routing (tap a clue
// to select its Slot), per-clue neutral verdict marks (contract #5), prev/next that
// walks layout.slots and skips fully-locked Slots, and a physical keyboard that
// mirrors the touch model (hex entry, Backspace=clearDigit, Enter=commit, arrows
// move the cursor / toggle direction at a crossing, Tab/Shift-Tab=prev/next). These
// assert the action wiring + projected state; the focus-ring + real keyboard feel get
// the browser eyeball. The assistive-tech layer (ARIA grid, roving focus) is C0FFEE-63.

// A physical key, dispatched at the host (where the keydown listener lives). The real
// element receives these from any focused shadow control too (they bubble to the host).
const pressPhysical = (
  el: HTMLElement,
  key: string,
  opts: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean } = {},
): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
};
const clabel = (el: HTMLElement): string => el.shadowRoot!.querySelector('.clabel')!.textContent ?? '';
const slotRowEl = (el: HTMLElement, key: string): HTMLElement =>
  el.shadowRoot!.querySelector(`[data-slot="${key}"]`) as HTMLElement;
const tapClue = (el: HTMLElement, key: string): void => click(slotRowEl(el, key));
const pressNav = (el: HTMLElement, dir: 'prev' | 'next'): void =>
  click(el.shadowRoot!.querySelector(`[data-nav="${dir}"]`));
// "1-Across" — the human clue label the element shows for a Slot (mirrors slotLabel).
const labelOf = (s: { number: number; direction: string }): string =>
  `${s.number}-${s.direction.charAt(0).toUpperCase()}${s.direction.slice(1)}`;
// Fill + commit the initially-selected Slot via the physical keyboard, locking it.
const solveSelected = (el: HTMLElement, target: string): void => {
  target.split('').forEach((d) => pressPhysical(el, d)); // cursor auto-advances per digit
  pressPhysical(el, 'Enter'); // commit -> a correct Guess locks every Cell
};

test('<c0ffee-crossword> the host is keyboard-focusable (tabindex 0) so keys can drive the puzzle', () => {
  const el = mount();
  expect(el.getAttribute('tabindex')).toBe('0');
});

test('<c0ffee-crossword> clue rows are <button>s carrying their Slot, and a tap routes selection', () => {
  const down = puzzle().layout.slots.find((s) => s.direction === 'down')!;
  const el = mount();
  const rows = [...el.shadowRoot!.querySelectorAll('.cluerow')] as HTMLElement[];
  expect(rows.length).toBe(puzzle().layout.slots.length);
  expect(rows.every((r) => r.tagName === 'BUTTON')).toBe(true);
  expect(rows.every((r) => !!r.getAttribute('data-slot'))).toBe(true);
  // tapping a down clue selects that Slot (the element opens on the first across Slot)
  expect(clabel(el)).toContain('Across');
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

test('<c0ffee-crossword> a not-yet-checked clue carries no verdict mark; a solved one shows a neutral mark', () => {
  const p = puzzle();
  const S = firstSlot();
  const el = mount();
  // fresh: the active Slot has been graded by nothing, so no persistent mark
  expect(slotRowEl(el, slotKey(S)).querySelector('.verdict')).toBeNull();
  solveSelected(el, p.targets[slotKey(S)]);
  const mark = slotRowEl(el, slotKey(S)).querySelector('.verdict');
  expect(mark).toBeTruthy();
  expect(mark!.textContent).toMatch(/solved/i); // icon + text
  // contract #5: a persistent clue-list mark is achromatic (neutral white stroke), never
  // a saturated channel color — assert the neutral stroke is what the glyph is drawn in
  expect(mark!.innerHTML).toContain('rgba(255,255,255');
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
  expect(el.shadowRoot!.querySelectorAll('.chip').length).toBe(3); // per-Channel verdict chips
  cells.forEach((k) => expect(lockedAt(el, k)).toBe(true));
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
  expect(S.cells.every((c) => lockedAt(el, cellKey(c)))).toBe(true); // S is fully locked

  // from EVERY other Slot, pressing next never lands on the locked S (it is skipped)
  for (const e of p.layout.slots) {
    if (slotKey(e) === slotKey(S)) continue;
    tapClue(el, slotKey(e));
    pressNav(el, 'next');
    expect(clabel(el)).not.toBe(labelOf(S));
  }
});

test('<c0ffee-crossword> prev/next no-ops when no other editable Slot remains (puzzle solved)', () => {
  const p = puzzle();
  const crossingKeys = new Set(p.layout.crossings.map((x) => cellKey(x.cell)));
  const el = mount();
  // solve the whole puzzle (same approach as the tap-driven complete test)
  for (const slot of p.layout.slots) {
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
  const before = clabel(el);
  pressNav(el, 'next'); // nothing editable anywhere -> no-op, selection unchanged
  expect(clabel(el)).toBe(before);
});

test('<c0ffee-crossword> keyboard: a Cmd/Ctrl modifier chord is left for the browser, not typed', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  pressPhysical(el, 'c', { metaKey: true }); // Cmd+C must copy, not type 'C' into the puzzle
  pressPhysical(el, 'f', { ctrlKey: true }); // Ctrl+F must reach find
  expect(glyphAt(el, cells[0])).toBeNull(); // nothing was typed
  expect(cursorKey(el)).toBe(cells[0]); // and the cursor did not advance
});

test('<c0ffee-crossword> a graded-but-unsolved clue shows the neutral "off" mark, not "solved"', () => {
  const p = puzzle();
  const S = firstSlot();
  const target = p.targets[slotKey(S)];
  // a six-digit Guess that differs from the target in the red Channel only (flip digit 0),
  // so green + blue lock but the Slot is not fully solved -> the 'off' mark
  const wrong = (target[0] === '0' ? '1' : '0') + target.slice(1);
  const el = mount();
  wrong.split('').forEach((d) => pressPhysical(el, d));
  pressPhysical(el, 'Enter');
  const mark = slotRowEl(el, slotKey(S)).querySelector('.verdict');
  expect(mark).toBeTruthy();
  expect(mark!.textContent).toMatch(/off/i);
  expect(mark!.innerHTML).toContain('rgba(255,255,255'); // contract #5 — achromatic
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
