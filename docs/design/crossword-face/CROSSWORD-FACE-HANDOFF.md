# `<c0ffee-crossword>` — face handoff directive

Imperative-shell **markup + scoped CSS** for the crossword's shadow root. The functional core
(`lib/crossword-layout.ts`, `-state.ts`, `-guess.ts`, generator) is shipped and out of scope —
this is the face that translates DOM events into the reducer's **five actions** and renders
`CrosswordState` back to DOM. Of-a-piece with `elements/swatch.ts` / `console.ts`; consumes
`tokens.css` across the shadow boundary.

```
Input surface (the whole contract):  select · setDigit · clearDigit · commit · newPuzzle
Read surface:                        CrosswordState (cells · selected · verdicts · solved · complete)
                                     + Layout (cells row-major · slots · crossings)
```

---

## 1. The color contract — the one invariant the whole face obeys

Recorded in `docs/adr/0007`. Every styling decision below is downstream of this; if a change
violates it, the change is wrong.

| # | Where | Color |
|---|---|---|
| 1 | **Literal Color values** — the clue Swatch + the your-mix Swatch | full saturated (the color itself) |
| 2 | **Channel identity** — active-Slot channel-pair outlines (`[0,1]`R `[2,3]`G `[4,5]`B) | pure `--c0ffee-r/-g/-b` = `#FF0000/#00FF00/#0000FF` |
| 3 | **Status feedback glyph** — check / higher-lower arrow | always neutral (so "green=correct" never collides with "green=channel") |
| 4 | **Transient toasts** | subtle, icon-backed semantic color — the *only* place semantic color is earned |
| 5 | **Persistent status** — wrong-clue mark in the clue list | neutral, icon+text |
| 6 | **Everything else** — cells, locks, chrome | neutral, muted by **opacity off `--c0ffee-fg`**, never grey tokens |

Pure channel color appears in exactly two places: the active-Slot pair outlines and (per the
chip rule below) the channel-identity letter. Nowhere else. **Do not soften `#0000FF`** for
contrast (ADR-0007) — solve blue legibility with layout and surrounding neutrals.

---

## 2. Tokens & elements reused

| Token | Use |
|---|---|
| `--c0ffee-bg` `#0a0a0b` | screen, every card/panel/key surface — **dressed**, never a lighter fill |
| `--c0ffee-fg` `#ededed` | digits / primary text; **all neutral chrome is `color-mix`/rgba off this**, not grey |
| `--c0ffee-accent` `#C0FFEE` | brand, "you", primary action, selection ring, focus-visible |
| `--c0ffee-r/-g/-b` | channel identity only (contract #2) |
| `--c0ffee-font` | DM Mono 300/400/500 throughout |
| `--c0ffee-radius` `10px` | standard control radius; deliberate one-offs (cell 6, panel 16/18, pill 999) kept inline, matching the console |

**Surface recipe** (from `swatch.ts` `.chip.a` / console `.card`): `background: var(--c0ffee-bg)`
+ `box-shadow: inset 0 0 0 1px rgba(255,255,255,.06–.12), <drop shadow>`. Reuse it for the
board panel, dock, keypad keys, clue chips, toasts.

**Element reuse is visual, not behavioral.** Hand-roll the in-game clue chips against the
surface tokens — do **not** mount `<c0ffee-swatch>`: it emits `colorchange` / "click to load",
and the crossword deliberately opts out of ADR-0001 URL reflection (it holds many colors). A
mounted swatch would hijack the hash with a clue color. The 72px comparison blocks are
hand-rolled regardless (stages, not chips).

---

## 3. Shell skeleton — shadow-root structure + shared CSS

A full-height flex column. Same skeleton renders all seven scenes; scenes differ only by which
parts mount and the `CrosswordState` they project.

```html
<style>
  :host { display:block; font-family:var(--c0ffee-font, monospace); color:var(--c0ffee-fg,#ededed); }
  *,*::before,*::after { box-sizing:border-box; }

  /* mobile-first fluid; centered, clamped column on wide viewports (ADR-0005) */
  .screen { display:flex; flex-direction:column; min-height:100%;
            width:100%; max-width:430px; margin:0 auto; background:var(--c0ffee-bg,#0a0a0b); }

  /* surface recipe — page bg dressed, never a lighter fill */
  .panel { background:var(--c0ffee-bg,#0a0a0b); border-radius:16px;
           box-shadow:inset 0 0 0 1px rgba(255,255,255,.18), 0 16px 34px -20px rgba(0,0,0,.85); }

  /* board: fluid, % geometry off an aspect-locked square (no magic px) */
  .board { position:relative; width:100%; max-width:252px; aspect-ratio:6/6; margin:0 auto; }
  .cell  { position:absolute; display:flex; align-items:center; justify-content:center; }
  .cell .glyph { position:relative; z-index:3; font:400 21px/1 var(--c0ffee-font); color:var(--c0ffee-fg); }
  /* woven base, lock badge, active-pair outline, clue numbers — see §4 */

  /* the keeper "aha": clue vs your-mix (the only saturated color besides the active outline) */
  .compare { display:flex; gap:10px; }
  .stage   { flex:1; height:72px; border-radius:12px; box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); }
  .stage.mix { box-shadow:inset 0 0 0 2px var(--c0ffee-accent,#C0FFEE); }   /* "you" */

  /* channel chips: identity letter colored (contract #2), glyph neutral (contract #3) */
  .chip   { display:inline-flex; align-items:center; gap:3px; }
  .chip .id   { font:500 11.5px/1 var(--c0ffee-font); }
  /* identity letters use MUTED tints (legible at 11px); the pure primary stays on the
     grid pair-outline, which is the structural signifier. Pure #0000FF text is invisible. */
  .chip.r .id { color:#ff6a6a; }
  .chip.g .id { color:#46e87f; }
  .chip.b .id { color:#7aa6ff; }
  .chip .glyph svg { stroke:rgba(255,255,255,.8); }   /* never channel-colored */

  /* hex keypad — 0-9 A-F + delete; ≥44px hit targets */
  .keypad { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
  .key { min-height:44px; border:none; border-radius:var(--c0ffee-radius,10px);
         background:var(--c0ffee-bg,#0a0a0b); box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);
         color:var(--c0ffee-fg); font:400 18px/1 var(--c0ffee-font); cursor:pointer; }
  .key:focus-visible { outline:2px solid var(--c0ffee-accent,#C0FFEE); outline-offset:2px; }

  /* toasts — the one place semantic color is allowed (contract #4) */
  .toast { display:inline-flex; align-items:center; gap:8px; padding:10px 14px; border-radius:10px; }
  .toast.warn  { background:#241c0c; box-shadow:inset 0 0 0 1px rgba(240,180,80,.5); color:#f1c074; }
  .toast.win   { background:#0d2417; box-shadow:inset 0 0 0 1px rgba(60,235,120,.55); color:#7be8a5; }
  .toast.wrong { background:#2a1212; box-shadow:inset 0 0 0 1px rgba(255,80,80,.5); color:#ff8b8b; }
</style>

<div class="screen">
  <header class="topbar"><!-- timer · pause · menu (clear/new) --></header>
  <div class="board" id="board"><!-- §4 --></div>
  <section class="dock panel"><!-- §5 — OR the coach card / completion card per scene --></section>
  <!-- overlays: confirm dialog, pause scrim, lock callout (absolute, inset 0) -->
</div>
```

---

## 4. Board — render from `Layout` + `CrosswordState`

Walk `layout.cells` (row-major → grid dims). Each live cell positioned by percentage:

```js
// for cell {row,col}: pull play state and render
const st = state.cells[`${row},${col}`];        // { digit:'0'..'F'|null, locked:boolean }
// left = col/cols*100%  top = row/rows*100%  w = 100/cols%  h = 100/rows%
```

- **Woven base** (the basket-weave look): pair cells in 2s; inset 2px on every *closed* side,
  0 on open sides; corner radius 6 unless an adjacent edge is open; hairline `rgba(255,255,255,.22)`
  on closed sides. (Algorithm verbatim in the prototype's `CW-HexBoard.weaveCell` — lift it; it's
  pure geometry off the solution dims.)
- **Digit**: `st.digit` in `.glyph`. Empty → nothing.
- **Lock badge** (`st.locked`, derived by the reducer from filled crossings): small neutral
  padlock, top-right, `stroke:var(--c0ffee-fg)`, opacity .65. Crossings come from `layout.crossings`.
- **Active-Slot pair outlines** — contract #2. For `state.selected`, take that slot's 6 cells in
  order and outline pairs `[0,1]/[2,3]/[4,5]`:

```html
<!-- one per pair, positioned over the two cells -->
<div class="pair" style="box-shadow: inset 0 0 0 1.4px #FF0000; background: rgba(255,0,0,.08);"></div>
<!-- pair 2: #00FF00 / rgba(0,255,0,.08)   pair 3: #0000FF / rgba(0,0,255,.10) -->
```

- **Clue numbers**: `layout.slots` → across = left-edge label, down = top label, neutral
  `rgba(255,255,255,.74)`.
- **Completion variant**: drop the weave (uniform inset-2 / radius-6 cells), layer the solved
  across/down colors per cell, add the bloom flourish (`@keyframes` self-contained).

---

## 5. Dock — the keeper aha + entry

Three bands, mounted by scene. **The clue-vs-your-mix comparison is the central teaching device —
it is not replaced by anything.**

- **Comparison** (big): two 72px stages side by side — `.stage` painted the clue color (literal,
  saturated), `.stage.mix` painted the player's current mix with the accent "you" ring. Mix
  empty → a `?` placeholder ringed in accent. This + the active-Slot outline are the only
  saturated color on screen.
- **Channel chips** (`CW-ChannelHints`): one per channel from `state.verdicts["{num}-{dir}"]`
  (`{red,green,blue:'higher'|'lower'|'correct'}`). Identity letter colored (#2), arrow/check
  **neutral** (#3). `correct`→check, `higher`→up arrow (go higher), `lower`→down arrow.
- **Keypad**: 0-9, A-F, **delete**. Wiring:

```js
key.onclick      = () => dispatch({ type:'setDigit',   cell: activeCell(), digit: ch });
deleteKey.onclick= () => dispatch({ type:'clearDigit', cell: activeCell() });   // new action
checkBtn.onclick = () => dispatch({ type:'commit' });
// slot nav → dispatch({ type:'select', slot:{number,direction} })
```

`setDigit` fills the active slot L→R skipping locked cells; the reducer locks a crossing on a
correct channel, so a shared cell updates in both directions with **no propagation code in the
face** (one Cell object, keyed `"row,col"`). Toast on `commit`: incomplete→`warn`, all-match→`win`,
else→`wrong` (transient; contract #4).

---

## 6. Scene → state map (the seven frozen scenes are real element states)

| # | Scene | `CrosswordState` | Parts shown |
|---|---|---|---|
| 01 | Fresh puzzle | empty cells, `selected:null` | board + clue list |
| 02 | Active slot, mid-solve | some digits, `selected` set | board (active outline) + dock(big) |
| 03 | Cross-propagation | a filled crossing → `locked` cell | board + dock(compact) + **lock callout** |
| 04 | Completion | `complete:true`, all `solved` | done topbar + solved board + completion card |
| 05 | First-run explainer | any | board + **coach card** (bottom-sheet over dimmed board in prod) |
| 06 | Live | `guess` slot + verdicts | board + dock(big) live (keypad → setDigit/clearDigit/commit) |
| 07 | Solved so far | per-clue `verdicts` | board + clue list (you-vs-clue, neutral marks) |

---

## 7. Open questions

1. **Keypad layout** — proposing 4×4 (0-9, A-F) + a delete key, Check as a full-width row
   beneath. Confirm geometry / where delete sits.
2. **Editing affordance** now that `clearDigit` exists — delete = clear the last filled editable
   cell and step back across locks? And is there a clear-whole-slot gesture, or only the menu's
   "clear all"?
3. **Channel-identity legibility — RESOLVED.** Chip identity letters use muted, legible tints
   (`#ff6a6a/#46e87f/#7aa6ff`); the pure primary stays on the grid pair-outline (the structural
   signifier). Pure `#0000FF` as small text was effectively invisible on the near-black surface.
   This keeps the colour-on-letters that Q1 asked for, readable. (Outline pure, text muted — the
   ADR-0007 "solve by layout, not desaturation" still holds for the outline.)
4. **Lock callout positioning** — anchor the popover to the locked cell's DOM rect (not the
   prototype's centred-board identity).
5. **Coach** — confirm bottom-sheet over a dimmed board in production (prototype renders it inline).
6. **Timer tick / clue-list routing / prev-next** — UI is built; needs the controller hooks
   (interval, `select` dispatch on prev/next).

---

## 8. Out of scope (do not rebuild)

- Puzzle generation, per-channel grading, the reducer, all hex/color math — `lib/*`, shipped.
- The play-model data structure — it **is** `CrosswordState`; the prototype's `puzzle.js` is
  throwaway and does not port.
- URL reflection — the crossword opts out of ADR-0001 by design.
- Zoom / enlarge-swatch modal — deferred (`CW-EnlargeModal` later).
- The legacy `Hex Crossword Mobile.dc.html` — frozen reference, ignore.
