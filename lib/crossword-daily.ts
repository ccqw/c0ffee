// crossword-daily.ts — the daily-seed derivation (ADR-0003 functional core; C0FFEE-86).
// A hash-less crossword load opens "today's puzzle": the same board for everyone on a
// given LOCAL calendar day (Wordle convention — it rolls at the solver's midnight, so
// the puzzle never changes mid-evening), a fresh board the next day. The date is
// INJECTED — the shell passes `new Date()` once on mount; this module never reads a
// clock, so the derivation stays a pure (Date) -> seed function.
//
// A Puzzle link is untouched by any of this: a shared (shapeId, seed) token still
// reproduces its exact board regardless of the day (ADR-0009 — the daily seed only
// picks which seed a token-less load starts from).

/** The gap between consecutive days' seeds. "New" walks +1 per press from the daily
 *  base (the shipped C0FFEE-67 behavior), so if days were adjacent integers a single
 *  New would deal tomorrow's board early. The stride gives each day a private range
 *  no real session's New-pressing can exhaust, and keeps seeds small enough that
 *  Puzzle-link tokens stay short. */
export const DAY_STRIDE = 1000;

// Day numbering is anchored at 2026-01-01 (local) — an arbitrary fixed epoch; it only
// has to be the SAME for everyone so a given day maps to a given seed.
const EPOCH_UTC_MS = Date.UTC(2026, 0, 1);

/** The seed a token-less load starts from: the injected moment's LOCAL calendar day,
 *  numbered from the epoch, times the stride. The local Y/M/D are re-anchored through
 *  Date.UTC before dividing, so DST's 23h/25h days can never skew the day count —
 *  every local calendar day is exactly one step. */
export function dailySeed(now: Date): number {
  const dayUtcMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return ((dayUtcMs - EPOCH_UTC_MS) / 86_400_000) * DAY_STRIDE;
}
