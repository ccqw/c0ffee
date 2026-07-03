// Unit tests (ADR-0003 functional core) for the daily-seed derivation (C0FFEE-86).
// The date is INJECTED as a Date value, never read from a real clock inside the module,
// so every scenario here is deterministic. These assert external behavior: which LOCAL
// calendar day a moment falls in, and how the derived seed strides between days — never
// the arithmetic inside.
import { test, expect } from 'vitest';
import { dailySeed, DAY_STRIDE } from './crossword-daily.ts';

test('every moment of one local day derives the same seed', () => {
  // local midnight and local 23:59:59 of the same calendar day — one daily puzzle,
  // regardless of what UTC thinks the date is (decision 2: Wordle convention)
  const morning = new Date(2026, 6, 3, 0, 0, 0);
  const night = new Date(2026, 6, 3, 23, 59, 59);
  expect(dailySeed(night)).toBe(dailySeed(morning));
});

test('consecutive local days differ by exactly one stride', () => {
  // the seed rolls at the solver's midnight, jumping a full stride so the in-session
  // "New" walk (+1 per press) can never collide with tomorrow's daily (decision 1)
  const today = new Date(2026, 6, 3, 23, 59, 59);
  const tomorrow = new Date(2026, 6, 4, 0, 0, 0);
  expect(dailySeed(tomorrow) - dailySeed(today)).toBe(DAY_STRIDE);
});

test('the stride leaves a private per-day range New cannot exhaust in a session', () => {
  // "New" advances +1 from the daily base; 1000 presses in one sitting is beyond any
  // real session, so the walk stays inside the day's own range
  expect(DAY_STRIDE).toBe(1000);
});

test('every day of a full year steps exactly one stride, across DST transitions', () => {
  // Date(y, m, d) normalizes overflowing days, so this walks real local calendar days
  // through both DST changes — where a naive ms-division derivation would double-count
  // or skip a day (the 23h/25h days).
  for (let d = 1; d < 365; d++) {
    const prev = dailySeed(new Date(2026, 0, d, 12, 0, 0));
    const next = dailySeed(new Date(2026, 0, d + 1, 12, 0, 0));
    expect(next - prev).toBe(DAY_STRIDE);
  }
});

test('the derivation is a pure function of its injected date', () => {
  const at = new Date(2026, 6, 3, 9, 30, 0);
  expect(dailySeed(at)).toBe(dailySeed(new Date(at.getTime())));
});
