// Shell smoke test (ADR-0006) for <c0ffee-crossword>, slice 1 of 4 (C0FFEE-64):
// the read-only render. happy-dom can't paint, so this asserts the rendered shadow
// DOM projects the shipped core's CrosswordState + Layout — the woven board, the
// Across/Down clue list, the clue-vs-your-mix comparison, and the active-Slot
// channel-pair outlines. The real weave fidelity + ADR-0007 color contract get a
// human browser eyeball (this slice is HITL); this covers the structural wiring.
import { test, expect, beforeAll } from 'vitest';
import { generatePuzzle } from '../lib/crossword-generator.ts';
import { initCrossword } from '../lib/crossword-state.ts';
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

test('<c0ffee-crossword> labels each Slot start with a deduped clue number', () => {
  // a Cell that starts both an across and a down Slot shows ONE number, so the label
  // count is the number of distinct start Cells, not the Slot count
  const starts = new Set(puzzle().layout.slots.map((s) => `${s.cells[0].row},${s.cells[0].col}`));
  const el = mount();
  expect(el.shadowRoot!.querySelectorAll('.num').length).toBe(starts.size);
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

const cellKey = (c: { row: number; col: number }): string => `${c.row},${c.col}`;
const slotKey = (s: { number: number; direction: string }): string => `${s.number}-${s.direction}`;

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

test('<c0ffee-crossword> the your-mix swatch paints live as digits are typed', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  // fresh: the empty "?" placeholder
  expect(el.shadowRoot!.querySelector('.stage.mix')!.textContent).toContain('?');
  cells.forEach((k, i) => {
    tapCell(el, k);
    pressKey(el, 'ABCDEF'[i]);
  });
  const mix = el.shadowRoot!.querySelector('.stage.mix') as HTMLElement;
  expect(mix.getAttribute('style')).toContain('#ABCDEF'); // the live mix color
});

test('<c0ffee-crossword> checking an incomplete Slot warns and does not grade', () => {
  const el = mount();
  pressKey(el, 'A'); // one digit only
  pressCheck(el);
  expect(el.shadowRoot!.querySelector('.toast.warn')).toBeTruthy();
  expect(el.shadowRoot!.querySelectorAll('.chip').length).toBe(0); // no verdict yet
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
});
