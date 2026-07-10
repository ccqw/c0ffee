// Shared scaffold for the <c0ffee-crossword> shell suite (C0FFEE-81). The shell
// tests split into per-seam files so each fork worker's happy-dom heap stays small
// (the environment retains ~15-25MB per test across a FILE; one 111-test file
// crossed V8's default ~2GB old space). This kit is not a test file: it holds the
// localStorage polyfill, the suite constants, the hook installer, and the DOM-driving
// helpers every seam file shares. File-local helpers stay in their seam file.
import { beforeAll, beforeEach } from 'vitest';
import { generatePuzzle } from '../lib/crossword-generator.ts';
import { cellKey, slotKey } from '../lib/crossword-state.ts';
import { encodePuzzleToken } from '../lib/crossword-link.ts';

// happy-dom v20 does not provide localStorage, but the element uses it for the one
// coach "seen" flag (C0FFEE-67). Install a minimal in-memory polyfill on window +
// globalThis BEFORE the element is imported, so the gating is exercised in tests; a
// real browser supplies the genuine Web Storage API. Matched by the element's own
// defensive accessor (it no-ops where storage is unavailable, e.g. private mode).
if (!(globalThis as { localStorage?: unknown }).localStorage) {
  const store = new Map<string, string>();
  const ls: Storage = {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as { localStorage: Storage }).localStorage = ls;
  if (typeof window !== 'undefined') (window as unknown as { localStorage: Storage }).localStorage = ls;
}

// The element generates its own puzzle from a fixed shape + seed; the tests regenerate
// the same pair to derive expected counts and values (the generator is the ADR-0009
// deterministic seam, so this matches exactly what the element renders). Nothing is
// hard-coded — the expectations track the core.
export const SHAPE = 'lattice-6';
export const SEED = 1;
export const puzzle = () => generatePuzzle(SHAPE, SEED);

// The shape the element deals on every default path — token-less (daily) load, New,
// bad-link fallback (C0FFEE-85: loom-6 balances the grid at 3 across / 3 down).
// lattice-6 stays authored but is reachable only through old Puzzle links (ADR-0009
// frozen ids), which is exactly how the suite's stable board above pins it.
export const DEFAULT_SHAPE = 'loom-6';

// C0FFEE-67 introduces the site's first localStorage use — the one "coach seen" flag.
export const COACH_SEEN_KEY = 'c0ffee:crossword:coach-seen';

// Installs the suite hooks a seam file needs: the element registration (a module side
// effect — customElements.define) and the per-test reset. happy-dom shares one
// localStorage across a whole file, so reset it before every test to a deterministic
// baseline: a RETURNING visitor (flag set) — so tests never see the first-run coach
// over their board and never depend on test order. The coach tests clear the flag
// themselves to simulate a first visit. (The element owns the real key; tests assert
// behavior, not the key.) The element also reads location.hash on connect (C0FFEE-78
// Puzzle link); the token-less default board rolls DAILY since C0FFEE-86, so the
// suite's stable (lattice-6, 1) board is pinned through the existing Puzzle-link hash
// path — the C0FFEE-78 seam, no test-only attribute. The daily-seed tests reset the
// hash to exercise the token-less path themselves.
export function setupCrosswordSuite(): void {
  beforeAll(async () => {
    await import('./crossword.ts');
  });
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(COACH_SEEN_KEY, '1');
    window.location.hash = encodePuzzleToken({ shapeId: SHAPE, seed: SEED });
  });
}

export function mount(): HTMLElement {
  const el = document.createElement('c0ffee-crossword');
  document.body.appendChild(el);
  return el;
}

// The Slot the element opens on: lowest number, across before down (mirrors firstSlot).
export function firstSlot() {
  return [...puzzle().layout.slots].sort(
    (a, b) => a.number - b.number || (a.direction < b.direction ? -1 : 1),
  )[0];
}

export const click = (node: Element | null): void => {
  if (!node) throw new Error('test tried to click a missing node');
  node.dispatchEvent(new Event('click', { bubbles: true }));
};
export const cellEl = (el: HTMLElement, key: string): HTMLElement =>
  el.shadowRoot!.querySelector(`[data-cell="${key}"]`) as HTMLElement;
export const tapCell = (el: HTMLElement, key: string): void => click(cellEl(el, key));
export const pressKey = (el: HTMLElement, ch: string): void =>
  click(el.shadowRoot!.querySelector(`[data-key="${ch}"]`));
export const pressDelete = (el: HTMLElement): void => click(el.shadowRoot!.querySelector('[data-act="delete"]'));
export const pressCheck = (el: HTMLElement): void => click(el.shadowRoot!.querySelector('[data-act="check"]'));
export const cursorKey = (el: HTMLElement): string | null =>
  el.shadowRoot!.querySelector('.cell.cur')?.getAttribute('data-cell') ?? null;
export const glyphAt = (el: HTMLElement, key: string): string | null =>
  cellEl(el, key).querySelector('.glyph')?.textContent ?? null;
// Whether the Cell SHOWS a padlock. Since C0FFEE-68 the icon is a crossing-cell
// signifier, so this is an engine-lock proxy only on crossing Cells; a locked
// non-crossing Cell renders bare (its lock shows up as rejected input instead).
export const lockedAt = (el: HTMLElement, key: string): boolean => !!cellEl(el, key).querySelector('.lock');

// Commit '000000' on the entry Slot so a graded Guess exists: the per-Channel hint
// strip (and therefore the "?" disclosure) only render once a Slot has been graded.
// '000000' is wrong for the SEED-1 first Slot, so the band shows the hints (not the
// solved state), and one Slot's commit can't complete the whole puzzle, so the dock
// (and its comparison band) stays put.
export const commitFirstSlot = (el: HTMLElement): void => {
  firstSlot().cells.forEach((c) => {
    tapCell(el, cellKey(c));
    pressKey(el, '0');
  });
  pressCheck(el);
};

// A physical key, dispatched at the host (where the keydown listener lives). The real
// element receives these from any focused shadow control too (they bubble to the host).
export const pressPhysical = (
  el: HTMLElement,
  key: string,
  opts: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean } = {},
): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
};
export const clabel = (el: HTMLElement): string => el.shadowRoot!.querySelector('.clabel')!.textContent ?? '';
export const slotRowEl = (el: HTMLElement, key: string): HTMLElement =>
  el.shadowRoot!.querySelector(`[data-slot="${key}"]`) as HTMLElement;
// C0FFEE-73: the clue list now lives in a switchable pane reached via the "Clue list"
// button (only present in the entry pane). openClues opens it if we are in the entry
// pane and is a no-op once the clue pane is already showing (the button is gone there),
// so it is safe to call before any clue-row interaction.
export const openClues = (el: HTMLElement): void => {
  const btn = el.shadowRoot!.querySelector('[data-act="pane-clues"]');
  if (btn) click(btn);
};
// A clue-row tap opens the clue pane (if needed), clicks the row, and — by the
// auto-return contract — drops back into the entry pane with that Slot selected.
export const tapClue = (el: HTMLElement, key: string): void => {
  openClues(el);
  click(slotRowEl(el, key));
};
// The per-row status the clue panel projects: 'unguessed' | 'match' | 'wrong'.
export const rowState = (el: HTMLElement, key: string): string | null =>
  slotRowEl(el, key).getAttribute('data-state');
export const pressNav = (el: HTMLElement, dir: 'prev' | 'next'): void =>
  click(el.shadowRoot!.querySelector(`[data-nav="${dir}"]`));
// "1-Across" — the human clue label the element shows for a Slot (mirrors slotLabel).
export const labelOf = (s: { number: number; direction: string }): string =>
  `${s.number}-${s.direction.charAt(0).toUpperCase()}${s.direction.slice(1)}`;
// Fill + commit the initially-selected Slot via the physical keyboard, locking it.
export const solveSelected = (el: HTMLElement, target: string): void => {
  target.split('').forEach((d) => pressPhysical(el, d)); // cursor auto-advances per digit
  pressPhysical(el, 'Enter'); // commit -> a correct Guess locks every Cell
};

export const q = (el: HTMLElement, sel: string): Element | null => el.shadowRoot!.querySelector(sel);
export const act = (el: HTMLElement, name: string): void =>
  click(el.shadowRoot!.querySelector(`[data-act="${name}"]`));
// Solve a Slot fully via taps (selecting it first by a Cell unique to it), locking it.
export const solveSlot = (el: HTMLElement, p: ReturnType<typeof puzzle>, slot: typeof p.layout.slots[number]): void => {
  const xset = new Set(p.layout.crossings.map((x) => cellKey(x.cell)));
  const sel = slot.cells.map(cellKey).find((k) => !xset.has(k))!;
  tapCell(el, sel);
  const target = p.targets[slotKey(slot)];
  slot.cells.forEach((c, i) => {
    const k = cellKey(c);
    if (lockedAt(el, k)) return;
    if (cursorKey(el) !== k) tapCell(el, k);
    pressKey(el, target[i]);
  });
  pressCheck(el);
};

// The selected (first) Slot's target Color address for a given seed — what the clue half
// paints. Mirrors firstSlot() but for an arbitrary seed. Defaults to DEFAULT_SHAPE (the
// board every token-less/fallback/New path deals since C0FFEE-85); the Puzzle-link tests
// pass SHAPE explicitly because a link reproduces its own shape.
export const firstTargetForSeed = (seed: number, shape: string = DEFAULT_SHAPE): string => {
  const p = generatePuzzle(shape, seed);
  const first = [...p.layout.slots].sort(
    (a, b) => a.number - b.number || (a.direction < b.direction ? -1 : 1),
  )[0];
  return p.targets[`${first.number}-${first.direction}`];
};
export const clueColorOf = (el: HTMLElement): string =>
  (q(el, '.half.clue') as HTMLElement).getAttribute('style') ?? '';
