// crossword-generator.ts — the Hex Color crossword's generator core (ADR-0003
// functional core; ADR-0009 determinism seam). A pure, seeded function:
// (shapeId, seed) -> Puzzle, byte-identical for the same pair, with NO ambient
// randomness (no Date, no Math.random) — only a seeded RNG. This is what lets the
// later Puzzle link (C0FFEE-57) reproduce a puzzle from a seed with no retrofit.
//
// It builds on the layout (C0FFEE-58) and reuses the color core (color.ts) for
// HSV reasoning. It does NOT touch the state reducer (C0FFEE-61): both depend on
// the layout, so `Puzzle` lives in crossword-layout.ts and the dependency graph
// stays a clean fan-out (layout <- generator, layout <- state).
//
// THE crux (CONTEXT.md: Cell / Channel). Crossings constrain single hex *digits*
// (nibbles); the aesthetics (distance, hue spread, lightness) live in *color*
// space. A pinned nibble becomes a per-Channel byte constraint: a high-nibble pin
// d confines that channel to [d*16 .. d*16+15]; a low-nibble pin to the residue
// class { b : b & 0xF === d }. So candidate colors are built FROM the allowed byte
// sets — they satisfy every pin by construction, never by rejection-sampling —
// and a shared Cell is one cellKey, so the digit one Slot writes is exactly the
// pin its crossing Slot reads (the same trick the C0FFEE-61 reducer uses). Crossing
// agreement is therefore automatic.

import { formatHex, hsvToRgb, rgbToHsv, type Hsv, type Rgb } from './color.ts';
import { deriveLayout, type Layout, type Puzzle, type Slot } from './crossword-layout.ts';
import { SHAPES } from './crossword-shapes.ts';

// --- tuning constants (named + conservative; easy to tighten later) ---

/** The minimum perceptual distance between any two target colors (the units are
 *  colorDistance's — weighted HSV). Large enough that no two clues read as the
 *  same color, loose enough that a fill succeeds in 1-2 attempts. Tunable. */
export const MIN_DISTANCE = 0.13;

/** Per-Channel candidate bytes kept nearest the ideal, and final candidates kept
 *  per Slot. Small enough to stay cheap, large enough to give the backtracker
 *  room when an early choice boxes a later Slot in. */
const NEAREST_PER_CHANNEL = 5;
const CANDIDATES_PER_SLOT = 40;

/** The attempt backstop. Crossings alone are always satisfiable and the thresholds
 *  are tuned so real shapes fill in 1-2 attempts, so this is a fail-loud guard
 *  against a future mis-tuning — a test proves it is unreachable for shipped
 *  shapes. */
const ATTEMPT_CAP = 1000;

/** The backtracking budget for ONE attempt. A well-spread plan fills nearly
 *  backtrack-free — about one step per Slot — so when a plan instead fans out
 *  combinatorially (two ideals landed too close), it is far cheaper to abandon
 *  it after a small budget and re-plan a fresh seeded rotation than to grind the
 *  dead end out. This many nodes is ~100x a clean fill, ample for the little
 *  backtracking a good plan needs, yet a tiny fraction of a blow-up. The re-plan
 *  keeps the function total; the ATTEMPT_CAP is the final backstop. */
const STEP_BUDGET = 600;

// The three lightness *roles* cycled across the Slots so the realized set spans
// value (tints and shades, not hue-only): a high-value tint, a mid, and a darker
// shade. Saturation stays moderate-to-high so every clue is chromatic (hue stays
// meaningful for colorDistance, which leans on hue).
const ROLES: ReadonlyArray<{ s: number; v: number }> = [
  { s: 0.45, v: 0.95 }, // tint
  { s: 0.70, v: 0.75 }, // mid
  { s: 0.82, v: 0.45 }, // shade
];

// colorDistance's channel weights. Hue dominates (it is what makes two clues read
// as "different colors"); saturation and value carry the tint/shade separation.
const W_HUE = 1.0;
const W_SAT = 0.5;
const W_VAL = 0.6;

const slotKey = (slot: Slot): string => `${slot.number}-${slot.direction}`;
const cellKey = (row: number, col: number): string => `${row},${col}`;

// makeRng(seed) -> a pure mulberry32 PRNG (5 lines, deterministic). One instance
// per generatePuzzle call, threaded through every random choice — THIS is the
// determinism primitive (ADR-0009). No Date, no Math.random.
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// hsvDistance(a, b) -> the weighted-HSV distance between two already-HSV colors.
// Hue is a circular gap normalized to [0,1]; saturation and value are plain [0,1]
// deltas. The fill works in HSV throughout (the plan ideals and the chosen colors
// are kept as HSV), so this is the hot-path form — no repeated rgbToHsv.
function hsvDistance(a: Hsv, b: Hsv): number {
  let dh = Math.abs(a.h - b.h);
  if (dh > 180) dh = 360 - dh; // shorter way around the wheel
  const dhn = dh / 180; // 0..1
  const ds = Math.abs(a.s - b.s);
  const dv = Math.abs(a.v - b.v);
  return Math.sqrt(W_HUE * dhn * dhn + W_SAT * ds * ds + W_VAL * dv * dv);
}

// colorDistance(a, b) -> a cheap, weighted-HSV perceptual distance between two
// Color values. THE swappable seam: a later CIELAB/Delta-E swap touches only this
// function (and hsvDistance, its HSV-space twin).
export function colorDistance(a: Rgb, b: Rgb): number {
  return hsvDistance(rgbToHsv(a), rgbToHsv(b));
}

// planPalette(slots, rng) -> an ideal HSV per Slot. Hue is an even spread (~360/n
// apart) over the whole wheel, rotated by a seeded base and jittered, so the
// realized hues land spread around the wheel; lightness is the per-Slot role
// cycled tint/mid/shade. Consumes a fixed count of RNG draws (1 base + 1 jitter
// per Slot), so each fresh attempt advances the single stream and differs.
function planPalette(slots: Slot[], rng: () => number): Map<string, Hsv> {
  const ordered = orderSlots(slots);
  const n = ordered.length;
  const step = 360 / n;
  const base = rng() * 360;
  const plan = new Map<string, Hsv>();
  ordered.forEach((slot, i) => {
    const jitter = (rng() - 0.5) * step * 0.5; // up to +/- a quarter step
    const h = (((base + i * step + jitter) % 360) + 360) % 360;
    const role = ROLES[i % ROLES.length];
    plan.set(slotKey(slot), { h, s: role.s, v: role.v });
  });
  return plan;
}

// The bytes 0..255 a channel may take given its two nibble pins (either may be
// absent). A high pin fixes the top nibble, a low pin the bottom; both -> one
// value, neither -> all 256. Always non-empty, so a Slot is never unfillable from
// its crossings alone.
function allowedBytes(highPin: number | null, lowPin: number | null): number[] {
  const out: number[] = [];
  for (let b = 0; b <= 255; b++) {
    if (highPin !== null && b >> 4 !== highPin) continue;
    if (lowPin !== null && (b & 0xf) !== lowPin) continue;
    out.push(b);
  }
  return out;
}

// The `count` members of `arr` nearest `target` (ties broken by value, for
// determinism).
function nearest(arr: number[], target: number, count: number): number[] {
  return [...arr]
    .sort((x, y) => Math.abs(x - target) - Math.abs(y - target) || x - y)
    .slice(0, count);
}

/** A candidate Color value for a Slot: its six-digit Hex color address and its
 *  HSV (precomputed once, so the hot path never re-converts). */
interface Candidate {
  hex: string;
  hsv: Hsv;
}

// candidatesFor(ideal, pins) -> the Slot's candidate colors, nearest the ideal
// HSV first. `pins` maps a Cell index (0..5) to its already-fixed hex digit value
// (0..15). Each channel's allowed bytes are derived from its pins (the crux),
// narrowed to those nearest the ideal channel value, then combined and ranked by
// distance to the ideal — so every candidate satisfies the pins by construction
// and the closest-to-ideal colors come first.
function candidatesFor(ideal: Hsv, pins: Map<number, number>): Candidate[] {
  const target = hsvToRgb(ideal);
  const pin = (i: number): number | null => pins.get(i) ?? null;
  const rs = nearest(allowedBytes(pin(0), pin(1)), target.r, NEAREST_PER_CHANNEL);
  const gs = nearest(allowedBytes(pin(2), pin(3)), target.g, NEAREST_PER_CHANNEL);
  const bs = nearest(allowedBytes(pin(4), pin(5)), target.b, NEAREST_PER_CHANNEL);

  const scored: Array<{ hex: string; hsv: Hsv; d: number }> = [];
  for (const r of rs) {
    for (const g of gs) {
      for (const b of bs) {
        const rgb = { r, g, b };
        const hsv = rgbToHsv(rgb);
        scored.push({ hex: formatHex(rgb), hsv, d: hsvDistance(hsv, ideal) });
      }
    }
  }
  scored.sort((a, b) => a.d - b.d || (a.hex < b.hex ? -1 : 1));
  return scored.slice(0, CANDIDATES_PER_SLOT).map(({ hex, hsv }) => ({ hex, hsv }));
}

// Slots ordered most-constrained-first (crossing-count desc, then number asc,
// then across before down): a static, deterministic order that gives the
// backtracker the tightly-pinned Slots first, where dead ends surface early.
function orderSlots(slots: Slot[]): Slot[] {
  const crossings = (slot: Slot): number =>
    slot.cells.filter((c) => slotsAt(slots, c.row, c.col).length > 1).length;
  return [...slots].sort(
    (a, b) =>
      crossings(b) - crossings(a) ||
      a.number - b.number ||
      (a.direction < b.direction ? -1 : a.direction > b.direction ? 1 : 0),
  );
}

// The Slots covering a Cell — length 2 marks a crossing (one across, one down).
function slotsAt(slots: Slot[], row: number, col: number): Slot[] {
  return slots.filter((s) => s.cells.some((c) => c.row === row && c.col === col));
}

// fillSlots(layout, plan) -> a target per Slot, or null on a dead end. A
// depth-first backtracking fill: each Slot reads its pins from the shared Cell
// digits, takes its candidates that clear MIN_DISTANCE against every color already
// chosen (most-separated first), writes the chosen one's new Cell digits, and
// recurses; a dead end undoes the digits it wrote and tries the next candidate.
// Pure given (layout, plan). An attempt that fans out past STEP_BUDGET is
// abandoned (returns null) so the caller can re-plan — see STEP_BUDGET.
function fillSlots(layout: Layout, plan: Map<string, Hsv>): Record<string, string> | null {
  const order = orderSlots(layout.slots);
  const chosen: Record<string, string> = {};
  const chosenHsv: Hsv[] = []; // the chosen colors in HSV, for the distance checks
  const cellDigits = new Map<string, string>();

  let steps = 0;
  let exhausted = false; // budget blown -> abandon this attempt, the caller re-plans
  const recurse = (i: number): boolean => {
    if (++steps > STEP_BUDGET) {
      exhausted = true;
      return false;
    }
    if (i === order.length) return true;
    const slot = order[i];

    const pins = new Map<number, number>();
    slot.cells.forEach((c, idx) => {
      const d = cellDigits.get(cellKey(c.row, c.col));
      if (d !== undefined) pins.set(idx, parseInt(d, 16));
    });

    // Among the near-ideal candidates, try the ones MOST separated from the
    // colors already chosen first (a farthest-point greedy): each placement is
    // the safest for the Slots still to come, so dead ends stay rare and shallow.
    // The aesthetics (hue spread, lightness) live in the plan, not here, so this
    // ordering costs nothing there.
    const options = candidatesFor(plan.get(slotKey(slot))!, pins)
      .map((cand) => {
        let minD = Infinity;
        for (const other of chosenHsv) minD = Math.min(minD, hsvDistance(cand.hsv, other));
        return { cand, minD };
      })
      .filter((o) => o.minD >= MIN_DISTANCE)
      .sort((a, b) => b.minD - a.minD || (a.cand.hex < b.cand.hex ? -1 : 1));

    for (const { cand } of options) {
      const { hex, hsv } = cand;
      const wrote: string[] = [];
      slot.cells.forEach((c, idx) => {
        const key = cellKey(c.row, c.col);
        if (!cellDigits.has(key)) {
          cellDigits.set(key, hex[idx]);
          wrote.push(key);
        }
      });
      chosen[slotKey(slot)] = hex;
      chosenHsv.push(hsv);

      if (recurse(i + 1)) return true;

      // Dead end: undo this Slot's choice and the Cell digits it introduced.
      delete chosen[slotKey(slot)];
      chosenHsv.pop();
      for (const key of wrote) cellDigits.delete(key);

      if (exhausted) return false; // stop fanning out once the budget is blown
    }
    return false;
  };

  return recurse(0) ? chosen : null;
}

// generatePuzzle(shapeId, seed) -> Puzzle. Look up the shape (throw on an unknown
// id, fail-loud like the sibling cores), derive its layout, then run the attempt
// loop: each attempt re-plans the palette (advancing the single seeded stream, so
// attempts differ) and fills; the first success returns. The CAP backstop throws
// — a test proves it is unreachable for the shipped shapes.
export function generatePuzzle(shapeId: string, seed: number): Puzzle {
  const shape = SHAPES.find((s) => s.id === shapeId);
  if (!shape) {
    throw new Error(`crossword-generator: no shape with id '${shapeId}'`);
  }
  const layout = deriveLayout(shape.grid);
  const rng = makeRng(seed);

  for (let attempt = 0; attempt < ATTEMPT_CAP; attempt++) {
    const plan = planPalette(layout.slots, rng);
    const targets = fillSlots(layout, plan);
    if (targets) return { layout, targets };
  }
  throw new Error(
    `crossword-generator: no fill for shape '${shapeId}' seed ${seed} within ${ATTEMPT_CAP} attempts`,
  );
}
