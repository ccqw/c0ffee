// C0FFEE-78 — Puzzle link hash load. On connect the element decodes location.hash: a
// valid Puzzle token reproduces THAT exact puzzle (ADR-0009 determinism — generatePuzzle
// is byte-identical per (shapeId, seed)), while a missing / malformed / unknown-shape
// token quietly opens a fresh puzzle (ADR-0009: a bad link is never a broken render).
// happy-dom can set location.hash; the clue half's painted target (contract #1) pins
// which puzzle loaded, so the deterministic seam is what the assertion reads.
// C0FFEE-86 — daily seed. A token-less load opens "today's puzzle": the starting seed is
// derived from the LOCAL calendar day (lib/crossword-daily.ts — the derivation itself is
// unit-tested there), so the same day always deals the same board and the next day rolls
// a fresh one. The faked system time drives the element's own `new Date()` on mount; the
// expectations regenerate through the SAME lib derivation (the ticket's approved seam).
import { test, expect, vi } from 'vitest';
import { encodePuzzleToken } from '../lib/crossword-link.ts';
import { dailySeed } from '../lib/crossword-daily.ts';
import {
  setupCrosswordSuite,
  mount,
  SHAPE,
  SEED,
  firstTargetForSeed,
  clueColorOf,
  openClues,
  q,
  act,
} from './crossword-test-kit.ts';

setupCrosswordSuite();

test('<c0ffee-crossword> a valid Puzzle-link hash reproduces that exact puzzle', () => {
  const SHARED = 7; // a seed distinct from the default, so the boards differ
  window.location.hash = encodePuzzleToken({ shapeId: SHAPE, seed: SHARED });
  const el = mount();
  // the clue half paints the SHARED seed's first-Slot target, not the default seed's —
  // and on the LINK's shape (lattice-6): a friend's old link keeps reproducing its board
  expect(clueColorOf(el)).toContain(`#${firstTargetForSeed(SHARED, SHAPE)}`);
  expect(clueColorOf(el)).not.toContain(`#${firstTargetForSeed(SEED, SHAPE)}`);
});

test('<c0ffee-crossword> a malformed Puzzle-link hash quietly opens the default puzzle', () => {
  vi.useFakeTimers(); // pin the day, so mount and expectation can't straddle midnight
  try {
    vi.setSystemTime(new Date(2026, 6, 3, 9, 0, 0));
    window.location.hash = 'not-a-puzzle-token';
    const el = mount(); // must not throw on a junk hash
    expect(q(el, '.board')).toBeTruthy(); // a real board, never a broken render
    // the fallback is the daily puzzle (C0FFEE-86) — the same board a token-less load opens
    expect(clueColorOf(el)).toContain(`#${firstTargetForSeed(dailySeed(new Date(2026, 6, 3)))}`);
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-crossword> a well-formed token for an unknown shape falls back to the default puzzle, quietly', () => {
  // a valid-SHAPE token shape but an id no SHAPES entry has: decode succeeds, generatePuzzle
  // would throw, and the shell must catch and open a fresh puzzle rather than crash.
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers(); // pin the day, so mount and expectation can't straddle midnight
  try {
    vi.setSystemTime(new Date(2026, 6, 3, 9, 0, 0));
    window.location.hash = encodePuzzleToken({ shapeId: 'no-such-shape', seed: 3 });
    const el = mount();
    expect(q(el, '.board')).toBeTruthy();
    expect(clueColorOf(el)).toContain(`#${firstTargetForSeed(dailySeed(new Date(2026, 6, 3)))}`);
    // a routine stale/tampered link is the EXPECTED bad-link case — it must stay quiet, not
    // escalate to console.error (which RUM collects), so a bad link never spams telemetry.
    expect(errSpy).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
    errSpy.mockRestore();
  }
});

test('<c0ffee-crossword> token-less mounts share one board per day and roll it the next day', () => {
  vi.useFakeTimers();
  try {
    window.location.hash = ''; // the token-less daily path, not the pinned suite board
    const todays = firstTargetForSeed(dailySeed(new Date(2026, 6, 3)));
    vi.setSystemTime(new Date(2026, 6, 3, 9, 0, 0));
    const morning = mount();
    vi.setSystemTime(new Date(2026, 6, 3, 21, 30, 0));
    const evening = mount();
    // one shared "today's puzzle" — the whole point: comparable Solve times
    expect(clueColorOf(morning)).toContain(`#${todays}`);
    expect(clueColorOf(evening)).toContain(`#${todays}`);

    vi.setSystemTime(new Date(2026, 6, 4, 9, 0, 0));
    const tomorrows = firstTargetForSeed(dailySeed(new Date(2026, 6, 4)));
    expect(tomorrows).not.toBe(todays); // consecutive days really deal different boards
    expect(clueColorOf(mount())).toContain(`#${tomorrows}`);
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-crossword> New advances from the daily base, never dealing another day\'s board', () => {
  vi.useFakeTimers();
  try {
    window.location.hash = '';
    vi.setSystemTime(new Date(2026, 6, 3, 9, 0, 0));
    const el = mount();
    act(el, 'menu');
    act(el, 'new');
    act(el, 'confirm-ok');
    // the fresh board is the daily's +1 neighbour — inside the day's private stride range
    expect(clueColorOf(el)).toContain(`#${firstTargetForSeed(dailySeed(new Date(2026, 6, 3)) + 1)}`);
  } finally {
    vi.useRealTimers();
  }
});

// C0FFEE-85 — the balanced grid. A token-less load deals loom-6: as many Across clues
// as Down (3 / 3, six Slots), the third rung along the bottom row. The daily tests above
// pin WHICH loom-6 board (seed via clue color); this pins the balance a player sees.
test('<c0ffee-crossword> the default board balances the clue list at three Across, three Down', () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date(2026, 6, 3, 9, 0, 0));
    window.location.hash = ''; // the token-less default path
    const el = mount();
    openClues(el);
    const groups = el.shadowRoot!.querySelectorAll('.cluegroup');
    expect(groups[0].querySelectorAll('.cluerow').length).toBe(3);
    expect(groups[1].querySelectorAll('.cluerow').length).toBe(3);
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-crossword> a token-less load never writes the hash', () => {
  // Share mints the Puzzle link on demand; the daily load must stay silent — a hash
  // write on load would spam RUM with route_change views (C0FFEE-86, ADR-0008)
  window.location.hash = '';
  mount();
  expect(window.location.hash).toBe('');
});
