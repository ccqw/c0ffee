// Unit tests (ADR-0003 functional core) for the Solve-time accumulator. Time is
// INJECTED as plain numbers (ms), never read from a real clock, so the pause math is
// deterministic and flake-free — the whole reason the accumulator is a pure core module
// (CONTEXT.md: Solve time; C0FFEE-57 PRD user story 20). These assert external behavior
// (events in -> elapsed ms out), never the internal field shape.
import { test, expect } from 'vitest';
import {
  initSolveTimer,
  solveTimerReducer,
  elapsedMs,
  type SolveTimer,
  type SolveTimerEvent,
} from './crossword-timer.ts';

// Feed a sequence of events onto a starting timer — the "stream of events" the PRD
// describes — so a scenario reads as its timeline.
const run = (timer: SolveTimer, ...events: SolveTimerEvent[]): SolveTimer =>
  events.reduce(solveTimerReducer, timer);

test('a fresh timer has zero elapsed', () => {
  expect(elapsedMs(initSolveTimer(), 1000)).toBe(0);
});

test('a running span accrues elapsed against the injected now', () => {
  const t = run(initSolveTimer(), { type: 'start', at: 100 });
  expect(elapsedMs(t, 100)).toBe(0);
  expect(elapsedMs(t, 2600)).toBe(2500); // 2.5s of wall time
});

test('pausing freezes elapsed at the pause instant, regardless of later now', () => {
  const t = run(initSolveTimer(), { type: 'start', at: 0 }, { type: 'pause', at: 4000 });
  expect(elapsedMs(t, 4000)).toBe(4000);
  expect(elapsedMs(t, 99999)).toBe(4000); // wall time passes, but the clock is paused
});

test('a pause/resume span is excluded from elapsed', () => {
  // run 0..10s, hidden 10..30s, run 30..40s -> 20s counted, the 20s gap excluded
  const t = run(
    initSolveTimer(),
    { type: 'start', at: 0 },
    { type: 'pause', at: 10_000 },
    { type: 'resume', at: 30_000 },
  );
  expect(elapsedMs(t, 40_000)).toBe(20_000);
});

test('elapsed equals start-to-stop minus every hidden span', () => {
  // two hidden gaps (12..20 and 27..35); running 0..12, 20..27, 35..50
  const t = run(
    initSolveTimer(),
    { type: 'start', at: 0 },
    { type: 'pause', at: 12_000 },
    { type: 'resume', at: 20_000 },
    { type: 'pause', at: 27_000 },
    { type: 'resume', at: 35_000 },
    { type: 'stop', at: 50_000 },
  );
  // wall span 0..50 = 50s; hidden = 8s + 8s = 16s; counted = 34s
  expect(elapsedMs(t, 50_000)).toBe(34_000);
});

test('back-to-back pauses are idempotent — the second does not move elapsed', () => {
  const once = run(initSolveTimer(), { type: 'start', at: 0 }, { type: 'pause', at: 3000 });
  const twice = solveTimerReducer(once, { type: 'pause', at: 9000 });
  expect(elapsedMs(twice, 12_000)).toBe(3000); // still just the first 3s
  expect(elapsedMs(twice, 12_000)).toBe(elapsedMs(once, 12_000));
});

test('a resume while already running is idempotent — no double counting or restart', () => {
  const t = run(initSolveTimer(), { type: 'start', at: 0 }, { type: 'resume', at: 5000 });
  // the redundant resume must not reset the running-span origin to 5000
  expect(elapsedMs(t, 10_000)).toBe(10_000);
});

test('a pause before any start is a no-op (nothing to pause)', () => {
  const t = run(initSolveTimer(), { type: 'pause', at: 5000 });
  expect(elapsedMs(t, 9000)).toBe(0);
});

test('stop freezes elapsed and is terminal — later events cannot restart or grow it', () => {
  const stopped = run(
    initSolveTimer(),
    { type: 'start', at: 0 },
    { type: 'stop', at: 7000 },
  );
  expect(elapsedMs(stopped, 7000)).toBe(7000);
  // a stray resume/start/pause after stop can never un-freeze the solve
  const poked = run(
    stopped,
    { type: 'resume', at: 8000 },
    { type: 'start', at: 8000 },
    { type: 'pause', at: 9000 },
  );
  expect(elapsedMs(poked, 50_000)).toBe(7000);
});

test('stop while paused keeps the accumulated elapsed', () => {
  const t = run(
    initSolveTimer(),
    { type: 'start', at: 0 },
    { type: 'pause', at: 6000 },
    { type: 'stop', at: 20_000 },
  );
  expect(elapsedMs(t, 20_000)).toBe(6000); // the paused-out span never counts
});

test('the reducer is pure — it does not mutate the input timer', () => {
  const before = run(initSolveTimer(), { type: 'start', at: 0 });
  const snapshot = JSON.stringify(before);
  solveTimerReducer(before, { type: 'pause', at: 1000 });
  expect(JSON.stringify(before)).toBe(snapshot);
});

test('a backwards timestamp never makes elapsed go negative', () => {
  // defensive: out-of-order/clock-skew input clamps the span to 0, keeping elapsed monotonic
  const t = run(initSolveTimer(), { type: 'start', at: 5000 });
  expect(elapsedMs(t, 1000)).toBe(0);
});
