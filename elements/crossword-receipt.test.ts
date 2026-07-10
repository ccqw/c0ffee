// The checked receipt (C0FFEE-71, handoff 2 §6b) + the padlock density rule it
// interacts with (C0FFEE-68, §5a). The verdict is pinned to the exact six digits it
// graded ("feedback that names its referent can never go stale"): the receipt renders
// below the split bar once the Slot has a graded Guess, never re-grades live, and
// flips its caption on divergence only.
// The SEED-1 first-Slot target is 83BEF1, so '000000' grades all-wrong (nothing locks).
import { test, expect } from 'vitest';
import { cellKey, slotKey } from '../lib/crossword-state.ts';
import {
  setupCrosswordSuite,
  mount,
  puzzle,
  firstSlot,
  click,
  tapCell,
  tapClue,
  pressKey,
  pressDelete,
  pressCheck,
  glyphAt,
  lockedAt,
  commitFirstSlot,
  solveSelected,
  q,
  act,
} from './crossword-test-kit.ts';

setupCrosswordSuite();

const receiptCaption = (el: HTMLElement): string =>
  q(el, '.receipt .rcaption')!.textContent!.trim();

test('<c0ffee-crossword> receipt: shows the graded swatch, "now", and the graded digit pairs', () => {
  const el = mount();
  commitFirstSlot(el); // graded guess '000000'
  const receipt = q(el, '.receipt')!;
  // the 18px swatch carries the literal graded mix — full fidelity, never dimmed (contract #1)
  expect(q(el, '.receipt .rswatch')!.getAttribute('style')).toContain('#000000');
  expect(receiptCaption(el)).toBe('now');
  // current == graded: no restore affordance, the receipt is inert
  expect(q(el, '.receipt .rundo')).toBeNull();
  expect(receipt.getAttribute('data-act')).toBeNull();
  // the three graded digit pairs, right-pinned, spell the graded guess
  const pairTexts = [...el.shadowRoot!.querySelectorAll('.rpair .id')].map((n) => n.textContent);
  expect(pairTexts).toEqual(['00', '00', '00']);
  // the chips era is over — nothing renders under the old meta-row classes
  expect(q(el, '.chip')).toBeNull();
});

test('<c0ffee-crossword> receipt: editing a graded Cell flips to "last" and reveals restore', () => {
  const el = mount();
  commitFirstSlot(el);
  // after the (all-wrong) commit the cursor re-inits to the Slot's first Cell — a
  // keypress edits it in place (a tapCell here would re-tap the crossing cursor Cell
  // and toggle to the ungraded down Slot instead)
  pressKey(el, '1'); // diverge from the graded '0'
  expect(receiptCaption(el)).toBe('last');
  expect(q(el, '.receipt .rundo')).toBeTruthy();
  expect(q(el, '.receipt')!.getAttribute('data-act')).toBe('restore');
  // the verdict stays pinned to its referent: swatch and pairs still show the GRADED digits
  expect(q(el, '.receipt .rswatch')!.getAttribute('style')).toContain('#000000');
  const pairTexts = [...el.shadowRoot!.querySelectorAll('.rpair .id')].map((n) => n.textContent);
  expect(pairTexts).toEqual(['00', '00', '00']);
});

test('<c0ffee-crossword> receipt: clearing a graded Cell (empty != graded) also reads as diverged', () => {
  const el = mount();
  commitFirstSlot(el);
  // the cursor sits on the filled first Cell after the commit: delete clears it in place
  pressDelete(el); // the Cell empties — no digit is not the graded digit
  expect(receiptCaption(el)).toBe('last');
  expect(q(el, '.receipt .rundo')).toBeTruthy();
});

test('<c0ffee-crossword> receipt: tap-to-restore returns every unlocked Cell to its graded digit', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  commitFirstSlot(el);
  // cursor is on cells[0] after the commit: rewrite it (auto-advance to cells[1]),
  // then delete cells[1] in place — two kinds of divergence, no taps (a cursor-Cell
  // re-tap would toggle direction on the crossing first Cell)
  pressKey(el, '1'); // one Cell rewritten...
  pressDelete(el); // ...and one emptied
  expect(glyphAt(el, cells[0])).toBe('1');
  expect(glyphAt(el, cells[1])).toBeNull();
  expect(receiptCaption(el)).toBe('last');

  click(q(el, '.receipt')); // tap the receipt while diverged
  expect(glyphAt(el, cells[0])).toBe('0');
  expect(glyphAt(el, cells[1])).toBe('0');
  // input == referent again: the caption returns and the affordance leaves
  expect(receiptCaption(el)).toBe('now');
  expect(q(el, '.receipt .rundo')).toBeNull();
  expect(q(el, '.receipt')!.getAttribute('data-act')).toBeNull();
});

test('<c0ffee-crossword> receipt: restore skips locked Cells (they already hold their graded digits)', () => {
  const p = puzzle();
  const slot = firstSlot();
  const target = p.targets[slotKey(slot)]; // 83BEF1
  const cells = slot.cells.map(cellKey);
  // red + green digits correct (those four Cells lock on commit), blue byte wrong
  const graded = target.slice(0, 4) + '0' + target[5];
  const el = mount();
  cells.forEach((k, i) => {
    tapCell(el, k);
    pressKey(el, graded[i].toUpperCase());
  });
  pressCheck(el);
  expect(lockedAt(el, cells[0])).toBe(true); // red locked
  expect(lockedAt(el, cells[4])).toBe(false); // blue editable

  // the cursor re-inits to the first NON-LOCKED Cell after the commit — cells[4]
  pressKey(el, 'F'); // diverge on the unlocked blue Cell
  expect(receiptCaption(el)).toBe('last');
  click(q(el, '.receipt'));
  // the unlocked Cell returns to the graded (wrong) digit — not the answer
  expect(glyphAt(el, cells[4])).toBe('0');
  // locked Cells kept their graded digits throughout
  expect(glyphAt(el, cells[0])).toBe(target[0].toUpperCase());
  expect(receiptCaption(el)).toBe('now');
});

// C0FFEE-68 — padlock density (handoff 2 §5a): lock BEHAVIOR is engine truth and
// unchanged (a commit locks both Cells of every correct Channel), but the padlock
// ICON is the crossing-cell signifier — it explains "you can't change this from THIS
// Slot". A matched pair in the solver's own Slot is already explained by its verdict
// feedback, so it renders bare.
test('<c0ffee-crossword> padlock shows on locked crossing Cells only; own-Slot matched pairs render bare but stay locked', () => {
  const p = puzzle();
  const slot = firstSlot();
  const target = p.targets[slotKey(slot)]; // 83BEF1
  const cells = slot.cells.map(cellKey);
  const crossingKeys = new Set(p.layout.crossings.map((x) => cellKey(x.cell)));
  // red + green digits correct (cells[0..3] lock on commit), blue byte wrong (editable)
  const graded = target.slice(0, 4) + '0' + target[5];
  const el = mount();
  cells.forEach((k, i) => {
    tapCell(el, k);
    pressKey(el, graded[i].toUpperCase());
  });
  pressCheck(el);

  // the pinned board must exercise BOTH kinds of locked Cell or this proves nothing
  const locked = cells.slice(0, 4);
  const crossing = locked.filter((k) => crossingKeys.has(k));
  const plain = locked.filter((k) => !crossingKeys.has(k));
  expect(crossing.length).toBeGreaterThan(0);
  expect(plain.length).toBeGreaterThan(0);

  // the icon is reserved for the dual-role crossing Cells...
  crossing.forEach((k) => expect(lockedAt(el, k)).toBe(true));
  plain.forEach((k) => expect(lockedAt(el, k)).toBe(false));

  // ...while a bare locked Cell still rejects input — behavior untouched. The tap
  // cannot seat the cursor on it and the keypress lands elsewhere.
  const i = cells.indexOf(plain[0]);
  const wrong = target[i].toUpperCase() === 'F' ? '0' : 'F';
  tapCell(el, plain[0]);
  pressKey(el, wrong);
  expect(glyphAt(el, plain[0])).toBe(target[i].toUpperCase());
});

test('<c0ffee-crossword> receipt: inert while current — a tap changes nothing', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  commitFirstSlot(el);
  click(q(el, '.receipt'));
  expect(receiptCaption(el)).toBe('now');
  cells.forEach((k) => expect(glyphAt(el, k)).toBe('0'));
});

test('<c0ffee-crossword> receipt: is per-Slot — another Slot shows none until ITS Guess is graded', () => {
  const p = puzzle();
  const down = p.layout.slots.find((s) => s.direction === 'down')!;
  const el = mount();
  commitFirstSlot(el);
  expect(q(el, '.receipt')).toBeTruthy();
  tapClue(el, slotKey(down)); // select an ungraded Slot
  expect(q(el, '.receipt')).toBeNull();
  tapClue(el, slotKey(firstSlot())); // back to the graded one
  expect(q(el, '.receipt')).toBeTruthy();
});

test('<c0ffee-crossword> receipt: a tap on the open "?" popover closes it without restoring', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  commitFirstSlot(el);
  pressKey(el, '1'); // diverge — the receipt is now the restore control
  act(el, 'legend'); // open the "?" popover, which is nested inside the receipt
  expect(q(el, '.legend')).toBeTruthy();
  // the dismiss-tap reflex on the popover body must never route to the receipt's
  // restore (the popover is inside the data-act="restore" subtree)
  click(q(el, '.legendrow'));
  expect(q(el, '.legend')).toBeNull(); // the tap closed the popover...
  expect(glyphAt(el, cells[0])).toBe('1'); // ...and the solver's edit survived
  expect(receiptCaption(el)).toBe('last');
});

test('<c0ffee-crossword> receipt: no restore affordance when the graded digits are unreachable', () => {
  // A crossing Cell this Slot graded WRONG can later lock at the TRUE digit via the
  // perpendicular Slot. The graded Guess then can never be fully reinstated (locks are
  // permanent): the caption stays honestly "last", but the restore glyph/action
  // — the affordance — must not render for a control that cannot do its job.
  const p = puzzle();
  const across = firstSlot();
  const target = p.targets[slotKey(across)]; // 83BEF1
  const cells = across.cells.map(cellKey);
  // cells[0] ("0,0") is the crossing with 1-down; grade the across with ONLY that
  // red digit wrong, so cells[0]+cells[1] stay unlocked and green/blue lock
  const wrong0 = target[0] === '0' ? '1' : '0';
  const graded = wrong0 + target.slice(1);
  const el = mount();
  cells.forEach((k, i) => {
    tapCell(el, k);
    pressKey(el, graded[i].toUpperCase());
  });
  pressCheck(el);
  expect(lockedAt(el, cells[0])).toBe(false); // red graded wrong — still editable

  // solve the perpendicular 1-down: its commit locks the shared Cell at the TRUE digit
  const down = p.layout.slots.find((s) => s.number === 1 && s.direction === 'down')!;
  tapClue(el, slotKey(down));
  const downTarget = p.targets[slotKey(down)];
  down.cells.forEach((c, i) => {
    tapCell(el, cellKey(c));
    pressKey(el, downTarget[i].toUpperCase());
  });
  pressCheck(el);
  expect(lockedAt(el, cells[0])).toBe(true); // the crossing Cell locked via 1-down

  // back on the across: locked-at-true != graded -> stale, but nothing is restorable
  tapClue(el, slotKey(across));
  expect(receiptCaption(el)).toBe('last');
  expect(q(el, '.receipt .rundo')).toBeNull();
  expect(q(el, '.receipt')!.getAttribute('data-act')).toBeNull();
});

test('<c0ffee-crossword> receipt: a solved Slot retires it and the meta count leaves with it', () => {
  const p = puzzle();
  const S = firstSlot();
  const el = mount();
  solveSelected(el, p.targets[slotKey(S)]);
  expect(q(el, '.receipt')).toBeNull(); // the bar's centered check carries the news
  expect(q(el, '.barcheck')).toBeTruthy();
  expect(q(el, '.count')).toBeNull(); // no count on a Slot that is no longer editable
});
