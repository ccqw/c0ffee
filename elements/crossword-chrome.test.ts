// C0FFEE-67 — slice 4/4 chrome: the surrounding affordances that turn the playable
// element into the finished game. A topbar (timer · pause · help · menu), one shared
// scrim primitive under the coach / pause / confirm overlays, a lock callout that
// fires once per puzzle on the first crossing-lock, a timer coupled to the overlay
// layer, Restart/New behind a destructive confirm, and the completion card. happy-dom
// can't paint or measure rects, so these assert the wiring + projected state + the
// localStorage gating; the bottom-sheet motion, rect anchoring, recolor and bloom get
// the browser eyeball.
import { test, expect, vi } from 'vitest';
import { cellKey, slotKey } from '../lib/crossword-state.ts';
import {
  setupCrosswordSuite,
  mount,
  puzzle,
  firstSlot,
  firstTargetForSeed,
  SEED,
  COACH_SEEN_KEY,
  tapCell,
  pressKey,
  pressPhysical,
  cursorKey,
  glyphAt,
  solveSlot,
  q,
  act,
} from './crossword-test-kit.ts';

setupCrosswordSuite();

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

test('<c0ffee-crossword> Restart keeps the same puzzle; New deals a fresh DEFAULT_SHAPE board', () => {
  const p = puzzle();
  const firstClue = slotKey(firstSlot());
  const targetSame = p.targets[firstClue];
  // The suite board was opened from a lattice-6 Puzzle link (the beforeEach pin), and New
  // STILL deals the loom-6 default (C0FFEE-85 decision 2: New always regenerates on
  // DEFAULT_SHAPE, even after a friend's link on another shape — Restart replays the
  // shared board). The seed advances from the adopted one.
  const targetFresh = firstTargetForSeed(SEED + 1);

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

  // mid-play the padlock earns its keep: one solved Slot stamps its CROSSING Cells
  // (C0FFEE-68 — the crossing-only signifier; its own pairs lock bare)
  solveSlot(el, p, p.layout.slots[0]);
  const slot0Keys = new Set(p.layout.slots[0].cells.map(cellKey));
  const slot0Crossings = p.layout.crossings.filter((x) => slot0Keys.has(cellKey(x.cell)));
  expect(slot0Crossings.length).toBeGreaterThan(0);
  expect(el.shadowRoot!.querySelectorAll('.lock').length).toBe(slot0Crossings.length);

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
