# Handoff 2: `<c0ffee-crossword>` face — drift fixes + compare-band redesign

Start here, then read **`CROSSWORD-FACE-HANDOFF-2.md`** — that file is the source of truth for
this round. This README orients you to the bundle.

---

## What this is

The follow-up to `design_handoff_crossword_face/` (the original face handoff, which is **fully
landed** in `ccqw/c0ffee@main`, `elements/crossword.ts`, audited 2026-07-01 at `71d5a74` — all
its §7 open questions are resolved in shipped code).

This round has two parts:

1. **Drift audit** (§1–§5): shipped face vs. design prototype, section by section. Small,
   mostly CSS-level fixes plus a few explicit decide-items.
2. **Committed redesign of the comparison band** (§6 + §6b): the two-swatch clue/mix comparison
   and the verdict-chips row are REPLACED by a **split compare bar** + **checked receipt**.
   This is new design, decided this session, prototyped in `prototype/`.

Everything from the original handoff still holds: scope is the face only (the reducer and
`CrosswordState` are shipped, untouchable), the input surface is still exactly
`select · setDigit · clearDigit · commit · newPuzzle`, and the ADR-0007 color contract and
token set are unchanged — see the original bundle's README for the short forms.

## Work list, by priority

**Bugs (fix):**
- §2a — solved board stamps a padlock on every cell (gate `LOCK_SVG` with `!solved`).
- §4a — cursor caret ring ignores the weave geometry; derive its inset/radius from
  `weaveCell` (same fix the spotlight ring already got).
- §1a — clue-panel column captions sit off their swatch columns (2-line CSS fix included).
- §2b — clue numbers still render on the solved board (one-line gate).

**Decide, then write it down (non-blocking):**
- §3a — keypad key height shipped at 40px vs the 44px touch-target floor.
- §5a — padlock density: icon on every locked cell vs crossing-cells-only (options ranked).
- §2c/§2d — solved-cell definition ring; completion-card check stamps.
- §2e — add `cw-bloom`/`cw-rise`/`cw-pop` to the `prefers-reduced-motion` guard.

**Build (the committed redesign):**
- §6 — split compare bar: one rounded rect, clue|you fills touching at a seam, neutral
  captions above, centered dark check on solve, accent ring retired.
- §6b — "checked" receipt replaces the chips row: verdict pinned to the graded digits +
  swatch; `checked now` / `last checked` captions; inline restore glyph + tap-to-restore;
  no dimming in any state. Resolves the stale-feedback problem (§5b) by design.

## Files in this bundle

```
README.md                              ← you are here
CROSSWORD-FACE-HANDOFF-2.md            ← SOURCE OF TRUTH — audit + committed spec (read next)
prototype/
  Compare Split Prototype.dc.html      ← the committed compare band, consolidated views:
                                          2a in-context (tweakable height) · 4a full state
                                          walk · 5a receipt detail · @320 narrow proof
  support.js                           ← prototype runtime only — ignore
```

The prototype is an **HTML design reference**, not production code: open
`prototype/Compare Split Prototype.dc.html` in a browser (it self-loads its runtime and DM Mono).
Exact values are in the spec; the prototype is the eyeball reference for them. Example fixture
throughout: clue `#3A7BD5`, guess `#3A7BE9` — off only in blue, the case the old layout hid.

## Where this lands in the shipped face

The redesign touches `_compare`, `_chips`/`_hintKey`, and the entry-pane dock only:
- `.stages` (two swatches) → the split bar.
- Chips row in the meta line → the receipt row below the bar; meta shows `n / 6` always.
- The "?" legend disclosure moves beside the receipt's digit-pair block; its popover and
  glyph vocabulary are unchanged.
- New face behavior: tap-the-receipt restore (§6b) — face-only, rides existing `setDigit`.
No reducer or core changes anywhere in this round.
