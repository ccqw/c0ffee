# Design directive: commit toast placement + a more fun completion celebration

Two questions for one Design Claude session, bundled because both touch the same
feedback-moment territory (Check -> toast -> eventually Solved) and Caitlin wants
one pass to cover both.

---

## Part 1: where does the transient commit toast live?

One question: **where does the transient commit toast live now that the checked
receipt owns the space above the input dock?**

### Why it moved

Pre-C0FFEE-71 the toast anchored above the input dock (`bottom:100%`) — empty
space then. The receipt (handoff 2 §6b, shipped v0.35.0 / PR #64) now renders
exactly there, and the wrong toast reads "Not quite — read the channel hints"
while covering the very hints it points at. As a stopgap it now floats centered
over the keypad (`scene-toast-over-keypad-current.png`). Caitlin's instinct:
maybe it belongs **over the split compare bar instead — bottom edge or centered
on it** ("over the clue you guessed").

**Since this question was first raised (v0.35.0), the keypad grew a row**:
C0FFEE-70 (undo/redo, v0.39.0) added a dedicated `[undo][redo][delete][Check
guess]` row below the 0-9/A-F grid. The toast now floats over the middle of a
taller keypad rather than near its bottom edge — see
`scene-toast-over-keypad-current.png` (captured at v0.39.0: note the extra
control row visible below the toast). This changes the balance of "what's idle
under the toast" a little; worth a fresh look rather than assuming the old
framing still holds.

### Candidates on the table

1. **Over the keypad** (shipped stopgap) — the one surface momentarily idle
   after a Check; pointer-transparent; any keypress dismisses it. Now sits
   mid-keypad rather than near the bottom, since the undo/redo/delete/Check row
   was added beneath it.
2. **Over/inside the split bar** — closer to where the eye lands after Check,
   but it covers the seam and the two literal color fills at exactly the moment
   they carry the feedback (tension with ADR-0007 contract #1's spirit).
3. Somewhere new — the session may find a better beat entirely (e.g. riding the
   bar's bottom edge without covering the seam, or a placement keyed to kind:
   warn/win/wrong may not want the same home).

### Live pointers (do not duplicate — read these)

- Implementation: `elements/crossword.ts` — `_toastEl()` render, `_showToast()`
  timing/dismissal (`TOAST_MS`), `.toastwrap`/`.toast.{warn,win,wrong}` CSS (one
  anchoring rule; trivially movable). Toast kinds + copy: `TOAST_GLYPH`, `_check()`.
- Receipt + bar context: `design_handoff_crossword_face_2/CROSSWORD-FACE-HANDOFF-2.md`
  §6 (split bar) + §6b (receipt, incl. the 2026-07-02 caption amendment — captions
  are `now`/`last`, not the doc's original `checked now`/`last checked` — and the
  container-width reality: the live compare column is ~278-319px depending on
  viewport, see ADR-0010).
- Keypad row context (new since this directive was opened): `elements/crossword.ts`
  `_inputDock()` — the `.keyrow` with undo/redo/delete/Check, from C0FFEE-70.
  Dismissal already covers it (`_dismissToast()` fires from every dispatch path,
  including undo/redo) — no reducer work needed regardless of where Part 1 lands.
- Tokens: `tokens.css` (`--c0ffee-*`); color contract: `docs/adr/0007-*` (the
  6-entry table in `docs/design/crossword-face/CROSSWORD-FACE-HANDOFF.md` §1).
- Height budget: ADR-0010 / C0FFEE-87 — two-tier viewport promise, no new
  vertical spend below the board on either tier.
- Frozen scenes in this directory: `scene-toast-over-keypad-current.png` (current,
  v0.39.0), `scene-toast-over-keypad.png` (original stopgap capture, v0.35.0, kept
  for continuity), `scene-receipt-diverged.png` (the receipt the toast must not
  cover).
- Live: https://c0ffee.cafe/crossword.html — type a wrong guess, Check.

### Constraints the decision must respect

- ADR-0007 contract #4: the toast owns the one earned semantic color; contract
  #1: never obscure a literal color value while it is the active feedback.
- Dismissal semantics stay: timeout + any keypress/board interaction.
- No new vertical spend (ADR-0010); no reducer/state changes — face-only.

---

## Part 2: a more fun completion celebration

New ask (2026-07-11): Caitlin wants the Solved moment to feel **more fun** than
it does today. This is intentionally open — there is no candidate list yet,
unlike Part 1. The session's job is to find the fun, not just confirm the
current design.

### What's there today (confirmed live, v0.39.0 — build on this, don't re-derive it)

Two things already happen together on completion, and both are working as
designed (verified against the original handoff's frame 04 and handoff-2 §2;
C0FFEE-82 fixed the last drifts):

1. **The board itself recolors** — every cell repaints as its Slot's target
   color, the woven pair-outlines and padlocks retire, and the whole grid reads
   as one solid mosaic (the puzzle's full palette, at once). Staggered per-cell
   pop-in, `35ms` apart (`@keyframes cw-bloom` in `elements/crossword.ts`).
2. **The completion card** underneath states "Solved", the frozen Solve time,
   and repeats the same palette as a row of small checked swatches.

`scene-completion-current.png` in this directory is a live capture of both
together (5-slot `lattice-6` puzzle, seed 1). This is the baseline — "more fun"
means adding to or intensifying this moment, not replacing it; the board-becomes-
palette idea is good and should stay legible.

### Open question

What makes this moment feel earned and delightful rather than just correct?
Some directions to prowl (not a shortlist — the session should feel free to find
something better):

- Motion: does the bloom need a bigger flourish, a second beat, a sequence
  (e.g. board first, then card), rather than one simultaneous pop-in?
- The completion card itself: trophy + text is quiet. Is there a more
  celebratory arrangement of the same elements (bigger swatches, a different
  card entrance, the swatch row doing something on arrival)?
- Sound/haptic: out of scope for this site historically (no audio anywhere) —
  confirm that's still the right call rather than assuming it.
- Anything that spotlights the palette itself harder — the swatches ARE the
  reward (5-16 literal hex colors the player placed), so the fun should come
  from *that*, not from generic game-completion chrome (confetti, stars,
  fireworks) that doesn't touch the site's own material.

### Constraint that will bite the obvious ideas

**ADR-0007's color contract (table at `docs/design/crossword-face/CROSSWORD-FACE-HANDOFF.md`
§1) still applies on the solved board.** Contract #1 (literal Color values stay
full-saturated, never stylized) protects the palette itself — that's an asset,
lean on it. Contract #6 (everything else — chrome — stays neutral, muted off
`--c0ffee-fg`, never grey tokens, never a NEW saturated color) is the one that
kills generic confetti: multicolor sparkle/confetti effects introduce arbitrary
saturated color outside the puzzle's own palette, which is exactly what this
site's whole design language forbids everywhere else. Any "more fun" proposal
that adds color should explain how it's drawing from the solved palette itself
(the 5-16 colors the player just placed) rather than inventing new ones. This
is the central creative tension for this part of the session — flag it, don't
quietly work around it.

Other constraints:
- `prefers-reduced-motion` must cover whatever's added (the existing guard in
  `elements/crossword.ts` covers `cw-bloom`/`cw-rise`/`cw-pop`; extend it, don't
  bypass it).
- ADR-0010 / C0FFEE-87's viewport budget governs the board and dock while
  playing; the completion card already supplants the dock (no budget conflict
  there), but anything that grows the card should still fit a 375x667 viewport.
- Face-only, same as Part 1: no reducer/state changes should be required to
  land whatever's decided (the celebration is a pure function of
  `state.complete`/`state.solved` + the puzzle's targets, already available to
  the shell).

### Live pointers (do not duplicate — read these)

- Implementation: `elements/crossword.ts` — `_completionCard()`, `_board()`
  (the `solved` branch), `_solvedColors()`, the `.completion`/`.comp-*` and
  `.board.solved` CSS blocks.
- Design precedent: `docs/design/crossword-face/prototype/CW-CompletionCard.dc.html`
  (original static mock) + `docs/design/crossword-face/COMPONENTS.md` §
  `CW-CompletionCard`; drift history in
  `design_handoff_crossword_face_2/CROSSWORD-FACE-HANDOFF-2.md` §2 (what was
  already fixed — don't re-litigate 2a-2e, they're settled).
- Frozen scene: `scene-completion-current.png` (this directory, v0.39.0 live
  capture).
- Live: https://c0ffee.cafe/crossword.html — solve any puzzle to see it, or
  load `#cw~lattice-6~1` for a reproducible small (5-slot) board.
