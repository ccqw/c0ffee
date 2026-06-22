# Crosshatch — component & token spec

Handoff notes for porting the **Hex Color Crossword** UI into a real codebase (React/Vue/etc.)
and plugging in puzzle-generation logic. The modular canvas
(`Hex Crossword Mobile (Modular).dc.html`) is the reference implementation: one composition
file that imports the reusable components below and feeds them **data**. All puzzle data and
game logic lives in one engine, **`puzzle.js`** (`window.HexPuzzle`) — the composition derives
every value from it. Map each component below 1:1 to a component in your framework; map the
tokens to your theme file; port `puzzle.js` into your controller/store almost verbatim.

> **Canonical source of truth: `Hex Crossword Mobile (Modular).dc.html`.** All new work lands
> there. `Hex Crossword Mobile.dc.html` is a **frozen legacy snapshot** — the original
> hand-built canvas, kept for reference only. Do not dual-maintain it; where the two have
> diverged, the modular file wins. (Its coach is still inline by design — the legacy file
> demonstrates the no-component build.) All new parts are prefixed `CW-`.

---

## 1. Design tokens

Everything is monospace, dark, with a single mint accent. No gradients, no rounded-card +
left-border clichés.

### Color

| Token | Value | Used for |
|---|---|---|
| `app.bg` | `#0a0a0b` | phone screen, panels, keys |
| `page.bg` | `#161619` | showcase background only |
| `menu.bg` | `#161618` | dropdown menu surface |
| `ink` | `#ededed` | primary text / digits |
| `ink.dim` | `rgba(255,255,255,.70)` | secondary text |
| `ink.faint` | `rgba(255,255,255,.50)` | tertiary / counts |
| `accent` | `#C0FFEE` | brand, "you", primary actions |
| `accent.ink` | `#06281f` | text on a mint fill |
| `hair` | `rgba(255,255,255,.22)` | grid weave hairlines |
| `stroke` | `rgba(255,255,255,.18)` | panel + control outlines (one value, normalized) |
| `faint` | `rgba(255,255,255,.08)` | subtle dividers / header underline |
| `danger.ink` | `#ffb27a` | destructive confirm |
| `danger.bg` | `#2a1410` | destructive confirm button |
| `danger.ring` | `rgba(255,140,90,.5)` | destructive confirm outline |

### Channels (R / G / B)

| Channel | Text | Glow base |
|---|---|---|
| R | `#ff6a6a` | `rgba(255,80,80,a)` |
| G | `#46e87f` | `rgba(60,235,120,a)` |
| B | `#7aa6ff` | `rgba(95,140,255,a)` |

Active-slot tint: `rgba(60,235,120,.20)`.

### Toasts

| Kind | bg | ring | text |
|---|---|---|---|
| warn | `#241c0c` | `rgba(240,180,80,.5)` | `#f1c074` |
| win  | `#0d2417` | `rgba(60,235,120,.55)` | `#7be8a5` |
| wrong| `#2a1212` | `rgba(255,80,80,.5)` | `#ff8b8b` |

### Type — `DM Mono`, weights 300 / 400 / 500

| Role | Style |
|---|---|
| Brand | `500 16px` |
| Grid digit | `400 21px` |
| Clue title | `400 14px` |
| Heading (coach/lock) | `400 21px/1.25` |
| Body | `400 13px/1.6` |
| Keypad digit | `400 18px` |
| Micro-label (uppercase) | `400 9.5px`, `letter-spacing .1–.16em` |

### Radii & metrics

Cell `6` · keypad key `9` · toast `10` · button `11` · popover/menu `13` · panel `16` ·
big swatch `18`. Cell box = `42px`, inner inset `2px`. **Min hit target `44px`** (enforced on
every icon button via 44px min-height/width + negative margins so visual size is unchanged).
Board = 6×6 cells = `252×252`.

The canonical palette is also declared as CSS custom properties in the composition's
`<style>` `:root` (`--cw-bg`, `--cw-ink`, `--cw-accent`, `--cw-hair`, `--cw-stroke`,
`--cw-faint`, `--cw-ch-r/g/b`). Inline-style literals in the markup mirror these one-to-one —
map the vars to your theme and the literals follow. White-stroke opacities were collapsed
from ~9 ad-hoc values to the three above.

**Animations are self-contained.** Each component that uses a keyframe animation now
declares it in its own `<helmet>` (`CW-HexBoard` → `@keyframes cw-bloom` / `.cw-cell`;
`CW-CluePanel` → `cw-twinkle` + `cw-glow` / `.cw-spark` + `.cw-match`), so the motion
survives when a component is imported, previewed standalone, or ported out on its own. The
composition still declares the same keyframes defensively, but they are no longer the single
source. **One required global remains:** the `:focus-visible` mint focus ring lives only in
the composition's `<style>` — in your app, put the equivalent rule in your global stylesheet
so every button keeps a visible keyboard-focus state.

**Channel feedback is split by purpose.** The board shows the **R/G/B colour-coding** of the
selected slot (structural — which cell-pairs are red/green/blue) via `CW-HexBoard`'s `channelSlot`
(derived in cell coords; the raw `overlays` prop remains for arbitrary rects), *without* any
verdict glyph. The **graded verdict** (matched / go-higher / go-lower) lives only in
the dock chips (`CW-ChannelHints`), and its "matched" glyph is a neutral grey check (same weight
as the arrows), not green.

---

## 2. Puzzle data model (the generator's contract)

The board renders entirely from a solution grid. `CW-HexBoard` knows the geometry; the
generator only needs to emit this:

```js
// 6 rows × 6 cols, '.' = blank cell
SOLUTION = ['3A7BD5', 'C.2.4.', '9.B.5.', 'FA8C00', '6.1.9.', 'E.F.C.'];

ENTRIES = {
  across: [{ num: 1, row: 0, col: 0, answer: '3A7BD5', color: '#3A7BD5' },
           { num: 4, row: 3, col: 0, answer: 'FA8C00', color: '#FA8C00' }],
  down:   [{ num: 1, row: 0, col: 0, answer: '3C9F6E', color: '#3C9F6E' },
           { num: 2, row: 0, col: 2, answer: '72B81F', color: '#72B81F' },
           { num: 3, row: 0, col: 4, answer: 'D4509C', color: '#D4509C' }],
};
```

A hex answer is 6 digits = `#RRGGBB`; each across/down word is 6 cells. Crossings are the
shared (lockable) cells. Clue numbers sit at word starts: `(0,0)=1 (0,2)=2 (0,4)=3 (3,0)=4`.

### This now lives in `puzzle.js` (the single source of truth)

`SOLUTION` + `ENTRIES` are declared **once** in `puzzle.js`; everything else is derived, so
nothing is hand-maintained anymore (the old duplicate `SOLUTION` / `ACROSS_ROW` / `DOWN_COL` /
`TARGET` literals are gone). `window.HexPuzzle` exposes:

```js
{ SIZE, CELL, BOARD,            // 6, 42, 252
  SOLUTION, ENTRIES,            // the canonical puzzle (above)
  live(r,c), cellsOf(entry,dir),
  acrossRowColors(), downColColors(),   // { startRow|startCol : color } — derived from ENTRIES
  crossings(),                  // [{row,col,across,down}] — the lockable cells, derived
  channelOf(hex,i), channelVerdict(guessHex,answerHex),  // 'match' | 'up' | 'down' per R/G/B
  mixColor(digits), isComplete(digits), matchesAnswer(digits,answerHex),
  fmtTime(s) }
```

The composition loads it (injects the `<script>` in `componentDidMount`, re-renders on load),
then reads `solution`/cell maps/verdicts from it and passes `solution="{{ solution }}"` to every
`CW-HexBoard`. `CW-HexBoard` keeps its own `static SOLUTION` only as a **standalone-preview
default**; the operative grid is always the one fed in.

### Woven-border rule (in `CW-HexBoard.weaveCell`)

Cells pair up in 2s for the basket-weave look. For a live cell `(r,c)`:

```
openRight = c even && live(r, c+1)      openLeft = c odd && live(r, c-1)
openDown  = r even && live(r+1, c)      openUp   = r odd && live(r-1, c)
inset:  2px on every CLOSED side, 0 on open sides
radius: a corner is rounded(6) unless either of its two edges is open
shadow: 1px hairline inset on each CLOSED side
corner: a 2px filler at the inner notch where an open-H meets an open-V edge
```

`variant:"solved"` skips the weave — uniform `inset:2 radius:6` cells with color layers +
the bloom flourish (`.cw-cell`).

---

## 3. Components

All live at project root as `CW-*.dc.html`, mounted with
`<dc-import name="CW-Foo" prop="{{ value }}">`. Props are kebab-cased in markup
(`timer-text` → `timerText`).

### `CW-HexBoard` — the woven grid
Renders the board from the solution + per-frame display state. The single highest-value
component; it's exactly what the generator feeds.

| Prop | Type | Notes |
|---|---|---|
| `variant` | `'weave' \| 'solved'` | weave = playing; solved = completion |
| `cells` | `Record<"r,c", {v?, tint?, lock?, layers?}>` | per-cell overrides: digit, bg tint, lock badge, color layers |
| `overlays` | `Array<{left,top,width,height,bg?,ring,icon?}>` | channel bars over a word; `icon: check\|up\|down` |
| `showNumbers` | `boolean` | outside clue-number labels |
| `spotlight` | `"row,col"` | dims the board + screen and rings that one cell (frame 03 lock callout). Drawn in cell coordinates, so it always lands on the cell — no external positioning math. |
| `channelSlot` | `"row,col[,dir]"` | lays 3 R/G/B channel bars over the 6-cell word starting at (row,col); `dir` = `across` (default) or `down`. Rects are **derived in cell coordinates** (like `spotlight`) — the parent no longer hand-codes overlay pixels. |
| `solution` | `string[]` | defaults to the canonical grid (standalone preview); the composition always passes the engine's `SOLUTION` |
| `cell` | `number` | natural px per cell (default `42`). Sets the board's **max-width** (`cols·cell`) and aspect ratio — it does not hard-size the board |
| `numbers` | `Array<{n,row,col,dir}>` | clue-number labels. Omit and the board derives them from `window.HexPuzzle.ENTRIES` (then a static fallback) |

**Responsive / fluid.** The board is no longer pixel-locked. It fills its container up to its
natural size (`cols·cell`, default 252px) and every cell, overlay, spotlight and channel bar
is positioned as a **percentage** of an `aspect-ratio`-locked square — so it scales to any
phone width with no JS and no magic pixels. Geometry is derived from the solution's own
dimensions (`rows = solution.length`, `cols = solution[0].length`); there is no longer a
hard-coded `6` / `42` / `252` anywhere in the board. To let the board grow **larger** than
252px in a real layout, raise (or drop) `cell`; the showcase keeps the 252px cap so the
frames render identically.

### `CW-InputDock` — clue-nav + guess band + keypad
The whole below-board input region, previously inlined verbatim in three frames. Wraps the
clue-nav header (Clue list / prev / next), the clue-vs-you comparison band, the transient toast,
and `CW-Keypad`. One component now serves frames 02 (static big), 03 (compact, behind the lock
callout) and 06 (live).

| Prop | Type | Notes |
|---|---|---|
| `band` | `'big' \| 'compact'` | big = two stacked swatches (02/06); compact = one inline row (03) |
| `clueLabel` | `string` | e.g. `"1-Across"` |
| `clueColor` | `string` | the clue swatch colour |
| `mixColor` | `string \| null` | your-mix swatch; `null` → empty **"?"** placeholder (big band) |
| `mixBadge` | `boolean` | show the small **"you"** corner tag on the mix swatch |
| `mixCheck` | `boolean` | show a check glyph inside the mix swatch (solved) |
| `countText` | `string \| null` | digit counter (`"3 / 6"`); when set it replaces the channel hints |
| `chR / chG / chB` | `'match' \| 'up' \| 'down' \| null` | channel hints (hidden when `null` or when `countText` is shown) |
| `toastKind` | `'warn' \| 'win' \| 'wrong' \| null` | transient toast above the keypad |
| `toastVis / toastShift` | `string` | live opacity / translateY for the toast transition |
| `press / onDelete / onCheck` | keypad handlers | forwarded to `CW-Keypad`; omit for a static keypad |
| `checkLabel` | `string` | default `"Check guess"` |
| `onClueList / onPrev / onNext` | `() => void` | clue-nav (still stubbed — see §5) |

### `CW-TopBar` — header + game menu
| Prop | Type | Notes |
|---|---|---|
| `mode` | `'play' \| 'done'` | done = elapsed + trophy, no controls |
| `timerText` / `timerHidden` | `string` / `bool` | clock display |
| `doneTime` | `string` | shown in done mode |
| `menuOpen` | `bool` | controls the kebab dropdown |
| `onToggleTimer / onPause / onCheckAll / onToggleMenu / onCloseMenu / onClear / onNew` | `() => void` | |

### `CW-Keypad` — hex keypad + delete/check row
| Prop | Type | Notes |
|---|---|---|
| `press` | `Record<'k0'..'kF', () => void>` | per-digit handlers; omit for a static (display-only) keypad |
| `onDelete / onCheck` | `() => void` | |
| `checkLabel` | `string` | default `"Check guess"` |

### `CW-CluePanel` — Across/Down clue list
| Prop | Type |
|---|---|
| `across` / `down` | `Array<{num, clue: color, you: 'q' \| 'match' \| color, wrong?: bool, connector?: 'arrow' \| 'spark'}>` |

`you` row states (frame 07 shows all of them at once):
- `'q'` (or omit) → not tried: empty **"?"** cell, plain clue swatch, arrow connector.
- `'match'` → solved: glowing clue swatch + check, **spark** connector, glowing "you" swatch.
- a color string **+ `wrong:true`** → attempted but wrong: plain clue swatch, arrow connector,
  the guessed color as a "you" swatch with an **✕**.
- a color string alone → an un-verdicted guess (mid-solve), plain colored "you" swatch.

### `CW-ChannelHints` — R/G/B status chips
| Prop | Type | Notes |
|---|---|---|
| `r` / `g` / `b` | `'match' \| 'up' \| 'down'` | check / go-higher / go-lower |

### `CW-Coach` — first-run how-to-play card
Two-step explainer ("Every clue is a colour" → "Read the channel hints"). Owns its own step
state internally; Next/Back move between steps, the dots track progress.

| Prop | Type | Notes |
|---|---|---|
| `onSkip` | `() => void` | tapped "Skip"; omit and it just resets to step 0 (demo loop) |
| `onDone` | `() => void` | tapped "Got it" on the last step; omit and it resets to step 0 |

**Mount contract — the anchor rule.** The card renders at `height:100%` and **must be mounted
inside a sized box**, never dropped straight into normal flow. In the composition it sits in a
deterministic region between the board and the home indicator:

```html
<!-- screen is a full-height flex column: status pad / TopBar / HexBoard / THIS -->
<div style="flex:1;min-height:0;display:grid;grid-template-rows:1fr;
            padding:6px 18px 42px;box-sizing:border-box;">
  <dc-import name="CW-Coach" hint-size="100%,100%"></dc-import>
</div>
```

- The wrapper is `flex:1` so it always fills exactly the leftover space; the `grid` +
  `grid-template-rows:1fr` gives the import host a **definite** height (a plain flex/block child
  would collapse to content height — the dc-import host is a content-sized block, so the card's
  own `flex:1` does **not** reach the screen column). The card's `height:100%` then resolves
  against it.
- The wrapper's `padding:6px 18px 42px` is the only place the spacing lives: `6` top, `18`
  sides, and **`42` bottom = home-indicator clearance (34px indicator + 8px breathing)**.
- Internally the card is a flex column: header (`flex:none`) / content (`flex:1`,
  `justify-content:center`, `overflow:hidden`) / footer (`flex:none`). **The footer is pinned
  to a fixed bottom and the content area clips rather than pushing it down** — so the card
  bottom is identical on every step and can never overflow the phone again, regardless of how
  much copy a step holds. Keep step content under the content-area height (trim copy before you
  let it grow); it will center, not overflow.

In a real app, render this as a bottom-sheet over a dimmed board rather than inline.

### `CW-ConfirmDialog` — destructive "are you sure?" overlay
`shown, title, desc, cta, onCancel, onConfirm`. Position: absolute inset-0 over the screen.

### `CW-PauseOverlay` — paused scrim
`shown, elapsed, onResume`.

### `CW-CompletionCard` — solved summary card
The completion summary (trophy header, summary line, swatch row, New-puzzle / Share buttons).
Previously inlined in frame 04. Presentational — the parent derives its data from the engine.

| Prop | Type | Notes |
|---|---|---|
| `swatches` | `string[]` | the solved colours; parent passes `[...across.color, ...down.color]` from `ENTRIES` |
| `count` | `number` | colours placed (defaults to `swatches.length`) |
| `summary` | `string` | overrides the auto line `"{count} colors placed · all channels matched"` |
| `newLabel` / `shareLabel` | `string` | button labels |
| `onNew` / `onShare` | `() => void` | omit for static (frame 04 leaves them stubbed) |

### `CW-LockCallout` — “cell is locked” explainer
The crossing-lock popover (frame 03): why a shared cell can't be changed. Previously inlined.
The **parent positions the mount** (absolute) and supplies the arrow style; the component owns
the card and the two role swatches.

| Prop | Type | Notes |
|---|---|---|
| `value` | `string` | the locked digit shown in both role cells |
| `aLabel` / `aHue` / `aRing` | `string` | first role: clue label, colour-word, ring colour |
| `bLabel` / `bHue` / `bRing` | `string` | second role |
| `arrowStyle` | `string` | full inline style for the pointer (parent derives it from cell geometry) |

---

## 4. State the composition owns (lift into your store)

The composition's logic class centralizes everything (no per-frame `confirmShown1..6`
duplication — that smell from the original is gone). One `state` object drives all frames:

```
{ t, paused, timerHidden, openMenu, confirm:{kind,frame}, guess[], checked, toast }
```

(Coach step state now lives inside `CW-Coach`; the composition no longer tracks it.)

- **menu / confirm** are keyed by frame id (`openMenu === id`), so one set of handlers serves
  every frame.
- **frame 06** is the live demo: `guess[]` + `checked` drive the keypad, the live mix swatch,
  `CW-ChannelHints`, and the transient toast. The answer is `ENTRIES.across[0].answer`
  (1-Across = `3A7BD5`), read from the engine — no hard-coded `TARGET`.
- **frame 04** completion: `CW-CompletionCard`'s swatches are derived in `renderVals` as
  `[...ENTRIES.across.map(e=>e.color), ...ENTRIES.down.map(e=>e.color)]` and `count` from their
  length — no hand-listed hex. The done-time routes through `fmtTime` too.
- **check** is a single `check()` method (the old identical `checkGuess` + `checkAll` pair was
  collapsed); all hex/channel math routes through `puzzle.js`.
- The clock is intentionally static (frozen scenes); wire a real interval when you add play.

---

## 5. Not yet ported (intentional)

- **Zoom / enlarge-swatch modal** from the original — a secondary tap interaction. Re-add as
  a `CW-EnlargeModal` overlay component when needed; the clue/board cells would expose an
  `onZoom(label,color)` callback.
- Real timer tick, prev/next clue navigation, and back-to-clue-list routing are stubbed
  (static buttons on `CW-InputDock`, props `onPrev` / `onNext` / `onClueList`) — UI-complete
  but not wired, ready for the generator/controller.
- **Lock-callout popover (frame 03)** is now its own component, `CW-LockCallout`, but it is
  still *positioned* from a centring identity (popover centre == centred board centre), derived
  from the engine's `CELL` / `BOARD` — no magic pixels, but it still assumes the board is
  horizontally centred. In a real app, anchor the popover to the locked cell's DOM rect instead.
- **Interaction model still to define:** active-slot selection, how typing fills a slot
  (left→right, skipping locked cells), backspace across a lock, auto-advance on a full word, and
  whether Check is per-clue or whole-board. The scenes show the *states*; the state machine that
  moves between them is the main thing left to design.

---

## 6. Play model — the missing layer (build this first)

> **⚠ SUPERSEDED (later in the project).** This section was written before we confirmed the real
> engine. The play model is **not** missing — it ships as `CrosswordState` + the reducer in
> `lib/crossword-state.ts` (repo `ccqw/c0ffee`), and `puzzle.js` here is throwaway. Do **not**
> build a reducer or a `GameState`. The authoritative handoff is **`CROSSWORD-FACE-HANDOFF.md`**;
> the notes below are kept only as a record of the gap analysis that led there.


> **The single biggest handoff gap.** `puzzle.js` models the *puzzle* (solution, entries,
> crossings, verdicts) but nothing here models the *play* — the grid the user is actively
> filling. Every in-progress scene **fakes that layer with per-frame fixture literals**, so the
> "data-driven" property is currently true of geometry and colour, but **not** of player state.
> A dev's first question — "what is the shape of game state?" — has no answer in code yet. This
> section specifies the shape so it can be implemented rather than reverse-engineered from
> screenshots.

### Where the fixtures stand in for real state (what to replace)

- `f2cells` / `f3cells` / `f6cells` / `f7cells` in the composition's `renderVals` are
  hand-authored `{ "r,c": { v } }` maps — they should be a **projection of one player grid**.
- `cluesPending` / `cluesStatus` are hand-authored clue rows (incl. `you:'match'`, `wrong`) —
  they should be **derived** by comparing the player grid against `ENTRIES`.
- `f3cells` hardcodes `{ v:'7', lock:true }`; the lockable cells are already derivable from
  `HexPuzzle.crossings()` — the lock badge should read from there, not a literal.
- `guess[]` is a single flat 6-char array for **one** slot (1-Across). There is no per-cell
  board state, no active-slot pointer, no word→cell mapping, and no cross-propagation (frame 03
  *shows* propagation; the data behind it is a literal).

### Proposed shape (put this in `puzzle.js`, next to the puzzle model)

```js
// The player's live grid — the one object every component should project from.
GameState = {
  cells: Record<"r,c", { value: '0'..'F' | null, locked: boolean }>, // locked = a filled crossing
  activeSlot: { num, dir: 'across'|'down' } | null,
  status: 'playing' | 'solved',
}
```

### Reducer skeleton (the "state machine §5 alludes to")

```js
// Pure transitions — port verbatim into your store (Redux/Zustand/reducer/etc.).
selectSlot(state, { num, dir })        // sets activeSlot
typeDigit(state, ch)                    // writes into the active slot L→R, skipping locked cells;
                                        //   propagates into the crossing cell (so the crossed
                                        //   word updates too); auto-advances; no-op when full
backspace(state)                        // clears last editable cell; steps back across locks
checkSlot(state, slot)                  // → 'win' | 'wrong' | 'warn'(incomplete) via channelVerdict
checkAll(state)                         // whole-board variant; sets status='solved' on all-match
// Selectors the components already want:
cellsForBoard(state)        → the { "r,c": {v,tint,lock} } map CW-HexBoard takes
clueRows(state, dir)        → the CW-CluePanel row array (you-state derived from cells vs ENTRIES)
```

Once this exists, the four `f*cells` fixtures and both `clues*` objects collapse into
`cellsForBoard(state)` / `clueRows(state, dir)` calls, and every frame becomes a genuine
snapshot of one model rather than an independent screenshot.

---

## 7. Other handoff notes (not blocking, but read before porting)

- **Single-source-of-truth leaks → colour drift.** Several clue colours are re-typed as
  literals instead of read from `ENTRIES`: the `clue-color="#3A7BD5"` / `mix-color="#3A8040"`
  attrs on the `CW-InputDock` mounts (frames 02/03/06), and the hex in `cluesPending` /
  `cluesStatus`. (`solvedSwatches` *does* derive correctly — copy that pattern.) Swap the
  generator's puzzle and these frames show **stale colours**. When wiring real state, route every
  clue colour through `ENTRIES[*].color` and every lock through `crossings()`.

- **`puzzle.js` is a global-singleton IIFE — convert it on the way in.** It assigns to
  `window.HexPuzzle`, and the composition injects a `<script>` tag in `componentDidMount`, polls
  for the global, and paints hint-placeholders until it lands (the brief flash on load). That is
  a canvas-runtime accommodation, **not** a real-app pattern — "port almost verbatim" means
  *port the logic*, but the delivery should become a normal ES module (`export const SOLUTION …`)
  you `import` synchronously. The load-and-poll dance and the `if (!P) return {}` early-return in
  `renderVals` both disappear in a real build; don't carry the singleton forward.

- **Lock-callout positioning** (`lockGeom`) is geometry-correct but assumes the board is
  horizontally centred (popover centre == board centre). Anchor the popover to the locked cell's
  **DOM rect** in the real app; the engine's `CELL`/`BOARD` give the offset, the centring identity
  is the fragile part.

- **Stubbed-but-fine:** real timer tick, prev/next clue nav, and clue-list routing are
  UI-complete and intentionally unwired (see §5) — no action needed beyond connecting them to the
  reducer above.

- **Accessibility of a colour game (product decision, not just dev work).** The R/G/B directional
  channel hints (`CW-ChannelHints`: matched / go-higher / go-lower) are a real colourblind aid and
  worth preserving. But the swatches themselves carry no text alternative and the board grid has
  no roving focus / ARIA. For a game built entirely on colour discrimination, the blind /
  low-vision play story is a **product** call to make before build — surface it; don't leave it to
  be silently dropped at implementation time.
