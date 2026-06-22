# Hex Color crossword - design handoff

A directive for a **visual design pass** (Claude Design) on the *chrome and layout* of the
Hex Color crossword. The logic is not just specced - it is **built and shipped** (see the
implementation contract below). This pass is about **look and feel only** - iterate fast
against the frozen scenes below. The winning, token-based markup/CSS will seed the real
`<c0ffee-crossword>` shell; the prototype itself is throwaway, the decisions are the keeper.

## Implementation contract (already built - do not re-build)

The whole logic core is on `main` as pure, DOM-free TypeScript with tests and audits
(C0FFEE-58/59/60/61). The design pass does **not** author a play model, a reducer, or a
types file - it consumes these. The shell wires DOM events to a five-action surface and
renders from the state shape; nothing here is yours to invent.

The action surface the markup dispatches:

    select / setDigit / clearDigit / commit / newPuzzle

`clearDigit` (the delete key) is the only addition the shell slice makes to the shipped
reducer - it sets a Cell's digit back to null and no-ops on a locked Cell. The keypad is
therefore `0-9`, `A-F`, and a delete key.

The types the markup renders from (`lib/crossword-layout.ts`, `lib/crossword-state.ts`,
`lib/crossword-guess.ts`):

    type Direction = 'across' | 'down';
    interface Cell      { row: number; col: number }            // zero-based
    interface Slot      { number: number; direction: Direction; cells: Cell[] }  // cells length 6, start->end
    interface Crossing  { cell: Cell; across: number; down: number }
    interface Layout    { slots: Slot[]; cells: Cell[]; crossings: Crossing[] }   // cells row-major
    interface Puzzle    { layout: Layout; targets: Record<string,string> }
    interface CellState { digit: string | null; locked: boolean }      // state.cells keyed "row,col"
    // verdicts keyed "number-direction" -> { red|green|blue: 'higher'|'lower'|'correct' }

How to walk it: board = `layout.cells` (max row/col = grid dims); numbers = `layout.slots`;
the active Slot's six live Cells are its `cells` in order, where `[0,1]` is the red Channel,
`[2,3]` green, `[4,5]` blue; per-Cell play state = `state.cells["row,col"]`; directional
chips = `state.verdicts["number-direction"]`; crossings (for the locked-crossing callout) =
`layout.crossings`.

## Read these first (already in the repo)

- **CONTEXT.md** - the domain glossary. Honor these terms exactly: *Hex Color crossword,
  Slot, Clue, Cell (+ dual-role), Guess, Channel, Swatch*. See the "Hex Color crossword"
  section.
- **tokens.css** - the design tokens (`--c0ffee-*`: font, accent, radius, background,
  channel colors `--c0ffee-r/g/b`). **Use these. Do not invent colors, fonts, or radii.**
- **elements/console.ts** and **elements/swatch.ts** - the existing interactives. This game
  must look *of-a-piece* with them: consume the same `--c0ffee-*` tokens and the same
  surface recipe (page-bg + inset hairline + shadow, never a lighter fill - see swatch.ts's
  `.chip`). Do **not** import the console's channel-**dot** vocabulary; the crossword carries
  channel identity differently (see the color contract).
- ADRs to respect: **0002** (Shadow DOM + `--c0ffee-*` tokens), **0005** (mobile-first),
  **0007** (faithful channel colors - read the "principle, not the surface list" consequence;
  it is what licenses the pair outline below).
- Full spec: Linear **C0FFEE-12**, "PRD: Hex Color crossword"
  (https://linear.app/ccqw/issue/C0FFEE-12).

## The color contract (the one invariant the whole face obeys)

The crossword has almost no color - no Additive Venn, no sliders, a deliberately hueless
grid - so every use of color is deliberate and budgeted:

1. **Literal Color values** - the clue Swatch and the your-mix Swatch: full saturated color.
   These are the "where the light shows" surfaces (ADR-0007), the heart of the game.
2. **Channel identity** - the active Slot's channel-pair **outlines**: pure `--c0ffee-r/g/b`
   (`#FF0000`/`#00FF00`/`#0000FF`). This is the dots' replacement and the *only* channel
   signifier the crossword has, so it earns the pure primary by the same logic the console's
   Venn does. Outline the pairs; do not tint the Cells.
3. **Status feedback glyph** - the check / higher-lower arrow: **always neutral**. So
   "green = correct" can never collide with "green = the green Channel."
4. **Transient toasts** - may carry **subtle, icon-backed semantic color**, because they
   appear briefly to grab attention and then leave. This is the only place semantic color is
   allowed.
5. **Persistent status** (e.g. a wrong-clue mark in the clue list) - **neutral**, icon+text.
   Color is earned by transience; a mark that stays does not get it.
6. **Everything else** - Cells, locks, chrome: neutral, muted by opacity off `--c0ffee-fg`,
   never grey tokens.

## What to design (scope)

The element's surfaces:

- **The grid** - neutral Cells (one hex digit each) + small Slot numbers. **No hue painted
  into the grid**: it stays quiet so the budgeted color (above) reads as meaningful.
- **The Clue list** - each Clue is a Slot number (e.g. `1-Across`) + a small **Swatch** of
  the target color; tapping the swatch enlarges it. Hand-roll the clue chip (inert,
  enlargeable) from the surface-recipe tokens - do **not** mount `<c0ffee-swatch>`, whose
  click-to-load/`colorchange` behavior would hijack the URL hash, which the crossword opts
  out of (it reflects no Color link).
- **The active Slot** - its six Cells grouped into three **channel-pairs** (red / green /
  blue) by a **pure-channel-color outline** around each pair, plus structural spacing (a hair
  more gap between pairs than within). The grouping renders for the **selected Slot only** and
  re-groups when the crossing Slot is selected (the dual-role: the same Cell is a different
  Channel in each direction).
- **Per-Channel feedback** - each channel reads *higher* / *lower* / *correct* via an
  **achromatic glyph**; the channel *identity* beside it is colored (the pair outline), the
  glyph itself never is. A *correct* channel locks its two Cells. Only one Slot's feedback is
  on screen at a time, so this stays quiet, not busy.
- **The on-screen hex keypad** (`0-9`, `A-F`, delete) - mobile-first: a phone keyboard can't
  easily type A-F, and delete drives `clearDigit`.
- **The first-run coach card** and the **locked-crossing callout popover** - both are real
  element states the shell renders (in scope this pass), not reference-only.
- **A new-puzzle control** and a quiet **completion** state.

## Frozen scenes to render (hard-code these - there is no engine in this pass)

1. **Fresh puzzle** - full grid + clue list, nothing entered.
2. **First-run coach card** - the onboarding overlay a brand-new player sees.
3. **Active Slot, mid-solve** - `1-Across` selected, its six Cells shown as three
   pair-outlined Channels; red reads *lower*, green reads *correct* (locked), blue reads
   *higher*; a few other Cells filled; the keypad present.
4. **Cross-propagation + locked-crossing callout** - a Cell locked by solving one Slot's
   Channel appears as a locked, known digit in the crossing Slot, where it belongs to a
   *different* Channel; the callout popover explains it.
5. **Completion** - all Slots solved; the quiet done state + the new-puzzle control.

### Sample data (so renders are realistic)

A small interlocking fragment (the real puzzle has 14-16 Slots):

- `1-Across` (row 1, cols 1-6) target `3A7BD5` -> digits `3 A 7 B D 5`
  (red `3A`=58, green `7B`=123, blue `D5`=213)
- `1-Down`  (col 1, rows 1-6) target `3C9F6E` -> shares Cell (1,1) = `3`
- `4-Across`(row 4, cols 1-6) target `FA8C00` -> shares `1-Down`'s 4th digit `F`

Scene 3 mid-solve guess on `1-Across`: player entered `3A8040`
-> red `3A` **correct/locked**, green `80`(128) vs `7B`(123) -> *lower*,
blue `40`(64) vs `D5`(213) -> *higher*.

## Open questions - show variations side by side

- **Pair-outline treatment**: the demarcation is decided (a pure-channel-color outline), but
  its *weight and shape* are open - hairline box vs. bracket vs. underline-per-pair. Which
  best says "these two digits are one Channel" without busying the grid?
- **Feedback glyphs**: what do *higher* / *lower* / *correct* / *locked* look like,
  achromatic, at Cell scale?
- **Keypad**: layout and placement on a phone, where the delete key sits, and how the active
  Cell is indicated.
- **Clue list placement** relative to the grid (stacked below on a phone? a drawer? beside
  on wide screens? - mobile-first, with a centered max-width on desktop, not a separate
  desktop layout).
- **Enlarge interaction** for a Clue swatch (modal? inline grow? long-press?).

## Out of scope (do NOT design)

- **The reveal / grid-painting** when a Slot is solved - a deferred experiment; the grid
  stays neutral for now.
- **Site nav / Menu / banner** changes - separate work (C0FFEE-15).
- **Any logic** - the generator, guess-grading, game state. Hard-code the scenes above.

## Design pass returned -> `crossword-face/`

This directive is the **outbound** brief. The Claude Design pass returned its answer in
[`crossword-face/`](./crossword-face/) - the inbound build directive for the
`<c0ffee-crossword>` shell (shadow-root markup + scoped CSS, the seven scenes as element
states, the `weaveCell` board geometry, the per-component token table). Start at
`crossword-face/README.md`; `CROSSWORD-FACE-HANDOFF.md` is the source of truth for the build.
The open questions above are resolved or carried forward there (see its sections 6-7).
