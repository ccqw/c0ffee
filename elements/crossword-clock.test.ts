// C0FFEE-79 — Solve time: the accurate accumulator wiring. The pure pause math is unit-tested
// in lib/crossword-timer.test.ts (injected timestamps); these shell smokes cover the WIRING the
// PRD names — start on the first Cell entry, pause while the tab is hidden (Page Visibility), and
// the persisted show/hide preference. happy-dom can't paint, so they assert projected state +
// the localStorage round-trip; the eye glyph and muted readout get the browser eyeball.
import { test, expect, vi } from 'vitest';
import {
  setupCrosswordSuite,
  mount,
  puzzle,
  pressKey,
  solveSlot,
  q,
  act,
} from './crossword-test-kit.ts';

setupCrosswordSuite();

// Drive the Page Visibility API: shadow document.hidden with an own getter (happy-dom's is a
// prototype getter, so an own property overrides it) and fire the event the element listens for.
const setTabHidden = (hidden: boolean): void => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
};

test('<c0ffee-crossword> the tab starts visible (default) for the Solve-time gate', () => {
  // guards the setTabHidden helper's own default and documents the baseline the clock assumes
  expect(document.hidden).toBe(false);
});

test('<c0ffee-crossword> the clock pauses while the tab is hidden and excludes the hidden span', () => {
  vi.useFakeTimers();
  try {
    const el = mount();
    const timer = (): string => q(el, '.timer')!.textContent ?? '';
    pressKey(el, 'A'); // start
    vi.advanceTimersByTime(2000); // run 2s
    expect(timer()).toBe('0:02');

    setTabHidden(true); // switch away from the tab
    vi.advanceTimersByTime(5000); // 5s of distraction — must NOT be counted
    setTabHidden(false); // return to the tab
    vi.advanceTimersByTime(1000); // run 1s more

    // counted = 2s + 1s; the 5s hidden gap is excluded (it would read 0:08 if it leaked in)
    expect(timer()).toBe('0:03');
  } finally {
    setTabHidden(false); // restore visibility for the rest of the suite
    vi.useRealTimers();
  }
});

test('<c0ffee-crossword> the topbar carries an eye toggle for the running clock', () => {
  const el = mount();
  const eye = q(el, '[data-act="clock-toggle"]');
  expect(eye).toBeTruthy();
  expect(eye!.tagName).toBe('BUTTON');
  // shown by default -> the "hidden" pressed-state is false
  expect(eye!.getAttribute('aria-pressed')).toBe('false');
  act(el, 'clock-toggle');
  expect(q(el, '[data-act="clock-toggle"]')!.getAttribute('aria-pressed')).toBe('true');
});

test('<c0ffee-crossword> the show/hide clock preference persists across reloads (localStorage)', () => {
  const a = mount();
  expect(q(a, '.timer.hidden')).toBeNull(); // shown by default
  act(a, 'clock-toggle'); // hide the running readout (a zen solve)
  expect(q(a, '.timer.hidden')).toBeTruthy();
  expect(q(a, '.timer')!.textContent).toBe('--:--');

  // a fresh element (a reload) remembers the hidden choice
  const b = mount();
  expect(q(b, '.timer.hidden')).toBeTruthy();

  // toggling back to shown is likewise remembered across a reload
  act(b, 'clock-toggle');
  const c = mount();
  expect(q(c, '.timer.hidden')).toBeNull();
});

test('<c0ffee-crossword> hiding the running readout does not stop the clock — completion still times the solve', () => {
  const p = puzzle();
  const el = mount();
  act(el, 'clock-toggle'); // hide the running readout mid-play
  expect(q(el, '.timer.hidden')).toBeTruthy();
  for (const slot of p.layout.slots) {
    if (q(el, '.completion')) break;
    solveSlot(el, p, slot);
  }
  const card = q(el, '.completion');
  expect(card).toBeTruthy();
  expect(card!.textContent).toMatch(/\d+:\d{2}/); // the frozen Solve time is still shown, m:ss
});

test('<c0ffee-crossword> a tab-return while an overlay is still up does NOT resume the clock', () => {
  // the two pause gates (scrim overlay, tab hidden) compose: clearing ONE while the other holds
  // must keep the clock paused. Guards against a refactor that resumes on visibilitychange
  // unconditionally instead of routing through the _clockShouldRun reconciliation.
  vi.useFakeTimers();
  try {
    const el = mount();
    const timer = (): string => q(el, '.timer')!.textContent ?? '';
    pressKey(el, 'A'); // start
    vi.advanceTimersByTime(2000);
    expect(timer()).toBe('0:02');

    act(el, 'pause'); // scrim overlay up -> paused
    setTabHidden(true); // AND the tab hidden — both gates false
    vi.advanceTimersByTime(3000);
    setTabHidden(false); // the tab returns, but the pause overlay is STILL up
    vi.advanceTimersByTime(3000);
    expect(timer()).toBe('0:02'); // still frozen: the overlay gate alone keeps it paused

    act(el, 'resume'); // now both gates clear
    vi.advanceTimersByTime(1000);
    expect(timer()).toBe('0:03'); // the whole overlay+hidden stretch was one excluded span
  } finally {
    setTabHidden(false);
    vi.useRealTimers();
  }
});

test('<c0ffee-crossword> Restart resets the clock to idle — it waits for the new first Cell entry', () => {
  vi.useFakeTimers();
  try {
    const el = mount();
    const timer = (): string => q(el, '.timer')!.textContent ?? '';
    pressKey(el, 'A'); // start
    vi.advanceTimersByTime(4000);
    expect(timer()).not.toMatch(/0:00/); // clock ran

    act(el, 'menu');
    act(el, 'restart');
    act(el, 'confirm-ok'); // Restart -> _resetClock: back to idle, elapsed 0
    expect(timer()).toBe('0:00');
    vi.advanceTimersByTime(3000);
    expect(timer()).toBe('0:00'); // idle: Restart does NOT auto-start the clock (C0FFEE-79)

    pressKey(el, 'B'); // the new solve's first Cell entry re-arms the clock
    vi.advanceTimersByTime(2000);
    expect(timer()).not.toMatch(/0:00/);
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-crossword> a later Cell entry does not restart the clock (origin stays the first entry)', () => {
  vi.useFakeTimers();
  try {
    const el = mount();
    const timer = (): string => q(el, '.timer')!.textContent ?? '';
    pressKey(el, 'A'); // first entry starts the clock at t0
    vi.advanceTimersByTime(3000);
    pressKey(el, 'B'); // a second entry must NOT reset the running-span origin
    vi.advanceTimersByTime(1000);
    expect(timer()).toBe('0:04'); // 3s + 1s from the FIRST entry, not 0:01
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-crossword> a throwing localStorage never breaks mount or the clock toggle', () => {
  // the private-mode / quota paths the defensive accessors call out: exercise the catch branches
  // by stubbing Web Storage to throw, and confirm the element still mounts shown and toggles.
  const orig = { getItem: window.localStorage.getItem, setItem: window.localStorage.setItem };
  try {
    window.localStorage.getItem = () => {
      throw new Error('storage blocked (private mode)');
    };
    window.localStorage.setItem = () => {
      throw new Error('storage blocked (quota)');
    };
    const el = mount(); // must not throw despite getItem failing on load
    expect(q(el, '.board')).toBeTruthy();
    expect(q(el, '.timer.hidden')).toBeNull(); // fell back to shown (the documented default)
    expect(() => act(el, 'clock-toggle')).not.toThrow(); // setItem throw is swallowed
    expect(q(el, '.timer.hidden')).toBeTruthy(); // the in-memory preference still flipped
  } finally {
    window.localStorage.getItem = orig.getItem;
    window.localStorage.setItem = orig.setItem;
  }
});

test('<c0ffee-crossword> disconnect tears down the visibility listener and the repaint interval', () => {
  vi.useFakeTimers();
  try {
    const el = mount();
    pressKey(el, 'A'); // start -> arms the repaint interval + relies on the visibility listener
    el.remove(); // disconnectedCallback: removeEventListener('visibilitychange') + _stopRepaint
    expect(() => setTabHidden(true)).not.toThrow(); // the listener is gone, so no stray handler
    vi.advanceTimersByTime(3000); // the interval was cleared -> no pulses mutate the detached DOM
    expect(q(el, '.timer')!.textContent).toBe('0:00'); // frozen at the disconnect render
  } finally {
    setTabHidden(false);
    vi.useRealTimers();
  }
});
