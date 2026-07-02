import { test, expect } from 'vitest';
import { composeShareMessage } from './crossword-share.ts';

// The share message composer (C0FFEE-80, third slice of the C0FFEE-57 PRD): pure
// {elapsedMs?, puzzleUrl} -> the plain shareable text the completion-state share
// control hands to navigator.share / the clipboard. Tests assert content positively
// (what IS in the message): the game's name, the emoji signature, the Puzzle link,
// and the Solve-time line's presence/absence tracking the optional elapsed.

const URL = 'https://c0ffee.cafe/crossword.html#cw~lattice-6~1';

test('composeShareMessage: names the game and carries the #C0FFEE wordmark', () => {
  const msg = composeShareMessage({ puzzleUrl: URL });
  expect(msg).toContain('Hex Color crossword');
  expect(msg).toContain('#C0FFEE');
});

test('composeShareMessage: always carries the emoji signature and the Puzzle link', () => {
  // The signature is a CONSTANT — the hash + the two-digit red/green/blue anatomy of a
  // Hex color address (the console's channel-pair Hex field, drawn in squares). It is
  // never derived from the solved colors, so it is spoiler-free by construction.
  for (const opts of [{ puzzleUrl: URL }, { puzzleUrl: URL, elapsedMs: 255000 }]) {
    const msg = composeShareMessage(opts);
    expect(msg).toContain('#\u{1F7E5}\u{1F7E5}\u{1F7E9}\u{1F7E9}\u{1F7E6}\u{1F7E6}');
    expect(msg).toContain(URL);
  }
});

test('composeShareMessage: includes the Solve-time line only when elapsed is present', () => {
  // 255000 ms = 4:15 — the CONTEXT.md canonical boast, m:ss with unpadded minutes
  // (the same shape the completion card shows).
  const timed = composeShareMessage({ puzzleUrl: URL, elapsedMs: 255000 });
  expect(timed).toContain('Solved in 4:15 - can you beat me?');

  // Without elapsed the message is exactly the untimed lines: name line, signature,
  // link — asserting the whole shape (not an absence) pins that no time line rides in.
  const untimed = composeShareMessage({ puzzleUrl: URL });
  const lines = untimed.split('\n');
  expect(lines).toHaveLength(3);
  expect(lines[0]).toContain('Hex Color crossword');
  expect(lines[1]).toBe('#\u{1F7E5}\u{1F7E5}\u{1F7E9}\u{1F7E9}\u{1F7E6}\u{1F7E6}');
  expect(lines[2]).toBe(URL);
});

test('composeShareMessage: formats elapsed as m:ss with zero-padded seconds', () => {
  expect(composeShareMessage({ puzzleUrl: URL, elapsedMs: 5000 })).toContain('Solved in 0:05');
  expect(composeShareMessage({ puzzleUrl: URL, elapsedMs: 60000 })).toContain('Solved in 1:00');
  // sub-second remainder floors, matching the completion card's frozen readout
  expect(composeShareMessage({ puzzleUrl: URL, elapsedMs: 754999 })).toContain('Solved in 12:34');
});

test('composeShareMessage: is plain shareable text (the timed 4-line shape)', () => {
  // The whole timed shape, asserted positively: name, time boast, signature, link.
  const lines = composeShareMessage({ puzzleUrl: URL, elapsedMs: 255000 }).split('\n');
  expect(lines).toHaveLength(4);
  expect(lines[0]).toBe('I solved the Hex Color crossword ☕ #C0FFEE');
  expect(lines[1]).toBe('Solved in 4:15 - can you beat me?');
  expect(lines[2]).toBe('#\u{1F7E5}\u{1F7E5}\u{1F7E9}\u{1F7E9}\u{1F7E6}\u{1F7E6}');
  expect(lines[3]).toBe(URL);
});

test('composeShareMessage: fails loud on an unrenderable elapsed (programmer error)', () => {
  // elapsedMs comes from the Solve-time accumulator, which never goes negative — a
  // negative or non-finite value here is a wiring bug, guarded like the sibling cores.
  expect(() => composeShareMessage({ puzzleUrl: URL, elapsedMs: -1 })).toThrow();
  expect(() => composeShareMessage({ puzzleUrl: URL, elapsedMs: Number.NaN })).toThrow();
});

test('composeShareMessage: fails loud on a URL that would corrupt the message shape', () => {
  // the link is the message's intact last line (the round-trip contract) — an empty or
  // newline-carrying URL is a wiring bug, not a message to quietly mint.
  expect(() => composeShareMessage({ puzzleUrl: '' })).toThrow();
  expect(() => composeShareMessage({ puzzleUrl: 'https://a\nb' })).toThrow();
});
