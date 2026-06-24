// <c0ffee-crossword> — the Hex Color crossword's face (imperative shell, ADR-0003).
//
// Slice 1 (C0FFEE-64) shipped the read-only render. Slice 2 of 4 (C0FFEE-65)
// makes it PLAYABLE by touch/pointer: a face-owned within-slot cursor, the hex
// keypad (0-9 / A-F / delete / Check), tap-to-position + crossing-select +
// re-tap direction toggle, a live your-mix Swatch, per-Channel verdict chips,
// and the commit toast. Physical-keyboard entry + clue-nav (C0FFEE-66) and the
// chrome/overlays/timer (C0FFEE-67) layer onto this same shadow tree later.
//
// The functional core is shipped and (almost) untouched: generatePuzzle
// (C0FFEE-60) makes a crossing-consistent Puzzle; initCrossword/crosswordReducer
// (C0FFEE-61) hold the CrosswordState this projects. The one core addition this
// slice folds in is the reducer's fifth action, clearDigit (the editing affordance
// the keypad's delete needs); everything else is shell. The shell translates state
// -> DOM (here) and DOM events -> the reducer's five actions.
//
// It holds many Color values, so it deliberately opts OUT of ADR-0001 URL reflection:
// no `colorchange`, no hash, and it does NOT mount <c0ffee-swatch> (whose click-to-load
// would hijack the hash with a clue color). The clue chips are hand-rolled boxes.
//
// Styling obeys the ADR-0007 color contract: saturated color appears only on the
// literal clue/mix Swatch (contract #1), the active-Slot channel-pair outlines in
// pure --c0ffee-r/-g/-b (contract #2), and the transient commit toast (contract #4).
// Verdict glyphs stay achromatic (contract #3); chip identity letters take MUTED
// channel tints (legible at 11px — pure #0000FF text is invisible on near-black).
// Everything else is neutral, muted by opacity off --c0ffee-fg, never grey tokens —
// and consumes tokens.css across the shadow boundary.

import { generatePuzzle } from '../lib/crossword-generator.ts';
import {
  initCrossword,
  crosswordReducer,
  cellKey,
  slotKey,
  SLOT_LENGTH,
  type CrosswordState,
  type CrosswordAction,
  type CellState,
  type SlotRef,
} from '../lib/crossword-state.ts';
import type { GuessResult, ChannelVerdict } from '../lib/crossword-guess.ts';
import type { Cell, Direction, Layout, Slot } from '../lib/crossword-layout.ts';

// Slice 1 opened on a fixed shape + seed, so the puzzle is deterministic: the smoke
// test asserts stable counts and the design eyeball reviews the same board every load.
// New-puzzle / the seeded Puzzle link (C0FFEE-67 / C0FFEE-57) are the future homes for
// a varying seed; this is the only place one is chosen for now.
const DEFAULT_SHAPE = 'lattice-6';
const DEFAULT_SEED = 1;

// Natural px per Cell — caps the board's max-width (cols * CELL_PX) and sets its
// aspect ratio. Every Cell is then positioned as a percentage, so the board is fluid
// and scales with its container (the prototype's geometry).
const CELL_PX = 42;

// How long a commit toast stays before it fades (transient teaching beat, contract #4).
const TOAST_MS = 2600;

// The grid weave hairline (ADR-0007 contract #6: neutral chrome off --c0ffee-fg).
const HAIR = 'rgba(255,255,255,.22)';

// The three channel-pair outlines for the active Slot (ADR-0007 contract #2): a Slot's
// six Cells split [0,1]=red, [2,3]=green, [4,5]=blue — the same split parseHex makes of
// a six-digit address. Pure primaries via the tokens; never softened.
const PAIRS: ReadonlyArray<{ ring: string; bg: string }> = [
  { ring: 'var(--c0ffee-r, #FF0000)', bg: 'rgba(255,0,0,.08)' },
  { ring: 'var(--c0ffee-g, #00FF00)', bg: 'rgba(0,255,0,.08)' },
  { ring: 'var(--c0ffee-b, #0000FF)', bg: 'rgba(0,0,255,.10)' },
];

// Muted channel-identity tints for the verdict chip letters (handoff §3 / open-Q3:
// legible at 11px where the pure primary would not be). The pure primary stays on the
// grid pair-outline, the structural signifier.
const CHIP_TINT: Record<'red' | 'green' | 'blue', string> = {
  red: '#ff6a6a',
  green: '#46e87f',
  blue: '#7aa6ff',
};

// A neutral padlock (lifted from the prototype): top-right, stroke off --c0ffee-fg,
// muted by opacity (contract #6 — status chrome stays achromatic).
const LOCK_SVG =
  '<span class="lock"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" ' +
  'stroke="var(--c0ffee-fg, #ededed)" stroke-width="2.4">' +
  '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>';

// Achromatic verdict glyphs (contract #3). 'correct' -> check; 'higher' -> aim-up
// (the target is above the guess); 'lower' -> aim-down. Stroke off --c0ffee-fg.
const VERDICT_GLYPH: Record<ChannelVerdict, string> = {
  correct:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  higher:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  lower:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
};

const DELETE_SVG =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"/><path d="m18 9-6 6M12 9l6 6"/></svg>';
const CHECK_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
// The commit toast's three kinds (contract #4: the one earned semantic color).
type ToastKind = 'warn' | 'win' | 'wrong';
// Icon per kind, table-driven like VERDICT_GLYPH (no nested ternary at the call site).
const TOAST_GLYPH: Record<ToastKind, string> = {
  warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>',
  win: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  wrong: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};

// The persistent per-Clue verdict marks in the clue list (ADR-0007 contract #5: a
// PERSISTENT status mark stays achromatic — unlike the one transient toast). 'solved'
// once every Channel of the Slot has locked; 'off' once a Guess has been graded but the
// Slot is not yet fully solved. Drawn in the neutral fg, never a channel primary — the
// graded higher/lower detail lives only on the inline board chips, not in this list.
const CLUE_MARK: Record<'solved' | 'off', { glyph: string; text: string }> = {
  solved: {
    glyph:
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    text: 'solved',
  },
  off: {
    glyph:
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    text: 'off',
  },
};

// The prev/next clue-nav chevrons (neutral chrome, contract #6). Lucide-style strokes
// off currentColor so the button's color rule drives them.
const NAV_GLYPH: Record<'prev' | 'next', string> = {
  prev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  next: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
};

// The hex keypad's keys in render order — 0-9 then A-F (the A-F row accent-tinted
// like the prototype, since they're the "color" digits). delete + Check live below.
const KEYS = '0123456789ABCDEF'.split('');

// weaveCell — the basket-weave board geometry, lifted VERBATIM from the design
// prototype (docs/design/crossword-face/prototype/CW-HexBoard.dc.html, the
// `weaveCell` method). Pure geometry off the live-Cell set: Cells pair in 2s; inset
// 2px on every closed side, 0 on open sides; corner radius 6 unless an adjacent edge
// is open; a 1px hairline on each closed side; and a 2x2px L-shaped hairline patch in
// the inner corner where two open sides meet. The only change from the prototype is
// reading liveness from a `live(r,c)` predicate (built from Layout.cells) instead of a
// `sol` string grid — the math is unchanged.
function weaveCell(live: (r: number, c: number) => boolean, r: number, c: number) {
  const openR = c % 2 === 0 && live(r, c + 1);
  const openL = c % 2 === 1 && live(r, c - 1);
  const openD = r % 2 === 0 && live(r + 1, c);
  const openU = r % 2 === 1 && live(r - 1, c);
  const inset = `${openU ? 0 : 2}px ${openR ? 0 : 2}px ${openD ? 0 : 2}px ${openL ? 0 : 2}px`;
  const tl = openU || openL ? 0 : 6,
    tr = openU || openR ? 0 : 6,
    br = openD || openR ? 0 : 6,
    bl = openD || openL ? 0 : 6;
  const radius = `${tl}px ${tr}px ${br}px ${bl}px`;
  const sh: string[] = [];
  if (!openU) sh.push(`inset 0 1px 0 ${HAIR}`);
  if (!openR) sh.push(`inset -1px 0 0 ${HAIR}`);
  if (!openD) sh.push(`inset 0 -1px 0 ${HAIR}`);
  if (!openL) sh.push(`inset 1px 0 0 ${HAIR}`);
  let corner: string | null = null;
  if (openR && openD)
    corner = `position:absolute;right:0;bottom:0;width:2px;height:2px;border-top:1px solid ${HAIR};border-left:1px solid ${HAIR};pointer-events:none;`;
  else if (openL && openD)
    corner = `position:absolute;left:0;bottom:0;width:2px;height:2px;border-top:1px solid ${HAIR};border-right:1px solid ${HAIR};pointer-events:none;`;
  else if (openR && openU)
    corner = `position:absolute;right:0;top:0;width:2px;height:2px;border-bottom:1px solid ${HAIR};border-left:1px solid ${HAIR};pointer-events:none;`;
  else if (openL && openU)
    corner = `position:absolute;left:0;top:0;width:2px;height:2px;border-bottom:1px solid ${HAIR};border-right:1px solid ${HAIR};pointer-events:none;`;
  return { inset, radius, shadow: sh.join(','), corner };
}

// The lowest-numbered Slot, across before down — the Slot the element opens on.
function firstSlot(layout: Layout): SlotRef {
  // A generated layout always has at least one Slot (generatePuzzle would have thrown
  // otherwise), so [0] is safe.
  const slot = [...layout.slots].sort(
    (a, b) => a.number - b.number || (a.direction < b.direction ? -1 : 1),
  )[0];
  return { number: slot.number, direction: slot.direction };
}

// cellKey / slotKey are imported from the core (crossword-state.ts) so the shell's
// `state.cells[...]` lookups can never drift from the keys the reducer indexes by.
// A grid position as a percentage of an n-unit axis — the board's one geometry primitive,
// shared by every percentage-positioned overlay (cells, pair outlines, clue numbers).
const pct = (n: number, of: number): string => `${(n / of) * 100}%`;
// "1-Across" / "3-Down" — the human label for a SlotRef (clue-vs-mix header).
const slotLabel = (ref: SlotRef): string =>
  `${ref.number}-${ref.direction.charAt(0).toUpperCase()}${ref.direction.slice(1)}`;

class C0ffeeCrossword extends HTMLElement {
  // attachShadow returns the root, so we never juggle a nullable shadowRoot.
  private root: ShadowRoot = this.attachShadow({ mode: 'open' });
  // The one game state the whole face projects from (ADR-0003 functional core).
  private state!: CrosswordState;
  // The within-slot cursor — the active editing Cell, keyed "row,col". CrosswordState
  // has no notion of an active Cell (setDigit takes an explicit cell and does not
  // advance), so the cursor is the FACE's job (C0FFEE-62 decision 2). null when the
  // selected Slot has no editable Cell (e.g. fully locked).
  private cursorKey: string | null = null;
  // The transient commit toast (contract #4); null when none is showing.
  private toast: { kind: ToastKind; text: string } | null = null;
  private toastTimer: number | null = null;
  // One delegated click listener on the shadow root drives every control. The root
  // persists across innerHTML re-renders, so the listener survives them — no per-render
  // re-binding, no leaks (dropped in disconnectedCallback).
  private onClick = (e: Event): void => this._handleClick(e);
  // The physical keyboard (C0FFEE-66). Bound on the host so a key from any focused shadow
  // control reaches it (events bubble across the boundary) and so the host itself — made
  // focusable with tabindex — can drive the puzzle directly.
  private onKeydown = (e: Event): void => this._handleKey(e as KeyboardEvent);

  connectedCallback(): void {
    const puzzle = generatePuzzle(DEFAULT_SHAPE, DEFAULT_SEED);
    // Open on the first Slot via the real reducer (not a hand-built state).
    this.state = crosswordReducer(initCrossword(puzzle), {
      type: 'select',
      slot: firstSlot(puzzle.layout),
    });
    this.cursorKey = this._firstCursor();
    // One focusable unit so a keyboard user can Tab to the puzzle and drive it. The
    // assistive-tech focus model (roving tabindex across the grid, ARIA roles) is the
    // separate C0FFEE-63 layer; this is the sighted-desktop keyboard seam.
    if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
    this.root.addEventListener('click', this.onClick);
    this.addEventListener('keydown', this.onKeydown);
    this._render();
  }

  disconnectedCallback(): void {
    this.root.removeEventListener('click', this.onClick);
    this.removeEventListener('keydown', this.onKeydown);
    this._clearToastTimer();
  }

  // --- event routing -------------------------------------------------------

  // One handler, three control families, routed by data-attribute. Cell taps,
  // keypad digits, and the delete/Check actions all bubble to the root.
  private _handleClick(e: Event): void {
    const target = e.target as Element | null;
    if (!target) return;
    const keyEl = target.closest('[data-key]');
    if (keyEl) return this._press((keyEl as HTMLElement).dataset.key as string);
    const actEl = target.closest('[data-act]');
    if (actEl) {
      const act = (actEl as HTMLElement).dataset.act;
      if (act === 'delete') return this._delete();
      if (act === 'check') return this._check();
      return;
    }
    const navEl = target.closest('[data-nav]');
    if (navEl) return this._step((navEl as HTMLElement).dataset.nav === 'prev' ? -1 : 1);
    const slotEl = target.closest('[data-slot]');
    if (slotEl) return this._routeToClue((slotEl as HTMLElement).dataset.slot as string);
    const cellEl = target.closest('[data-cell]');
    if (cellEl) return this._tap((cellEl as HTMLElement).dataset.cell as string);
  }

  // Physical keyboard, mirroring the touch model (C0FFEE-62 decision 8): a hex digit ->
  // setDigit at the cursor (then auto-advance, via _press); Backspace -> clearDigit
  // step-back; Enter -> commit; arrow keys move the cursor / toggle direction at a
  // crossing; Tab/Shift-Tab -> prev/next Slot (skip fully-locked). preventDefault keeps
  // Tab from moving DOM focus and arrows/Backspace from scrolling or going back — the
  // puzzle owns the keyboard while focused. Unhandled keys fall through untouched.
  private _handleKey(e: KeyboardEvent): void {
    const k = e.key;
    if (/^[0-9a-fA-F]$/.test(k)) {
      e.preventDefault();
      return this._press(k.toUpperCase());
    }
    if (k === 'Backspace') {
      e.preventDefault();
      return this._delete();
    }
    if (k === 'Enter') {
      e.preventDefault();
      return this._check();
    }
    if (k === 'Tab') {
      e.preventDefault();
      return this._step(e.shiftKey ? -1 : 1);
    }
    if (k.startsWith('Arrow')) {
      e.preventDefault();
      return this._arrow(k);
    }
  }

  private _dispatch(action: CrosswordAction): void {
    this.state = crosswordReducer(this.state, action);
  }

  // A keypad digit -> setDigit at the cursor, then auto-advance to the next editable
  // (non-locked) Cell, clamping at the last (no wrap; reaching the end does not
  // auto-commit — Check stays explicit). The reducer ignores a locked Cell, so a
  // cursor parked on one is a safe no-op.
  private _press(digit: string): void {
    const slot = this._selectedSlot();
    if (!slot || this.cursorKey === null) return;
    const cell = this._cellOf(this.cursorKey);
    this._dispatch({ type: 'setDigit', cell, digit });
    this.cursorKey = this._nextEditable(slot, this._indexInSlot(slot, this.cursorKey)) ?? this.cursorKey;
    this._dismissToast();
    this._render();
  }

  // Delete = backspace: a filled cursor Cell clears in place (retype there); an empty
  // cursor Cell steps back over locked Cells to the previous editable one and clears
  // it. Locks are stepped over, never cleared (C0FFEE-62 decision 3).
  private _delete(): void {
    const slot = this._selectedSlot();
    if (!slot || this.cursorKey === null) return;
    const cur = this._cellState(this.cursorKey);
    if (!cur.locked && cur.digit !== null) {
      this._dispatch({ type: 'clearDigit', cell: this._cellOf(this.cursorKey) });
    } else {
      const prev = this._prevEditable(slot, this._indexInSlot(slot, this.cursorKey));
      if (prev === null) return; // at the start, nothing behind to clear
      this.cursorKey = prev;
      this._dispatch({ type: 'clearDigit', cell: this._cellOf(prev) });
    }
    this._dismissToast();
    this._render();
  }

  // A Cell tap. Three outcomes (C0FFEE-62 decision 2):
  //  - re-tap the active crossing Cell already under the cursor -> toggle direction
  //    (select the perpendicular Slot, keep the cursor on the shared Cell);
  //  - tap any other Cell of the active Slot -> move the cursor there;
  //  - tap a Cell that belongs only to another Slot -> select that Slot (cursor inits
  //    to its first editable Cell).
  private _tap(key: string): void {
    const active = this._selectedSlot();
    const slotsHere = this.state.puzzle.layout.slots.filter((s) =>
      s.cells.some((c) => cellKey(c) === key),
    );
    const activeHasCell = !!active && active.cells.some((c) => cellKey(c) === key);

    if (active && activeHasCell) {
      if (key === this.cursorKey && slotsHere.length > 1) {
        const perp = slotsHere.find((s) => s.direction !== active.direction);
        if (perp) {
          this._dispatch({ type: 'select', slot: { number: perp.number, direction: perp.direction } });
          // cursor kept on the shared Cell (it belongs to the perpendicular Slot too)
          this._dismissToast();
          this._render();
          return;
        }
      }
      this.cursorKey = key; // move within the active Slot
      this._dismissToast();
      this._render();
      return;
    }

    // Selecting a new Slot from a Cell outside the active one. A crossing Cell belongs
    // to one across + one down; with nothing relevant active, prefer the across.
    const pick = slotsHere.find((s) => s.direction === 'across') ?? slotsHere[0];
    if (!pick) return; // no live Slot here (impossible for a real Cell) — ignore
    this._dispatch({ type: 'select', slot: { number: pick.number, direction: pick.direction } });
    this.cursorKey = this._firstCursor();
    this._dismissToast();
    this._render();
  }

  // Check -> commit. An incomplete Slot can't be graded, so it warns instead of
  // dispatching (the reducer would no-op silently). A graded Slot shows win when every
  // Channel matched (and a fuller message once the whole puzzle is complete) else
  // wrong; the per-Channel verdict chips carry the detail.
  private _check(): void {
    const slot = this._selectedSlot();
    if (!slot) return;
    const digits = slot.cells.map((c) => this._cellState(cellKey(c)).digit);
    if (digits.some((d) => d === null)) {
      this._showToast('warn', 'Fill in all six digits before checking.');
      return;
    }
    this._dispatch({ type: 'commit' });
    // "Every Channel matched" is exactly state.solved for this Slot (a Channel is solved
    // iff its commit graded correct) — consume the core's derived truth rather than
    // re-interpreting the verdict strings in the shell (ADR-0003).
    const solved = this.state.solved[slotKey(slot)];
    const allCorrect = solved.red && solved.green && solved.blue;
    // A correct commit locks the Slot's Cells; move the cursor to whatever stays
    // editable (null once the Slot is fully solved).
    this.cursorKey = this._firstCursor();
    if (this.state.complete) this._showToast('win', 'Solved — every Channel matches.');
    else if (allCorrect) this._showToast('win', 'Every Channel matches — locked in.');
    else this._showToast('wrong', 'Not quite — read the channel hints.');
  }

  // --- navigation ----------------------------------------------------------

  // An arrow key. Along the active Slot's axis (Left/Right for an across Slot, Up/Down
  // for a down Slot) it moves the cursor one editable Cell, clamping at the ends (no
  // wrap) and skipping locked Cells like the keypad's auto-advance. The cross-axis arrow,
  // on a crossing Cell, toggles to the perpendicular Slot keeping the cursor on the shared
  // Cell — the keyboard twin of re-tapping a crossing (C0FFEE-62 decisions 2 + 8).
  private _arrow(key: string): void {
    const slot = this._selectedSlot();
    if (!slot || this.cursorKey === null) return;
    const horizontal = slot.direction === 'across';
    const along = horizontal
      ? key === 'ArrowLeft'
        ? -1
        : key === 'ArrowRight'
          ? 1
          : 0
      : key === 'ArrowUp'
        ? -1
        : key === 'ArrowDown'
          ? 1
          : 0;
    if (along !== 0) {
      const idx = this._indexInSlot(slot, this.cursorKey);
      const next = along < 0 ? this._prevEditable(slot, idx) : this._nextEditable(slot, idx);
      if (next === null) return; // clamp at the Slot end
      this.cursorKey = next;
      this._dismissToast();
      this._render();
      return;
    }
    // a cross-axis arrow: toggle direction at a crossing (the keyboard re-tap)
    const perp = this.state.puzzle.layout.slots.find(
      (s) => s.direction !== slot.direction && s.cells.some((c) => cellKey(c) === this.cursorKey),
    );
    if (!perp) return; // not on a crossing — no perpendicular Slot to switch to
    this._dispatch({ type: 'select', slot: { number: perp.number, direction: perp.direction } });
    // cursor kept on the shared Cell (it belongs to the perpendicular Slot too)
    this._dismissToast();
    this._render();
  }

  // prev/next Slot navigation (C0FFEE-62 decision 7), shared by the clue-nav buttons and
  // Tab/Shift-Tab. Walks layout.slots order, wraps, and SKIPS fully-locked Slots (those
  // with no editable Cell), landing on the next Slot that still has an editable Cell. A
  // no-op when no OTHER Slot is editable (the current is the only one, or the puzzle is
  // solved). On landing, the cursor inits to the new Slot's first editable Cell.
  private _step(dir: 1 | -1): void {
    const slot = this._selectedSlot();
    if (!slot) return;
    const slots = this.state.puzzle.layout.slots;
    const n = slots.length;
    const start = slots.findIndex((s) => s.number === slot.number && s.direction === slot.direction);
    const editable = (s: Slot): boolean => s.cells.some((c) => !this._cellState(cellKey(c)).locked);
    for (let i = 1; i < n; i++) {
      const cand = slots[(((start + dir * i) % n) + n) % n];
      if (!editable(cand)) continue;
      this._dispatch({ type: 'select', slot: { number: cand.number, direction: cand.direction } });
      this.cursorKey = this._firstCursor();
      this._dismissToast();
      this._render();
      return;
    }
    // no other editable Slot — nothing to move to
  }

  // A clue-list tap: select that Slot and init the cursor to its first editable Cell. A
  // fully-solved clue stays selectable (reviewable) — its cursor just resolves to null.
  // The data-slot string is the core's slotKey ("number-direction"), so it round-trips
  // back into a SlotRef the reducer validates.
  private _routeToClue(key: string): void {
    const [numStr, direction] = key.split('-');
    this._dispatch({ type: 'select', slot: { number: Number(numStr), direction: direction as Direction } });
    this.cursorKey = this._firstCursor();
    this._dismissToast();
    this._render();
  }

  // The persistent per-Clue mark state (ADR-0007 contract #5): 'solved' once every Channel
  // of the Slot has locked, 'off' once a Guess has been graded but it is not yet fully
  // solved, null when the Slot has never been checked (no mark). Reads the core's derived
  // truth (verdicts / solved); never re-interprets digits.
  private _clueVerdict(slot: Slot): 'solved' | 'off' | null {
    const key = slotKey(slot);
    if (this.state.verdicts[key] == null) return null;
    const s = this.state.solved[key];
    return s.red && s.green && s.blue ? 'solved' : 'off';
  }

  // --- cursor helpers ------------------------------------------------------

  // The play state at a "row,col" key, fail-loud on a miss (mirrors the core's cellAt
  // and the face's _target/_selectedSlot). Every read of state.cells routes through
  // here, so a key-shape drift surfaces as a greppable domain error rather than a bare
  // TypeError deep in a handler — the face fails loud uniformly, not in hand-picked spots.
  private _cellState(key: string): CellState {
    const cs = this.state.cells[key];
    if (!cs) throw new Error(`c0ffee-crossword: no Cell state for ${key} in rendered state`);
    return cs;
  }

  // The index of `key` within `slot`, fail-loud when absent. Callers only pass a cursor
  // key that is, by construction, in the active Slot, so a -1 here means a drift — caught
  // loudly rather than silently restarting a scan from index 0.
  private _indexInSlot(slot: Slot, key: string): number {
    const i = slot.cells.findIndex((c) => cellKey(c) === key);
    if (i < 0) throw new Error(`c0ffee-crossword: cursor ${key} not in Slot ${slotKey(slot)}`);
    return i;
  }

  // The first editable Cell of the selected Slot: the first non-locked empty one, else
  // the first non-locked one, else null (the Slot is fully locked).
  private _firstCursor(): string | null {
    const slot = this._selectedSlot();
    if (!slot) return null;
    const empty = slot.cells.find((c) => {
      const cs = this._cellState(cellKey(c));
      return !cs.locked && cs.digit === null;
    });
    if (empty) return cellKey(empty);
    const free = slot.cells.find((c) => !this._cellState(cellKey(c)).locked);
    return free ? cellKey(free) : null;
  }

  private _nextEditable(slot: Slot, fromIndex: number): string | null {
    for (let i = fromIndex + 1; i < slot.cells.length; i++) {
      const key = cellKey(slot.cells[i]);
      if (!this._cellState(key).locked) return key;
    }
    return null; // clamp at the last editable Cell, no wrap
  }

  private _prevEditable(slot: Slot, fromIndex: number): string | null {
    for (let i = fromIndex - 1; i >= 0; i--) {
      const key = cellKey(slot.cells[i]);
      if (!this._cellState(key).locked) return key;
    }
    return null;
  }

  // The Cell at a "row,col" key, as a {row,col}. Used only for keys the cursor already
  // sits on (so the Cell is in the grid); parse is the inverse of cellKey.
  private _cellOf(key: string): Cell {
    const [row, col] = key.split(',').map(Number);
    return { row, col };
  }

  // --- toast ---------------------------------------------------------------

  private _showToast(kind: ToastKind, text: string): void {
    this._clearToastTimer();
    this.toast = { kind, text };
    this._render();
    this.toastTimer = window.setTimeout(() => {
      this.toast = null;
      this.toastTimer = null;
      this._render();
    }, TOAST_MS);
  }

  // Drop the toast immediately (the next input supersedes it) without re-rendering —
  // the caller renders. A no-op when nothing is showing.
  private _dismissToast(): void {
    if (!this.toast) return;
    this._clearToastTimer();
    this.toast = null;
  }

  private _clearToastTimer(): void {
    if (this.toastTimer !== null) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
  }

  // --- render --------------------------------------------------------------

  private _render(): void {
    const { layout } = this.state.puzzle;
    this.root.innerHTML = `
      <style>${STYLE}</style>
      <div class="screen">
        <div class="boardwrap">${this._board(layout)}</div>
        <section class="dock panel">
          ${this._compare()}
          ${this._inputDock()}
          ${this._clueList(layout)}
        </section>
      </div>`;
  }

  // Resolve the selected SlotRef to its full Slot, or null when nothing is selected.
  // A non-null selection absent from the layout is impossible — the reducer's `select`
  // validates against this same layout and throws otherwise — so it fails loud here
  // rather than silently dropping the active-Slot outline.
  private _selectedSlot(): Slot | null {
    const sel = this.state.selected;
    if (!sel) return null;
    const slot = this.state.puzzle.layout.slots.find(
      (s) => s.number === sel.number && s.direction === sel.direction,
    );
    if (!slot) throw new Error(`c0ffee-crossword: selected Slot ${slotKey(sel)} not in rendered layout`);
    return slot;
  }

  // The latent target Hex color address for a Slot, fail-loud on a miss (mirrors the
  // core's cellAt). initCrossword validates every Slot has a six-digit target, so a miss
  // means a key drift — surfaced loudly rather than painting `background:#undefined`.
  private _target(ref: SlotRef): string {
    const hex = this.state.puzzle.targets[slotKey(ref)];
    if (typeof hex !== 'string') {
      throw new Error(`c0ffee-crossword: no target Hex color address for Slot ${slotKey(ref)}`);
    }
    return hex;
  }

  // The woven board: walk Layout.cells (row-major), position each by percentage of an
  // aspect-locked square, and dress it with the lifted weave geometry. Lays the active
  // Slot's channel-pair outlines and the clue-number labels over the top. Each Cell is a
  // tap target (data-cell); the cursor Cell carries an accent caret.
  private _board(layout: Layout): string {
    const cols = Math.max(...layout.cells.map((c) => c.col)) + 1;
    const rows = Math.max(...layout.cells.map((c) => c.row)) + 1;
    const liveSet = new Set(layout.cells.map(cellKey));
    const live = (r: number, c: number): boolean => liveSet.has(`${r},${c}`);

    const cells = layout.cells
      .map((cell) => {
        const key = cellKey(cell);
        const g = weaveCell(live, cell.row, cell.col);
        const st = this._cellState(key);
        const isCursor = key === this.cursorKey;
        const wrap = `position:absolute;left:${pct(cell.col, cols)};top:${pct(cell.row, rows)};width:${pct(1, cols)};height:${pct(1, rows)};`;
        const base = `position:absolute;inset:${g.inset};border-radius:${g.radius};background:var(--c0ffee-bg, #0a0a0b);box-shadow:${g.shadow};`;
        return `<div class="cell${isCursor ? ' cur' : ''}" data-cell="${key}" style="${wrap}">
          <div class="base" style="${base}"></div>
          ${g.corner ? `<div style="${g.corner}"></div>` : ''}
          ${isCursor ? '<div class="caret"></div>' : ''}
          ${st.digit ? `<span class="glyph">${st.digit}</span>` : ''}
          ${st.locked ? LOCK_SVG : ''}
        </div>`;
      })
      .join('');

    const boardStyle = `position:relative;width:100%;max-width:${cols * CELL_PX}px;aspect-ratio:${cols} / ${rows};margin:0 auto;`;
    return `<div class="board" style="${boardStyle}">
      ${cells}
      ${this._outlines(cols, rows)}
      ${this._clueNumbers(layout, cols, rows)}
    </div>`;
  }

  // The active-Slot channel-pair outlines (ADR-0007 contract #2). Take the selected
  // Slot's six Cells in order and ring pairs [0,1]/[2,3]/[4,5], each over the two Cells'
  // bounding box (horizontal for across, vertical for down), in its pure channel primary.
  private _outlines(cols: number, rows: number): string {
    const slot = this._selectedSlot();
    if (!slot) return '';
    return PAIRS.map((pair, i) => {
      const a = slot.cells[i * 2];
      const b = slot.cells[i * 2 + 1];
      const r0 = Math.min(a.row, b.row);
      const c0 = Math.min(a.col, b.col);
      const w = Math.abs(b.col - a.col) + 1;
      const h = Math.abs(b.row - a.row) + 1;
      const style =
        `position:absolute;left:calc(${pct(c0, cols)} + 2px);top:calc(${pct(r0, rows)} + 2px);` +
        `width:calc(${pct(w, cols)} - 4px);height:calc(${pct(h, rows)} - 4px);` +
        `border-radius:7px;background:${pair.bg};box-shadow:inset 0 0 0 1.4px ${pair.ring};pointer-events:none;`;
      return `<div class="pair" style="${style}"></div>`;
    }).join('');
  }

  // Clue-number labels on the board PERIPHERY (the handoff design): a down Slot's number
  // sits centered ABOVE its starting column on the top edge; an across Slot's number sits
  // centered to the LEFT of its starting row on the left edge — outside the cells, never
  // inside the first Cell. One label per Slot, so a corner that starts both an across and
  // a down shows its number on BOTH edges (position disambiguates which clue it names).
  // Neutral (contract #6); pointer-events:none so a label never eats a Cell tap. The
  // boardwrap padding reserves the room these negative offsets need.
  private _clueNumbers(layout: Layout, cols: number, rows: number): string {
    return layout.slots
      .map((slot) => {
        const { row, col } = slot.cells[0];
        const style =
          slot.direction === 'down'
            ? `top:-15px;left:calc(${pct(col, cols)} + ${50 / cols}%);transform:translateX(-50%);`
            : `left:-14px;top:calc(${pct(row, rows)} + ${50 / rows}%);transform:translateY(-50%);`;
        return `<span class="num" style="${style}">${slot.number}</span>`;
      })
      .join('');
  }

  // The clue-vs-your-mix comparison (the keeper "aha"): the selected Slot's label + a
  // meta line (the typed-digit count while solving, the per-Channel verdict chips once
  // a Guess has been graded), then the clue Swatch painted its literal target (contract
  // #1) beside the live your-mix Swatch ringed in accent.
  private _compare(): string {
    const slot = this._selectedSlot();
    const ref = slot ? { number: slot.number, direction: slot.direction } : null;

    const label = ref ? slotLabel(ref) : '';
    const digits = slot ? slot.cells.map((c) => this._cellState(cellKey(c)).digit) : [];
    const typed = digits.filter((d) => d !== null).length;
    const verdict = ref ? this.state.verdicts[slotKey(ref)] : null;
    const meta = verdict
      ? this._chips(verdict)
      : `<span class="count">${typed} / 6</span>`;

    const clueStyle = ref
      ? `background:#${this._target(ref)};`
      : 'box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);';

    // Your-mix: a Guess is a WHOLE six-digit color address, so the mix Swatch only
    // resolves to a color once every Cell of the Slot is filled. Until then it stays the
    // empty "?" placeholder (no half-typed color masquerading as a guess).
    const mix =
      typed === SLOT_LENGTH
        ? `<div class="stage mix filled" style="background:#${digits.join('')};"></div>`
        : `<div class="stage mix"><span class="q">?</span></div>`;

    return `<div class="compare">
      <div class="cmeta">
        <button type="button" class="navbtn" data-nav="prev" aria-label="Previous clue">${NAV_GLYPH.prev}</button>
        <span class="clabel">${label}</span>
        ${meta}
        <button type="button" class="navbtn" data-nav="next" aria-label="Next clue">${NAV_GLYPH.next}</button>
      </div>
      <div class="stages">
        <div class="stage clue" style="${clueStyle}"></div>
        ${mix}
      </div>
    </div>`;
  }

  // The per-Channel verdict chips (handoff §3): identity letter in a muted channel tint
  // (contract #2 made legible), glyph achromatic (contract #3).
  private _chips(verdict: GuessResult): string {
    const rows: ReadonlyArray<[keyof GuessResult, string, string]> = [
      ['red', 'r', 'R'],
      ['green', 'g', 'G'],
      ['blue', 'b', 'B'],
    ];
    return `<span class="chips">${rows
      .map(([channel, ch, letter]) => {
        const v = verdict[channel];
        return `<span class="chip ${ch}" data-ch="${ch}" data-verdict="${v}">
          <span class="id" style="color:${CHIP_TINT[channel]};">${letter}</span>
          <span class="glyph">${VERDICT_GLYPH[v]}</span>
        </span>`;
      })
      .join('')}</span>`;
  }

  // The input dock: a transient commit toast (contract #4) above the hex keypad. The
  // keypad is the crossword's OWN hex entry (the console is slider-driven and owns no
  // keypad). 0-9 / A-F digit keys, then a delete + Check row.
  private _inputDock(): string {
    const digitKeys = KEYS.map(
      (k) =>
        `<button type="button" class="key${/[A-F]/.test(k) ? ' hex' : ''}" data-key="${k}">${k}</button>`,
    ).join('');
    return `<div class="inputdock">
      ${this._toastEl()}
      <div class="keypad">${digitKeys}</div>
      <div class="keyrow">
        <button type="button" class="key del" data-act="delete" aria-label="Delete">${DELETE_SVG}</button>
        <button type="button" class="key check" data-act="check">${CHECK_SVG}<span>Check guess</span></button>
      </div>
    </div>`;
  }

  private _toastEl(): string {
    if (!this.toast) return '';
    return `<div class="toastwrap"><span class="toast ${this.toast.kind}">${TOAST_GLYPH[this.toast.kind]}${this.toast.text}</span></div>`;
  }

  // The Across/Down clue list: one tappable row per Slot — its number, a painted box of
  // its clue Color value, and (once checked) a neutral verdict mark. A tap routes to that
  // Slot (C0FFEE-66); the rows are real <button>s with the focus-visible ring, so the list
  // is fully keyboard/pointer drivable. NOT <c0ffee-swatch> (which would emit colorchange
  // and hijack the hash). The six-digit answer stays latent: only the color is shown,
  // which is the clue (you reason its hex), so nothing is leaked.
  private _clueList(layout: Layout): string {
    const sel = this.state.selected;
    const group = (direction: 'across' | 'down', heading: string): string => {
      const rows = layout.slots
        .filter((s) => s.direction === direction)
        .sort((a, b) => a.number - b.number)
        .map((slot) => {
          const hex = this._target(slot);
          const key = slotKey(slot);
          const isSel = !!sel && sel.number === slot.number && sel.direction === slot.direction;
          const v = this._clueVerdict(slot);
          const mark = v
            ? `<span class="verdict">${CLUE_MARK[v].glyph}<span class="vt">${CLUE_MARK[v].text}</span></span>`
            : '';
          return `<li><button type="button" class="cluerow${isSel ? ' sel' : ''}" data-slot="${key}" aria-pressed="${isSel}">
            <span class="cnum">${slot.number}</span>
            <span class="box" style="background:#${hex};"></span>
            ${mark}
          </button></li>`;
        })
        .join('');
      return `<div class="cluegroup"><h2>${heading}</h2><ul>${rows}</ul></div>`;
    };
    return `<div class="cluelist">${group('across', 'Across')}${group('down', 'Down')}</div>`;
  }
}

// The scoped CSS. Page bg is dressed (hairline + shadow), never a lighter fill (ADR-0007
// surface recipe, shared with swatch.ts / console.ts). Keypad keys, toasts, chips, and
// the cursor caret are this slice's additions onto the slice-1 skeleton.
const STYLE = `
  :host { display:block; font-family:var(--c0ffee-font, monospace); color:var(--c0ffee-fg, #ededed); outline:none; }
  /* the puzzle is one focusable unit (tabindex on the host) — show the keyboard-focus ring
     when it is reached by Tab, the same accent ring every control uses (C0FFEE-66) */
  :host(:focus-visible) { outline:2px solid var(--c0ffee-accent, #C0FFEE); outline-offset:3px; border-radius:18px; }
  *, *::before, *::after { box-sizing:border-box; }

  /* mobile-first fluid; centered, clamped column on wide viewports (ADR-0005) */
  .screen { display:flex; flex-direction:column; gap:14px; min-height:100%;
            width:100%; max-width:430px; margin:0 auto; padding:18px 0;
            background:var(--c0ffee-bg, #0a0a0b); }

  /* surface recipe — dressed page bg, never a lighter fill */
  .panel { background:var(--c0ffee-bg, #0a0a0b); border-radius:16px;
           box-shadow:inset 0 0 0 1px rgba(255,255,255,.18), 0 16px 34px -20px rgba(0,0,0,.85); }

  /* the negative-offset clue numbers need room outside the board box */
  .boardwrap { padding:20px 22px; }
  .board { position:relative; }
  .cell { position:absolute; display:flex; align-items:center; justify-content:center; cursor:pointer; }
  .cell .glyph { position:relative; z-index:3; font:400 21px/1 var(--c0ffee-font, monospace); color:var(--c0ffee-fg, #ededed); }
  /* the within-slot cursor: an accent caret ring over the active Cell (contract: accent = "you") */
  .cell .caret { position:absolute; inset:2px; border-radius:6px; z-index:4; pointer-events:none;
                 box-shadow:inset 0 0 0 2px var(--c0ffee-accent, #C0FFEE); }
  .cell .lock { position:absolute; top:3px; right:4px; line-height:0; opacity:.65; z-index:5; }
  .num { position:absolute; font:400 10px/1 var(--c0ffee-font, monospace); color:rgba(255,255,255,.74); z-index:6; pointer-events:none; }

  .dock { padding:16px; display:flex; flex-direction:column; gap:16px; margin:0 14px; }

  /* the comparison: clue + live mix — the literal Color values (contract #1); the active
     outline (#2) and the transient commit toast (#4) are the other saturated surfaces */
  .compare { display:flex; flex-direction:column; gap:11px; }
  .cmeta { display:flex; align-items:center; gap:10px; min-height:18px; }
  /* prev/next clue-nav: neutral chevron buttons flanking the clue label (contract #6) */
  .navbtn { flex:none; width:30px; height:30px; padding:0; border:none; border-radius:8px;
            background:var(--c0ffee-bg, #0a0a0b); box-shadow:inset 0 0 0 1px rgba(255,255,255,.19);
            color:rgba(255,255,255,.78); cursor:pointer; display:flex; align-items:center; justify-content:center; }
  .navbtn:focus-visible { outline:2px solid var(--c0ffee-accent, #C0FFEE); outline-offset:2px; }
  .clabel { font:400 14px/1 var(--c0ffee-font, monospace); color:var(--c0ffee-fg, #ededed); white-space:nowrap; }
  .count { margin-left:auto; font:400 10.5px/1 var(--c0ffee-font, monospace); letter-spacing:.12em;
           text-transform:uppercase; color:rgba(255,255,255,.62); }
  .chips { margin-left:auto; display:inline-flex; align-items:center; gap:9px; }
  .chip { display:inline-flex; align-items:center; gap:3px; }
  .chip .id { font:500 11.5px/1 var(--c0ffee-font, monospace); }
  .chip .glyph { line-height:0; }
  .stages { display:flex; gap:10px; }
  .stage { flex:1; height:72px; border-radius:12px; box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); }
  .stage.mix { display:flex; align-items:center; justify-content:center; box-shadow:inset 0 0 0 2px var(--c0ffee-accent, #C0FFEE); }
  .stage.mix .q { font:400 26px/1 var(--c0ffee-font, monospace); color:var(--c0ffee-accent, #C0FFEE); opacity:.8; }

  /* the input dock — toast above the hex keypad */
  .inputdock { position:relative; display:flex; flex-direction:column; gap:8px; }
  .toastwrap { position:absolute; left:0; right:0; bottom:100%; margin-bottom:10px; display:flex;
               justify-content:center; pointer-events:none; z-index:5; }
  .toast { display:inline-flex; align-items:center; gap:8px; padding:10px 14px; border-radius:10px;
           font:400 11.5px/1.3 var(--c0ffee-font, monospace); white-space:nowrap; }
  .toast svg { flex:none; }
  .toast.warn  { background:#241c0c; box-shadow:inset 0 0 0 1px rgba(240,180,80,.5), 0 10px 24px -10px rgba(0,0,0,.7); color:#f1c074; }
  .toast.win   { background:#0d2417; box-shadow:inset 0 0 0 1px rgba(60,235,120,.55), 0 10px 24px -10px rgba(0,0,0,.7); color:#7be8a5; }
  .toast.wrong { background:#2a1212; box-shadow:inset 0 0 0 1px rgba(255,80,80,.5), 0 10px 24px -10px rgba(0,0,0,.7); color:#ff8b8b; }

  .keypad { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
  .keyrow { display:grid; grid-template-columns:1fr 2fr; gap:6px; }
  .key { min-height:44px; border:none; border-radius:9px; background:var(--c0ffee-bg, #0a0a0b);
         box-shadow:inset 0 0 0 1px rgba(255,255,255,.19); color:var(--c0ffee-fg, #ededed);
         font:400 18px/1 var(--c0ffee-font, monospace); cursor:pointer;
         display:flex; align-items:center; justify-content:center; gap:7px; }
  .key.hex { box-shadow:inset 0 0 0 1px rgba(192,255,238,.28); color:var(--c0ffee-accent, #C0FFEE); }
  .key.del { color:rgba(255,255,255,.78); }
  .key.check { box-shadow:inset 0 0 0 1px rgba(192,255,238,.4); color:var(--c0ffee-accent, #C0FFEE);
               font:400 14px/1 var(--c0ffee-font, monospace); letter-spacing:.04em; }
  .key:focus-visible { outline:2px solid var(--c0ffee-accent, #C0FFEE); outline-offset:2px; }

  .cluelist { display:flex; gap:18px; }
  .cluegroup { flex:1; }
  .cluegroup h2 { margin:0 0 8px; font:500 9.5px/1 var(--c0ffee-font, monospace);
                  letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,.5); }
  .cluegroup ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:3px; }
  .cluegroup li { display:flex; }
  /* a clue row is a real <button> (reset to inherit the panel) so a tap routes to its
     Slot and the focus-visible ring lands here; 44px min-height keeps it a touch target */
  .cluerow { flex:1; display:flex; align-items:center; gap:8px; min-height:36px; padding:4px 7px;
             border:none; border-radius:8px; background:none; color:inherit; cursor:pointer;
             font:inherit; text-align:left; }
  .cluerow.sel { background:rgba(255,255,255,.05); box-shadow:inset 0 0 0 1px rgba(255,255,255,.28); }
  .cluerow:focus-visible { outline:2px solid var(--c0ffee-accent, #C0FFEE); outline-offset:2px; }
  .cluerow .cnum { font:400 12px/1 var(--c0ffee-font, monospace); color:rgba(255,255,255,.74); min-width:14px; }
  .cluerow .box { width:22px; height:22px; border-radius:6px; box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); flex:none; }
  /* the persistent verdict mark — achromatic icon + muted text (contract #5) */
  .cluerow .verdict { margin-left:auto; display:inline-flex; align-items:center; gap:4px; line-height:0; }
  .cluerow .verdict .vt { font:400 9px/1 var(--c0ffee-font, monospace); letter-spacing:.1em;
                          text-transform:uppercase; color:rgba(255,255,255,.6); }
`;

customElements.define('c0ffee-crossword', C0ffeeCrossword);
