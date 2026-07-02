// Shell smoke test (ADR-0006) for <c0ffee-crossword>, slice 1 of 4 (C0FFEE-64):
// the read-only render. happy-dom can't paint, so this asserts the rendered shadow
// DOM projects the shipped core's CrosswordState + Layout — the woven board, the
// Across/Down clue list, the clue-vs-your-mix comparison, and the active-Slot
// channel-pair outlines. The real weave fidelity + ADR-0007 color contract get a
// human browser eyeball (this slice is HITL); this covers the structural wiring.
import { test, expect, beforeAll, beforeEach, vi } from 'vitest';
import { generatePuzzle } from '../lib/crossword-generator.ts';
import { initCrossword, cellKey, slotKey } from '../lib/crossword-state.ts';
import { gradeGuess } from '../lib/crossword-guess.ts';
import { encodePuzzleToken, decodePuzzleToken } from '../lib/crossword-link.ts';
import { datadogRum } from '@datadog/browser-rum-slim';

// happy-dom v20 does not provide localStorage, but the element uses it for the one
// coach "seen" flag (C0FFEE-67). Install a minimal in-memory polyfill on window +
// globalThis BEFORE the element is imported, so the gating is exercised in tests; a
// real browser supplies the genuine Web Storage API. Matched by the element's own
// defensive accessor (it no-ops where storage is unavailable, e.g. private mode).
if (!(globalThis as { localStorage?: unknown }).localStorage) {
  const store = new Map<string, string>();
  const ls: Storage = {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as { localStorage: Storage }).localStorage = ls;
  if (typeof window !== 'undefined') (window as unknown as { localStorage: Storage }).localStorage = ls;
}

// Registering the custom element is a module side effect (customElements.define).
beforeAll(async () => {
  await import('./crossword.ts');
});

// C0FFEE-67 introduces the site's first localStorage use — the one "coach seen"
// flag. happy-dom shares one localStorage across the whole file, so reset it before
// every test to a deterministic baseline: a RETURNING visitor (flag set) — so the
// 64/65/66 tests below never see the first-run coach over their board and never
// depend on test order. The coach tests clear the flag themselves to simulate a
// first visit. (The element owns the real key; tests assert behavior, not the key.)
const COACH_SEEN_KEY = 'c0ffee:crossword:coach-seen';
beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(COACH_SEEN_KEY, '1');
  // The element reads location.hash on connect (C0FFEE-78 Puzzle link). Reset it to empty
  // so every test that does not opt into a Puzzle-link hash opens the default puzzle; the
  // hash-load tests set it explicitly before mounting.
  window.location.hash = '';
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

// --- the "?" channel-hint legend disclosure (C0FFEE-77) ------------------------
// Commit '000000' on the entry Slot so a graded Guess exists: the per-Channel hint
// strip (and therefore the "?" disclosure) only render once a Slot has been graded.
// '000000' is wrong for the SEED-1 first Slot, so the band shows the hints (not the
// solved state), and one Slot's commit can't complete the whole puzzle, so the dock
// (and its comparison band) stays put.
const commitFirstSlot = (el: HTMLElement): void => {
  firstSlot().cells.forEach((c) => {
    tapCell(el, cellKey(c));
    pressKey(el, '0');
  });
  pressCheck(el);
};

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

// --- the split compare bar's graded states (C0FFEE-72, handoff 2 §6) -----------
// Solved: both fills the same color, ONE dark check centered over the seam.
// Checked-but-wrong: the bar stays unmarked — the seam (and, until C0FFEE-71
// lands the receipt, the meta-row chips) carries the news.

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

// --- the checked receipt (C0FFEE-71, handoff 2 §6b) -----------------------------
// The verdict is pinned to the exact six digits it graded ("feedback that names its
// referent can never go stale"): the receipt renders below the split bar once the Slot
// has a graded Guess, never re-grades live, and flips its caption on divergence only.
// The SEED-1 first-Slot target is 83BEF1, so '000000' grades all-wrong (nothing locks).

const receiptCaption = (el: HTMLElement): string =>
  q(el, '.receipt .rcaption')!.textContent!.trim();

test('<c0ffee-crossword> receipt: shows the graded swatch, "checked now", and the graded digit pairs', () => {
  const el = mount();
  commitFirstSlot(el); // graded guess '000000'
  const receipt = q(el, '.receipt')!;
  // the 18px swatch carries the literal graded mix — full fidelity, never dimmed (contract #1)
  expect(q(el, '.receipt .rswatch')!.getAttribute('style')).toContain('#000000');
  expect(receiptCaption(el)).toBe('checked now');
  // current == graded: no restore affordance, the receipt is inert
  expect(q(el, '.receipt .rundo')).toBeNull();
  expect(receipt.getAttribute('data-act')).toBeNull();
  // the three graded digit pairs, right-pinned, spell the graded guess
  const pairTexts = [...el.shadowRoot!.querySelectorAll('.rpair .id')].map((n) => n.textContent);
  expect(pairTexts).toEqual(['00', '00', '00']);
  // the chips era is over — nothing renders under the old meta-row classes
  expect(q(el, '.chip')).toBeNull();
});

test('<c0ffee-crossword> receipt: editing a graded Cell flips to "last checked" and reveals restore', () => {
  const el = mount();
  commitFirstSlot(el);
  // after the (all-wrong) commit the cursor re-inits to the Slot's first Cell — a
  // keypress edits it in place (a tapCell here would re-tap the crossing cursor Cell
  // and toggle to the ungraded down Slot instead)
  pressKey(el, '1'); // diverge from the graded '0'
  expect(receiptCaption(el)).toBe('last checked');
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
  expect(receiptCaption(el)).toBe('last checked');
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
  expect(receiptCaption(el)).toBe('last checked');

  click(q(el, '.receipt')); // tap the receipt while diverged
  expect(glyphAt(el, cells[0])).toBe('0');
  expect(glyphAt(el, cells[1])).toBe('0');
  // input == referent again: the caption returns and the affordance leaves
  expect(receiptCaption(el)).toBe('checked now');
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
  expect(receiptCaption(el)).toBe('last checked');
  click(q(el, '.receipt'));
  // the unlocked Cell returns to the graded (wrong) digit — not the answer
  expect(glyphAt(el, cells[4])).toBe('0');
  // locked Cells kept their graded digits throughout
  expect(glyphAt(el, cells[0])).toBe(target[0].toUpperCase());
  expect(receiptCaption(el)).toBe('checked now');
});

test('<c0ffee-crossword> receipt: inert while current — a tap changes nothing', () => {
  const cells = firstSlot().cells.map(cellKey);
  const el = mount();
  commitFirstSlot(el);
  click(q(el, '.receipt'));
  expect(receiptCaption(el)).toBe('checked now');
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
  expect(receiptCaption(el)).toBe('last checked');
});

test('<c0ffee-crossword> receipt: no restore affordance when the graded digits are unreachable', () => {
  // A crossing Cell this Slot graded WRONG can later lock at the TRUE digit via the
  // perpendicular Slot. The graded Guess then can never be fully reinstated (locks are
  // permanent): the caption stays honestly "last checked", but the restore glyph/action
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
  expect(receiptCaption(el)).toBe('last checked');
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
  // asserted in the celebration-cleanup tests below.
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
// C0FFEE-73: the clue list now lives in a switchable pane reached via the "Clue list"
// button (only present in the entry pane). openClues opens it if we are in the entry
// pane and is a no-op once the clue pane is already showing (the button is gone there),
// so it is safe to call before any clue-row interaction.
const openClues = (el: HTMLElement): void => {
  const btn = el.shadowRoot!.querySelector('[data-act="pane-clues"]');
  if (btn) click(btn);
};
// A clue-row tap opens the clue pane (if needed), clicks the row, and — by the
// auto-return contract — drops back into the entry pane with that Slot selected.
const tapClue = (el: HTMLElement, key: string): void => {
  openClues(el);
  click(slotRowEl(el, key));
};
// The per-row status the clue panel projects: 'unguessed' | 'match' | 'wrong'.
const rowState = (el: HTMLElement, key: string): string | null =>
  slotRowEl(el, key).getAttribute('data-state');
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

// C0FFEE-67 — slice 4/4 chrome: the surrounding affordances that turn the playable
// element into the finished game. A topbar (timer · pause · help · menu), one shared
// scrim primitive under the coach / pause / confirm overlays, a lock callout that
// fires once per puzzle on the first crossing-lock, a timer coupled to the overlay
// layer, Restart/New behind a destructive confirm, and the completion card. happy-dom
// can't paint or measure rects, so these assert the wiring + projected state + the
// localStorage gating; the bottom-sheet motion, rect anchoring, recolor and bloom get
// the browser eyeball.

const q = (el: HTMLElement, sel: string): Element | null => el.shadowRoot!.querySelector(sel);
const act = (el: HTMLElement, name: string): void =>
  click(el.shadowRoot!.querySelector(`[data-act="${name}"]`));
// Solve a Slot fully via taps (selecting it first by a Cell unique to it), locking it.
const solveSlot = (el: HTMLElement, p: ReturnType<typeof puzzle>, slot: typeof p.layout.slots[number]): void => {
  const xset = new Set(p.layout.crossings.map((x) => cellKey(x.cell)));
  const sel = slot.cells.map(cellKey).find((k) => !xset.has(k))!;
  tapCell(el, sel);
  const target = p.targets[slotKey(slot)];
  slot.cells.forEach((c, i) => {
    const k = cellKey(c);
    if (lockedAt(el, k)) return;
    if (cursorKey(el) !== k) tapCell(el, k);
    pressKey(el, target[i]);
  });
  pressCheck(el);
};

test('<c0ffee-crossword> renders a topbar with timer, pause, help and menu controls', () => {
  const el = mount();
  expect(q(el, '.topbar')).toBeTruthy();
  expect(q(el, '[data-act="pause"]')).toBeTruthy();
  expect(q(el, '[data-act="help"]')).toBeTruthy();
  expect(q(el, '[data-act="menu"]')).toBeTruthy();
  expect(q(el, '.timer')).toBeTruthy();
});

test('<c0ffee-crossword> the coach auto-shows on a first visit and is gated by a localStorage seen-flag', () => {
  window.localStorage.removeItem(COACH_SEEN_KEY); // simulate a first-ever visit
  const first = mount();
  expect(q(first, '.coach')).toBeTruthy(); // the first-run explainer auto-shows
  expect(q(first, '.scrim')).toBeTruthy(); // over a scrim-dimmed board

  // advancing to step 2 and tapping "Got it" records the seen-flag, so a brand-new
  // element stays quiet
  act(first, 'coach-next');
  act(first, 'coach-done');
  expect(q(first, '.coach')).toBeNull();
  expect(window.localStorage.getItem(COACH_SEEN_KEY)).toBeTruthy();

  const second = mount(); // a returning visitor — the flag is now set
  expect(q(second, '.coach')).toBeNull();
});

test('<c0ffee-crossword> the help control re-summons the coach; New/Restart do not', () => {
  const el = mount(); // returning visitor (flag set in beforeEach) — coach hidden
  expect(q(el, '.coach')).toBeNull();
  act(el, 'help'); // "?" re-summons it (at step 1)
  expect(q(el, '.coach')).toBeTruthy();
  act(el, 'coach-skip'); // Skip dismisses from step 1

  // New / Restart reset the board but must NOT re-trigger the coach
  act(el, 'menu');
  act(el, 'new');
  act(el, 'confirm-ok');
  expect(q(el, '.coach')).toBeNull();
});

test('<c0ffee-crossword> pause, confirm and coach all ride one shared scrim primitive', () => {
  // pause overlay
  const a = mount();
  act(a, 'pause');
  expect(q(a, '.scrim')).toBeTruthy();
  expect(q(a, '.pause')).toBeTruthy();

  // confirm dialog
  const b = mount();
  act(b, 'menu');
  act(b, 'restart');
  expect(q(b, '.scrim')).toBeTruthy();
  expect(q(b, '.confirm')).toBeTruthy();

  // coach
  window.localStorage.removeItem(COACH_SEEN_KEY);
  const c = mount();
  expect(q(c, '.scrim')).toBeTruthy();
  expect(q(c, '.coach')).toBeTruthy();
});

test('<c0ffee-crossword> Restart asks for confirmation, then wipes every entry and lock', () => {
  const p = puzzle();
  const S = firstSlot();
  const el = mount();
  solveSlot(el, p, S);
  expect(el.shadowRoot!.querySelectorAll('.lock').length).toBeGreaterThan(0); // locked some cells

  act(el, 'menu');
  act(el, 'restart'); // opens the destructive confirm — does NOT wipe yet
  expect(q(el, '.confirm')).toBeTruthy();
  expect(el.shadowRoot!.querySelectorAll('.lock').length).toBeGreaterThan(0); // still locked

  act(el, 'confirm-ok'); // confirmed -> newPuzzle(same Puzzle): wipes entries + verdicts + locks
  expect(el.shadowRoot!.querySelectorAll('.lock').length).toBe(0);
  expect(el.shadowRoot!.querySelectorAll('.cell .glyph').length).toBe(0); // no digits remain
  expect(q(el, '.confirm')).toBeNull(); // dialog closed
});

test('<c0ffee-crossword> Restart keeps the same puzzle; New generates a fresh one', () => {
  const p = puzzle();
  const firstClue = slotKey(firstSlot());
  const targetSame = p.targets[firstClue];
  const targetFresh = generatePuzzle(SHAPE, SEED + 1).targets[firstClue];

  const a = mount();
  // the entry pane's clue half is painted the selected Slot's target (contract #1)
  const clueColor = (el: HTMLElement): string =>
    (q(el, '.half.clue') as HTMLElement).getAttribute('style')!;
  expect(clueColor(a)).toContain(`#${targetSame}`);
  act(a, 'menu');
  act(a, 'restart');
  act(a, 'confirm-ok');
  expect(clueColor(a)).toContain(`#${targetSame}`); // same Puzzle, same target color

  const b = mount();
  act(b, 'menu');
  act(b, 'new');
  act(b, 'confirm-ok');
  expect(clueColor(b)).toContain(`#${targetFresh}`); // a freshly-generated puzzle (seed advanced)
});

test('<c0ffee-crossword> the lock callout fires once on the first crossing-lock, naming the dual-role cell', () => {
  const p = puzzle();
  const S = firstSlot(); // solving the first across Slot locks its crossing Cells
  const el = mount();
  expect(q(el, '.lockcallout')).toBeNull();
  solveSlot(el, p, S);
  const callout = q(el, '.lockcallout');
  expect(callout).toBeTruthy();
  // it names both roles of the shared Cell (the committed Slot + the crossing Slot)
  expect(callout!.textContent).toMatch(/Across/);
  expect(callout!.textContent).toMatch(/Down/);
});

test('<c0ffee-crossword> the lock callout dismisses on the next input and does not re-fire for the puzzle', () => {
  const p = puzzle();
  const S = firstSlot();
  const el = mount();
  solveSlot(el, p, S);
  expect(q(el, '.lockcallout')).toBeTruthy();
  pressKey(el, 'A'); // next input dismisses the transient callout
  expect(q(el, '.lockcallout')).toBeNull();

  // solving ANOTHER crossing Slot must not re-summon it (fires once per puzzle)
  const other = p.layout.slots.find((s) => slotKey(s) !== slotKey(S))!;
  solveSlot(el, p, other);
  expect(q(el, '.lockcallout')).toBeNull();
});

test('<c0ffee-crossword> Restart re-arms the lock callout for the new puzzle', () => {
  const p = puzzle();
  const S = firstSlot();
  const el = mount();
  solveSlot(el, p, S);
  expect(q(el, '.lockcallout')).toBeTruthy();
  pressKey(el, 'A'); // dismiss

  act(el, 'menu');
  act(el, 'restart');
  act(el, 'confirm-ok'); // re-arms the callout for the (identical) puzzle
  solveSlot(el, p, S);
  expect(q(el, '.lockcallout')).toBeTruthy();
});

test('<c0ffee-crossword> the completion card renders on a solved puzzle with a frozen time, swatches and New', () => {
  const p = puzzle();
  const el = mount();
  for (const slot of p.layout.slots) {
    if (q(el, '.completion')) break;
    solveSlot(el, p, slot);
  }
  const card = q(el, '.completion');
  expect(card).toBeTruthy();
  expect(card!.textContent).toMatch(/Solved/i);
  expect(card!.textContent).toMatch(/\d+:\d{2}/); // the frozen elapsed time, mm:ss
  expect(el.shadowRoot!.querySelectorAll('.completion .swatch').length).toBeGreaterThan(0);
  expect(q(el, '[data-act="completion-new"]')).toBeTruthy();
  expect(q(el, '.keypad')).toBeNull(); // the dock is replaced by the card
});

// C0FFEE-82 — solved-board celebration cleanup (handoff 2 §2 / prototype scene 04):
// the win celebration is clean uniform color tiles carrying the answer digits, with
// the play chrome (padlocks, periphery clue numbers, outlines) fully retired. The
// padlock stays a MID-play signifier. happy-dom can't paint, so these assert the
// projected structure; the ring legibility + bloom + reduced-motion get the eyeball.

test('<c0ffee-crossword> the solved board is pure color tiles: ring + answer digit per Cell, chrome retired', () => {
  const p = puzzle();
  const el = mount();

  // mid-play the padlock earns its keep: one solved Slot stamps its six locked Cells
  solveSlot(el, p, p.layout.slots[0]);
  expect(el.shadowRoot!.querySelectorAll('.lock').length).toBe(p.layout.slots[0].cells.length);

  for (const slot of p.layout.slots) {
    if (q(el, '.completion')) break;
    solveSlot(el, p, slot);
  }
  const board = q(el, '.board.solved')!;
  expect(board).toBeTruthy();
  const cells = [...board.querySelectorAll('.cell')];
  expect(cells.length).toBe(p.layout.cells.length);
  for (const cell of cells) {
    // each Cell is exactly its color tile + its answer digit — nothing rides along
    expect([...cell.children].map((c) => c.className)).toEqual(['base', 'glyph']);
    const base = cell.querySelector('.base')!.getAttribute('style')!;
    // the definition ring: a near-black answer still reads as a tile, not a hole
    expect(base).toContain('inset 0 0 0 1px rgba(255,255,255,.2)');
    // the staggered bloom survives as a per-Cell delay (the accepted flourish)
    expect(base).toMatch(/animation-delay:\d+ms/);
    expect(cell.querySelector('.glyph')!.textContent).toMatch(/^[0-9a-f]$/i);
  }
  // the board's children are the Cells alone — outlines AND periphery numbers retired
  expect(board.children.length).toBe(cells.length);
});

test('<c0ffee-crossword> completion-card swatches each carry the dark check stamp', () => {
  const p = puzzle();
  const el = mount();
  for (const slot of p.layout.slots) {
    if (q(el, '.completion')) break;
    solveSlot(el, p, slot);
  }
  const swatches = [...el.shadowRoot!.querySelectorAll('.completion .swatch')];
  expect(swatches.length).toBe(p.layout.slots.length);
  // "every one verified" — the clue-panel check treatment stamped on each swatch
  for (const s of swatches) expect(s.querySelector('svg')).toBeTruthy();
});

test('<c0ffee-crossword> the Solve-time clock counts running seconds, pauses with the scrim, and resumes', () => {
  vi.useFakeTimers();
  try {
    const el = mount(); // returning visitor -> no coach, but the clock is idle until first entry
    const timer = (): string => q(el, '.timer')!.textContent ?? '';
    expect(timer()).toMatch(/0:00/);
    vi.advanceTimersByTime(3000);
    expect(timer()).toMatch(/0:00/); // nothing typed yet -> the clock has not started (C0FFEE-79)

    pressKey(el, 'A'); // the first Cell entry starts the clock
    vi.advanceTimersByTime(3000);
    const running = timer();
    expect(running).not.toMatch(/0:00/); // it ran

    act(el, 'pause'); // pausing freezes the clock (coupled to the overlay layer)
    const paused = timer();
    vi.advanceTimersByTime(5000);
    expect(timer()).toBe(paused); // no advance while paused

    act(el, 'resume');
    vi.advanceTimersByTime(2000);
    expect(timer()).not.toBe(paused); // it resumed
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-crossword> the timer freezes once the puzzle is complete', () => {
  vi.useFakeTimers();
  try {
    const p = puzzle();
    const el = mount();
    vi.advanceTimersByTime(2000);
    for (const slot of p.layout.slots) {
      if (q(el, '.completion')) break;
      solveSlot(el, p, slot);
    }
    const frozen = q(el, '.completion')!.textContent!.match(/\d+:\d{2}/)![0];
    vi.advanceTimersByTime(10000);
    const still = q(el, '.completion')!.textContent!.match(/\d+:\d{2}/)![0];
    expect(still).toBe(frozen); // the elapsed time froze on completion
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-crossword> Escape closes an open overlay before releasing focus', () => {
  const el = mount();
  el.focus();
  act(el, 'pause');
  expect(q(el, '.pause')).toBeTruthy();
  pressPhysical(el, 'Escape'); // closes the overlay first
  expect(q(el, '.pause')).toBeNull();
  expect(document.activeElement).toBe(el); // still focused — the overlay absorbed the Escape
});

test('<c0ffee-crossword> the game surface is inert while a scrim overlay covers the board', () => {
  const cells = firstSlot().cells.map(cellKey);
  // pause: neither a click on the keypad nor a physical key may fill/move the board
  const a = mount();
  act(a, 'pause');
  pressKey(a, 'A'); // keypad CLICK path while paused
  pressPhysical(a, 'B'); // physical KEY path while paused
  expect(glyphAt(a, cells[0])).toBeNull(); // nothing typed
  expect(cursorKey(a)).toBe(cells[0]); // cursor did not advance

  // confirm dialog: same inertness
  const b = mount();
  act(b, 'menu');
  act(b, 'restart');
  pressKey(b, 'A');
  pressPhysical(b, 'B');
  expect(glyphAt(b, cells[0])).toBeNull();

  // first-run coach: same inertness (a tap on a Cell must not select/fill either)
  window.localStorage.removeItem(COACH_SEEN_KEY);
  const c = mount();
  expect(q(c, '.coach')).toBeTruthy();
  pressPhysical(c, 'A');
  tapCell(c, cells[1]);
  expect(glyphAt(c, cells[0])).toBeNull();
});

test('<c0ffee-crossword> at most one scrim overlay is open at a time (help while paused does not stack)', () => {
  const el = mount();
  act(el, 'pause');
  expect(q(el, '.pause')).toBeTruthy();
  act(el, 'help'); // re-summon the coach while paused — must NOT leave two overlays up
  expect(q(el, '.coach')).toBeTruthy();
  expect(q(el, '.pause')).toBeNull(); // pause was cleared, not stacked under the coach
  // dismissing the single overlay returns to a fully-playable board (timer resumes)
  act(el, 'coach-skip');
  expect(q(el, '.coach')).toBeNull();
  expect(q(el, '.scrim')).toBeNull();
});

test('<c0ffee-crossword> the clock is idle until the first Cell entry, even after the coach is dismissed', () => {
  vi.useFakeTimers();
  try {
    window.localStorage.removeItem(COACH_SEEN_KEY); // first visit -> coach auto-shows
    const el = mount();
    expect(q(el, '.coach')).toBeTruthy();
    vi.advanceTimersByTime(3000);
    expect(q(el, '.timer')!.textContent).toMatch(/0:00/); // clock waits behind the coach
    act(el, 'coach-next');
    act(el, 'coach-done'); // dismiss the coach — but no Cell has been entered yet
    vi.advanceTimersByTime(2000);
    expect(q(el, '.timer')!.textContent).toMatch(/0:00/); // still idle: the coach is not the trigger
    pressKey(el, 'A'); // the first Cell entry is what starts the clock (C0FFEE-79)
    vi.advanceTimersByTime(2000);
    expect(q(el, '.timer')!.textContent).not.toMatch(/0:00/);
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-crossword> confirm Cancel closes the dialog and leaves every entry and lock intact', () => {
  const p = puzzle();
  const S = firstSlot();
  const el = mount();
  solveSlot(el, p, S);
  const locksBefore = el.shadowRoot!.querySelectorAll('.lock').length;
  expect(locksBefore).toBeGreaterThan(0);
  act(el, 'menu');
  act(el, 'restart');
  expect(q(el, '.confirm')).toBeTruthy();
  act(el, 'confirm-cancel'); // Cancel must NOT wipe
  expect(q(el, '.confirm')).toBeNull();
  expect(el.shadowRoot!.querySelectorAll('.lock').length).toBe(locksBefore); // intact
});

// C0FFEE-73 — single-viewport switchable panes: below the constant board + topbar, the
// player sees EITHER the entry pane (comparison + keypad) OR the clue-list pane (the
// handoff's two-column CW-CluePanel). A "Clue list" button opens the list; tapping a row
// selects that Slot and auto-returns to the entry pane. happy-dom can't see layout, so the
// actual single-viewport FIT (board + one pane + chrome on one phone screen, the coach at
// the visible bottom) and the spark/glow visuals are a human eyeball on `npm run dev`;
// these assert the pane wiring, the auto-return, and the per-row status projection.

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

// C0FFEE-78 — Puzzle link hash load. On connect the element decodes location.hash: a
// valid Puzzle token reproduces THAT exact puzzle (ADR-0009 determinism — generatePuzzle
// is byte-identical per (shapeId, seed)), while a missing / malformed / unknown-shape
// token quietly opens a fresh puzzle (ADR-0009: a bad link is never a broken render).
// happy-dom can set location.hash; the clue half's painted target (contract #1) pins
// which puzzle loaded, so the deterministic seam is what the assertion reads.

// The selected (first) Slot's target Color address for a given seed — what the clue half
// paints. Mirrors firstSlot() but for an arbitrary seed.
const firstTargetForSeed = (seed: number): string => {
  const p = generatePuzzle(SHAPE, seed);
  const first = [...p.layout.slots].sort(
    (a, b) => a.number - b.number || (a.direction < b.direction ? -1 : 1),
  )[0];
  return p.targets[`${first.number}-${first.direction}`];
};
const clueColorOf = (el: HTMLElement): string =>
  (q(el, '.half.clue') as HTMLElement).getAttribute('style') ?? '';

test('<c0ffee-crossword> a valid Puzzle-link hash reproduces that exact puzzle', () => {
  const SHARED = 7; // a seed distinct from the default, so the boards differ
  window.location.hash = encodePuzzleToken({ shapeId: SHAPE, seed: SHARED });
  const el = mount();
  // the clue half paints the SHARED seed's first-Slot target, not the default seed's
  expect(clueColorOf(el)).toContain(`#${firstTargetForSeed(SHARED)}`);
  expect(clueColorOf(el)).not.toContain(`#${firstTargetForSeed(SEED)}`);
});

test('<c0ffee-crossword> a malformed Puzzle-link hash quietly opens the default puzzle', () => {
  window.location.hash = 'not-a-puzzle-token';
  const el = mount(); // must not throw on a junk hash
  expect(q(el, '.board')).toBeTruthy(); // a real board, never a broken render
  expect(clueColorOf(el)).toContain(`#${firstTargetForSeed(SEED)}`); // the fresh default puzzle
});

test('<c0ffee-crossword> a well-formed token for an unknown shape falls back to the default puzzle, quietly', () => {
  // a valid-SHAPE token shape but an id no SHAPES entry has: decode succeeds, generatePuzzle
  // would throw, and the shell must catch and open a fresh puzzle rather than crash.
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    window.location.hash = encodePuzzleToken({ shapeId: 'no-such-shape', seed: 3 });
    const el = mount();
    expect(q(el, '.board')).toBeTruthy();
    expect(clueColorOf(el)).toContain(`#${firstTargetForSeed(SEED)}`);
    // a routine stale/tampered link is the EXPECTED bad-link case — it must stay quiet, not
    // escalate to console.error (which RUM collects), so a bad link never spams telemetry.
    expect(errSpy).not.toHaveBeenCalled();
  } finally {
    errSpy.mockRestore();
  }
});

// C0FFEE-79 — Solve time: the accurate accumulator wiring. The pure pause math is unit-tested
// in lib/crossword-timer.test.ts (injected timestamps); these shell smokes cover the WIRING the
// PRD names — start on the first Cell entry, pause while the tab is hidden (Page Visibility), and
// the persisted show/hide preference. happy-dom can't paint, so they assert projected state +
// the localStorage round-trip; the eye glyph and muted readout get the browser eyeball.

// Drive the Page Visibility API: shadow document.hidden with an own getter (happy-dom's is a
// prototype getter, so an own property overrides it) and fire the event the element listens for.
const setTabHidden = (hidden: boolean): void => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
};

test('<c0ffee-crossword> the tab starts visible (default) for the Solve-time gate', () => {
  // guards the setTabHidden helper's own default and documents the baseline the clock assumes
  expect(document.hidden).toBe(false);
});

test('<c0ffee-crossword> the clock pauses while the tab is hidden and excludes the hidden span', () => {
  vi.useFakeTimers();
  try {
    const el = mount();
    const timer = (): string => q(el, '.timer')!.textContent ?? '';
    pressKey(el, 'A'); // start
    vi.advanceTimersByTime(2000); // run 2s
    expect(timer()).toBe('0:02');

    setTabHidden(true); // switch away from the tab
    vi.advanceTimersByTime(5000); // 5s of distraction — must NOT be counted
    setTabHidden(false); // return to the tab
    vi.advanceTimersByTime(1000); // run 1s more

    // counted = 2s + 1s; the 5s hidden gap is excluded (it would read 0:08 if it leaked in)
    expect(timer()).toBe('0:03');
  } finally {
    setTabHidden(false); // restore visibility for the rest of the suite
    vi.useRealTimers();
  }
});

test('<c0ffee-crossword> the topbar carries an eye toggle for the running clock', () => {
  const el = mount();
  const eye = q(el, '[data-act="clock-toggle"]');
  expect(eye).toBeTruthy();
  expect(eye!.tagName).toBe('BUTTON');
  // shown by default -> the "hidden" pressed-state is false
  expect(eye!.getAttribute('aria-pressed')).toBe('false');
  act(el, 'clock-toggle');
  expect(q(el, '[data-act="clock-toggle"]')!.getAttribute('aria-pressed')).toBe('true');
});

test('<c0ffee-crossword> the show/hide clock preference persists across reloads (localStorage)', () => {
  const a = mount();
  expect(q(a, '.timer.hidden')).toBeNull(); // shown by default
  act(a, 'clock-toggle'); // hide the running readout (a zen solve)
  expect(q(a, '.timer.hidden')).toBeTruthy();
  expect(q(a, '.timer')!.textContent).toBe('--:--');

  // a fresh element (a reload) remembers the hidden choice
  const b = mount();
  expect(q(b, '.timer.hidden')).toBeTruthy();

  // toggling back to shown is likewise remembered across a reload
  act(b, 'clock-toggle');
  const c = mount();
  expect(q(c, '.timer.hidden')).toBeNull();
});

test('<c0ffee-crossword> hiding the running readout does not stop the clock — completion still times the solve', () => {
  const p = puzzle();
  const el = mount();
  act(el, 'clock-toggle'); // hide the running readout mid-play
  expect(q(el, '.timer.hidden')).toBeTruthy();
  for (const slot of p.layout.slots) {
    if (q(el, '.completion')) break;
    solveSlot(el, p, slot);
  }
  const card = q(el, '.completion');
  expect(card).toBeTruthy();
  expect(card!.textContent).toMatch(/\d+:\d{2}/); // the frozen Solve time is still shown, m:ss
});

test('<c0ffee-crossword> a tab-return while an overlay is still up does NOT resume the clock', () => {
  // the two pause gates (scrim overlay, tab hidden) compose: clearing ONE while the other holds
  // must keep the clock paused. Guards against a refactor that resumes on visibilitychange
  // unconditionally instead of routing through the _clockShouldRun reconciliation.
  vi.useFakeTimers();
  try {
    const el = mount();
    const timer = (): string => q(el, '.timer')!.textContent ?? '';
    pressKey(el, 'A'); // start
    vi.advanceTimersByTime(2000);
    expect(timer()).toBe('0:02');

    act(el, 'pause'); // scrim overlay up -> paused
    setTabHidden(true); // AND the tab hidden — both gates false
    vi.advanceTimersByTime(3000);
    setTabHidden(false); // the tab returns, but the pause overlay is STILL up
    vi.advanceTimersByTime(3000);
    expect(timer()).toBe('0:02'); // still frozen: the overlay gate alone keeps it paused

    act(el, 'resume'); // now both gates clear
    vi.advanceTimersByTime(1000);
    expect(timer()).toBe('0:03'); // the whole overlay+hidden stretch was one excluded span
  } finally {
    setTabHidden(false);
    vi.useRealTimers();
  }
});

test('<c0ffee-crossword> Restart resets the clock to idle — it waits for the new first Cell entry', () => {
  vi.useFakeTimers();
  try {
    const el = mount();
    const timer = (): string => q(el, '.timer')!.textContent ?? '';
    pressKey(el, 'A'); // start
    vi.advanceTimersByTime(4000);
    expect(timer()).not.toMatch(/0:00/); // clock ran

    act(el, 'menu');
    act(el, 'restart');
    act(el, 'confirm-ok'); // Restart -> _resetClock: back to idle, elapsed 0
    expect(timer()).toBe('0:00');
    vi.advanceTimersByTime(3000);
    expect(timer()).toBe('0:00'); // idle: Restart does NOT auto-start the clock (C0FFEE-79)

    pressKey(el, 'B'); // the new solve's first Cell entry re-arms the clock
    vi.advanceTimersByTime(2000);
    expect(timer()).not.toMatch(/0:00/);
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-crossword> a later Cell entry does not restart the clock (origin stays the first entry)', () => {
  vi.useFakeTimers();
  try {
    const el = mount();
    const timer = (): string => q(el, '.timer')!.textContent ?? '';
    pressKey(el, 'A'); // first entry starts the clock at t0
    vi.advanceTimersByTime(3000);
    pressKey(el, 'B'); // a second entry must NOT reset the running-span origin
    vi.advanceTimersByTime(1000);
    expect(timer()).toBe('0:04'); // 3s + 1s from the FIRST entry, not 0:01
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-crossword> a throwing localStorage never breaks mount or the clock toggle', () => {
  // the private-mode / quota paths the defensive accessors call out: exercise the catch branches
  // by stubbing Web Storage to throw, and confirm the element still mounts shown and toggles.
  const orig = { getItem: window.localStorage.getItem, setItem: window.localStorage.setItem };
  try {
    window.localStorage.getItem = () => {
      throw new Error('storage blocked (private mode)');
    };
    window.localStorage.setItem = () => {
      throw new Error('storage blocked (quota)');
    };
    const el = mount(); // must not throw despite getItem failing on load
    expect(q(el, '.board')).toBeTruthy();
    expect(q(el, '.timer.hidden')).toBeNull(); // fell back to shown (the documented default)
    expect(() => act(el, 'clock-toggle')).not.toThrow(); // setItem throw is swallowed
    expect(q(el, '.timer.hidden')).toBeTruthy(); // the in-memory preference still flipped
  } finally {
    window.localStorage.getItem = orig.getItem;
    window.localStorage.setItem = orig.setItem;
  }
});

test('<c0ffee-crossword> disconnect tears down the visibility listener and the repaint interval', () => {
  vi.useFakeTimers();
  try {
    const el = mount();
    pressKey(el, 'A'); // start -> arms the repaint interval + relies on the visibility listener
    el.remove(); // disconnectedCallback: removeEventListener('visibilitychange') + _stopRepaint
    expect(() => setTabHidden(true)).not.toThrow(); // the listener is gone, so no stray handler
    vi.advanceTimersByTime(3000); // the interval was cleared -> no pulses mutate the detached DOM
    expect(q(el, '.timer')!.textContent).toBe('0:00'); // frozen at the disconnect render
  } finally {
    setTabHidden(false);
    vi.useRealTimers();
  }
});

// C0FFEE-80 — the share control (third slice of the C0FFEE-57 share PRD). The composed
// message is unit-tested in lib/crossword-share.test.ts; these smokes cover the shell
// wiring the AC names: the control is present in the completion state, invoking it hands
// the composed message to navigator.share where it exists, falls back to copy-to-clipboard
// + confirmation flash where it does not (the C0FFEE-54 pattern), emits one anonymous
// puzzle_shared RUM action on a successful share, and the message's Puzzle link
// round-trips through the C0FFEE-78 codec to the exact puzzle just solved.

// Solve the whole board (any puzzle) — the completion card supplants the dock.
const solveAll = (el: HTMLElement, p: ReturnType<typeof puzzle>): void => {
  for (const slot of p.layout.slots) {
    if (q(el, '.completion')) break; // propagation can complete before the last Slot
    solveSlot(el, p, slot);
  }
  expect(q(el, '.completion')).toBeTruthy();
};

// The share handler resolves one navigator promise then flashes/emits; a few microtask
// turns settle the whole chain (no timers involved on the success paths).
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

// Install a Web Share / clipboard stub for one test, restoring the bare happy-dom
// navigator after (happy-dom ships neither API, which IS the fallback environment).
const withNavigatorApi = async (
  api: { share?: (data: unknown) => Promise<void>; writeText?: (t: string) => Promise<void> },
  run: () => Promise<void>,
): Promise<void> => {
  const nav = navigator as unknown as Record<string, unknown>;
  const hadShare = 'share' in nav;
  const hadClipboard = 'clipboard' in nav;
  if (api.share) Object.defineProperty(nav, 'share', { configurable: true, value: api.share });
  if (api.writeText)
    Object.defineProperty(nav, 'clipboard', { configurable: true, value: { writeText: api.writeText } });
  try {
    await run();
  } finally {
    if (!hadShare) delete nav.share;
    if (!hadClipboard) delete nav.clipboard;
  }
};

test('<c0ffee-crossword> the completion card carries a share control beside New puzzle', () => {
  const el = mount();
  solveAll(el, puzzle());
  expect(q(el, '.completion [data-act="share"]')).toBeTruthy();
  expect(q(el, '.completion [data-act="share"]')!.textContent).toContain('Share');
  expect(q(el, '.completion [data-act="completion-new"]')).toBeTruthy(); // Share supplements, never supplants
});

test('<c0ffee-crossword> share hands the composed message to navigator.share and emits one puzzle_shared', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  const action = vi.spyOn(datadogRum, 'addAction').mockImplementation(() => {});
  try {
    await withNavigatorApi({ share }, async () => {
      const el = mount();
      solveAll(el, puzzle());
      act(el, 'share');
      await settle();

      expect(share).toHaveBeenCalledTimes(1);
      const text = (share.mock.calls[0][0] as { text: string }).text;
      expect(text).toContain('Hex Color crossword'); // the composed message, not a bare URL
      expect(text).toContain('Solved in'); // clock shown (the default) -> the boast rides along
      // ONE anonymous action, emitted on the share resolving — no payload beyond the name
      expect(action).toHaveBeenCalledTimes(1);
      expect(action).toHaveBeenCalledWith('puzzle_shared');
    });
  } finally {
    action.mockRestore();
  }
});

test('<c0ffee-crossword> the shared Puzzle link reproduces the exact puzzle just solved', async () => {
  const SHARED = 7; // open on a friend's puzzle (seed distinct from the default)...
  window.location.hash = encodePuzzleToken({ shapeId: SHAPE, seed: SHARED });
  const share = vi.fn().mockResolvedValue(undefined);
  const action = vi.spyOn(datadogRum, 'addAction').mockImplementation(() => {});
  try {
    await withNavigatorApi({ share }, async () => {
      const el = mount();
      solveAll(el, generatePuzzle(SHAPE, SHARED));
      act(el, 'share');
      await settle();

      // ...and the message's link must carry THAT (shapeId, seed) through the codec —
      // the ADR-0009 round-trip that lands a friend on the same board.
      const text = (share.mock.calls[0][0] as { text: string }).text;
      const url = text.split('\n').at(-1)!;
      expect(decodePuzzleToken(new URL(url).hash)).toEqual({ shapeId: SHAPE, seed: SHARED });
    });
  } finally {
    action.mockRestore();
  }
});

test('<c0ffee-crossword> without Web Share, share copies the message and flashes confirmation', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const action = vi.spyOn(datadogRum, 'addAction').mockImplementation(() => {});
  try {
    await withNavigatorApi({ writeText }, async () => {
      const el = mount();
      solveAll(el, puzzle());
      act(el, 'share');
      await settle();

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText.mock.calls[0][0]).toContain('Hex Color crossword'); // the same composed message
      // the C0FFEE-54 confirmation flash: the control shows Copied and announces it
      expect(q(el, '[data-act="share"]')!.textContent).toContain('Copied');
      expect(q(el, '.share-status')!.textContent).toContain('Copied');
      expect(action).toHaveBeenCalledTimes(1); // the copy IS the share on desktop
      el.remove(); // disconnect clears the armed flash-revert timer (no dangling real timer)
    });
  } finally {
    action.mockRestore();
  }
});

test('<c0ffee-crossword> a denied clipboard flashes the failed state and emits nothing', async () => {
  const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
  const action = vi.spyOn(datadogRum, 'addAction').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await withNavigatorApi({ writeText }, async () => {
      const el = mount();
      solveAll(el, puzzle());
      act(el, 'share');
      await settle();

      // a failed copy must never pass for a share: the flash says so, and no action rides
      expect(q(el, '[data-act="share"]')!.textContent).toContain('Copy failed');
      expect(action).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled(); // the reason stays in the console (C0FFEE-54 posture)
      el.remove(); // disconnect clears the armed flash-revert timer (no dangling real timer)
    });
  } finally {
    warn.mockRestore();
    action.mockRestore();
  }
});

test('<c0ffee-crossword> a hidden clock shares the zen message — no Solve-time line', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  const action = vi.spyOn(datadogRum, 'addAction').mockImplementation(() => {});
  try {
    await withNavigatorApi({ share }, async () => {
      const el = mount();
      act(el, 'clock-toggle'); // the remembered preference IS the opt-in (CONTEXT.md Solve time)
      solveAll(el, puzzle());
      act(el, 'share');
      await settle();

      // the untimed message is exactly name + signature + link (the composer's 3-line shape)
      const text = (share.mock.calls[0][0] as { text: string }).text;
      const lines = text.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain('Hex Color crossword');
      expect(lines.at(-1)).toContain('#cw~');
    });
  } finally {
    action.mockRestore();
  }
});

test('<c0ffee-crossword> a cancelled share sheet stays quiet — no copy, no flash, no action', async () => {
  const share = vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
  const writeText = vi.fn();
  const action = vi.spyOn(datadogRum, 'addAction').mockImplementation(() => {});
  try {
    await withNavigatorApi({ share, writeText }, async () => {
      const el = mount();
      solveAll(el, puzzle());
      act(el, 'share');
      await settle();

      expect(share).toHaveBeenCalledTimes(1);
      expect(writeText).not.toHaveBeenCalled(); // closing the sheet is a choice, not a failure
      expect(q(el, '.share-label')!.textContent).toBe('Share'); // at rest, nothing flashed
      expect(action).not.toHaveBeenCalled();
    });
  } finally {
    action.mockRestore();
  }
});

test('<c0ffee-crossword> a REFUSED share sheet falls back to the clipboard copy', async () => {
  // NotAllowedError (iframe permissions policy) — not a cancel: the sheet could not open
  // at all, so the copy steps in rather than leaving a dead button, with the reason in
  // the console (the C0FFEE-54 posture).
  const share = vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
  const writeText = vi.fn().mockResolvedValue(undefined);
  const action = vi.spyOn(datadogRum, 'addAction').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await withNavigatorApi({ share, writeText }, async () => {
      const el = mount();
      solveAll(el, puzzle());
      act(el, 'share');
      await settle();

      expect(writeText).toHaveBeenCalledTimes(1); // the copy IS the share when the sheet can't be
      expect(writeText.mock.calls[0][0]).toContain('Hex Color crossword');
      expect(q(el, '.share-label')!.textContent).toContain('Copied');
      expect(action).toHaveBeenCalledTimes(1); // the landed copy counts — once, not twice
      expect(warn).toHaveBeenCalled();
      el.remove(); // disconnect clears the armed flash-revert timer (no dangling real timer)
    });
  } finally {
    warn.mockRestore();
    action.mockRestore();
  }
});
