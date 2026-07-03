# Design directive: the commit toast's home

One question for a Design Claude session: **where does the transient commit toast
live now that the checked receipt owns the space above the input dock?**

## Why it moved

Pre-C0FFEE-71 the toast anchored above the input dock (`bottom:100%`) — empty
space then. The receipt (handoff 2 §6b, shipped v0.35.0 / PR #64) now renders
exactly there, and the wrong toast reads "Not quite — read the channel hints"
while covering the very hints it points at. As a stopgap it now floats centered
over the keypad (`scene-toast-over-keypad.png`). Caitlin's instinct: maybe it
belongs **over the split compare bar instead — bottom edge or centered on it**
("over the clue you guessed").

## Candidates on the table

1. **Over the keypad** (shipped stopgap) — the one surface momentarily idle
   after a Check; pointer-transparent; any keypress dismisses it.
2. **Over/inside the split bar** — closer to where the eye lands after Check,
   but it covers the seam and the two literal color fills at exactly the moment
   they carry the feedback (tension with ADR-0007 contract #1's spirit).
3. Somewhere new — the session may find a better beat entirely (e.g. riding the
   bar's bottom edge without covering the seam, or a placement keyed to kind:
   warn/win/wrong may not want the same home).

## Live pointers (do not duplicate — read these)

- Implementation: `elements/crossword.ts` — `_toastEl()` render, `_showToast()`
  timing/dismissal, `.toastwrap`/`.toast.{warn,win,wrong}` CSS (one anchoring
  rule; trivially movable). Toast kinds + copy: `TOAST_GLYPH`, `_check()`.
- Receipt + bar context: `design_handoff_crossword_face_2/CROSSWORD-FACE-HANDOFF-2.md`
  §6 (split bar) + §6b (receipt, incl. the 2026-07-02 caption amendment and the
  container-width reality: the live compare column is ~278px at a 375 viewport).
- Tokens: `tokens.css` (`--c0ffee-*`); color contract: `docs/adr/0007-*`.
- Height budget: C0FFEE-87 — no new vertical spend below the board.
- Frozen scenes in this directory: `scene-toast-over-keypad.png` (current),
  `scene-receipt-diverged.png` (the receipt the toast must not cover).
- Live: https://c0ffee.cafe/crossword.html (v0.35.0) — type a wrong guess, Check.

## Constraints the decision must respect

- ADR-0007 contract #4: the toast owns the one earned semantic color; contract
  #1: never obscure a literal color value while it is the active feedback.
- Dismissal semantics stay: timeout + any keypress/board interaction.
- No new vertical spend (C0FFEE-87); no reducer/state changes — face-only.
