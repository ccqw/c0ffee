// Shell smoke test (ADR-0006) for <c0ffee-crossword>, slice 1 of 4 (C0FFEE-64):
// the read-only render. happy-dom can't paint, so this asserts the rendered shadow
// DOM projects the shipped core's CrosswordState + Layout — the woven board, the
// Across/Down clue list, the clue-vs-your-mix comparison, and the active-Slot
// channel-pair outlines. The real weave fidelity + ADR-0007 color contract get a
// human browser eyeball (this slice is HITL); this covers the structural wiring.
import { test, expect } from 'vitest';
import { initCrossword } from '../lib/crossword-state.ts';
import { setupCrosswordSuite, mount, puzzle, openClues } from './crossword-test-kit.ts';

setupCrosswordSuite();

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
  // C0FFEE-73: the clue list lives in the switchable clue pane, not the default entry pane
  openClues(el);

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

test('<c0ffee-crossword> renders the split compare bar: clue fill painted its target, empty you-half', () => {
  const p = puzzle();
  // the element opens on the lowest-numbered Slot, across before down
  const first = [...p.layout.slots].sort(
    (a, b) => a.number - b.number || (a.direction < b.direction ? -1 : 1),
  )[0];
  const target = p.targets[`${first.number}-${first.direction}`];

  const el = mount();
  const root = el.shadowRoot!;
  // ONE bar, two fills meeting at the seam (handoff 2 §6) — the seam IS the comparison
  const bar = root.querySelector('.splitbar') as HTMLElement;
  expect(bar).toBeTruthy();
  expect(bar.querySelectorAll('.half').length).toBe(2);
  // the clue half carries the literal target Color value, pinned to the seed (contract #1)
  const clue = bar.querySelector('.half.clue') as HTMLElement;
  expect(clue.getAttribute('style')).toContain(`#${target}`);
  // the you-half is empty -> the page-bg "?" placeholder
  expect(bar.querySelector('.half.mix')!.textContent).toContain('?');
  // the neutral captions sit ABOVE the bar, one centered over each half
  expect([...root.querySelectorAll('.caps span')].map((s) => s.textContent)).toEqual(['clue', 'you']);
});

test('<c0ffee-crossword> opens on an active Slot, outlined in three channel pairs (contract #2)', () => {
  // connectedCallback selects the first Slot, so its three R/G/B pair outlines render;
  // a regression that left nothing selected would drop these to 0
  const el = mount();
  expect(el.shadowRoot!.querySelectorAll('.pair').length).toBe(3);
});

test('<c0ffee-crossword> hand-rolls one clue swatch per Slot (opts out of ADR-0001 — no nested swatch)', () => {
  const slots = puzzle().layout.slots.length;
  const el = mount();
  openClues(el); // C0FFEE-73: the clue swatches live in the clue pane
  // the clue swatches are plain painted boxes the element owns, one per Slot...
  expect(el.shadowRoot!.querySelectorAll('.clueswatch').length).toBe(slots);
  // ...not <c0ffee-swatch>, whose click-to-load would hijack the hash with a clue color
  expect(el.shadowRoot!.querySelector('c0ffee-swatch')).toBeNull();
});
