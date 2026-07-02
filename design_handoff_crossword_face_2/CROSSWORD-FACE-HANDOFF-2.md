# Crossword face — handoff 2 (post-landing drift audit)

**Status:** the original `CROSSWORD-FACE-HANDOFF.md` has fully landed in `ccqw/c0ffee@main`
(`elements/crossword.ts`, audited 2026-07-01 at `71d5a74`). All five of its §7 open questions
are resolved in shipped code. This doc covers what's left: **drift between the shipped face and
the design prototype**, found by side-by-side comparison. Fix list is small and CSS-only.

Prototype source of truth for each section is named inline (all in this design project).

---

## 1. Clue-list pane (live `_cluePanel` vs `CW-CluePanel.dc.html`)

Overall: a faithful lift. Row anatomy, metrics (12px num · 30×30 r7 swatches · 16px connector ·
gap 11 · min-height 44), all three you-states, check/cross SVGs, `cw-glow`/`cw-twinkle` timings,
and the surface recipe match the prototype exactly. Live's upgrades (rows as real
`<button data-slot>`, `.sel` state, in-panel scroll region, `prefers-reduced-motion` guard,
state derived from `CrosswordState`) are all improvements — keep them.

### 1a. DRIFT — column-caption alignment (fix, CSS-only)

The prototype's "clue / you" captions mirror the row's exact spacer structure, so each caption
sits dead-center over its swatch column. Live approximates with padding and drifts left:

- Live row geometry (`.cluerow`: `padding:6px 8px; gap:11px`; num 12 · swatch 30 · connector 16):
  clue swatch spans **31–61px**, you swatch **99–129px** from the row's left edge.
- Live `.colhead` (`padding:0 8px 0 24px; gap:8px; .ch-you{margin-left:16px}`):
  clue caption **24–54px** (≈7px left of its column), you caption **78–108px** (≈21px left).

**Fix** — make the header math mirror the row math (11px gaps, 8+12+11 lead-in,
connector 16 + gap 11 extra before "you"):

```css
.colhead { display:flex; gap:11px; margin:0 0 5px; padding:0 8px 0 31px; }
.colhead .ch-you { margin-left:27px; }
```

(Everything else in `.colhead`/`.colhead span` unchanged: spans stay `width:30px`, centered.)
Eyeball after: both captions centered over their swatch columns in the Across AND Down groups.

### 1b. DRIFT — Across/Down group gap: 26px → 18px (confirm, likely fine)

Prototype uses `gap:26px` between the two clue groups; live `.cluepanel` uses `gap:18px`.
At the 430px clamp this is probably an intentional tightening for the one-viewport pane —
confirm it was deliberate and keep whichever reads better on a 375px viewport. Non-blocking.

### 1c. RECORD — dropped prototype states (accepted, no action)

Live's three-state model (`unguessed | match | wrong`) makes two prototype variants
unreachable: the plain committed-color you-swatch with no cross (`youColor`), and the
connector decoupled from match (spark without match). Both are correct casualties of deriving
row status from `CrosswordState` — a full committed-but-wrong guess always earns the cross.
Recorded so nobody "restores" them from the prototype later.

---

## 2. Win celebration (live completion vs prototype scene 04)

Compared `_completionCard` + the solved-board branch of `_board` + `.topbar.done` against the
prototype composition: `CW-CompletionCard.dc.html` + `CW-HexBoard.dc.html` (`variant="solved"`,
`show-numbers=false`) + `CW-TopBar.dc.html` (`mode="done"`).

Matches: card head (accent star + "Solved", 18px), 26×r6 swatch row, 46px actions, panel
recipe, solved cells as uniform inset-2/r6 color tiles with the answer digits shown, board
inert (`cursor:default`, outlines/caret retired). Live's summary line adds the frozen Solve
time — good (the prototype carried it in the topbar only).

### 2a. BUG — padlock on every solved cell (fix)

On completion every Cell is locked, and the solved branch of `_board` still renders
`${st.locked ? LOCK_SVG : ''}` — so the celebration board stamps a 10px padlock on ALL cells,
over the answer colors. The prototype's solved board is clean tiles + digits, no locks (the
lock is a mid-play signifier; on a solved board it's pure noise). **Fix:** gate it —
`${st.locked && !solved ? LOCK_SVG : ''}`.

### 2b. DRIFT — clue numbers still shown on the solved board (fix, one-line)

Prototype scene 04 passes `show-numbers=false`: the periphery clue numbers retire with the
rest of the play chrome. Live renders `_clueNumbers` unconditionally. **Fix:**
`${solved ? '' : this._clueNumbers(layout, cols, rows)}` (same gate the outlines already use).

### 2c. DRIFT — solved-cell definition ring dropped (confirm)

Prototype solved cells carry `inset 0 0 0 1px rgba(255,255,255,.20)` so dark answer colors
keep their tile edges. Live solved cells have no ring — only the 4px bg gutter separates
them, and near-black answers can read as holes in the board. Recommend restoring the ring.

### 2d. DRIFT — card swatches lost their check stamps (confirm)

Prototype completion-card swatches each carry the dark 13px check (the clue-panel's
`PANEL_CHECK_SVG` treatment — "every one verified"). Live renders plain color squares.
Cheap to restore; confirm intent either way.

### 2e. CHANGED — bloom flourish (probably intentional, confirm)

Prototype: one simultaneous shimmer — `cw-bloom` opacity .76→1→.76, 1.7s, .55s delay, all
cells at once. Live: staggered per-cell pop-in — opacity 0 / scale .6 → 1, .5s, `i*35ms`
stagger. Live's read as the better flourish; keep it, but note `cw-bloom` (and `cw-rise` /
`cw-pop`) sit outside the existing `prefers-reduced-motion` guard — add them to it.

### 2f. RECORD — minor deltas (accepted unless someone objects)

- Crossing-cell color precedence flipped: prototype layers down-col color on top; live's
  `_solvedColors` writes across last, so across wins. Cosmetic either way.
- Card actions: prototype stacks New/Share vertically full-width (max 240px); live puts them
  in a horizontal row. Fits at the 430px clamp; fine.
- Topbar done-state glyph: prototype used a neutral 15px muted glyph (contract #6 chrome);
  live reuses the accent-filled trophy star. Defensible (completion is the celebration
  moment), but it's a second accent star on screen with the card head's.

---

## 3. Keypad (live `_inputDock` + `.keypad` vs `CW-Keypad.dc.html`)

Nearly verbatim: 4-col grid 0–9 then A–F, accent-tinted A–F keys (`rgba(192,255,238,.28)`
ring, `#C0FFEE` glyphs), `1fr 2fr` delete/check row, identical delete/check SVGs, r9,
`letter-spacing:.04em` on Check. Live adds focus-visible rings — keep.

### 3a. DRIFT — key height 44px → 40px (touch-target regression, decide)

Prototype keys are `height:44px` — the 44px hit-target floor, deliberate on the game's
most-tapped controls. Live `.key` is `min-height:40px`, presumably squeezed for the
one-viewport budget (C0FFEE-73). Either restore 44px (costs ~14px total across the dock —
check it still fits a 667px-tall viewport) or record 40px as the accepted trade. Don't leave
it implicit.

### 3b. RECORD — gaps 6px → 5px (accepted)

Keypad/keyrow gaps tightened 6→5px with the same one-viewport squeeze. Fine.

---

## 4. Cursor, active-channel outlines, verdict shading (vs `CW-HexBoard.dc.html` + modular frames 02/03/06)

Matches: the active-Slot channel-pair outlines are a verbatim lift — +2px/−4px pair rects, r7,
fills `rgba(255,0,0,.08)` / `rgba(0,255,0,.08)` / `rgba(0,0,255,.10)`, inset 1.4px pure-primary
rings (ADR-0007 contract #2). Live improves the geometry: pairs derive from the Slot's real
cell coords instead of the prototype's `i*2` axis-stepping. Locked-cell treatment (10px padlock,
top 3px / right 4px, opacity .65) and unconfirmed typed digits (plain 21px glyph, no shading)
are identical in both.

### 4a. BUG — cursor caret ignores the weave geometry (fix, spotlight precedent)

Live's cursor is a 2px accent inset ring: `.cell .caret { inset:2px; border-radius:6px; }` —
uniform. The woven cell underneath is NOT uniform: `weaveCell` gives it asymmetric insets
(0 on open sides) and per-corner radii (0 where an edge is open). On any cursor Cell with a
weave connection the accent ring drifts off the cell's drawn box and sits over the join.
This is the exact bug already fixed for the prototype's spotlight ring, which now traces the
cell's OWN inset + radii — apply the same derivation to the caret: build its inset/radius
from `weaveCell(live, r, c)` instead of constants.

### 4b. RECORD — cursor signifier: neutral tint → accent ring (accepted)

The static prototype marked the current cell with a faint neutral fill
(`rgba(237,237,237,.08)`); live ships a real within-slot cursor as a 2px accent ring.
Accent = "you" per the contract, and a ring reads at a glance where a tint doesn't — keep
live's treatment. The neutral tint affordance is retired, not lost.

### 4c. RECORD — on-board verdict overlays never adopted (confirm intent)

`CW-HexBoard` carries an unused `overlays` prop: graded pair rects with small achromatic
check/up/down icons rendered ON the board. Neither the prototype composition nor live uses
it — per-channel verdicts live solely in the dock's chips (identical in both). Recording so
nobody reads the prototype source and thinks board-level verdict rings went missing; if the
chips ever prove too far from the grid on tall boards, this is the designed fallback.

---

## 5. Lock + check placement — cell vs channel, across slot contexts
(vs modular frames 02/03/06 + `CW-InputDock.dc.html`; engine semantics per `lib/crossword-state.ts`)

Engine baseline (locked, not up for debate): a commit locks BOTH cells of every channel that
graded correct; a crossing cell so locked is locked for the perpendicular slot too; complete =
all cells locked. The questions below are purely about what the FACE shows where.

### 5a. DECIDE — padlock density: crossing-only signifier → every locked cell

The prototype's visual language reserved the padlock for the dual-role CROSSING cell (frame 03,
paired with the lock callout teach). Frame 02 shows a matched red channel (R ✓ chip) with the
active slot's red-pair cells deliberately unmarked — the chips carried the news; the demo
engine had no general lock mechanics at all.

Live renders the padlock on EVERY locked cell, in every context: the active slot's own matched
pairs (2–4 padlocks sprout on a partial-correct commit), crossings, and inactive slots — so a
late-game board is dense with padlocks (and the solved board is 100% padlocked, §2a).

Options, in rough preference order:
1. Keep the lock BEHAVIOR everywhere but show the ICON only on crossing cells (the prototype's
   language: the padlock explains "you can't change this from THIS slot"; a matched pair in
   your own slot is already explained by its ✓ chip).
2. Icon on locked cells outside the active slot only.
3. Keep as shipped (honest, but noisy) — then §2a still applies on the solved board.
Whichever wins, write it down; the prototype and live currently disagree silently.

### 5b. DRIFT — verdict chips persist through re-edits — **RESOLVED by §6b** (the receipt)

Prototype (frame 06 demo): chips show only while the graded guess stands — `checked` clears on
the next keypress and the meta reverts to the "n / 6" count. Live: `state.verdicts[slot]` is
never cleared by `setDigit`/`clearDigit`, and `_compare` prefers chips whenever a verdict
exists — so stale check/arrows keep showing against a guess the solver is actively rewriting.
It's also inconsistent with live's own clue-panel rule, which reverts a row to "?" the moment
a post-commit edit empties a cell. Cheapest face-only fix: in `_compare`, show the count
instead of chips when the slot's current digits differ from the digits the verdict graded
(or simply when any unlocked cell has been edited since commit).

### 5c. RECORD — minor deltas

- Prototype stamps a dark 26px check on the your-mix swatch when the whole guess matches
  (`mixCheck`, frame 06); live never marks the mix swatch. Redundant with all-✓ chips + the
  win toast — accept, or restore for the completion beat.
- Channel checks never appear on the board in either (the unused `overlays` capability, §4c).
- Intersecting/inactive slots: verdicts never spill outside the active slot's dock in either;
  padlocks are the board's only cross-slot signal, verdict review lives in the clue panel.

---

## 6. COMMITTED REDESIGN — split compare bar (replaces `.stages` in the entry dock)

Decided 2026-07-02 (prototype: `Compare Split Prototype.dc.html`, view 2a). The shipped
two-swatch comparison — 10px gap + 2px accent ring on the mix — defeats the game's core
perceptual task: a one-channel miss is nearly invisible across the gap, and the mint ring
contaminates the comparison. Replace it with ONE rounded rectangle split into two color
fills that touch at a seam.

Spec (all values final):
- **Container:** `position:relative; display:flex; height:72px; border-radius:12px;
  overflow:hidden;` plus a neutral ring as an absolute overlay child (`inset:0; border-radius:
  12px; box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); pointer-events:none;` — an inset
  shadow on the container itself would paint under the fills).
- **Halves:** `flex:1` each. Left = the clue's target color. Right = the your-mix color,
  resolving only at 6/6 digits (unchanged rule). No gap, no divider between filled halves —
  the fills MUST touch; the seam is the comparison.
- **Empty you-half:** page bg `#0a0a0b`, centered `?` (20–22px, `rgba(255,255,255,.46)`), and
  a seam hairline on that half only: `box-shadow:inset 1px 0 0 rgba(255,255,255,.18)`. The
  hairline disappears the moment the mix resolves.
- **Labels (persistent, contract #5: neutral):** captions ABOVE the bar, one centered over
  each half — the clue-panel column-caption style: `font:400 9.5px/1 var(--c0ffee-font);
  letter-spacing:.1em; text-transform:uppercase; color:rgba(255,255,255,.74);` in a
  `display:flex` row (each caption `flex:1; text-align:center`), 6px above the bar. Nothing
  is drawn on the fills themselves — the comparison surface stays clean.
- **Solved (slot fully matched):** both halves the same color; ONE check centered over the
  seam, the clue-list check style darkened for visibility at this size: 20px, stroke
  `rgba(0,0,0,.72)`, stroke-width 3 (the clue panel uses `rgba(0,0,0,.5)` at 15px — same
  language, deeper shade). No circle backing. Known trade: on a very dark answer color the
  dark check loses contrast — same property the clue-list checks already have; accepted for
  consistency.
- **Checked-but-wrong:** no mark on the bar — the seam plus the receipt (§6b) carry it.
- **Retired:** the mix swatch's 2px `--c0ffee-accent` ring and the accent `?`. ADR-0007 note:
  accent = "you" remains everywhere else (caret, focus rings); here the "you" identity moves
  to the neutral label so the comparison surface stays uncontaminated. This also resolves
  §5c's mix-check question — the centered dark check IS the mix check now.

Height is the one open knob: 72px default, anywhere in 52–110 works; pick against the
one-viewport budget (C0FFEE-73) alongside the §3a keypad-height decision.

### 6b. COMMITTED — "checked" receipt replaces the chips row (resolves §5b)

Principle: **feedback that names its referent can never go stale.** The verdict is pinned to
the exact six digits it graded, so it stays true while the solver retypes — no live
re-grading. Canonical reference: prototype view **4a** — the full four-state walk (typing
→ checked → editing-again → solved) of split bar + receipt together; receipt-row detail in
**5a**; narrow-viewport proof beside them.

Spec (all values final):
- **Receipt row**, rendered below the split bar once the Slot has a graded Guess:
  `display:flex; flex-wrap:wrap; align-items:center; gap:8px 10px; padding:8px 10px;
  border-radius:9px; box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);`
- **Order: `[swatch] [caption (+restore glyph when stale)] … [digit pairs pinned right]`**
  - 18px r5 **swatch** of the graded mix, inset ring `rgba(255,255,255,.2)`. Always full
    fidelity — a literal color value is never dimmed or altered (ADR-0007 contract #1).
  - **State caption**, 9px uppercase, .1em tracking, `rgba(255,255,255,.55)`: reads
    **`checked now`** while the Slot's current digits equal the graded digits,
    **`last checked`** once they diverge. The two strings are the same width in DM Mono,
    so the flip moves nothing.
    > **AMENDED 2026-07-02 (C0FFEE-71 merge eyeball):** captions shortened to **`now`** /
    > **`last`**. The live compare column is ~278px at a 375 viewport (the page spends
    > ~97px on chrome vs this prototype frame's 28px), so the long strings wrapped the
    > diverged row's digit pairs to a second line on 375-class devices. Also: the
    > same-width claim was off by one character (11 vs 12); `now`/`last` are off by one
    > too, absorbed by the elastic middle. The container-width reality is recorded for
    > the C0FFEE-87 grill (it is the width twin of the height finding).
  - **Restore glyph** (undo-2, 13px, stroke `rgba(255,255,255,.55)`, achromatic — contract
    #6) inline right after the word, rendered ONLY while diverged — it affords the restore
    and marks the receipt as not-current. No placeholder when absent: the digit pairs are
    pinned to the row's right edge by `margin-left:auto`, so the elastic middle absorbs the
    glyph — swatch, caption, and pairs hold their exact positions in both states.
  - **Digit pairs**, right-pinned: the three graded pairs, each with its verdict glyph —
    digits `font:500 12px var(--c0ffee-font)` in the muted channel tints (`#ff6a6a` /
    `#46e87f` / `#7aa6ff`), glyphs the existing achromatic VERDICT_GLYPH set at 11px.
    ADR-0007 clean: identity = muted tint on small text, status = achromatic glyph,
    saturated color only on the literal swatch.
- **No dimming in any state.** Currency is carried by the caption word + glyph presence,
  never by opacity.
- **Replaces the meta-row chips entirely** (`_chips`/`_hintKey` leave the meta row). The
  meta row's right side always shows the `n / 6` count while the Slot is editable. The "?"
  legend disclosure rides beside the receipt's digit-pair block.
- **Restore:** tapping the receipt while diverged restores the graded guess — `setDigit`
  each unlocked Cell of the Slot back to its graded digit (locked Cells already hold
  theirs). The caption returns to `checked now` and the glyph disappears (input == referent
  again). While NOT diverged the receipt is inert.
- **Solved:** the receipt disappears; the centered dark check on the bar (§6) carries it.
- **Responsive:** the bar is fully fluid; the receipt is the only fixed-content row — at a
  320px viewport (~292px inner) it fits with room to spare including the glyph, and
  `flex-wrap:wrap` is the safety net (pairs drop to a second line rather than clip).
  Verified in the prototype.

---

## 7. Not re-audited here

Board weave, entry pane, chrome overlays, lock callout were spot-checked
against the prototype during the same audit and matched (weave geometry is lifted verbatim and
credited in-source). If a future slice touches one of those, diff against its `CW-*.dc.html`
before shipping.

## 8. Known remaining scope (unchanged)

- C0FFEE-63: roving focus / ARIA / screen-reader layer — explicitly out of the face slices,
  still open.
