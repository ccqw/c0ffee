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

// The element generates its own puzzle from a fixed shape + seed; the tests
// regenerate the same pair to know the expected counts (the generator is the
// ADR-0009 deterministic seam, so this matches what the element renders).
const SHAPE = 'ladder-14';
const SEED = 1;

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
  const expected = initCrossword(generatePuzzle(SHAPE, SEED)).puzzle.layout.cells.length;
  const el = mount();
  expect(el.shadowRoot!.querySelectorAll('.cell').length).toBe(expected);
});

test('<c0ffee-crossword> renders an Across/Down clue list entry per Slot', () => {
  const slots = generatePuzzle(SHAPE, SEED).layout.slots.length;
  const el = mount();
  expect(el.shadowRoot!.querySelectorAll('.cluerow').length).toBe(slots);
});

test('<c0ffee-crossword> renders the comparison: a painted clue stage + an empty mix', () => {
  const el = mount();
  expect(el.shadowRoot!.querySelectorAll('.stage').length).toBe(2);
  // clue stage carries the literal target Color value (ADR-0007 contract #1)
  const clue = el.shadowRoot!.querySelector('.stage.clue') as HTMLElement;
  expect(clue.getAttribute('style')).toContain('background');
  // mix empty -> the "?" placeholder, since slice 1 takes no input yet
  expect(el.shadowRoot!.querySelector('.stage.mix')!.textContent).toContain('?');
});

test('<c0ffee-crossword> outlines the active Slot in three channel pairs (ADR-0007 contract #2)', () => {
  const el = mount();
  expect(el.shadowRoot!.querySelectorAll('.pair').length).toBe(3);
});

test('<c0ffee-crossword> hand-rolls its clue chips (opts out of ADR-0001 — no nested swatch)', () => {
  const el = mount();
  // the clue chips are plain painted boxes the element owns...
  expect(el.shadowRoot!.querySelectorAll('.box').length).toBeGreaterThan(0);
  // ...not <c0ffee-swatch>, whose click-to-load would hijack the hash with a clue color
  expect(el.shadowRoot!.querySelector('c0ffee-swatch')).toBeNull();
});
