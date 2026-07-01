// <c0ffee-crossword> — the Hex Color crossword's face (imperative shell, ADR-0003).
//
// Slice 1 (C0FFEE-64) shipped the read-only render. Slice 2 of 4 (C0FFEE-65)
// made it PLAYABLE by touch/pointer: a face-owned within-slot cursor, the hex
// keypad (0-9 / A-F / delete / Check), tap-to-position + crossing-select +
// re-tap direction toggle, a live your-mix Swatch, per-Channel verdict chips,
// and the commit toast. Slice 3 (C0FFEE-66) added physical-keyboard entry +
// clue-nav. Slice 4 of 4 (C0FFEE-67) wraps the chrome around all of it: the
// topbar (timer / pause / help / menu), the shared-scrim overlays (first-run
// coach, pause, destructive Restart/New confirm), the one-shot lock callout,
// and the completion card — all on this same shadow tree.
//
// C0FFEE-73 makes the whole game fit one mobile viewport (ADR-0005): the region
// below the constant board + topbar becomes two switchable panes. The entry pane
// (comparison + keypad) is where you play; a "Clue list" button in the clue-nav
// header opens the clue-list pane (the handoff's two-column CW-CluePanel: every
// Slot's clue color beside your own guess). Tapping a clue row selects that Slot
// and auto-returns to the entry pane; Escape returns unchanged. Exactly one pane
// renders below the board at a time, so the page never has to scroll. Pure shell:
// `activePane` is transient element state (never the URL hash), and the clue-vs-you
// row status is derived from CrosswordState — no reducer or core change.
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
// and consumes tokens.css across the shadow boundary. The chrome (C0FFEE-67) adds two
// further uses, both kept within the contract: --c0ffee-accent marks primary actions
// (Resume / coach Next / Got it / New), and ONE earned warm semantic tone marks the
// destructive confirm CTA + warn glyph; the completion recolor paints the solved board
// its own answer Colors (contract #1 territory). See the `=== chrome ===` STYLE block.

import { datadogRum } from '@datadog/browser-rum-slim';
import { generatePuzzle } from '../lib/crossword-generator.ts';
import { decodePuzzleToken, encodePuzzleToken } from '../lib/crossword-link.ts';
import { composeShareMessage, fmtSolveTime } from '../lib/crossword-share.ts';
import { SHAPES } from '../lib/crossword-shapes.ts';
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
  type Puzzle,
} from '../lib/crossword-state.ts';
import type { GuessResult, ChannelVerdict } from '../lib/crossword-guess.ts';
import type { Cell, Direction, Layout, Slot } from '../lib/crossword-layout.ts';
import {
  initSolveTimer,
  solveTimerReducer,
  elapsedMs,
  type SolveTimer,
} from '../lib/crossword-timer.ts';

// The default puzzle when no Puzzle link is present: a fixed shape + seed, deterministic
// so the smoke test asserts stable counts and the design eyeball reviews the same board.
// A varying seed now enters from two places — "New" advances it (C0FFEE-67), and a
// Puzzle-link hash supplies a shared (shapeId, seed) on load (C0FFEE-78, _initialPuzzle).
const DEFAULT_SHAPE = 'lattice-6';
const DEFAULT_SEED = 1;

// Natural px per Cell — caps the board's max-width (cols * CELL_PX) and sets its
// aspect ratio. Every Cell is then positioned as a percentage, so the board is fluid
// and scales with its container (the prototype's geometry).
const CELL_PX = 38;

// How long a commit toast stays before it fades (transient teaching beat, contract #4).
const TOAST_MS = 2600;

// How long the share control's Copied / Copy failed flash shows before returning to
// rest (C0FFEE-80; the C0FFEE-54 confirmation-flash cadence).
const FLASH_MS = 1400;

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

// The per-row status the clue-list pane projects for a Slot (C0FFEE-73 / CW-CluePanel):
// 'unguessed' (no committed Guess, or a post-commit edit emptied a Cell), 'match' (every
// Channel solved), 'wrong' (a full six-digit Guess committed that is not fully solved).
type ClueRowState = 'unguessed' | 'match' | 'wrong';

// The clue-list row's hamburger affordance lives in the entry pane's clue-nav header
// (CW-InputDock): the "Clue list" button that swaps in the clue-list pane. Neutral chrome
// off currentColor (contract #6), the prototype's three-line list glyph.
const LIST_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';

// The clue-panel's in-swatch marks (CW-CluePanel): a dark check stamped on a solved/match
// swatch (legible on the saturated color), and a dark cross on the your-guess swatch of a
// wrong row. Achromatic strokes over a colored ground (contract #3 — the glyph carries no
// color content; the swatch underneath is the literal clue/guess color, contract #1).
const PANEL_CHECK_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const PANEL_CROSS_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

// The prev/next clue-nav chevrons (neutral chrome, contract #6). Lucide-style strokes
// off currentColor so the button's color rule drives them.
const NAV_GLYPH: Record<'prev' | 'next', string> = {
  prev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  next: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
};

// Each arrow key, mapped to the Slot axis it moves ALONG and its step. An arrow moves the
// cursor only when its axis matches the active Slot's direction; the cross-axis arrow
// instead toggles direction at a crossing (see _arrow). A flat table beats a nested
// ternary and makes the axis-vs-direction rule explicit.
const ARROW_AXIS: Record<string, { axis: Direction; step: 1 | -1 }> = {
  ArrowLeft: { axis: 'across', step: -1 },
  ArrowRight: { axis: 'across', step: 1 },
  ArrowUp: { axis: 'down', step: -1 },
  ArrowDown: { axis: 'down', step: 1 },
};

// The hex keypad's keys in render order — 0-9 then A-F (the A-F row accent-tinted
// like the prototype, since they're the "color" digits). delete + Check live below.
const KEYS = '0123456789ABCDEF'.split('');

// --- chrome (C0FFEE-67) --------------------------------------------------------

// The site's first localStorage use: one UI "seen" flag for the first-run coach
// (C0FFEE-62 decision 5). Not the URL hash (that invariant governs a color address);
// a single seen-flag fails the ADR 3-test, so no ADR. Namespaced to the crossword.
const COACH_SEEN_KEY = 'c0ffee:crossword:coach-seen';

// The second UI preference flag (C0FFEE-79): whether the running Solve-time readout is
// shown during play. A timer-less "zen" solve is a first-class choice (CONTEXT.md: Solve
// time), remembered across visits. Like COACH_SEEN_KEY this is a single UI preference, not
// a color address, so it stays out of the URL hash and — a lone boolean — fails the ADR
// 3-test, so no ADR. Namespaced to the crossword. Absent -> shown (the timed default).
const CLOCK_SHOWN_KEY = 'c0ffee:crossword:clock-shown';

// How long the one-shot lock callout lingers before it auto-dismisses (a transient
// teaching beat, C0FFEE-62 decision 4 — like the toast, it is never chased).
const LOCK_CALLOUT_MS = 4200;

// The default starting seed (C0FFEE-64). "New" advances it for a freshly-generated
// puzzle; "Restart" reuses the current Puzzle object (same grid + targets).
const START_SEED = DEFAULT_SEED;

// The m:ss Solve-time formatter now lives in the share core (fmtSolveTime,
// lib/crossword-share.ts) as the ONE source of truth — the topbar readout, the
// completion card and the shared boast all render through it, so they can never
// disagree about the time (C0FFEE-80, collapsing a duplicated formatter).

// Per-pair channel identity for the lock callout's two role cells: pair index 0 -> red,
// 1 -> green, 2 -> blue, named with the pure primary (contract #2) and the colour word.
const CHANNEL_OF_PAIR: ReadonlyArray<{ word: string; ring: string }> = [
  { word: 'red', ring: 'var(--c0ffee-r, #FF0000)' },
  { word: 'green', ring: 'var(--c0ffee-g, #00FF00)' },
  { word: 'blue', ring: 'var(--c0ffee-b, #0000FF)' },
];

// Topbar + overlay glyphs (neutral chrome, contract #6; lifted from the prototype's
// CW-TopBar / CW-PauseOverlay / CW-ConfirmDialog / CW-CompletionCard). Stroke/fill off
// currentColor so each control's own colour rule drives them.
const PAUSE_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const PLAY_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const HELP_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>';
const KEBAB_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>';
// The Solve-time show/hide toggle glyphs (C0FFEE-79): eye = shown (tap to hide), eye-off =
// hidden (tap to show). Neutral chrome, stroke off currentColor (contract #6). Lucide eye /
// eye-off.
const EYE_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.6 6.6C3.9 8.2 2 12 2 12s3.5 7 10 7a9.3 9.3 0 0 0 5.4-1.6"/><path d="m2 2 20 20"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const RESTART_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.4 2.6L3 8"/><path d="M3 3v5h5"/></svg>';
const SPARKLE_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3c.4 4 2.6 6.2 6.5 6.5-3.9.3-6.1 2.5-6.5 6.5-.4-4-2.6-6.2-6.5-6.5C8.4 9.2 10.6 7 11 3Z"/><path d="M18.5 13.5c.13 1.7 1 2.55 2.7 2.7-1.7.13-2.55 1-2.7 2.7-.13-1.7-1-2.55-2.7-2.7 1.7-.13 2.55-1 2.7-2.7Z"/></svg>';
const SHARE_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
const WARN_TRIANGLE_SVG =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
const TROPHY_SVG =
  '<svg width="19" height="19" viewBox="0 0 24 24" fill="var(--c0ffee-accent, #C0FFEE)" stroke="var(--c0ffee-accent, #C0FFEE)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2.5 14.85 8.27 21.2 9.2 16.6 13.68 17.69 20 12 17.02 6.31 20 7.4 13.68 2.8 9.2 9.15 8.27"/></svg>';
const ARROW_RIGHT_SVG =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13"/><path d="m13 6 6 6-6 6"/></svg>';
const ACCENT_LOCK_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--c0ffee-accent, #C0FFEE)" stroke-width="2.2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

// The pending destructive action a confirm dialog gates (C0FFEE-62 decision 3): both
// ride the one newPuzzle action — Restart reuses the Puzzle, New generates a fresh one.
type PendingConfirm = 'restart' | 'new';

// The live lock-callout payload (the dual-role explainer for a freshly-locked crossing
// Cell). `key` anchors the popover to that Cell's rect; a/b name its two roles.
interface LockCallout {
  key: string;
  value: string;
  aLabel: string;
  aWord: string;
  aRing: string;
  bLabel: string;
  bWord: string;
  bRing: string;
}

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
  // The body container whose innerHTML _render replaces. The <style> sheet is injected
  // ONCE into the root scaffold (connectedCallback) and lives OUTSIDE this container, so a
  // re-render (every keystroke) no longer re-parses the whole stylesheet — only the body
  // markup is rebuilt. (Set up in _scaffold; the delegated listeners stay on the root,
  // which persists across body re-renders.)
  private body!: HTMLElement;
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

  // Which pane renders below the constant board + topbar (C0FFEE-73). 'entry' is the
  // comparison + keypad you play in; 'clues' is the clue-list pane (CW-CluePanel). Default
  // 'entry' so the game opens ready to type; transient element state (never the URL hash),
  // reset to 'entry' on every New/Restart via _loadPuzzle. Completion supersedes both.
  private activePane: 'entry' | 'clues' = 'entry';

  // --- chrome (C0FFEE-67) ---
  // The current Puzzle object — kept so Restart can reuse it (newPuzzle(same Puzzle)
  // wipes entries/verdicts/locks but keeps the grid + targets); New advances the seed.
  private puzzle!: Puzzle;
  private seed = START_SEED;
  // The current puzzle's shape id, tracked beside the seed so the share control can mint
  // the (shapeId, seed) Puzzle link for the EXACT board just solved (C0FFEE-80): adopted
  // from a shared token on load, back to the default when "New" regenerates.
  private shapeId = DEFAULT_SHAPE;
  // The crossing Cells of the current puzzle (those shared by two Slots), the set the
  // lock callout watches for the first demonstrable cross-propagation.
  private crossings = new Set<string>();

  // The Solve time (CONTEXT.md), now an injected-time accumulator (C0FFEE-79, lib/
  // crossword-timer.ts). The accumulator is the source of truth for elapsed ms — it banks
  // running spans across pauses, so the arithmetic is exact even when a background tab
  // throttles the interval below (this replaced the C0FFEE-67 tick-counter that undercounted
  // hidden-tab time). The clock starts on the first Cell entry, pauses under any scrim overlay
  // (decision 6) AND while the tab is hidden (Page Visibility), and stops on completion.
  private timer: SolveTimer = initSolveTimer();
  // Has the first Cell entry happened? The clock is idle (elapsed 0) until it has, then the
  // gates in _clockShouldRun govern whether it accumulates. Reset by New/Restart.
  private timerStarted = false;
  // A 1s pulse that repaints ONLY the .timer readout (the accumulator holds the real time,
  // so a late/throttled pulse never loses seconds — it just repaints less often).
  private repaintInterval: number | null = null;
  // Whether the running readout is shown during play (C0FFEE-79). Loaded from localStorage on
  // connect; toggled by the topbar eye. Cosmetic — a hidden clock still runs and the frozen
  // Solve time still shows on the completion card.
  private clockShown = true;

  // Overlay layer — all three ride one shared scrim primitive (decision 5).
  private paused = false; // pause scrim up
  private menuOpen = false; // topbar kebab dropdown open
  private legendOpen = false; // channel-hint "?" key popover open (C0FFEE-77)
  private confirm: PendingConfirm | null = null; // destructive-confirm dialog (Restart/New)
  private coachOpen = false; // first-run / re-summoned coach bottom-sheet
  private coachStep: 0 | 1 = 0; // the coach's two explainer steps

  // The one-shot lock callout (decision 4): fires on the FIRST commit that locks a
  // crossing Cell, suppressed thereafter, re-armed only by Restart/New.
  private lockCallout: LockCallout | null = null;
  private lockCalloutFired = false;
  private lockCalloutTimer: number | null = null;

  // The lock callout anchors to a Cell's rect and is a transient teaching beat — it is
  // dismissed on resize/scroll rather than chased (decision 4).
  private onViewportShift = (): void => this._dismissLockCallout();
  // One delegated click listener on the shadow root drives every control. The root
  // persists across innerHTML re-renders, so the listener survives them — no per-render
  // re-binding, no leaks (dropped in disconnectedCallback).
  private onClick = (e: Event): void => this._handleClick(e);
  // The physical keyboard (C0FFEE-66). Bound on the host so a key from any focused shadow
  // control reaches it (events bubble across the boundary) and so the host itself — made
  // focusable with tabindex — can drive the puzzle directly.
  private onKeydown = (e: Event): void => this._handleKey(e as KeyboardEvent);
  // The Page Visibility API drives the Solve-time pause (C0FFEE-79): switching away from the
  // tab pauses the clock, returning resumes it — so a distraction never inflates the time, and
  // we sidestep the hidden-tab interval throttling by simply not counting. Bound on `document`
  // (visibilitychange fires there), dropped in disconnectedCallback.
  private onVisibility = (): void => this._onVisibilityChange();

  connectedCallback(): void {
    this._loadPuzzle(this._initialPuzzle());
    // Inject the stylesheet once and create the body container; _render only rewrites the
    // body, so the CSS is parsed a single time per connect, not on every keystroke.
    this._scaffold();
    // One focusable unit so a keyboard user can Tab to the puzzle and drive it. The
    // assistive-tech focus model (roving tabindex across the grid, ARIA roles) is the
    // separate C0FFEE-63 layer; this is the sighted-desktop keyboard seam.
    if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
    this.root.addEventListener('click', this.onClick);
    this.addEventListener('keydown', this.onKeydown);
    // The lock callout is anchored to a Cell rect; drop it on any viewport shift rather
    // than re-measuring (decision 4). Listen on window — the rect moves with the page.
    window.addEventListener('resize', this.onViewportShift);
    window.addEventListener('scroll', this.onViewportShift, true);
    // Pause/resume the Solve time as the tab hides/returns (C0FFEE-79).
    document.addEventListener('visibilitychange', this.onVisibility);

    // The remembered show/hide preference for the running readout (C0FFEE-79).
    this.clockShown = this._loadClockShown();

    // First-run coach (decision 5): auto-show once, gated by the localStorage seen-flag.
    // A first-ever visitor sees it over a scrim-dimmed board. The Solve-time clock no longer
    // starts here for anyone — it waits for the first Cell entry (C0FFEE-79), which on a first
    // visit can only happen after the coach is dismissed (the board is inert beneath it).
    if (!this._coachSeen()) {
      this.coachOpen = true;
      this.coachStep = 0;
    }
    this._render();
  }

  disconnectedCallback(): void {
    this.root.removeEventListener('click', this.onClick);
    this.removeEventListener('keydown', this.onKeydown);
    window.removeEventListener('resize', this.onViewportShift);
    window.removeEventListener('scroll', this.onViewportShift, true);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this._clearToastTimer();
    this._stopRepaint();
    this._clearLockCalloutTimer();
    if (this._shareTimer !== null) {
      clearTimeout(this._shareTimer);
      this._shareTimer = null;
    }
  }

  // --- puzzle lifecycle (C0FFEE-67) ----------------------------------------

  // The puzzle to open on (C0FFEE-78 Puzzle link). The element reads location.hash ONCE,
  // here on connect: a valid Puzzle token reproduces its exact (shapeId, seed) puzzle
  // (ADR-0009 determinism), so a friend's link opens the same board. A missing/malformed
  // token — or a well-formed token whose shape no SHAPES entry has, so generatePuzzle
  // throws — falls back to a fresh default puzzle rather than a broken render (ADR-0009:
  // a bad link never breaks the game). A mid-game hashchange is deliberately NOT watched
  // (it would wipe progress); WRITING the link is the share slice (C0FFEE-80).
  //
  // On a shared seed we adopt it as `this.seed` so a later "New" advances from it. New
  // still regenerates on DEFAULT_SHAPE; with a single authored shape that is always the
  // shared shape, so carrying ref.shapeId into New is a future seam (when SHAPES grows).
  private _initialPuzzle(): Puzzle {
    const ref = decodePuzzleToken(window.location?.hash);
    if (ref) {
      try {
        const puzzle = generatePuzzle(ref.shapeId, ref.seed);
        this.seed = ref.seed;
        this.shapeId = ref.shapeId; // the share control re-mints this exact identity
        return puzzle;
      } catch (err) {
        // Two throw paths land here, both ending in a fresh default puzzle (ADR-0009: a
        // bad link is never a broken render). An unknown shapeId — a stale or tampered
        // link — is the expected case, swallowed quietly so a routine bad link never
        // spams RUM with false errors. But a shape the build DOES have that still failed
        // to fill is an ATTEMPT_CAP regression the generator test claims is unreachable;
        // surface THAT one to console.error (which RUM collects — the console.ts URL-write
        // escalation pattern) without breaking the render.
        if (SHAPES.some((s) => s.id === ref.shapeId)) {
          console.error(
            `c0ffee-crossword: known shape '${ref.shapeId}' seed ${ref.seed} failed to generate`,
            err,
          );
        }
      }
    }
    return generatePuzzle(DEFAULT_SHAPE, this.seed);
  }

  // Initialise the element on a Puzzle: store it, derive its crossing set, open on its
  // first Slot via the real reducer, and re-arm the one-shot lock callout. Shared by
  // the initial load and by Restart/New (each supplies its Puzzle).
  private _loadPuzzle(puzzle: Puzzle): void {
    this.puzzle = puzzle;
    this.crossings = new Set(puzzle.layout.crossings.map((x) => cellKey(x.cell)));
    this.state = crosswordReducer(initCrossword(puzzle), {
      type: 'select',
      slot: firstSlot(puzzle.layout),
    });
    this.cursorKey = this._firstCursor();
    this.activePane = 'entry'; // a fresh puzzle opens in the entry pane (C0FFEE-73)
    this.lockCallout = null;
    this.lockCalloutFired = false; // re-armed for the new puzzle
    this._clearLockCalloutTimer();
  }

  // Restart (same Puzzle) or New (a freshly-generated one), behind the confirm dialog.
  // Both dispatch newPuzzle — Restart reuses the stored Puzzle (wipes entries, verdicts
  // AND locks on the same grid/targets), New advances the seed for a new generation
  // (C0FFEE-62 decision 3). The Timer resets to 0 and starts immediately (the coach is
  // never re-shown by New/Restart, decision 5/6). Overlays close.
  private _restartOrNew(fresh: boolean): void {
    if (fresh) {
      this.seed += 1;
      this.shapeId = DEFAULT_SHAPE; // New regenerates on the default shape (the seam above)
    }
    this._loadPuzzle(fresh ? generatePuzzle(DEFAULT_SHAPE, this.seed) : this.puzzle);
    this._closeOverlays();
    this._dismissToast();
    // The fresh board's clock resets to idle and waits for its own first Cell entry
    // (C0FFEE-79) — a New/Restart is not itself a Cell entry.
    this._resetClock();
    this._render();
  }

  // --- Solve-time clock (C0FFEE-79) ----------------------------------------

  // The injected timestamp for a clock transition — captured at the DOM-event moment. Date
  // (not performance.now) so happy-dom's fake timers advance it: the accumulator is exact
  // regardless, and clock skew is clamped to never run elapsed backwards (crossword-timer.ts).
  private _now(): number {
    return Date.now();
  }

  // Whether the tab is currently hidden (Page Visibility). Guarded for older happy-dom.
  private _tabHidden(): boolean {
    return typeof document !== 'undefined' && document.hidden === true;
  }

  // Whether the Solve time should be accumulating right now: it has started (first Cell
  // entered), the puzzle isn't solved, no scrim overlay (coach / pause / confirm) covers the
  // board (decision 6), and the tab is visible. Any false gate pauses it; all true resume it.
  private _clockShouldRun(): boolean {
    return (
      this.timerStarted &&
      !this.state.complete &&
      this._activeScrimOverlay() === null &&
      !this._tabHidden()
    );
  }

  // The first Cell entry opens the clock (C0FFEE-79). Idempotent — only the first press of a
  // puzzle starts it; a no-op once started or once solved. (First entry is only reachable with
  // the board live and the tab focused, so it starts running immediately.)
  private _startClock(): void {
    if (this.timerStarted || this.state.complete) return;
    this.timerStarted = true;
    this.timer = solveTimerReducer(this.timer, { type: 'start', at: this._now() });
    this._startRepaint();
  }

  // Reconcile the accumulator + repaint pulse with _clockShouldRun, capturing `now` here at
  // the gate-change moment. Called from every gate transition (overlay open/close, tab
  // visibility). resume-while-running and pause-while-paused are reducer no-ops, so this only
  // truly transitions when a gate flipped. A stopped clock never resumes.
  private _syncClock(): void {
    if (this.timer.stopped) {
      this._stopRepaint();
      return;
    }
    const now = this._now();
    if (this._clockShouldRun()) {
      this.timer = solveTimerReducer(this.timer, { type: 'resume', at: now });
      this._startRepaint();
    } else {
      this.timer = solveTimerReducer(this.timer, { type: 'pause', at: now });
      this._stopRepaint();
    }
  }

  // Stop the clock on completion — banks the open span and freezes it terminally (a stray
  // resume can never un-freeze the finished solve; that guard lives in the accumulator).
  private _stopClock(): void {
    this.timer = solveTimerReducer(this.timer, { type: 'stop', at: this._now() });
    this._stopRepaint();
  }

  // Reset to idle for a fresh puzzle (New/Restart): a new accumulator, un-started, no pulse.
  private _resetClock(): void {
    this._stopRepaint();
    this.timer = initSolveTimer();
    this.timerStarted = false;
  }

  // Arm the 1s repaint pulse (idempotent). It repaints only the readout, never the board.
  private _startRepaint(): void {
    if (this.repaintInterval !== null) return;
    this.repaintInterval = window.setInterval(() => this._paintClock(), 1000);
  }
  private _stopRepaint(): void {
    if (this.repaintInterval !== null) {
      clearInterval(this.repaintInterval);
      this.repaintInterval = null;
    }
  }

  // Patch ONLY the .timer readout from the live accumulator (not a board rebuild) — cheap, and
  // it never disturbs the cursor or an open overlay. A no-op when the readout is hidden by the
  // preference or absent (guarded querySelector).
  private _paintClock(): void {
    if (!this.clockShown) return;
    const readout = this.root.querySelector('.timer');
    if (readout) readout.textContent = this._elapsedText();
  }

  // The current Solve time as m:ss (fmtSolveTime), live off the accumulator
  // (frozen once stopped).
  private _elapsedText(): string {
    return fmtSolveTime(elapsedMs(this.timer, this._now()));
  }

  // Pause/resume as the tab hides/returns (C0FFEE-79). Only touches the clock; a quick
  // readout repaint keeps the shown time fresh on return (the pause left it frozen).
  private _onVisibilityChange(): void {
    this._syncClock();
    this._paintClock();
  }

  // The show/hide preference, read/written defensively like the coach seen-flag: Web Storage
  // can throw (private mode) or be absent (older happy-dom). Absent -> shown (the timed
  // default); on any failure the readout just behaves as shown / un-recordable.
  private _loadClockShown(): boolean {
    try {
      return window.localStorage.getItem(CLOCK_SHOWN_KEY) !== '0';
    } catch {
      return true;
    }
  }
  private _persistClockShown(): void {
    try {
      window.localStorage.setItem(CLOCK_SHOWN_KEY, this.clockShown ? '1' : '0');
    } catch {
      /* storage unavailable — the preference just won't persist; not fatal */
    }
  }

  // The topbar eye toggles the running readout's visibility and remembers the choice. The
  // clock keeps running underneath either way (a hidden clock is a display choice, not a
  // pause); the completion card still shows the frozen Solve time.
  private _toggleClock(): void {
    this.clockShown = !this.clockShown;
    this._persistClockShown();
    this._render();
  }

  // --- share (C0FFEE-80) ----------------------------------------------------

  // The Puzzle link for the CURRENT board, minted through the C0FFEE-78 codec so a
  // recipient reproduces this exact puzzle (ADR-0009 determinism). Built from the page's
  // own address — origin + pathname keep it correct on dev and prod alike — and never
  // written to location.hash (reading a mid-game hashchange would wipe progress, and a
  // hash rewrite would spam RUM with route_change views).
  private _puzzleUrl(): string {
    const token = encodePuzzleToken({ shapeId: this.shapeId, seed: this.seed });
    return `${location.origin}${location.pathname}#${token}`;
  }

  // The completion card's share control (C0FFEE-80, the C0FFEE-57 capstone): compose the
  // spoiler-free message and hand it to the native share sheet, or copy it to the clipboard
  // with a confirmation flash where Web Share is absent (the C0FFEE-54 pattern). The Solve
  // time rides along only when the running readout is shown — the remembered eye preference
  // IS the opt-in (CONTEXT.md: a timer-less, zen solve shares a timeless message).
  //
  // ONE anonymous puzzle_shared action (ADR-0008 amendment) is emitted per share that
  // actually happened: the sheet resolving, or the copy landing. A cancelled sheet or a
  // denied clipboard emits nothing — intent isn't a share.
  private async _share(): Promise<void> {
    const message = composeShareMessage({
      puzzleUrl: this._puzzleUrl(),
      elapsedMs: this.clockShown ? elapsedMs(this.timer, this._now()) : undefined,
    });

    if (typeof navigator.share === 'function') {
      let shared = false;
      try {
        await navigator.share({ text: message });
        shared = true;
      } catch (err) {
        // The solver closing the sheet is their prerogative, not a failure: no flash,
        // no action, no console noise. Anything ELSE (NotAllowedError under an iframe
        // permissions policy, InvalidStateError on a double-tap) is a sheet that could
        // not open — so fall through to the clipboard copy below rather than leaving a
        // dead button, keeping the reason in the console (C0FFEE-54 posture).
        if ((err as DOMException | null)?.name === 'AbortError') return;
        console.warn('c0ffee-crossword: navigator.share failed', err);
      }
      if (shared) {
        datadogRum.addAction('puzzle_shared');
        return;
      }
    }

    // Web Share absent (desktop) or refused above: the copy IS the share. Same posture
    // as console.ts's _copyHex — the try wraps ONLY the write; in an insecure context
    // navigator.clipboard is undefined and that synchronous TypeError lands in the same
    // catch.
    let ok = true;
    try {
      await navigator.clipboard.writeText(message);
    } catch (err) {
      console.warn('c0ffee-crossword: clipboard write failed', err);
      ok = false;
    }
    // The awaits open a gap: a removed element must not flash into a detached tree —
    // but a landed copy still counts as a share. The flash comes BEFORE the emit: the
    // solver's confirmation must never sit downstream of a telemetry call.
    if (this.isConnected) this._flashShare(ok);
    if (ok) datadogRum.addAction('puzzle_shared');
  }

  // The confirmation flash (C0FFEE-54 pattern): swap the control's label in place and
  // announce via the live region, auto-return to rest, a re-tap mid-flash restarts
  // cleanly. Nodes are re-queried at fire time — a re-render mid-flash (e.g. New) swaps
  // in fresh at-rest markup, so a stale revert must be a no-op, never a crash.
  private _shareTimer: number | null = null;

  private _flashShare(ok: boolean): void {
    const label = this.root.querySelector('.share-label');
    const status = this.root.querySelector('.share-status');
    if (!label || !status) return;
    if (this._shareTimer !== null) clearTimeout(this._shareTimer);
    label.textContent = ok ? 'Copied' : 'Copy failed';
    status.textContent = ok ? 'Copied to clipboard' : 'Copy failed';
    this._shareTimer = window.setTimeout(() => {
      const rested = this.root.querySelector('.share-label');
      if (rested) rested.textContent = 'Share';
      const restedStatus = this.root.querySelector('.share-status');
      if (restedStatus) restedStatus.textContent = '';
      this._shareTimer = null;
    }, FLASH_MS);
  }

  // --- coach + overlays (C0FFEE-67) ----------------------------------------

  // The localStorage seen-flag, read/written defensively: Web Storage can throw (private
  // mode, disabled cookies) or be absent (older happy-dom). On any failure the coach
  // simply behaves as first-run / un-recordable rather than crashing the game.
  private _coachSeen(): boolean {
    try {
      return window.localStorage.getItem(COACH_SEEN_KEY) != null;
    } catch {
      return false;
    }
  }
  private _markCoachSeen(): void {
    try {
      window.localStorage.setItem(COACH_SEEN_KEY, '1');
    } catch {
      /* storage unavailable — the coach just may re-show next visit; not fatal */
    }
  }

  // Re-summon the coach via the topbar "?" (decision 5). Always opens at step 0; does not
  // touch the seen-flag (it is already seen). Clears any other overlay first so at most one
  // scrim overlay is ever open (the precedence in _activeScrimOverlay then never has to resolve
  // a real conflict). The coach is a scrim overlay, so _syncClock pauses a running solve while
  // it is up (decision 6) — reading the help never costs Solve time.
  private _openCoach(): void {
    this.paused = false;
    this.confirm = null;
    this.menuOpen = false;
    this.legendOpen = false;
    this.coachOpen = true;
    this.coachStep = 0;
    this._syncClock();
    this._render();
  }

  // Dismiss the coach (Skip / Got it / Escape / scrim tap). Records the seen-flag so it never
  // auto-shows again, then reconciles the clock: a re-summoned coach dismissed mid-solve resumes
  // it; a first-run dismissal leaves it idle (the clock waits for the first Cell entry, not the
  // coach — C0FFEE-79).
  private _dismissCoach(): void {
    this.coachOpen = false;
    this._markCoachSeen();
    this._syncClock();
    this._render();
  }

  private _pause(): void {
    if (this.paused || this.state.complete) return;
    this.confirm = null;
    this.coachOpen = false;
    this.paused = true;
    this.menuOpen = false;
    this.legendOpen = false;
    this._syncClock(); // the clock pauses with the scrim (decision 6)
    this._render();
  }
  private _resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this._syncClock();
    this._render();
  }

  private _toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) this.legendOpen = false; // the two transient popovers never co-open
    this._render();
  }

  // The channel-hint "?" disclosure (C0FFEE-77): a transient twin of the kebab menu. Opening
  // it closes the kebab so the two are never up together (and so Escape's precedence — legend
  // first — only ever has one to resolve). Not a scrim overlay: the board stays interactive.
  private _toggleLegend(): void {
    this.legendOpen = !this.legendOpen;
    if (this.legendOpen) this.menuOpen = false;
    this._render();
  }

  // A menu item (Restart/New) opens the destructive confirm rather than acting at once
  // (decision 3 — both wipe progress). The confirm rides the shared scrim, so the Solve-time
  // clock pauses under it (decision 6) and resumes on Cancel.
  private _requestConfirm(action: PendingConfirm): void {
    this.paused = false;
    this.coachOpen = false;
    this.confirm = action;
    this.menuOpen = false;
    this.legendOpen = false;
    this._syncClock();
    this._render();
  }
  private _cancelConfirm(): void {
    this.confirm = null;
    this._syncClock();
    this._render();
  }
  private _acceptConfirm(): void {
    const action = this.confirm;
    this.confirm = null;
    // Restart/New resets the clock via _restartOrNew; a no-action accept just reconciles.
    if (action) this._restartOrNew(action === 'new');
    else {
      this._syncClock();
      this._render();
    }
  }

  // Close every transient overlay (used by Restart/New). Does not record the coach
  // seen-flag — only an explicit dismissal does — but New/Restart never re-show it.
  private _closeOverlays(): void {
    this.paused = false;
    this.menuOpen = false;
    this.legendOpen = false;
    this.confirm = null;
    this.coachOpen = false;
  }

  // --- lock callout (C0FFEE-67) --------------------------------------------

  // After a commit, fire the one-shot lock callout if this commit newly locked a crossing
  // Cell (the first demonstrable cross-propagation, decision 4). `committed` is the Slot
  // just graded; `before` is the set of Cell keys locked prior to the commit. Picks the
  // first newly-locked crossing Cell in reading order, builds its dual-role explainer,
  // and arms the auto-dismiss. Suppressed once fired (until Restart/New re-arms it) and
  // skipped when the commit completed the whole puzzle (the completion card owns that).
  private _maybeFireLockCallout(committed: Slot, before: Set<string>): void {
    if (this.lockCalloutFired || this.state.complete) return;
    // Freshly-locked crossing Cells, in reading order, each resolved to its dual role: the
    // committed Slot's Channel-pair vs the perpendicular Slot's. (A Cell with no perpendicular
    // Slot isn't dual-role and is dropped.)
    const candidates = this.puzzle.layout.cells
      .map(cellKey)
      .filter((k) => this.crossings.has(k) && this._cellState(k).locked && !before.has(k))
      .sort((a, b) => {
        const [ra, ca] = a.split(',').map(Number);
        const [rb, cb] = b.split(',').map(Number);
        return ra - rb || ca - cb;
      })
      .map((key) => {
        const perp = this.puzzle.layout.slots.find(
          (s) => s.direction !== committed.direction && s.cells.some((c) => cellKey(c) === key),
        );
        if (!perp) return null;
        const aPair = Math.floor(committed.cells.findIndex((c) => cellKey(c) === key) / 2);
        const bPair = Math.floor(perp.cells.findIndex((c) => cellKey(c) === key) / 2);
        return { key, perp, aPair, bPair };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    // Fire only on a crossing whose two roles are DIFFERENT Channels — that is the
    // demonstrable "same value, a different Channel" the callout teaches. A same-Channel
    // corner teaches nothing AND would render the footer's "a different Channel" as a
    // falsehood, so suppress instead of firing it; leaving `lockCalloutFired` false keeps
    // the one-shot armed for a later, genuinely dual-Channel lock.
    const pick = candidates.find((c) => c.aPair !== c.bPair);
    if (!pick) return;
    const { key, perp, aPair, bPair } = pick;
    this.lockCallout = {
      key,
      value: this._cellState(key).digit ?? '',
      aLabel: slotLabel({ number: committed.number, direction: committed.direction }),
      aWord: CHANNEL_OF_PAIR[aPair].word,
      aRing: CHANNEL_OF_PAIR[aPair].ring,
      bLabel: slotLabel({ number: perp.number, direction: perp.direction }),
      bWord: CHANNEL_OF_PAIR[bPair].word,
      bRing: CHANNEL_OF_PAIR[bPair].ring,
    };
    this.lockCalloutFired = true;
    this._clearLockCalloutTimer();
    this.lockCalloutTimer = window.setTimeout(() => {
      this.lockCallout = null;
      this.lockCalloutTimer = null;
      this._render();
    }, LOCK_CALLOUT_MS);
  }

  // Drop the callout immediately (next input / tap / viewport shift). Re-renders so the
  // popover clears; a no-op when none is showing.
  private _dismissLockCallout(): void {
    this._clearLockCalloutTimer();
    if (!this.lockCallout) return;
    this.lockCallout = null;
    this._render();
  }
  private _clearLockCalloutTimer(): void {
    if (this.lockCalloutTimer !== null) {
      clearTimeout(this.lockCalloutTimer);
      this.lockCalloutTimer = null;
    }
  }

  // --- event routing -------------------------------------------------------

  // One delegated handler. Chrome controls (topbar, overlays, menu) act through data-act
  // and stay live even while an overlay covers the board; the game surface below (keypad,
  // delete/Check, clue-nav, clue rows, Cell taps) is inert while an overlay is up
  // (decision 5/6 — you cannot play through the coach/pause/confirm/completion layer).
  private _handleClick(e: Event): void {
    const target = e.target as Element | null;
    if (!target) return;
    const actEl = target.closest('[data-act]');
    const act = actEl ? (actEl as HTMLElement).dataset.act : null;

    // Chrome actions — always available.
    switch (act) {
      case 'pause':
        return this._pause();
      case 'resume':
        return this._resume();
      case 'menu':
        return this._toggleMenu();
      case 'menu-close':
        this.menuOpen = false;
        return this._render();
      case 'legend':
        return this._toggleLegend();
      case 'legend-close':
        this.legendOpen = false;
        return this._render();
      case 'help':
        return this._openCoach();
      case 'clock-toggle':
        return this._toggleClock();
      case 'restart':
        return this._requestConfirm('restart');
      case 'new':
        return this._requestConfirm('new');
      case 'confirm-ok':
        return this._acceptConfirm();
      case 'confirm-cancel':
        return this._cancelConfirm();
      case 'coach-next':
        this.coachStep = 1;
        return this._render();
      case 'coach-back':
        this.coachStep = 0;
        return this._render();
      case 'coach-skip':
      case 'coach-done':
        return this._dismissCoach();
      case 'completion-new':
        return this._restartOrNew(true); // nothing to lose on a solved board — no confirm
      case 'share':
        return void this._share(); // async share/copy; the handler flashes its own outcome
      case 'scrim':
        return this._scrimTap();
    }

    // Game surface — blocked while an overlay covers the board.
    if (this._overlayUp()) return;
    // Any board interaction dismisses the transient lock callout (decision 4) — even a
    // no-op one (a tap on a solved Cell), which is why it lives here, not in the handlers.
    if (this.lockCallout) this._dismissLockCallout();
    // The channel-hint legend is transient too: any board interaction retracts it. In the
    // browser the full-bleed backdrop already catches a pointer tap (closing it before this
    // runs); this also covers a synthetic click and keeps the two paths in step (C0FFEE-77).
    if (this.legendOpen) this.legendOpen = false;
    // In the clue pane only a clue-row tap is live (it routes the Slot and auto-returns to
    // the entry pane); the board stays visible but is a passive reference there, so a
    // board-cell tap is inert — the keypad/delete/check/nav are not even rendered. This
    // mirrors the key guard above so the two input paths agree (C0FFEE-73).
    if (this.activePane === 'clues') {
      const rowEl = target.closest('[data-slot]');
      if (rowEl) return this._routeToClue((rowEl as HTMLElement).dataset.slot as string);
      return;
    }
    if (act === 'pane-clues') return this._showCluePane();
    if (act === 'delete') return this._delete();
    if (act === 'check') return this._check();
    const keyEl = target.closest('[data-key]');
    if (keyEl) return this._press((keyEl as HTMLElement).dataset.key as string);
    const navEl = target.closest('[data-nav]');
    if (navEl) return this._step((navEl as HTMLElement).dataset.nav === 'prev' ? -1 : 1);
    const slotEl = target.closest('[data-slot]');
    if (slotEl) return this._routeToClue((slotEl as HTMLElement).dataset.slot as string);
    const cellEl = target.closest('[data-cell]');
    if (cellEl) return this._tap((cellEl as HTMLElement).dataset.cell as string);
  }

  // The single source of truth for which scrim-backed overlay is up (coach / pause /
  // confirm), with the one canonical precedence. The render layer, the scrim-tap router
  // and `_overlayUp` all read this, so the precedence is defined exactly once — and the
  // openers keep these mutually exclusive, so the order only ever resolves a real tie
  // defensively. Returns null when no scrim overlay is showing. (The kebab menu and the
  // lock callout are NOT scrim overlays and are handled separately.)
  private _activeScrimOverlay(): 'confirm' | 'pause' | 'coach' | null {
    if (this.confirm !== null) return 'confirm';
    if (this.paused) return 'pause';
    if (this.coachOpen) return 'coach';
    return null;
  }

  // Whether an overlay is currently covering the board (any scrim overlay), or the puzzle
  // is complete (the completion card has supplanted the dock). The game surface is inert
  // in any of these states.
  private _overlayUp(): boolean {
    return this._activeScrimOverlay() !== null || this.state.complete;
  }

  // A tap on the shared scrim, routed to the overlay it backs: resume from pause, cancel a
  // confirm, dismiss the coach. (The destructive confirm also cancels on a scrim tap — the
  // Cancel button is the same affordance; the only irreversible step is the Confirm button.)
  private _scrimTap(): void {
    switch (this._activeScrimOverlay()) {
      case 'pause':
        return this._resume();
      case 'confirm':
        return this._cancelConfirm();
      case 'coach':
        return this._dismissCoach();
    }
  }

  // Physical keyboard, mirroring the touch model (C0FFEE-62 decision 8): a hex digit ->
  // setDigit at the cursor (then auto-advance, via _press); Backspace -> clearDigit
  // step-back; Enter -> commit; arrow keys move the cursor / toggle direction at a
  // crossing; Tab/Shift-Tab -> prev/next Slot (skip fully-locked). preventDefault keeps
  // Tab from moving DOM focus and arrows/Backspace from scrolling or going back — the
  // puzzle owns the keyboard while focused. Unhandled keys fall through untouched.
  private _handleKey(e: KeyboardEvent): void {
    // Leave browser/OS chords alone — Cmd/Ctrl/Alt + a hex letter (Cmd+C, Cmd+R, Ctrl+F…)
    // must reach copy/paste/reload/find, not get typed as a digit. Shift is intentionally
    // NOT excluded: Shift+Tab is the prev-Slot binding.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    // Escape closes an open overlay first (legend -> menu -> confirm -> pause -> coach ->
    // lock callout), and only releases focus when nothing is open. The channel-hint legend
    // sits at the TOP: it is the most local, transient disclosure (C0FFEE-77). Since Tab is
    // rebound to prev/next Slot (PRD decision 8), a focused puzzle would otherwise trap the
    // keyboard; blur is the escape hatch (the full roving-focus / SR model is C0FFEE-63).
    if (k === 'Escape') {
      if (this.legendOpen) {
        this.legendOpen = false;
        return this._render();
      }
      if (this.menuOpen) {
        this.menuOpen = false;
        return this._render();
      }
      if (this.confirm !== null) return this._cancelConfirm();
      if (this.paused) return this._resume();
      if (this.coachOpen) return this._dismissCoach();
      if (this.lockCallout) return this._dismissLockCallout();
      // the clue-list pane is never a trap: Escape returns to the entry pane unchanged,
      // the keyboard twin of tapping the already-selected clue (C0FFEE-73)
      if (this.activePane === 'clues') {
        this.activePane = 'entry';
        return this._render();
      }
      this.blur();
      return;
    }
    // While an overlay covers the board, the game keys are inert (mirrors the click guard).
    if (this._overlayUp()) return;
    // The clue pane is a route/review surface with no keypad rendered, so game keys are
    // entry-pane only — otherwise a hex digit/Enter/Tab/arrow would fill or commit the
    // hidden selected Slot invisibly (C0FFEE-73). Escape (handled above) is the keyboard
    // return; a clue-row tap is the only live clue-pane action (see the click guard).
    if (this.activePane === 'clues') return;
    // Any board key dismisses the transient lock callout (decision 4), no-op input included.
    if (this.lockCallout) this._dismissLockCallout();
    // ...and retracts the channel-hint legend (the keyboard path the pointer backdrop can't
    // catch), so a resumed edit never leaves the key stranded over a changed strip (C0FFEE-77).
    if (this.legendOpen) this.legendOpen = false;
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
    // The first digit typed into a Cell is the Solve-time start (C0FFEE-79); idempotent after.
    this._startClock();
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
    // Snapshot which Cells were locked BEFORE the commit, so the lock callout can tell a
    // freshly-locked crossing Cell from one a prior commit already locked (decision 4).
    const lockedBefore = new Set(
      this.puzzle.layout.cells.map(cellKey).filter((k) => this._cellState(k).locked),
    );
    this._dispatch({ type: 'commit' });
    // "Every Channel matched" is exactly state.solved for this Slot (a Channel is solved
    // iff its commit graded correct) — consume the core's derived truth rather than
    // re-interpreting the verdict strings in the shell (ADR-0003).
    const solved = this.state.solved[slotKey(slot)];
    const allCorrect = solved.red && solved.green && solved.blue;
    // A correct commit locks the Slot's Cells; move the cursor to whatever stays
    // editable (null once the Slot is fully solved).
    this.cursorKey = this._firstCursor();
    if (this.state.complete) {
      // The puzzle is solved: stop the clock at the Solve time and let the completion
      // card carry the moment (no win toast — the card is the celebration, scene 04).
      this._stopClock();
      this._render();
      return;
    }
    // The first commit that locks a crossing Cell earns the one-shot lock callout (sets
    // state only; the _showToast below renders both the toast and the callout together).
    this._maybeFireLockCallout(slot, lockedBefore);
    if (allCorrect) this._showToast('win', 'Every Channel matches — locked in.');
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
    // An arrow whose axis matches the active Slot moves the cursor along it; any other
    // arrow (the cross-axis one) leaves `along` 0 and falls through to the toggle branch.
    const move = ARROW_AXIS[key];
    const along = move && move.axis === slot.direction ? move.step : 0;
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

  // Open the clue-list pane (the "Clue list" button, C0FFEE-73). The board + topbar stay
  // constant above it; the entry pane's comparison + keypad are swapped out for the
  // CW-CluePanel. A play action, so it is inert behind an overlay (routed below the
  // _overlayUp guard in _handleClick).
  private _showCluePane(): void {
    this.activePane = 'clues';
    this._dismissToast();
    this._render();
  }

  // A clue-list tap: select that Slot, init the cursor to its first editable Cell, AND
  // auto-return to the entry pane so the keypad is in front of the player ready to type
  // (C0FFEE-73 — the clue-list pane has no back button; a row tap IS the return). A
  // fully-solved clue stays selectable (reviewable) — its cursor just resolves to null.
  // The data-slot string is the core's slotKey ("number-direction"), so it round-trips
  // back into a SlotRef the reducer validates.
  private _routeToClue(key: string): void {
    const [numStr, dir] = key.split('-');
    // Narrow `dir` to a Direction rather than asserting it — a data-slot that ever drifts
    // from slotKey's "number-direction" format fails loud HERE (at the decoder that owns
    // the assumption) instead of silently downstream. Number(numStr) NaN is still caught
    // by the reducer's select -> findSlot, which throws on an unknown Slot.
    if (dir !== 'across' && dir !== 'down') {
      throw new Error(`c0ffee-crossword: malformed clue Slot key ${key}`);
    }
    this._dispatch({ type: 'select', slot: { number: Number(numStr), direction: dir } });
    this.cursorKey = this._firstCursor();
    this.activePane = 'entry'; // a row tap drops back into the entry pane to type
    this._dismissToast();
    this._render();
  }

  // The clue-list pane's per-row status (C0FFEE-73 / CW-CluePanel), derived from
  // CrosswordState, never from re-interpreting digits beyond the "is it filled" check:
  //  - 'unguessed' when no Guess has been graded (verdict null), OR a post-commit edit has
  //    since emptied a Cell — "you" always means a real six-digit guess, so an incomplete
  //    Slot reverts to the "?" state until re-committed;
  //  - 'match' once every Channel is solved (the locked Cells spell the clue color);
  //  - 'wrong' when a full six-digit Guess is committed but not fully solved.
  private _clueRowState(slot: Slot): ClueRowState {
    const key = slotKey(slot);
    if (this.state.verdicts[key] == null) return 'unguessed';
    const filled = slot.cells.every((c) => this._cellState(cellKey(c)).digit !== null);
    if (!filled) return 'unguessed';
    const s = this.state.solved[key];
    return s.red && s.green && s.blue ? 'match' : 'wrong';
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

  // Drop the toast immediately (the next input supersedes it) without re-rendering — the
  // caller renders. A no-op when nothing is showing. (The lock callout is dismissed at the
  // event-router level instead, since it must clear even on a no-op input — e.g. a key on a
  // fully-solved Slot, where the input handler early-returns before reaching here.)
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

  // Inject the stylesheet once + create the persistent body container the renders rewrite.
  // Idempotent across reconnects: a fresh connect rebuilds the scaffold from scratch.
  private _scaffold(): void {
    this.root.innerHTML = `<style>${STYLE}</style><div class="cw-body"></div>`;
    this.body = this.root.querySelector('.cw-body') as HTMLElement;
  }

  private _render(): void {
    const { layout } = this.state.puzzle;
    const complete = this.state.complete;
    // On completion the dock is replaced wholesale by the completion card, and the board
    // switches to its solved recolor/bloom variant (scene 04) — the pane split governs only
    // the mid-play body. Mid-play, exactly one pane renders below the board (C0FFEE-73):
    // the entry pane (clue-nav header + comparison + keypad) you play in, or the clue-list
    // pane (CW-CluePanel). One pane at a time keeps the board + pane + chrome to one screen.
    const body = complete
      ? this._completionCard()
      : this.activePane === 'clues'
        ? this._cluePanel(layout)
        : `<section class="dock panel">
            ${this._clueNav()}
            ${this._compare()}
            ${this._inputDock()}
          </section>`;
    // Rewrite only the body — the <style> sheet lives in the scaffold and is not re-parsed.
    this.body.innerHTML = `
      <div class="screen">
        ${this._topbar()}
        <div class="boardwrap">${this._board(layout)}</div>
        ${body}
        ${this._overlays()}
        ${this._legendBackdrop()}
      </div>`;
  }

  // --- chrome render (C0FFEE-67) -------------------------------------------

  // The topbar: quiet elapsed-time readout + pause + "?" help + game menu while playing;
  // a frozen time + trophy once solved (the controls retire — New rides the completion
  // card). No brand wordmark — the Site banner owns branding; this is controls only.
  private _topbar(): string {
    if (this.state.complete) {
      // The frozen Solve time always shows on completion — the show/hide preference governs the
      // running readout DURING play, not the final time (which the completion card carries too).
      return `<header class="topbar done">
        <span class="timer">${this._elapsedText()}</span>
        <span class="trophy">${TROPHY_SVG}</span>
      </header>`;
    }
    // The running readout, shown or replaced by a muted dash per the preference; the clock keeps
    // running underneath a hidden readout (C0FFEE-79). The eye toggles + remembers the choice.
    const readout = this.clockShown
      ? `<span class="timer" aria-label="Elapsed time">${this._elapsedText()}</span>`
      : `<span class="timer hidden" aria-label="Solve time hidden">--:--</span>`;
    const eyeLabel = this.clockShown ? 'Hide the Solve time' : 'Show the Solve time';
    return `<header class="topbar">
      <span class="timerwrap">
        ${readout}
        <button type="button" class="tbtn eyebtn" data-act="clock-toggle" aria-label="${eyeLabel}" aria-pressed="${!this.clockShown}">${this.clockShown ? EYE_SVG : EYE_OFF_SVG}</button>
      </span>
      <span class="tbtns">
        <button type="button" class="tbtn" data-act="pause" aria-label="Pause">${PAUSE_SVG}</button>
        <button type="button" class="tbtn" data-act="help" aria-label="How to play">${HELP_SVG}</button>
        <button type="button" class="tbtn" data-act="menu" aria-label="Game menu" aria-expanded="${this.menuOpen}">${KEBAB_SVG}</button>
      </span>
      ${this._menuDropdown()}
    </header>`;
  }

  // The kebab dropdown: Restart (same Puzzle — wipes entries, verdicts AND locks) and New
  // (a freshly-generated puzzle). Both gated by the destructive confirm (decision 3). A
  // full-bleed backdrop closes it on an outside tap.
  private _menuDropdown(): string {
    if (!this.menuOpen) return '';
    return `<div class="menuback" data-act="menu-close"></div>
      <div class="menu" role="menu">
        <button type="button" class="menuitem" data-act="restart" role="menuitem">${RESTART_SVG}<span>Restart</span></button>
        <button type="button" class="menuitem" data-act="new" role="menuitem">${SPARKLE_SVG}<span>New puzzle</span></button>
      </div>`;
  }

  // The overlay layer (absolute, inset 0 over the screen): all three transient overlays
  // ride one shared scrim primitive (decision 5). The lock callout is a separate, anchored
  // popover (not scrim-backed — it teaches mid-play without dimming the board).
  private _overlays(): string {
    let overlay = '';
    switch (this._activeScrimOverlay()) {
      case 'coach':
        overlay = this._coachSheet();
        break;
      case 'pause':
        overlay = this._pauseOverlay();
        break;
      case 'confirm':
        overlay = this._confirmDialog();
        break;
    }
    const scrim = overlay ? `<div class="scrim" data-act="scrim"></div>` : '';
    const callout = this.lockCallout ? this._lockCalloutEl(this.lockCallout) : '';
    return `${scrim}${overlay}${callout}`;
  }

  // The first-run coach (decision 5): a two-step bottom-sheet over the scrim-dimmed board.
  // Step 0 "Every clue is a colour" -> step 1 "Read the channel hints". Skip / Got it both
  // record the seen-flag; the dots track progress. (Copy + structure from CW-Coach.)
  private _coachSheet(): string {
    const step = this.coachStep;
    const dot = (on: boolean): string =>
      `<span class="dot${on ? ' on' : ''}"></span>`;
    const body =
      step === 0
        ? `<div class="csheet-head">Every clue is a color.</div>
           <p class="csheet-body">Fill the six hex digits - <b>#RRGGBB</b> - that build the Swatch. Two digits per Channel: red, green, blue.</p>`
        : `<div class="csheet-head">Read the channel hints.</div>
           <p class="csheet-body">Check a Guess and each Channel tells you which way to go: a check means it matches, an arrow points where to nudge your next guess.</p>`;
    const footerBtns =
      step === 0
        ? `<button type="button" class="cbtn next" data-act="coach-next">Next ${NAV_GLYPH.next}</button>`
        : `<button type="button" class="cbtn back" data-act="coach-back">Back</button>
           <button type="button" class="cbtn done" data-act="coach-done">Got it</button>`;
    return `<div class="coach sheet" role="dialog" aria-label="How to play">
      <div class="coach-top">
        <span class="coach-badge"></span>
        <span class="coach-title">How to play</span>
        <button type="button" class="coach-skip" data-act="coach-skip">Skip</button>
      </div>
      <div class="coach-content">${body}</div>
      <div class="coach-foot">
        <span class="dots">${dot(step === 0)}${dot(step === 1)}</span>
        <span class="coach-actions">${footerBtns}</span>
      </div>
    </div>`;
  }

  // The pause scrim (decision 6 — the board is hidden behind the scrim; the clock is
  // frozen). Resume restarts it. (Copy from CW-PauseOverlay.)
  private _pauseOverlay(): string {
    return `<div class="pause overlaycard" role="dialog" aria-label="Paused">
      <div class="ovicon">${PAUSE_SVG}</div>
      <div class="ovtitle">Paused</div>
      <div class="ovdesc">${this._elapsedText()} elapsed - board hidden</div>
      <button type="button" class="cbtn resume" data-act="resume">${PLAY_SVG} Resume</button>
    </div>`;
  }

  // The destructive confirm for Restart / New (decision 3). Restart wipes every entry,
  // verdict and lock on the same grid; New generates a fresh puzzle. (Copy from
  // CW-ConfirmDialog, retitled for the Restart/New vocabulary.)
  private _confirmDialog(): string {
    const isNew = this.confirm === 'new';
    const title = isNew ? 'Start a new puzzle?' : 'Restart this puzzle?';
    const desc = isNew
      ? 'This generates a fresh puzzle. Your current progress is lost - you can not undo it.'
      : 'This wipes every digit and unlocks the board on the same puzzle - you can not undo it.';
    const cta = isNew ? 'New puzzle' : 'Restart';
    return `<div class="confirm overlaycard" role="alertdialog" aria-label="${title}">
      <div class="ovicon warn">${WARN_TRIANGLE_SVG}</div>
      <div class="ovtitle">${title}</div>
      <div class="ovdesc">${desc}</div>
      <div class="confirm-actions">
        <button type="button" class="cbtn cancel" data-act="confirm-cancel">Cancel</button>
        <button type="button" class="cbtn danger" data-act="confirm-ok">${cta}</button>
      </div>
    </div>`;
  }

  // The one-shot lock callout (decision 4): a popover anchored to the freshly-locked
  // crossing Cell's rect, explaining its dual role (same value, two Channels). Flips
  // above/below near the board edges and clamps horizontally; dismissed on resize/scroll,
  // next input, or ~4s. (Copy from CW-LockCallout.) happy-dom returns a zeroed rect, so the
  // positioning is a no-op there and gets the browser eyeball.
  private _lockCalloutEl(lc: LockCallout): string {
    const pos = this._calloutPosition(lc.key);
    const roleCell = (ring: string): string =>
      `<span class="role-cell" style="box-shadow:inset 0 0 0 1px ${ring};">${lc.value}</span>`;
    return `<div class="lockcallout" style="${pos}" role="status">
      <div class="lc-top">${ACCENT_LOCK_SVG}<span class="lc-tag">Locked cell</span></div>
      <div class="lc-head">This cell is locked.</div>
      <p class="lc-body">One cell, two roles - a crossing Channel already filled it, so you can't change it. Here's why:</p>
      <div class="lc-roles">
        <span class="role">${roleCell(lc.aRing)}<span class="role-label">${lc.aLabel}<br>${lc.aWord}</span></span>
        ${ARROW_RIGHT_SVG}
        <span class="role">${roleCell(lc.bRing)}<span class="role-label">${lc.bLabel}<br>${lc.bWord}</span></span>
      </div>
      <p class="lc-foot">The <b>${lc.value}</b> locked as ${lc.aLabel}'s ${lc.aWord} is known here - now it's ${lc.bLabel}'s ${lc.bWord}. Same value, a different Channel.</p>
    </div>`;
  }

  // Position the lock callout against its anchor Cell's rect, relative to the host. Flips
  // below the Cell when there isn't room above, and clamps within the host's width. Returns
  // an inline style. A zeroed rect (the `host.width === 0` guard catches both happy-dom
  // and a detached host) yields a harmless fixed fallback (horizontally centered,
  // upper-middle) rather than NaN offsets.
  private _calloutPosition(key: string): string {
    const cellEl = this.root.querySelector(`[data-cell="${key}"]`);
    const host = this.getBoundingClientRect();
    if (!cellEl || host.width === 0) {
      // harmless fixed fallback (horizontally centered, upper-middle) rather than NaN
      return 'left:50%;top:40%;transform:translate(-50%,-50%);';
    }
    const r = cellEl.getBoundingClientRect();
    const cx = r.left - host.left + r.width / 2;
    const above = r.top - host.top; // room above the Cell within the host
    const CARD = 300; // approx callout width for clamping
    const half = CARD / 2;
    const left = Math.max(half + 6, Math.min(cx, host.width - half - 6));
    // flip below the Cell when there isn't ~260px of room above it
    const below = above < 260;
    const vertical = below
      ? `top:${r.bottom - host.top + 10}px;`
      : `bottom:${host.height - (r.top - host.top) + 10}px;`;
    return `left:${left}px;transform:translateX(-50%);${vertical}max-width:${CARD}px;`;
  }

  // The completion card (scene 04): the solved summary that supplants the dock — trophy +
  // "Solved", a summary line carrying the frozen Solve time and colour count, the solved
  // Swatch row, and a New-puzzle action. Share is C0FFEE-57 (blocked on C0FFEE-12), so it
  // is intentionally omitted here rather than shipped as a dead control.
  private _completionCard(): string {
    const slots = this.state.puzzle.layout.slots;
    const swatches = slots
      .map((s) => `<span class="swatch" style="background:#${this._target(s)};"></span>`)
      .join('');
    const summary = `Solved in ${this._elapsedText()} - ${slots.length} colors placed, all Channels matched.`;
    return `<section class="completion panel">
      <div class="comp-head">${TROPHY_SVG}<span>Solved</span></div>
      <p class="comp-summary">${summary}</p>
      <div class="comp-swatches">${swatches}</div>
      <div class="comp-actions">
        <button type="button" class="cbtn comp-new" data-act="completion-new">${SPARKLE_SVG} New puzzle</button>
        <button type="button" class="cbtn comp-share" data-act="share">${SHARE_SVG}<span class="share-label">Share</span></button>
      </div>
      <span class="share-status" role="status" aria-live="polite"></span>
    </section>`;
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
    const solved = this.state.complete;
    // On completion each Cell paints its Slot's solved Color value — the board becomes the
    // palette it spelled out (scene 04). A Cell takes its across Slot's colour where it has
    // one, else its down Slot's. Computed once per render, only when solved.
    const cellColor = solved ? this._solvedColors(layout) : null;

    const cells = layout.cells
      .map((cell, i) => {
        const key = cellKey(cell);
        const g = weaveCell(live, cell.row, cell.col);
        const st = this._cellState(key);
        const isCursor = !solved && key === this.cursorKey;
        const wrap = `position:absolute;left:${pct(cell.col, cols)};top:${pct(cell.row, rows)};width:${pct(1, cols)};height:${pct(1, rows)};`;
        // Solved variant: uniform inset-2 / radius-6 cell painted its Slot colour, with a
        // staggered bloom (the weave hairlines give way to the colour). Playing variant:
        // the woven neutral base.
        const base = solved
          ? `position:absolute;inset:2px;border-radius:6px;background:${cellColor![key]};animation:cw-bloom .5s ${i * 35}ms both;`
          : `position:absolute;inset:${g.inset};border-radius:${g.radius};background:var(--c0ffee-bg, #0a0a0b);box-shadow:${g.shadow};`;
        return `<div class="cell${isCursor ? ' cur' : ''}${solved ? ' solved' : ''}" data-cell="${key}" style="${wrap}">
          <div class="base" style="${base}"></div>
          ${!solved && g.corner ? `<div style="${g.corner}"></div>` : ''}
          ${isCursor ? '<div class="caret"></div>' : ''}
          ${st.digit ? `<span class="glyph">${st.digit}</span>` : ''}
          ${st.locked ? LOCK_SVG : ''}
        </div>`;
      })
      .join('');

    const boardStyle = `position:relative;width:100%;max-width:${cols * CELL_PX}px;aspect-ratio:${cols} / ${rows};margin:0 auto;`;
    return `<div class="board${solved ? ' solved' : ''}" style="${boardStyle}">
      ${cells}
      ${solved ? '' : this._outlines(cols, rows)}
      ${this._clueNumbers(layout, cols, rows)}
    </div>`;
  }

  // The per-Cell solved colours (completion recolor): each Cell keyed to the Color value
  // of the Slot it spells — its across Slot where it has one, else its down Slot. Only the
  // colour is shown (the answer digit is already locked in the Cell), so nothing latent
  // leaks that wasn't already on screen.
  private _solvedColors(layout: Layout): Record<string, string> {
    const map: Record<string, string> = {};
    for (const dir of ['down', 'across'] as const) {
      // across written second so a crossing Cell ends up its across colour
      for (const slot of layout.slots.filter((s) => s.direction === dir)) {
        const hex = `#${this._target(slot)}`;
        for (const c of slot.cells) map[cellKey(c)] = hex;
      }
    }
    return map;
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
      ? this._hintKey(verdict)
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
        <span class="clabel">${label}</span>
        ${meta}
      </div>
      <div class="stages">
        <div class="stage clue" style="${clueStyle}"></div>
        ${mix}
      </div>
    </div>`;
  }

  // The clue-nav header (CW-InputDock two-part row, C0FFEE-73): a labelled "Clue list"
  // button top-left that opens the clue-list pane, and the prev/next chevrons top-right.
  // The "Clue list" button rides the same delegated click handler via data-act, so it
  // inherits the focus-visible ring; prev/next keep their data-nav contract (_step). The
  // clue label itself lives in the comparison band below (see _compare), as drawn.
  private _clueNav(): string {
    return `<div class="cluenav">
      <button type="button" class="cluelistbtn" data-act="pane-clues" aria-label="Show clue list">${LIST_SVG}<span>Clue list</span></button>
      <div class="navchevrons">
        <button type="button" class="navbtn" data-nav="prev" aria-label="Previous clue">${NAV_GLYPH.prev}</button>
        <button type="button" class="navbtn" data-nav="next" aria-label="Next clue">${NAV_GLYPH.next}</button>
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

  // The channel-hint strip plus its "?" legend disclosure (C0FFEE-77, CW-InputDock meta
  // row). The strip (_chips) is unchanged; the "?" opens a transient key for the three
  // glyphs. legendOpen is a twin of menuOpen: an invisible full-bleed backdrop catches an
  // outside tap, the "?" toggles, Escape closes — and the board stays live behind it (no
  // scrim, not an _overlayUp state). It rides beside the strip, so the key is reachable
  // exactly where and when the glyphs appear (only after a Guess is graded).
  private _hintKey(verdict: GuessResult): string {
    return `<div class="hintkey">
      ${this._chips(verdict)}
      <button type="button" class="legendbtn" data-act="legend" aria-label="Show channel hint key" aria-expanded="${this.legendOpen}">?</button>
      ${this._legendPopover()}
    </div>`;
  }

  // The legend key: each per-Channel glyph paired with its plain-language action. It reuses
  // VERDICT_GLYPH, so the popover shows the EXACT glyphs the strip renders (never a drifting
  // copy) — and the glyphs stay achromatic, the letters carry no tint, so the key reads as
  // quiet chrome, not color content (ADR-0007 contract #3). ASCII " - " separators match the
  // completion-summary copy convention. Rendered only while open; closed by default.
  private _legendPopover(): string {
    if (!this.legendOpen) return '';
    const rows: ReadonlyArray<[ChannelVerdict, string]> = [
      ['correct', 'matched - leave it'],
      ['higher', 'too low - go higher'],
      ['lower', 'too high - go lower'],
    ];
    return `<div class="legend" role="note">${rows
      .map(([v, text]) => `<div class="legendrow"><span class="lglyph">${VERDICT_GLYPH[v]}</span>${text}</div>`)
      .join('')}</div>`;
  }

  // The legend's dismiss backdrop, rendered at the screen level (like the kebab's .menuback)
  // so it anchors to .screen and covers the whole crossword but NOT the Site banner above it
  // — an outside tap closes the legend, a banner tap still works. Kept out of the inline
  // .hintkey so it can be a screen-scoped block (C0FFEE-77).
  private _legendBackdrop(): string {
    return this.legendOpen ? '<div class="legendback" data-act="legend-close"></div>' : '';
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

  // The clue-list pane (CW-CluePanel, C0FFEE-73): the Across/Down clues side by side, each
  // a tappable row of Slot number -> clue swatch -> connector -> your-guess swatch, showing
  // every clue's color next to your own guess and its status at a glance. A tap routes to
  // that Slot and auto-returns to the entry pane (_routeToClue); the rows are real <button>s
  // with the focus-visible ring, so the pane is fully keyboard/pointer drivable. NOT
  // <c0ffee-swatch> (which would emit colorchange and hijack the hash). No latent answer
  // leaks (ADR-0007): a row shows the clue color (which IS the clue) and the player's own
  // committed guess — never an unsolved answer's digits.
  private _cluePanel(layout: Layout): string {
    const sel = this.state.selected;
    const row = (slot: Slot): string => {
      const key = slotKey(slot);
      const clueHex = this._target(slot);
      const st = this._clueRowState(slot);
      const isSel = !!sel && sel.number === slot.number && sel.direction === slot.direction;
      // clue swatch: glows + stamps a check at match; a plain painted box otherwise
      const clueSwatch =
        st === 'match'
          ? `<span class="clueswatch match" style="background:#${clueHex};">${PANEL_CHECK_SVG}</span>`
          : `<span class="clueswatch" style="background:#${clueHex};"></span>`;
      // connector: a spark once solved, an arrow (clue -> you) while you are still guessing
      const connector =
        st === 'match'
          ? `<span class="connector spark" aria-hidden="true">&#10022;</span>`
          : `<span class="connector" aria-hidden="true">&#8594;</span>`;
      // your-guess swatch: "?" until a full Guess is committed; the clue color (with a
      // check) once solved; your own six-digit guess color (with a cross) when wrong
      let youSwatch: string;
      if (st === 'unguessed') {
        youSwatch = `<span class="youswatch q" title="no guess yet"><span class="q">?</span></span>`;
      } else if (st === 'match') {
        youSwatch = `<span class="youswatch match" style="background:#${clueHex};" title="solved">${PANEL_CHECK_SVG}</span>`;
      } else {
        const guess = slot.cells.map((c) => this._cellState(cellKey(c)).digit).join('');
        youSwatch = `<span class="youswatch wrong" style="background:#${guess};" title="checked - wrong">${PANEL_CROSS_SVG}</span>`;
      }
      return `<li><button type="button" class="cluerow${isSel ? ' sel' : ''}" data-slot="${key}" data-state="${st}" aria-pressed="${isSel}">
        <span class="cnum">${slot.number}</span>
        ${clueSwatch}
        ${connector}
        ${youSwatch}
      </button></li>`;
    };
    const group = (direction: 'across' | 'down', heading: string): string => {
      const rows = layout.slots
        .filter((s) => s.direction === direction)
        .sort((a, b) => a.number - b.number)
        .map(row)
        .join('');
      return `<div class="cluegroup">
        <h2>${heading}</h2>
        <div class="colhead"><span class="ch-clue">clue</span><span class="ch-you">you</span></div>
        <ul>${rows}</ul>
      </div>`;
    };
    return `<section class="cluepanel panel">${group('across', 'Across')}${group('down', 'Down')}</section>`;
  }
}

// The scoped CSS. Page bg is dressed (hairline + shadow), never a lighter fill (ADR-0007
// surface recipe, shared with swatch.ts / console.ts). Keypad keys, toasts, chips, and
// the cursor caret are this slice's additions onto the slice-1 skeleton.
const STYLE = `
  /* fill <main> so .screen can bound itself to one viewport (Option A, C0FFEE-73): the
     host stretches to the height <main> reserves (flex:1 under the Site banner), and
     .screen takes height:100% of that — never taller than the screen. */
  :host { display:block; height:100%; font-family:var(--c0ffee-font, monospace); color:var(--c0ffee-fg, #ededed); outline:none; }
  /* the puzzle is one focusable unit (tabindex on the host) — show the keyboard-focus ring
     when it is reached by Tab, the same accent ring every control uses (C0FFEE-66) */
  :host(:focus-visible) { outline:2px solid var(--c0ffee-accent, #C0FFEE); outline-offset:3px; border-radius:18px; }
  *, *::before, *::after { box-sizing:border-box; }
  /* the render container generates no box — its children lay out as if direct children of
     the host, so injecting the stylesheet once (not per-render) changes nothing visually */
  .cw-body { display:contents; }

  /* mobile-first fluid; centered, clamped column on wide viewports (ADR-0005).
     position:relative so the absolute overlay layer (scrim, pause/confirm cards, the
     coach bottom-sheet, the lock callout) anchors to the screen, not the page. */
  /* one-viewport host: height:100% (not min-height) bounds the screen to <main>, and
     min-height:0 lets the active pane's own scroll region (not the page) absorb overflow
     (Option A, C0FFEE-73). The board + topbar are fixed; only the pane below them flexes. */
  .screen { position:relative; display:flex; flex-direction:column; gap:11px; height:100%; min-height:0;
            width:100%; max-width:430px; margin:0 auto; padding:6px 0;
            background:var(--c0ffee-bg, #0a0a0b); }

  /* surface recipe — dressed page bg, never a lighter fill */
  .panel { background:var(--c0ffee-bg, #0a0a0b); border-radius:16px;
           box-shadow:inset 0 0 0 1px rgba(255,255,255,.18), 0 16px 34px -20px rgba(0,0,0,.85); }

  /* the negative-offset clue numbers need room outside the board box. flex:none so the
     board keeps its size and the pane below it absorbs the leftover height (C0FFEE-73). */
  .boardwrap { flex:none; padding:14px 22px; }
  .board { position:relative; }
  .cell { position:absolute; display:flex; align-items:center; justify-content:center; cursor:pointer; }
  .cell .glyph { position:relative; z-index:3; font:400 21px/1 var(--c0ffee-font, monospace); color:var(--c0ffee-fg, #ededed); }
  /* the within-slot cursor: an accent caret ring over the active Cell (contract: accent = "you") */
  .cell .caret { position:absolute; inset:2px; border-radius:6px; z-index:4; pointer-events:none;
                 box-shadow:inset 0 0 0 2px var(--c0ffee-accent, #C0FFEE); }
  .cell .lock { position:absolute; top:3px; right:4px; line-height:0; opacity:.65; z-index:5; }
  .num { position:absolute; font:400 10px/1 var(--c0ffee-font, monospace); color:rgba(255,255,255,.74); z-index:6; pointer-events:none; }

  .dock { padding:14px 16px; display:flex; flex-direction:column; gap:12px; margin:0 14px; }

  /* clue-nav header (CW-InputDock two-part row, C0FFEE-73): "Clue list" button left,
     prev/next chevrons right. The clue label itself sits in the comparison band below. */
  .cluenav { display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .cluelistbtn { display:flex; align-items:center; gap:6px; min-height:38px; padding:4px 8px; margin:0 -8px;
                 border:none; border-radius:8px; background:none; cursor:pointer; flex:none;
                 color:rgba(255,255,255,.82); font:400 11px/1 var(--c0ffee-font, monospace); letter-spacing:.02em; white-space:nowrap; }
  .cluelistbtn:hover { color:var(--c0ffee-fg, #ededed); }
  .cluelistbtn:focus-visible { outline:2px solid var(--c0ffee-accent, #C0FFEE); outline-offset:2px; }
  .navchevrons { display:flex; align-items:center; gap:6px; }

  /* the comparison: clue + live mix — the literal Color values (contract #1); the active
     outline (#2) and the transient commit toast (#4) are the other saturated surfaces */
  .compare { display:flex; flex-direction:column; gap:11px; }
  .cmeta { display:flex; align-items:center; gap:10px; min-height:18px; }
  /* prev/next clue-nav: neutral chevron buttons (contract #6) */
  .navbtn { flex:none; width:30px; height:30px; padding:0; border:none; border-radius:8px;
            background:var(--c0ffee-bg, #0a0a0b); box-shadow:inset 0 0 0 1px rgba(255,255,255,.19);
            color:rgba(255,255,255,.78); cursor:pointer; display:flex; align-items:center; justify-content:center; }
  .navbtn:focus-visible { outline:2px solid var(--c0ffee-accent, #C0FFEE); outline-offset:2px; }
  .clabel { font:400 14px/1 var(--c0ffee-font, monospace); color:var(--c0ffee-fg, #ededed); white-space:nowrap; }
  .count { margin-left:auto; font:400 10.5px/1 var(--c0ffee-font, monospace); letter-spacing:.12em;
           text-transform:uppercase; color:rgba(255,255,255,.62); }
  /* the channel-hint strip + its "?" legend disclosure (C0FFEE-77); margin-left:auto rides
     the wrapper now so the popover anchors to it (position:relative) and the "?" sits flush
     against the strip's right edge */
  .hintkey { position:relative; margin-left:auto; display:inline-flex; align-items:center; gap:9px; }
  .chips { display:inline-flex; align-items:center; gap:9px; }
  .chip { display:inline-flex; align-items:center; gap:3px; }
  .chip .id { font:500 11.5px/1 var(--c0ffee-font, monospace); }
  .chip .glyph { line-height:0; }
  /* the "?" disclosure: a quiet round chrome control (contract #6), accent-ringed when open */
  .legendbtn { flex:none; width:22px; height:22px; padding:0; border:none; border-radius:50%;
               background:var(--c0ffee-bg, #0a0a0b); box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);
               color:rgba(255,255,255,.6); cursor:pointer; font:500 11px/1 var(--c0ffee-font, monospace);
               display:inline-flex; align-items:center; justify-content:center; }
  .legendbtn[aria-expanded="true"] { box-shadow:inset 0 0 0 1px rgba(192,255,238,.55); color:var(--c0ffee-accent, #C0FFEE); }
  .legendbtn:focus-visible { outline:2px solid var(--c0ffee-accent, #C0FFEE); outline-offset:2px; }
  /* invisible backdrop — an outside tap closes the legend (kebab-menu model). Absolute so it
     anchors to .screen (covers the crossword, not the Site banner above it), as .menuback does */
  .legendback { position:absolute; inset:0; z-index:40; }
  /* the popover drops below the "?" row, right-aligned, with a little pointer notch */
  .legend { position:absolute; top:calc(100% + 10px); right:0; z-index:45; width:208px; padding:11px 13px;
            border-radius:11px; background:var(--c0ffee-bg, #0a0a0b);
            box-shadow:inset 0 0 0 1px rgba(255,255,255,.16), 0 18px 40px -16px rgba(0,0,0,.94);
            display:flex; flex-direction:column; gap:6px; }
  .legend::before { content:''; position:absolute; top:-5px; right:9px; width:10px; height:10px;
                    background:var(--c0ffee-bg, #0a0a0b); box-shadow:inset 1px 1px 0 rgba(255,255,255,.16);
                    transform:rotate(45deg); }
  .legendrow { display:flex; align-items:center; gap:10px; font:400 11.5px/1.3 var(--c0ffee-font, monospace);
               color:rgba(255,255,255,.74); }
  .lglyph { width:15px; flex:none; display:inline-flex; justify-content:center; line-height:0; }
  .stages { display:flex; gap:10px; }
  .stage { flex:1; height:62px; border-radius:12px; box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); }
  .stage.mix { display:flex; align-items:center; justify-content:center; box-shadow:inset 0 0 0 2px var(--c0ffee-accent, #C0FFEE); }
  .stage.mix .q { font:400 26px/1 var(--c0ffee-font, monospace); color:var(--c0ffee-accent, #C0FFEE); opacity:.8; }

  /* the input dock — toast above the hex keypad */
  .inputdock { position:relative; display:flex; flex-direction:column; gap:6px; }
  .toastwrap { position:absolute; left:0; right:0; bottom:100%; margin-bottom:10px; display:flex;
               justify-content:center; pointer-events:none; z-index:5; }
  .toast { display:inline-flex; align-items:center; gap:8px; padding:10px 14px; border-radius:10px;
           font:400 11.5px/1.3 var(--c0ffee-font, monospace); white-space:nowrap; }
  .toast svg { flex:none; }
  .toast.warn  { background:#241c0c; box-shadow:inset 0 0 0 1px rgba(240,180,80,.5), 0 10px 24px -10px rgba(0,0,0,.7); color:#f1c074; }
  .toast.win   { background:#0d2417; box-shadow:inset 0 0 0 1px rgba(60,235,120,.55), 0 10px 24px -10px rgba(0,0,0,.7); color:#7be8a5; }
  .toast.wrong { background:#2a1212; box-shadow:inset 0 0 0 1px rgba(255,80,80,.5), 0 10px 24px -10px rgba(0,0,0,.7); color:#ff8b8b; }

  .keypad { display:grid; grid-template-columns:repeat(4,1fr); gap:5px; }
  .keyrow { display:grid; grid-template-columns:1fr 2fr; gap:5px; }
  .key { min-height:40px; border:none; border-radius:9px; background:var(--c0ffee-bg, #0a0a0b);
         box-shadow:inset 0 0 0 1px rgba(255,255,255,.19); color:var(--c0ffee-fg, #ededed);
         font:400 18px/1 var(--c0ffee-font, monospace); cursor:pointer;
         display:flex; align-items:center; justify-content:center; gap:7px; }
  .key.hex { box-shadow:inset 0 0 0 1px rgba(192,255,238,.28); color:var(--c0ffee-accent, #C0FFEE); }
  .key.del { color:rgba(255,255,255,.78); }
  .key.check { box-shadow:inset 0 0 0 1px rgba(192,255,238,.4); color:var(--c0ffee-accent, #C0FFEE);
               font:400 14px/1 var(--c0ffee-font, monospace); letter-spacing:.04em; }
  .key:focus-visible { outline:2px solid var(--c0ffee-accent, #C0FFEE); outline-offset:2px; }

  /* the clue-list pane (CW-CluePanel, C0FFEE-73): the Across/Down clues side by side. As
     the active pane below the board it absorbs overflow itself (min-height:0 + overflow:auto)
     so a long list scrolls within the panel while the board + chrome stay put. */
  .cluepanel { flex:1 1 auto; min-height:0; overflow:auto; margin:0 14px; padding:18px; display:flex; gap:18px; }
  .cluegroup { flex:1; min-width:0; }
  .cluegroup h2 { margin:0 0 8px; font:400 14px/1 var(--c0ffee-font, monospace); color:var(--c0ffee-fg, #ededed); }
  /* the "clue" / "you" column captions over each row's two swatches */
  .colhead { display:flex; gap:8px; margin:0 0 5px; padding:0 8px 0 24px; }
  .colhead span { width:30px; text-align:center; flex:none; font:400 9.5px/1 var(--c0ffee-font, monospace);
                  letter-spacing:.1em; text-transform:uppercase; color:rgba(255,255,255,.74); }
  .colhead .ch-you { margin-left:16px; } /* skip the connector column to sit over the you swatch */
  .cluegroup ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:3px; }
  .cluegroup li { display:flex; }
  /* a clue row is a real <button> (reset to inherit the panel) so a tap routes to its Slot
     and the focus-visible ring lands here; 44px min-height keeps it a touch target */
  .cluerow { flex:1; display:flex; align-items:center; gap:11px; min-height:44px; padding:6px 8px;
             border:none; border-radius:8px; background:none; color:inherit; cursor:pointer;
             font:inherit; text-align:left; }
  .cluerow.sel { background:rgba(255,255,255,.05); box-shadow:inset 0 0 0 1px rgba(255,255,255,.28); }
  .cluerow:focus-visible { outline:2px solid var(--c0ffee-accent, #C0FFEE); outline-offset:2px; }
  .cluerow .cnum { font:400 13px/1 var(--c0ffee-font, monospace); color:rgba(255,255,255,.7);
                   width:12px; text-align:right; flex:none; }
  /* the two color swatches: the clue (its target color, contract #1) and your own guess */
  .clueswatch, .youswatch { width:30px; height:30px; border-radius:7px; flex:none;
                            box-shadow:inset 0 0 0 1px rgba(255,255,255,.2);
                            display:flex; align-items:center; justify-content:center; line-height:0; }
  .youswatch.q { background:var(--c0ffee-bg, #0a0a0b); box-shadow:inset 0 0 0 1px rgba(255,255,255,.15); }
  .youswatch.q .q { font:500 16px/1 var(--c0ffee-font, monospace); color:rgba(255,255,255,.46); line-height:1; }
  /* connector between the swatches: a spark (accent) once solved, else a muted arrow */
  .connector { width:16px; text-align:center; flex:none; font:400 13px/1 var(--c0ffee-font, monospace);
               color:rgba(255,255,255,.62); }
  /* a solved swatch glows softly; the spark twinkles (both respect reduced-motion below) */
  .clueswatch.match, .youswatch.match { animation:cw-glow 2.4s ease-in-out infinite; }
  .connector.spark { color:var(--c0ffee-accent, #C0FFEE); animation:cw-twinkle 2.3s ease-in-out infinite; }
  @keyframes cw-glow {
    0%,100% { box-shadow:inset 0 0 0 1px rgba(255,255,255,.22), 0 0 6px -1px rgba(192,255,238,.32); }
    50% { box-shadow:inset 0 0 0 1px rgba(255,255,255,.64), 0 0 13px 0 rgba(192,255,238,.6); }
  }
  @keyframes cw-twinkle {
    0%,100% { opacity:.45; transform:scale(.78) rotate(0deg); }
    50% { opacity:1; transform:scale(1.2) rotate(45deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .clueswatch.match, .youswatch.match, .connector.spark { animation:none; }
  }

  /* === chrome (C0FFEE-67) === all neutral off --c0ffee-fg (contract #6); the accent is
     "you"/primary actions; semantic colour only on the destructive confirm + warn glyph. */

  /* topbar — controls only (no brand wordmark; the Site banner owns branding) */
  .topbar { position:relative; display:flex; align-items:center; justify-content:space-between;
            padding:2px 16px 12px; min-height:34px; box-shadow:inset 0 -1px 0 rgba(255,255,255,.07); }
  .timerwrap { display:flex; align-items:center; gap:2px; }
  .timer { font:400 13px/1 var(--c0ffee-font, monospace); color:rgba(255,255,255,.74);
           letter-spacing:.02em; min-width:34px; }
  .timer.hidden { color:rgba(255,255,255,.34); } /* zen solve: the running readout is muted out */
  .eyebtn { min-width:30px; height:30px; color:rgba(255,255,255,.5); }
  .tbtns { display:flex; align-items:center; gap:4px; }
  .tbtn { display:flex; align-items:center; justify-content:center; min-width:38px; height:38px;
          border:none; border-radius:9px; background:none; color:rgba(255,255,255,.66); cursor:pointer; }
  .tbtn:hover { color:var(--c0ffee-fg, #ededed); }
  .tbtn:focus-visible { outline:2px solid var(--c0ffee-accent, #C0FFEE); outline-offset:2px; }
  .topbar.done { justify-content:space-between; }
  .topbar.done .trophy { line-height:0; }

  /* game menu dropdown — outside-tap backdrop + a small surface-recipe card */
  .menuback { position:absolute; inset:0; z-index:40; }
  .menu { position:absolute; top:40px; right:14px; z-index:45; min-width:174px; padding:6px;
          border-radius:13px; background:var(--c0ffee-bg, #0a0a0b);
          box-shadow:inset 0 0 0 1px rgba(255,255,255,.12), 0 18px 42px -16px rgba(0,0,0,.85);
          display:flex; flex-direction:column; gap:2px; }
  .menuitem { display:flex; align-items:center; gap:11px; width:100%; min-height:40px; padding:8px 11px;
              border:none; border-radius:9px; background:none; color:rgba(255,255,255,.86); cursor:pointer;
              font:400 13px/1 var(--c0ffee-font, monospace); text-align:left; }
  .menuitem:hover { background:rgba(255,255,255,.06); }
  .menuitem:focus-visible { outline:2px solid var(--c0ffee-accent, #C0FFEE); outline-offset:-2px; }

  /* the one shared scrim primitive (decision 5): coach, pause and confirm all ride it */
  .scrim { position:absolute; inset:0; z-index:60; background:rgba(8,8,10,.93);
           backdrop-filter:blur(9px); -webkit-backdrop-filter:blur(9px); }

  /* pause + confirm: a centered card over the scrim */
  .overlaycard { position:absolute; inset:0; z-index:61; display:flex; flex-direction:column;
                 align-items:center; justify-content:center; gap:14px; padding:0 30px; text-align:center; }
  .ovicon { width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center;
            color:rgba(255,255,255,.85); box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); }
  .ovicon.warn { color:#ffb27a; box-shadow:inset 0 0 0 1px rgba(255,178,122,.45); }
  .ovtitle { font:500 19px/1.2 var(--c0ffee-font, monospace); color:var(--c0ffee-fg, #ededed); letter-spacing:.01em; }
  .ovdesc { font:400 13px/1.5 var(--c0ffee-font, monospace); color:rgba(255,255,255,.7); max-width:250px; }
  .confirm-actions { display:flex; gap:10px; margin-top:6px; }

  /* shared overlay button (coach next/back/done, resume, cancel, completion new) */
  .cbtn { display:inline-flex; align-items:center; gap:8px; height:44px; padding:0 20px; border:none;
          border-radius:11px; background:var(--c0ffee-bg, #0a0a0b); color:rgba(255,255,255,.82);
          box-shadow:inset 0 0 0 1px rgba(255,255,255,.2); cursor:pointer;
          font:400 14px/1 var(--c0ffee-font, monospace); }
  .cbtn svg { flex:none; }
  .cbtn:focus-visible { outline:2px solid var(--c0ffee-accent, #C0FFEE); outline-offset:2px; }
  /* accent (primary) variant — resume, coach Next, completion New */
  .cbtn.next, .cbtn.resume, .cbtn.comp-new { color:var(--c0ffee-accent, #C0FFEE);
          box-shadow:inset 0 0 0 1px rgba(192,255,238,.45); }
  /* the one earned semantic colour: the destructive confirm CTA */
  .cbtn.danger { color:#ffb27a; background:#2a1410; box-shadow:inset 0 0 0 1px rgba(255,140,90,.5); }
  /* "Got it" — a filled accent affirmative */
  .cbtn.done { color:#06281f; background:var(--c0ffee-accent, #C0FFEE); box-shadow:none; font-weight:500; }

  /* coach — a bottom-sheet over the dimmed board (decision 5) */
  .coach.sheet { position:absolute; left:0; right:0; bottom:0; z-index:61; display:flex; flex-direction:column;
                 padding:18px; border-radius:18px 18px 0 0; background:var(--c0ffee-bg, #0a0a0b);
                 box-shadow:inset 0 0 0 1px rgba(255,255,255,.18), 0 -16px 40px -18px rgba(0,0,0,.9);
                 animation:cw-rise .28s ease both; }
  .coach-top { display:flex; align-items:center; gap:9px; margin-bottom:16px; }
  .coach-badge { width:22px; height:22px; border-radius:6px; background:var(--c0ffee-accent, #C0FFEE);
                 box-shadow:inset 0 0 0 1px rgba(255,255,255,.25); flex:none; }
  .coach-title { font:500 13px/1 var(--c0ffee-font, monospace); color:rgba(255,255,255,.78); letter-spacing:.02em; }
  .coach-skip { margin-left:auto; min-height:38px; padding:0 6px; border:none; background:none; cursor:pointer;
                color:rgba(255,255,255,.7); font:400 11px/1 var(--c0ffee-font, monospace); letter-spacing:.02em; }
  .coach-skip:focus-visible { outline:2px solid var(--c0ffee-accent, #C0FFEE); outline-offset:2px; }
  .coach-content { min-height:96px; }
  .csheet-head { font:400 21px/1.25 var(--c0ffee-font, monospace); color:var(--c0ffee-fg, #ededed);
                 letter-spacing:-.01em; margin-bottom:10px; }
  .csheet-body { margin:0; font:400 13px/1.6 var(--c0ffee-font, monospace); color:rgba(255,255,255,.7); }
  .csheet-body b { color:var(--c0ffee-fg, #ededed); font-weight:500; }
  .coach-foot { display:flex; align-items:center; justify-content:space-between; margin-top:18px; }
  .dots { display:flex; gap:7px; }
  .dot { width:7px; height:7px; border-radius:50%; background:rgba(255,255,255,.22); }
  .dot.on { background:var(--c0ffee-accent, #C0FFEE); }
  .coach-actions { display:flex; align-items:center; gap:8px; }

  /* lock callout — an anchored popover (not scrim-backed; it teaches mid-play) */
  .lockcallout { position:absolute; z-index:55; padding:16px; border-radius:16px;
                 background:var(--c0ffee-bg, #0a0a0b);
                 box-shadow:inset 0 0 0 1px rgba(255,255,255,.22), 0 28px 64px -16px rgba(0,0,0,.95);
                 animation:cw-pop .2s ease both; }
  .lc-top { display:flex; align-items:center; gap:9px; margin-bottom:14px; }
  .lc-tag { font:500 13px/1 var(--c0ffee-font, monospace); color:rgba(255,255,255,.78); letter-spacing:.02em; }
  .lc-head { font:400 20px/1.25 var(--c0ffee-font, monospace); color:var(--c0ffee-fg, #ededed);
             letter-spacing:-.01em; margin-bottom:9px; }
  .lc-body, .lc-foot { margin:0; font:400 12.5px/1.55 var(--c0ffee-font, monospace); color:rgba(255,255,255,.72); }
  .lc-foot { margin-top:16px; }
  .lc-foot b { color:var(--c0ffee-fg, #ededed); font-weight:500; }
  .lc-roles { display:flex; align-items:center; justify-content:center; gap:16px; margin:16px 0 6px; }
  .lc-roles .role { display:flex; flex-direction:column; align-items:center; gap:7px; }
  .role-cell { width:38px; height:42px; display:flex; align-items:center; justify-content:center;
               border-radius:5px; font:400 22px/1 var(--c0ffee-font, monospace); color:var(--c0ffee-fg, #ededed); }
  .role-label { font:400 11px/1.4 var(--c0ffee-font, monospace); color:rgba(255,255,255,.74);
                text-align:center; letter-spacing:.04em; }

  /* completion card (scene 04) — supplants the dock when solved */
  .completion { margin:0 14px; padding:18px; display:flex; flex-direction:column; align-items:center; gap:6px; }
  .comp-head { display:flex; align-items:center; gap:9px; }
  .comp-head span { font:400 18px/1 var(--c0ffee-font, monospace); color:var(--c0ffee-fg, #ededed); letter-spacing:.02em; }
  .comp-summary { margin:2px 0 14px; font:400 12px/1.5 var(--c0ffee-font, monospace);
                  color:rgba(255,255,255,.72); text-align:center; }
  .comp-swatches { display:flex; flex-wrap:wrap; justify-content:center; gap:7px; margin-bottom:18px; }
  .comp-swatches .swatch { width:26px; height:26px; border-radius:6px; box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); }
  .comp-actions { display:flex; gap:10px; }
  .comp-new, .comp-share { justify-content:center; height:46px; padding:0 22px; }
  .comp-share { gap:9px; } /* secondary: the .cbtn base outline (the handoff's Share) */
  /* visually-hidden live region: screen readers hear the copy flash too (C0FFEE-54) */
  .share-status { position:absolute; width:1px; height:1px; overflow:hidden;
                  clip:rect(0 0 0 0); clip-path:inset(50%); white-space:nowrap; }

  /* solved board: the colour blooms in as the weave gives way (scene 04) */
  .board.solved .cell { cursor:default; }
  @keyframes cw-bloom { from { opacity:0; transform:scale(.6); } to { opacity:1; transform:scale(1); } }
  @keyframes cw-rise  { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes cw-pop   { from { opacity:0; transform:scale(.96); } to { opacity:1; transform:scale(1); } }
`;

customElements.define('c0ffee-crossword', C0ffeeCrossword);
