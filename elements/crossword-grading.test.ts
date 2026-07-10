// The graded surfaces around the split compare bar: the "?" channel-hint legend
// disclosure (C0FFEE-77) and the bar's graded states (C0FFEE-72, handoff 2 §6).
// Solved: both fills the same color, ONE dark check centered over the seam.
// Checked-but-wrong: the bar stays unmarked — the seam (and the C0FFEE-71 receipt)
// carries the news.
import { test, expect } from 'vitest';
import { cellKey, slotKey } from '../lib/crossword-state.ts';
import {
  setupCrosswordSuite,
  mount,
  puzzle,
  firstSlot,
  tapCell,
  pressKey,
  pressCheck,
  cursorKey,
  glyphAt,
  commitFirstSlot,
  pressPhysical,
  q,
  act,
} from './crossword-test-kit.ts';

setupCrosswordSuite();

test('<c0ffee-crossword> the "?" channel-hint legend disclosure appears only once a Guess is graded', () => {
  const el = mount();
  // mid-Guess the meta line carries the typed-digit count and no "?" clutters it
  expect(q(el, '.count')).toBeTruthy();
  expect(q(el, '.legendbtn')).toBeNull();
  // a graded commit brings the receipt in with the "?" beside its digit pairs — and the
  // count STAYS on the meta row while the Slot is editable (C0FFEE-71, §6b)
  commitFirstSlot(el);
  expect(q(el, '.count')).toBeTruthy();
  expect(q(el, '.count')!.textContent).toContain('6 / 6');
  expect(q(el, '.receipt .legendbtn')).toBeTruthy();
});

test('<c0ffee-crossword> tapping the "?" opens a legend keying the three glyphs in words', () => {
  const el = mount();
  commitFirstSlot(el);
  // closed by default — it costs a returning solver who knows the glyphs nothing
  expect(q(el, '.legend')).toBeNull();
  expect(q(el, '.legendbtn')!.getAttribute('aria-expanded')).toBe('false');

  act(el, 'legend');
  expect(q(el, '.legend')).toBeTruthy();
  expect(q(el, '.legendbtn')!.getAttribute('aria-expanded')).toBe('true');
  const rows = el.shadowRoot!.querySelectorAll('.legendrow');
  expect(rows.length).toBe(3);
  const text = q(el, '.legend')!.textContent!.replace(/\s+/g, ' ');
  expect(text).toContain('matched - leave it');
  expect(text).toContain('too low - go higher');
  expect(text).toContain('too high - go lower');
});

test('<c0ffee-crossword> a solved Slot paints both halves the same color and stamps the seam check', () => {
  const p = puzzle();
  const slot = firstSlot();
  const target = p.targets[slotKey(slot)];
  const el = mount();
  slot.cells.forEach((c, i) => {
    tapCell(el, cellKey(c));
    pressKey(el, target[i].toUpperCase());
  });
  pressCheck(el);

  const root = el.shadowRoot!;
  // the mix half resolved to the SAME literal color as the clue half — the seam vanishes
  const mixStyle = (root.querySelector('.half.mix') as HTMLElement).getAttribute('style') ?? '';
  const clueStyle = (root.querySelector('.half.clue') as HTMLElement).getAttribute('style') ?? '';
  expect(mixStyle.toUpperCase()).toContain(`#${target.toUpperCase()}`);
  expect(clueStyle.toUpperCase()).toContain(`#${target.toUpperCase()}`);
  // ONE check over the seam (the darkened clue-list check) marks the solved Slot
  expect(root.querySelectorAll('.barcheck').length).toBe(1);
});

test('<c0ffee-crossword> a checked-but-wrong Guess leaves the bar unmarked', () => {
  const el = mount();
  commitFirstSlot(el); // '000000' is wrong for the SEED-1 first Slot
  // graded, so the receipt renders below the bar (C0FFEE-71)...
  expect(q(el, '.receipt')).toBeTruthy();
  // ...but no mark lands on the comparison surface itself
  expect(el.shadowRoot!.querySelector('.barcheck')).toBeNull();
});

test('<c0ffee-crossword> the legend dismisses via a second "?" tap, the backdrop, and Escape', () => {
  const el = mount();
  el.focus();
  commitFirstSlot(el);

  // a second "?" tap toggles it shut
  act(el, 'legend');
  expect(q(el, '.legend')).toBeTruthy();
  act(el, 'legend');
  expect(q(el, '.legend')).toBeNull();

  // a tap on the full-bleed backdrop (the kebab-menu dismiss model) closes it
  act(el, 'legend');
  expect(q(el, '.legendback')).toBeTruthy();
  act(el, 'legend-close');
  expect(q(el, '.legend')).toBeNull();

  // Escape closes it
  act(el, 'legend');
  pressPhysical(el, 'Escape');
  expect(q(el, '.legend')).toBeNull();
});

test('<c0ffee-crossword> Escape closes the legend first (the most-local overlay), keeping focus', () => {
  const el = mount();
  el.focus();
  commitFirstSlot(el);
  act(el, 'legend');
  expect(q(el, '.legend')).toBeTruthy();
  pressPhysical(el, 'Escape');
  expect(q(el, '.legend')).toBeNull();
  expect(document.activeElement).toBe(el); // focus retained — the legend absorbed the Escape
});

test('<c0ffee-crossword> the board stays live behind the open legend (no scrim, no freeze)', () => {
  const el = mount();
  el.focus();
  commitFirstSlot(el);
  act(el, 'legend');
  expect(q(el, '.legend')).toBeTruthy();
  expect(q(el, '.scrim')).toBeNull(); // not a scrim overlay — the board is never dimmed
  // a physical digit still reaches the board: the game surface is live behind the legend
  const cur = cursorKey(el)!;
  pressPhysical(el, 'A');
  expect(glyphAt(el, cur)).toBe('A');
});
