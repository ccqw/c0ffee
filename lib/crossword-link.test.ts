import { test, expect } from 'vitest';
import { encodePuzzleToken, decodePuzzleToken } from './crossword-link.ts';

// The Puzzle link codec (C0FFEE-78, ADR-0009): a pure, total string<->struct pair for
// the seed token that rides the crossword route's hash fragment. Mirrors the Color link
// codec in color.ts (parseColorLink/formatColorLink) but on its own token shape — and,
// by construction, shape-distinct from a bare hex run so the two hash conventions can
// never be confused. Tests assert external behavior (round-trip, null-on-malformed,
// shape-distinctness), never the internal token grammar beyond the one format-pinning
// assertion (the token is a wire contract once a link is shared).

const REF = { shapeId: 'lattice-6', seed: 1 };

test('encodePuzzleToken: packs shapeId + seed into the canonical token', () => {
  // Pinned: once a Puzzle link is shared, the token shape is a wire contract (ADR-0009
  // freezes shape ids for the same reason). A change here breaks every link already out.
  expect(encodePuzzleToken(REF)).toBe('cw~lattice-6~1');
});

test('decodePuzzleToken: round-trips an encoded token back to its {shapeId, seed}', () => {
  for (const seed of [0, 1, 42, 1000, 4294967295]) {
    const ref = { shapeId: 'lattice-6', seed };
    expect(decodePuzzleToken(encodePuzzleToken(ref))).toEqual(ref);
  }
});

test('decodePuzzleToken: tolerates a leading # (location.hash includes it)', () => {
  expect(decodePuzzleToken('#' + encodePuzzleToken(REF))).toEqual(REF);
});

test('decodePuzzleToken: an empty or missing hash is null', () => {
  expect(decodePuzzleToken('')).toBeNull();
  expect(decodePuzzleToken('#')).toBeNull();
  expect(decodePuzzleToken(null)).toBeNull();
  expect(decodePuzzleToken(undefined)).toBeNull();
});

test('decodePuzzleToken: a malformed token is null (total, never throws)', () => {
  for (const bad of [
    'notatoken',
    'cw~lattice-6', // missing seed
    'cw~lattice-6~', // empty seed
    'cw~~1', // empty shapeId
    'cw~lattice-6~1~2', // extra field
    'xx~lattice-6~1', // wrong scheme tag
    'cw~lattice-6~-1', // negative seed
    'cw~lattice-6~1.5', // non-integer seed
    'cw~lattice-6~0x1f', // non-decimal seed
    'cw~lattice 6~1', // space in shapeId
    'cw~lattice-6~ 1', // space in seed
  ]) {
    expect(decodePuzzleToken(bad)).toBeNull();
  }
});

test('a bare hex run never decodes as a Puzzle token (distinct from a Color link)', () => {
  // A Color link hash is a run of hex digits (#C0FFEE). None of these may be mistaken
  // for a Puzzle token — the crux of ADR-0009 #3.
  for (const hex of ['C0FFEE', 'c0ffee', '123456', 'abcdef', 'FFF']) {
    expect(decodePuzzleToken(hex)).toBeNull();
  }
});

test('an encoded Puzzle token is never shaped like a bare hex run', () => {
  // The other half of the distinctness contract: whatever we emit must not look like a
  // Color address, so a future reader can never confuse the two conventions.
  for (const seed of [0, 1, 255, 4242]) {
    const token = encodePuzzleToken({ shapeId: 'lattice-6', seed });
    expect(/^[0-9a-fA-F]+$/.test(token)).toBe(false);
  }
});

test('encodePuzzleToken: fails loud on an un-round-trippable input (programmer error)', () => {
  // encode formats trusted internal values; minting a token that decode could not reverse
  // would be a silent contract break, so guard it (the sibling cores fail loud too).
  expect(() => encodePuzzleToken({ shapeId: 'has~tilde', seed: 1 })).toThrow();
  expect(() => encodePuzzleToken({ shapeId: 'lattice-6', seed: -1 })).toThrow();
  expect(() => encodePuzzleToken({ shapeId: 'lattice-6', seed: 1.5 })).toThrow();
});
