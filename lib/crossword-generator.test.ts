import { test, expect } from 'vitest';
import { generatePuzzle, colorDistance, MIN_DISTANCE } from './crossword-generator.ts';
import { SHAPES } from './crossword-shapes.ts';
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

test('the color set spans a range of lightness (tints and shades, not hue-only)', () => {
  for (const { id, seed, puzzle } of CORPUS) {
    const vs = targetsOf(puzzle).map((h) => rgbToHsv(parseHex(h)!).v);
    expect(Math.max(...vs) - Math.min(...vs), `${id}#${seed} V span`).toBeGreaterThanOrEqual(0.22);
  }
});

test('the chosen hues are spread around the wheel (no large empty arc)', () => {
  for (const { id, seed, puzzle } of CORPUS) {
    const hues = targetsOf(puzzle)
      .map((h) => rgbToHsv(parseHex(h)!).h)
      .sort((a, b) => a - b);
    let maxGap = 360 - (hues[hues.length - 1] - hues[0]); // the wrap-around arc
    for (let i = 1; i < hues.length; i++) maxGap = Math.max(maxGap, hues[i] - hues[i - 1]);
    expect(maxGap, `${id}#${seed} max hue gap`).toBeLessThanOrEqual(120);
  }
});

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
