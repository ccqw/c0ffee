// crossword-timer.ts — the Solve-time accumulator (ADR-0003 functional core). A pure
// clock for the Hex Color crossword's Solve time: the elapsed span from the solver's
// first Cell entry to the final Slot solved, with any tab-hidden stretches paused out
// (CONTEXT.md: Solve time; C0FFEE-57 PRD). The imperative shell (elements/crossword.ts)
// feeds it start / pause / resume / stop events, each carrying an INJECTED timestamp;
// this module never reads a real clock. That is the whole point: injected time makes the
// pause arithmetic deterministic and flake-free in tests, and — because the shell drives
// pause/resume off the Page Visibility API — a backgrounded tab simply stops counting
// rather than being undercounted by the throttled setInterval the C0FFEE-67 tick-counter
// suffered.
//
// The state is an immutable value threaded through a reducer (the crosswordReducer idiom),
// with a separate pure reader `elapsedMs(timer, at)` so the shell can ask "how long so far?"
// at any render frame without a state transition. Each pause banks the open running span and
// each resume opens a new one, so any number of running spans are summed; the paused gaps
// between them are never counted, and elapsed is exactly start-to-stop minus the hidden spans.

/** The clock's immutable state. Not meant to be built by hand — start from `initSolveTimer`
 *  and transition via `solveTimerReducer`.
 *  - `accumulatedMs`: running time banked from spans that have already ended (each pause/stop
 *    closes the open span into here).
 *  - `runningSince`: the injected timestamp the current running span began at, or `null` when
 *    the clock is idle, paused, or stopped (no open span).
 *  - `stopped`: completion froze the clock. Terminal — every later event is a no-op, so a
 *    stray resume can never un-freeze a finished solve. */
export interface SolveTimer {
  readonly accumulatedMs: number;
  readonly runningSince: number | null;
  readonly stopped: boolean;
}

/** The event stream the shell feeds the clock, each stamped with an injected `at` (ms):
 *  `start` on the first Cell entry, `pause`/`resume` as the tab hides/returns (or an overlay
 *  covers the board), `stop` on completion. `start` and `resume` are mechanically identical
 *  (both open a running span from a paused/idle state) — two names for one intent, kept
 *  distinct so the call sites read as what they mean. */
export type SolveTimerEvent =
  | { readonly type: 'start'; readonly at: number }
  | { readonly type: 'pause'; readonly at: number }
  | { readonly type: 'resume'; readonly at: number }
  | { readonly type: 'stop'; readonly at: number };

// A running span's contribution, clamped so an out-of-order or clock-skewed `at` can never
// subtract time — elapsed only ever moves forward (a small honesty invariant, not a hot path).
const span = (runningSince: number, at: number): number => Math.max(0, at - runningSince);

/** A fresh, idle clock: zero elapsed, not yet running, not stopped. The shell holds one of
 *  these from mount and on every New/Restart, opening the next running span on the first
 *  Cell entry. */
export function initSolveTimer(): SolveTimer {
  return { accumulatedMs: 0, runningSince: null, stopped: false };
}

/** Apply one event, returning a new timer (the input is never mutated). Once stopped, every
 *  event is a no-op. `start`/`resume` open a running span (idempotent while already running);
 *  `pause` banks the open span (idempotent while already paused, so back-to-back pauses are
 *  safe); `stop` banks any open span and freezes the clock terminally. */
export function solveTimerReducer(timer: SolveTimer, event: SolveTimerEvent): SolveTimer {
  if (timer.stopped) return timer;
  switch (event.type) {
    case 'start':
    case 'resume':
      // Already running -> keep the current span's origin (a redundant resume must not
      // restart the span or double-count); otherwise open a span at `at`.
      if (timer.runningSince !== null) return timer;
      return { ...timer, runningSince: event.at };
    case 'pause':
      // Not running -> nothing to bank (idempotent: a second pause is a no-op).
      if (timer.runningSince === null) return timer;
      return {
        accumulatedMs: timer.accumulatedMs + span(timer.runningSince, event.at),
        runningSince: null,
        stopped: false,
      };
    case 'stop':
      return {
        accumulatedMs:
          timer.runningSince !== null
            ? timer.accumulatedMs + span(timer.runningSince, event.at)
            : timer.accumulatedMs,
        runningSince: null,
        stopped: true,
      };
  }
}

/** Elapsed running time as of the injected `at` (ms): banked spans plus the open span, if
 *  any. Pure and side-effect free, so the shell can call it every repaint. A paused or
 *  stopped clock ignores `at` and returns its banked total. */
export function elapsedMs(timer: SolveTimer, at: number): number {
  // The terminal freeze is the reader's OWN guarantee, not one borrowed from the reducer: a
  // stopped clock returns its banked total regardless of `at`. The reducer already nulls
  // runningSince on stop, so this guard is belt-and-suspenders today — but it keeps elapsed
  // frozen at completion even if a future transition ever left a span open on stop.
  if (timer.stopped) return timer.accumulatedMs;
  return timer.accumulatedMs + (timer.runningSince !== null ? span(timer.runningSince, at) : 0);
}
