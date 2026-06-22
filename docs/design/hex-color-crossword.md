# Hex Color crossword - design handoff

A directive for a **visual design pass** (Claude Design) on the *chrome and layout* of the
Hex Color crossword. The logic is already specced (Linear C0FFEE-12). This pass is about
**look and feel only** - iterate fast against the frozen scenes below. The winning,
token-based markup/CSS will seed the real `<c0ffee-crossword>` shell; the prototype itself
is throwaway, the decisions are the keeper.

## Read these first (already in the repo)

- **CONTEXT.md** - the domain glossary. Honor these terms exactly: *Hex Color crossword,
  Slot, Clue, Cell (+ dual-role), Guess, Channel, Swatch*. See the "Hex Color crossword"
  section.
- **tokens.css** - the design tokens (`--c0ffee-*`: font, accent, radius, background,
  channel colors). **Use these. Do not invent colors, fonts, or radii.**
- **elements/console.ts** and **elements/swatch.ts** - the existing interactives. This game
  must look *of-a-piece* with them. In particular, the console's **Hex field** already
  renders a hex address "segmented into three channel-demarcated pairs, each carrying a
  small channel-colored dot" - reuse that visual vocabulary rather than inventing a new one.
- ADRs to respect: **0002** (Shadow DOM + `--c0ffee-*` tokens), **0005** (mobile-first),
  **0007** (faithful channel colors).
- Full spec: Linear **C0FFEE-12**, "PRD: Hex Color crossword"
  (https://linear.app/ccqw/issue/C0FFEE-12).

## What to design (scope)

The element's surfaces:

- **The grid** - neutral Cells (one hex digit each) + small Slot numbers. **No hue painted
  into the grid**: it stays quiet so the Clue swatches are the only saturated color on the
  page (the same quiet-chrome posture CONTEXT gives the Site banner).
- **The Clue list** - each Clue is a Slot number (e.g. `1-Across`) + a small **Swatch** of
  the target color; tapping the swatch enlarges it.
- **The active Slot** - its six Cells grouped into three **channel-pairs** (red / green /
  blue). Grouping is **structural** - use the grid's own dividers (lighter or absent within
  a pair, a hair more gap between pairs) - plus a **faint channel-color identity cue**. The
  grouping renders for the **selected Slot only** and re-groups when the crossing Slot is
  selected (the dual-role: the same Cell is a different Channel in each direction).
- **Per-Channel feedback** - each channel reads *higher* / *lower* / *correct*. Status
  glyphs are **achromatic** - never "green = right"; status must never read as color
  content. A *correct* channel locks its two Cells.
- **The on-screen hex keypad** (0-9, A-F) - mobile-first: a phone keyboard can't easily type
  A-F.
- **A new-puzzle control** and a quiet **completion** state.

## Frozen scenes to render (hard-code these - there is no engine in this pass)

1. **Fresh puzzle** - full grid + clue list, nothing entered.
2. **Active Slot, mid-solve** - `1-Across` selected, its six Cells shown as three pairs;
   red reads *lower*, green reads *correct* (locked), blue reads *higher*; a few other Cells
   filled.
3. **Cross-propagation** - a Cell locked by solving one Slot's Channel appears as a locked,
   known digit in the crossing Slot, where it belongs to a *different* Channel.
4. **Completion** - all Slots solved; the quiet done state + the new-puzzle control.

### Sample data (so renders are realistic)

A small interlocking fragment (the real puzzle has 14-16 Slots):

- `1-Across` (row 1, cols 1-6) target `3A7BD5` -> digits `3 A 7 B D 5`
  (red `3A`=58, green `7B`=123, blue `D5`=213)
- `1-Down`  (col 1, rows 1-6) target `3C9F6E` -> shares Cell (1,1) = `3`
- `4-Across`(row 4, cols 1-6) target `FA8C00` -> shares `1-Down`'s 4th digit `F`

Scene 2 mid-solve guess on `1-Across`: player entered `3A8040`
-> red `3A` **correct/locked**, green `80`(128) vs `7B`(123) -> *lower*,
blue `40`(64) vs `D5`(213) -> *higher*.

## Open questions - show variations side by side

- **Channel-pair demarcation**: gap-only vs. channel-colored underline vs. a light
  lozenge/bracket vs. the console's dot. Which best says "these two digits are one Channel"
  without busying the grid?
- **Feedback glyphs**: what do *higher* / *lower* / *correct* / *locked* look like,
  achromatic, at Cell scale?
- **Keypad**: layout and placement on a phone, and how the active Cell is indicated.
- **Clue list placement** relative to the grid (stacked below on a phone? a drawer? beside
  on wide screens?).
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
