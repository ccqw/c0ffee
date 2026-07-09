import { test, expect } from 'vitest';
import { generatePuzzle, colorDistance, MIN_DISTANCE } from './crossword-generator.ts';
import { SHAPES, SHAPE_BOUNDS } from './crossword-shapes.ts';
import { initCrossword, type Puzzle } from './crossword-state.ts';
import { parseHex, rgbToHsv } from './color.ts';

// The Hex Color crossword's generator core (ADR-0003 functional core, ADR-0009
// determinism seam): a pure (shapeId, seed) -> Puzzle. It assigns one target Hex
// color address per Slot such that every shared Cell's digit agrees across its
// two Slots, and the chosen colors are mutually distant, hue-spread, and span a
// range of lightness (CONTEXT.md: Slot / Cell / Channel). No DOM, no ambient
// randomness — only the seeded RNG. Tests assert invariants across every shipped
// shape x many seeds (mirroring lib/color.test.ts), not exact output.

const SHAPE_IDS = SHAPES.map((s) => s.id);
// A spread of seeds, including 0 (RNG edge) and a large value, run against every
// shape — the invariants must hold for the whole catalog, not one lucky puzzle.
const SEEDS = [0, 1, 2, 7, 42, 99, 256, 1000, 31337, 0x6d2b79f5];

// One corpus of puzzles generated once and shared by every invariant test below —
// regenerating per assertion would dominate the suite's runtime.
const CORPUS: Array<{ id: string; seed: number; puzzle: Puzzle }> = SHAPE_IDS.flatMap((id) =>
  SEEDS.map((seed) => ({ id, seed, puzzle: generatePuzzle(id, seed) })),
);

const cellKey = (row: number, col: number): string => `${row},${col}`;
const slotKey = (number: number, direction: string): string => `${number}-${direction}`;
const targetsOf = (p: Puzzle): string[] => Object.values(p.targets);

// Walk every Slot, decode its six-digit target into its Cells, and report the set
// of digits each Cell receives — a shared Cell appears under two Slots, so a set
// larger than one means the crossing disagrees.
function cellDigits(p: Puzzle): Map<string, Set<string>> {
  const seen = new Map<string, Set<string>>();
  for (const slot of p.layout.slots) {
    const hex = p.targets[slotKey(slot.number, slot.direction)];
    slot.cells.forEach((c, i) => {
      const key = cellKey(c.row, c.col);
      (seen.get(key) ?? seen.set(key, new Set()).get(key)!).add(hex[i]);
    });
  }
  return seen;
}

// --- the determinism seam (ADR-0009) ---

test('same (shapeId, seed) reproduces a byte-identical puzzle', () => {
  for (const { id, seed, puzzle } of CORPUS) {
    expect(generatePuzzle(id, seed).targets).toEqual(puzzle.targets);
  }
});

test('a different seed yields a different puzzle', () => {
  for (const id of SHAPE_IDS) {
    expect(generatePuzzle(id, 1).targets).not.toEqual(generatePuzzle(id, 2).targets);
  }
});

// --- crossing consistency: a shared Cell holds one digit for both its Slots ---

test('every shared Cell agrees across its two Slots', () => {
  for (const { id, seed, puzzle } of CORPUS) {
    for (const [key, set] of cellDigits(puzzle)) {
      expect(set.size, `Cell ${key} carries one digit in ${id}#${seed}`).toBe(1);
    }
  }
});

// --- aesthetic invariants: distant, lightness-spanning, hue-spread ---

test('all chosen colors exceed MIN_DISTANCE (no two near-identical clues)', () => {
  expect(MIN_DISTANCE).toBeGreaterThan(0);
  for (const { id, seed, puzzle } of CORPUS) {
    const rgbs = targetsOf(puzzle).map((h) => parseHex(h)!);
    for (let i = 0; i < rgbs.length; i++) {
      for (let j = i + 1; j < rgbs.length; j++) {
        expect(
          colorDistance(rgbs[i], rgbs[j]),
          `${id}#${seed} pair ${i},${j}`,
        ).toBeGreaterThanOrEqual(MIN_DISTANCE);
      }
    }
  }
});

// These two aesthetic bounds scale with the COLOR COUNT: a shape with fewer Slots has
// fewer target colors, so its realized lightness span is naturally narrower and its hue
// wheel has wider gaps. The v1 shape (lattice-6) is five Slots, so the bounds are looser
// than the earlier 14-16 Slot shapes needed (worst over 64 seeds: V span ~0.19, hue gap
// ~175). They still guard a real collapse — a monochrome or single-lightness palette —
// while allowing a clustered, harmonic five-color set. Re-tighten (toward 0.22 / 120) if
// a denser shape returns.
test('the color set spans a range of lightness (tints and shades, not hue-only)', () => {
  for (const { id, seed, puzzle } of CORPUS) {
    const vs = targetsOf(puzzle).map((h) => rgbToHsv(parseHex(h)!).v);
    expect(Math.max(...vs) - Math.min(...vs), `${id}#${seed} V span`).toBeGreaterThanOrEqual(0.15);
  }
});

test('the chosen hues are spread around the wheel (no large empty arc)', () => {
  for (const { id, seed, puzzle } of CORPUS) {
    const hues = targetsOf(puzzle)
      .map((h) => rgbToHsv(parseHex(h)!).h)
      .sort((a, b) => a - b);
    let maxGap = 360 - (hues[hues.length - 1] - hues[0]); // the wrap-around arc
    for (let i = 1; i < hues.length; i++) maxGap = Math.max(maxGap, hues[i] - hues[i - 1]);
    expect(maxGap, `${id}#${seed} max hue gap`).toBeLessThanOrEqual(185);
  }
});

// --- the grandfather clause (C0FFEE-85 / ADR-0009 amendment) ---

// Golden regression: one shipped lattice-6 board pinned byte-for-byte, captured on
// v0.37.1 BEFORE the acceptance loop landed. lattice-6 declares no bounds, so the
// bounds check must not consume RNG or alter control flow for it — any drift here
// means an already-shared Puzzle link now opens a different board, which ADR-0009
// forbids. (This is the suite's stable (lattice-6, 1) board; the first-Slot target
// 83BEF1 is the same one the element tests pin through the hash path.)
test('golden: (lattice-6, 1) reproduces its shipped board byte-identically', () => {
  expect(generatePuzzle('lattice-6', 1).targets).toEqual({
    '1-across': '83BEF1',
    '4-across': 'BD39BE',
    '1-down': '804B13',
    '2-down': 'B0F387',
    '3-down': 'F3CB72',
  });
});

// --- per-shape acceptance bounds (C0FFEE-85): muddy boards are thrown back ---

// loom-6's nine crossings pin every across Slot's high nibble in all three Channels,
// which collapses some realized palettes (measured unbounded: 15.6% of seeds over the
// 185-degree hue-gap bound, 1.3% under 0.15 V span, over a 2,400-seed sweep). The
// generator's attempt loop re-plans boards outside the shape's declared bounds, so
// every dealt board must meet them. The math here is written out independently of the
// generator's own acceptance check, so a bug in that check cannot pass both sides.
test('every dealt loom-6 board meets its declared bounds across a seed sweep', () => {
  const bounds = SHAPE_BOUNDS['loom-6'];
  expect(bounds).toBeDefined();
  for (let seed = 0; seed < 64; seed++) {
    const hsvs = targetsOf(generatePuzzle('loom-6', seed)).map((h) => rgbToHsv(parseHex(h)!));
    const hues = hsvs.map((c) => c.h).sort((a, b) => a - b);
    let maxGap = 360 - (hues[hues.length - 1] - hues[0]);
    for (let i = 1; i < hues.length; i++) maxGap = Math.max(maxGap, hues[i] - hues[i - 1]);
    const vs = hsvs.map((c) => c.v);
    expect(maxGap, `loom-6#${seed} max hue gap`).toBeLessThanOrEqual(bounds!.maxHueGapDeg);
    expect(Math.max(...vs) - Math.min(...vs), `loom-6#${seed} V span`).toBeGreaterThanOrEqual(
      bounds!.minVSpan,
    );
  }
}, 30000);

// --- well-formed output: drops straight into the reducer ---

test('every target is a six-digit Hex color address, one per Slot', () => {
  for (const { puzzle } of CORPUS) {
    expect(Object.keys(puzzle.targets).length).toBe(puzzle.layout.slots.length);
    for (const slot of puzzle.layout.slots) {
      expect(puzzle.targets[slotKey(slot.number, slot.direction)]).toMatch(/^[0-9A-F]{6}$/);
    }
  }
});

test('the generated Puzzle feeds initCrossword without throwing', () => {
  for (const { puzzle } of CORPUS) {
    expect(() => initCrossword(puzzle)).not.toThrow();
  }
});

// --- totality: the attempt CAP is unreachable for the shipped shapes ---

// Many generations in one test, so it gets an explicit generous timeout — a slow
// CI runner overruns the 5s default otherwise (the generator itself averages a
// couple ms per call; this is wall-clock for ~100 of them, not a slow unit).
test('generation succeeds for every shipped shape across many seeds (CAP unreached)', () => {
  for (const id of SHAPE_IDS) {
    for (let seed = 0; seed < 32; seed++) {
      expect(() => generatePuzzle(id, seed)).not.toThrow();
    }
  }
}, 30000);

// --- fail-loud on an unknown shape (programmer error, like the sibling cores) ---

test('an unknown shapeId throws', () => {
  expect(() => generatePuzzle('no-such-shape', 1)).toThrow(/shape/i);
});

// --- colorDistance: the swappable perceptual-distance seam ---

test('colorDistance is zero for identical colors and symmetric', () => {
  const a = parseHex('3A7BD5')!;
  const b = parseHex('D5A73A')!;
  expect(colorDistance(a, a)).toBe(0);
  expect(colorDistance(a, b)).toBeCloseTo(colorDistance(b, a));
});

test('colorDistance separates opposite hues and a tint from its shade', () => {
  const red = parseHex('FF0000')!;
  const cyan = parseHex('00FFFF')!;
  const lightGray = parseHex('CCCCCC')!;
  const darkGray = parseHex('333333')!;
  // Opposite hues are far apart; so is a light vs dark neutral of the same hue.
  expect(colorDistance(red, cyan)).toBeGreaterThan(MIN_DISTANCE);
  expect(colorDistance(lightGray, darkGray)).toBeGreaterThan(MIN_DISTANCE);
});
