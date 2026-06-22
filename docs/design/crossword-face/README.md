# Handoff: `<c0ffee-crossword>` face

Start here, then read **`CROSSWORD-FACE-HANDOFF.md`** — that file is the source of truth for the
build. This README orients you to the bundle and tells you what each file is for.

---

## What this is

A design reference for the **face** of the Hex Color Crossword: the shadow-root markup + scoped
CSS that renders `CrosswordState` to DOM and translates DOM events into the reducer's five
actions. The files under `prototype/` are **HTML design references** — a working prototype showing
the intended look and behavior, **not** production code to copy. Your job is to recreate this face
in the real repo (`ccqw/c0ffee`, branch `main`): a vanilla TS + Vite site of native Web Components
with Shadow DOM, of-a-piece with `elements/swatch.ts` / `console.ts`, consuming `tokens.css` across
the shadow boundary.

**Fidelity: high.** Colors, typography, spacing, radii, and the woven-grid geometry are final.
Recreate them precisely; the exact values are tabulated in `COMPONENTS.md` §1 and the geometry
algorithms are in the prototype's `CW-HexBoard` (lift them verbatim — they're pure geometry).

## Scope — face only

The functional core is **already shipped** and out of scope. Do not rebuild it:

- Layout, generator, per-channel grading, the play-model reducer → `lib/crossword-*.ts`.
- The play-model data structure **is** `CrosswordState` (`lib/crossword-state.ts`) — not a thing
  to design.
- URL reflection — the crossword deliberately opts out of ADR-0001 (it holds many colors).

```
Input surface (the whole contract):  select · setDigit · clearDigit · commit · newPuzzle
Read surface:                        CrosswordState (cells · selected · verdicts · solved · complete)
                                     + Layout (cells row-major · slots · crossings)
```

## The one invariant — the color contract (ADR-0007)

Every styling decision is downstream of this. Full table in `CROSSWORD-FACE-HANDOFF.md` §1; the short form:

1. Literal color values (clue swatch, your-mix swatch) → **full saturated**.
2. Channel identity — active-slot pair **outlines** (`[0,1]`R `[2,3]`G `[4,5]`B) → pure
   `--c0ffee-r/-g/-b` = `#FF0000/#00FF00/#0000FF`.
   2b. Channel-identity **letters** (R/G/B chips, small text) → muted legible tints
   `#ff6a6a/#46e87f/#7aa6ff` (pure `#0000FF` is invisible at 11px — solve legibility by treatment,
   never by softening the outline).
3. Status feedback glyph (check / arrow) → **always neutral**.
4. Transient toasts → the *only* place semantic color is earned.
5. Persistent status (wrong-clue mark) → neutral, icon + text.
6. Everything else → neutral via **opacity off `--c0ffee-fg`**, never grey tokens.

**Never soften `#0000FF`** for contrast.

## Tokens

`--c0ffee-bg #0a0a0b` · `-fg #ededed` · `-accent #C0FFEE` · `-r/-g/-b` pure primaries ·
`-font` DM Mono 300/400/500 · `-radius 10`. **Surface recipe** = page-bg + inset hairline +
drop shadow, **never a lighter fill**. Full token + type + radius tables in `COMPONENTS.md` §1.

---

## Files in this bundle

```
README.md                      ← you are here
CROSSWORD-FACE-HANDOFF.md      ← SOURCE OF TRUTH — the build directive (read next)
COMPONENTS.md                  ← exhaustive token / geometry / per-component prop spec
prototype/                     ← the HTML design reference (look + behavior)
```

### `prototype/` contents

| File | What it is | Port? |
|---|---|---|
| `Hex Crossword Mobile (Modular).dc.html` | **Canonical** composition — renders all 7 scenes; open this to see the design | reference only |
| `CW-HexBoard.dc.html` | the woven grid — **highest-value**; lift `weaveCell` geometry verbatim | recreate |
| `CW-InputDock.dc.html` | clue-nav + clue-vs-you comparison + toast + keypad | recreate |
| `CW-Keypad.dc.html` | hex keypad (0-9 A-F) + delete/check | recreate |
| `CW-ChannelHints.dc.html` | R/G/B verdict chips | recreate |
| `CW-CluePanel.dc.html` | Across/Down clue list | recreate |
| `CW-TopBar.dc.html` | header + game menu | recreate |
| `CW-Coach.dc.html` | first-run explainer (→ bottom-sheet in prod) | recreate |
| `CW-CompletionCard.dc.html` | solved summary | recreate |
| `CW-ConfirmDialog.dc.html` | destructive-confirm overlay | recreate |
| `CW-LockCallout.dc.html` | crossing-lock popover (→ anchor to cell DOM rect in prod) | recreate |
| `CW-PauseOverlay.dc.html` | paused scrim | recreate |
| `puzzle.js` | **throwaway** — a canvas-only stand-in for the puzzle/play model | **do not port** — the real model is `lib/*` + `CrosswordState` |
| `ios-frame.jsx`, `support.js` | prototype runtime only (device bezel + DC engine) | ignore |

> The component split here is a sensible 1:1 map for the real Web Components, but it is advisory —
> the only hard contract is the five actions + `CrosswordState`/`Layout`.

## Scene → state map

Seven frozen scenes in the composition are real element states of one model. Full table in
`CROSSWORD-FACE-HANDOFF.md` §6: 01 fresh · 02 active slot · 03 cross-propagation (lock callout) ·
04 completion · 05 first-run coach · 06 live (keypad → setDigit/clearDigit/commit) · 07 solved-so-far.

## Viewing the prototype

Open `prototype/Hex Crossword Mobile (Modular).dc.html` in a browser (it self-loads its runtime
and DM Mono from Google Fonts). Each scene renders inside an iOS bezel for context — the bezel is
prototype scaffolding, not part of the face.

## Open questions to confirm before/while building

Non-blocking; all in `CROSSWORD-FACE-HANDOFF.md` §7. In brief: keypad geometry (proposed 4×4 +
delete, full-width Check below); `clearDigit` editing affordance (delete steps back across locks?);
anchor the lock callout to the locked cell's **DOM rect** (the prototype centres on the board);
render Coach as a **bottom-sheet over a dimmed board** (prototype is inline); wire the real timer
tick and prev/next clue-nav `select` dispatches (UI built, intentionally unwired).

## Accessibility — a product call to surface

The R/G/B directional channel hints are a genuine colorblind aid — preserve them. But the swatches
carry no text alternative and the board has no roving focus / ARIA. For a game built entirely on
color discrimination, the blind / low-vision story is a product decision worth raising before build,
not silently dropping at implementation.
