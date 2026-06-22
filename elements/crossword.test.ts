// Shell smoke test (ADR-0006) for <c0ffee-crossword>, slice 1 of 4 (C0FFEE-64):
// the read-only render. happy-dom can't paint, so this asserts the rendered shadow
// DOM projects the shipped core's CrosswordState + Layout — the woven board, the
// Across/Down clue list, the clue-vs-your-mix comparison, and the active-Slot
// channel-pair outlines. The real weave fidelity + ADR-0007 color contract get a
// human browser eyeball (this slice is HITL); this covers the structural wiring.
import { test, expect, beforeAll } from 'vitest';
import { generatePuzzle } from '../lib/crossword-generator.ts';
import { initCrossword } from '../lib/crossword-state.ts';

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
