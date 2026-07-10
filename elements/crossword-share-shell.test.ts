// C0FFEE-80 — the share control (third slice of the C0FFEE-57 share PRD). The composed
// message is unit-tested in lib/crossword-share.test.ts; these smokes cover the shell
// wiring the AC names: the control is present in the completion state, invoking it hands
// the composed message to navigator.share where it exists, falls back to copy-to-clipboard
// + confirmation flash where it does not (the C0FFEE-54 pattern), emits one anonymous
// puzzle_shared RUM action on a successful share, and the message's Puzzle link
// round-trips through the C0FFEE-78 codec to the exact puzzle just solved.
import { test, expect, vi } from 'vitest';
import { generatePuzzle } from '../lib/crossword-generator.ts';
import { encodePuzzleToken, decodePuzzleToken } from '../lib/crossword-link.ts';
import { datadogRum } from '@datadog/browser-rum-slim';
import {
  setupCrosswordSuite,
  mount,
  puzzle,
  SHAPE,
  solveSlot,
  q,
  act,
} from './crossword-test-kit.ts';

setupCrosswordSuite();

// Solve the whole board (any puzzle) — the completion card supplants the dock.
const solveAll = (el: HTMLElement, p: ReturnType<typeof puzzle>): void => {
  for (const slot of p.layout.slots) {
    if (q(el, '.completion')) break; // propagation can complete before the last Slot
    solveSlot(el, p, slot);
  }
  expect(q(el, '.completion')).toBeTruthy();
};

// The share handler resolves one navigator promise then flashes/emits; a few microtask
// turns settle the whole chain (no timers involved on the success paths).
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

// Install a Web Share / clipboard stub for one test, restoring the bare happy-dom
// navigator after (happy-dom ships neither API, which IS the fallback environment).
const withNavigatorApi = async (
  api: { share?: (data: unknown) => Promise<void>; writeText?: (t: string) => Promise<void> },
  run: () => Promise<void>,
): Promise<void> => {
  const nav = navigator as unknown as Record<string, unknown>;
  const hadShare = 'share' in nav;
  const hadClipboard = 'clipboard' in nav;
  if (api.share) Object.defineProperty(nav, 'share', { configurable: true, value: api.share });
  if (api.writeText)
    Object.defineProperty(nav, 'clipboard', { configurable: true, value: { writeText: api.writeText } });
  try {
    await run();
  } finally {
    if (!hadShare) delete nav.share;
    if (!hadClipboard) delete nav.clipboard;
  }
};

test('<c0ffee-crossword> the completion card carries a share control beside New puzzle', () => {
  const el = mount();
  solveAll(el, puzzle());
  expect(q(el, '.completion [data-act="share"]')).toBeTruthy();
  expect(q(el, '.completion [data-act="share"]')!.textContent).toContain('Share');
  expect(q(el, '.completion [data-act="completion-new"]')).toBeTruthy(); // Share supplements, never supplants
});

test('<c0ffee-crossword> share hands the composed message to navigator.share and emits one puzzle_shared', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  const action = vi.spyOn(datadogRum, 'addAction').mockImplementation(() => {});
  try {
    await withNavigatorApi({ share }, async () => {
      const el = mount();
      solveAll(el, puzzle());
      act(el, 'share');
      await settle();

      expect(share).toHaveBeenCalledTimes(1);
      const text = (share.mock.calls[0][0] as { text: string }).text;
      expect(text).toContain('Hex Color crossword'); // the composed message, not a bare URL
      expect(text).toContain('Solved in'); // clock shown (the default) -> the boast rides along
      // ONE anonymous action, emitted on the share resolving — no payload beyond the name
      expect(action).toHaveBeenCalledTimes(1);
      expect(action).toHaveBeenCalledWith('puzzle_shared');
    });
  } finally {
    action.mockRestore();
  }
});

test('<c0ffee-crossword> the shared Puzzle link reproduces the exact puzzle just solved', async () => {
  const SHARED = 7; // open on a friend's puzzle (seed distinct from the default)...
  window.location.hash = encodePuzzleToken({ shapeId: SHAPE, seed: SHARED });
  const share = vi.fn().mockResolvedValue(undefined);
  const action = vi.spyOn(datadogRum, 'addAction').mockImplementation(() => {});
  try {
    await withNavigatorApi({ share }, async () => {
      const el = mount();
      solveAll(el, generatePuzzle(SHAPE, SHARED));
      act(el, 'share');
      await settle();

      // ...and the message's link must carry THAT (shapeId, seed) through the codec —
      // the ADR-0009 round-trip that lands a friend on the same board.
      const text = (share.mock.calls[0][0] as { text: string }).text;
      const url = text.split('\n').at(-1)!;
      expect(decodePuzzleToken(new URL(url).hash)).toEqual({ shapeId: SHAPE, seed: SHARED });
    });
  } finally {
    action.mockRestore();
  }
});

test('<c0ffee-crossword> without Web Share, share copies the message and flashes confirmation', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const action = vi.spyOn(datadogRum, 'addAction').mockImplementation(() => {});
  try {
    await withNavigatorApi({ writeText }, async () => {
      const el = mount();
      solveAll(el, puzzle());
      act(el, 'share');
      await settle();

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText.mock.calls[0][0]).toContain('Hex Color crossword'); // the same composed message
      // the C0FFEE-54 confirmation flash: the control shows Copied and announces it
      expect(q(el, '[data-act="share"]')!.textContent).toContain('Copied');
      expect(q(el, '.share-status')!.textContent).toContain('Copied');
      expect(action).toHaveBeenCalledTimes(1); // the copy IS the share on desktop
      el.remove(); // disconnect clears the armed flash-revert timer (no dangling real timer)
    });
  } finally {
    action.mockRestore();
  }
});

test('<c0ffee-crossword> a denied clipboard flashes the failed state and emits nothing', async () => {
  const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
  const action = vi.spyOn(datadogRum, 'addAction').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await withNavigatorApi({ writeText }, async () => {
      const el = mount();
      solveAll(el, puzzle());
      act(el, 'share');
      await settle();

      // a failed copy must never pass for a share: the flash says so, and no action rides
      expect(q(el, '[data-act="share"]')!.textContent).toContain('Copy failed');
      expect(action).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled(); // the reason stays in the console (C0FFEE-54 posture)
      el.remove(); // disconnect clears the armed flash-revert timer (no dangling real timer)
    });
  } finally {
    warn.mockRestore();
    action.mockRestore();
  }
});

test('<c0ffee-crossword> a hidden clock shares the zen message — no Solve-time line', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  const action = vi.spyOn(datadogRum, 'addAction').mockImplementation(() => {});
  try {
    await withNavigatorApi({ share }, async () => {
      const el = mount();
      act(el, 'clock-toggle'); // the remembered preference IS the opt-in (CONTEXT.md Solve time)
      solveAll(el, puzzle());
      act(el, 'share');
      await settle();

      // the untimed message is exactly name + signature + link (the composer's 3-line shape)
      const text = (share.mock.calls[0][0] as { text: string }).text;
      const lines = text.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain('Hex Color crossword');
      expect(lines.at(-1)).toContain('#cw~');
    });
  } finally {
    action.mockRestore();
  }
});

test('<c0ffee-crossword> a cancelled share sheet stays quiet — no copy, no flash, no action', async () => {
  const share = vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
  const writeText = vi.fn();
  const action = vi.spyOn(datadogRum, 'addAction').mockImplementation(() => {});
  try {
    await withNavigatorApi({ share, writeText }, async () => {
      const el = mount();
      solveAll(el, puzzle());
      act(el, 'share');
      await settle();

      expect(share).toHaveBeenCalledTimes(1);
      expect(writeText).not.toHaveBeenCalled(); // closing the sheet is a choice, not a failure
      expect(q(el, '.share-label')!.textContent).toBe('Share'); // at rest, nothing flashed
      expect(action).not.toHaveBeenCalled();
    });
  } finally {
    action.mockRestore();
  }
});

test('<c0ffee-crossword> a REFUSED share sheet falls back to the clipboard copy', async () => {
  // NotAllowedError (iframe permissions policy) — not a cancel: the sheet could not open
  // at all, so the copy steps in rather than leaving a dead button, with the reason in
  // the console (the C0FFEE-54 posture).
  const share = vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
  const writeText = vi.fn().mockResolvedValue(undefined);
  const action = vi.spyOn(datadogRum, 'addAction').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await withNavigatorApi({ share, writeText }, async () => {
      const el = mount();
      solveAll(el, puzzle());
      act(el, 'share');
      await settle();

      expect(writeText).toHaveBeenCalledTimes(1); // the copy IS the share when the sheet can't be
      expect(writeText.mock.calls[0][0]).toContain('Hex Color crossword');
      expect(q(el, '.share-label')!.textContent).toContain('Copied');
      expect(action).toHaveBeenCalledTimes(1); // the landed copy counts — once, not twice
      expect(warn).toHaveBeenCalled();
      el.remove(); // disconnect clears the armed flash-revert timer (no dangling real timer)
    });
  } finally {
    warn.mockRestore();
    action.mockRestore();
  }
});
