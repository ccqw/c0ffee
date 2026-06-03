# Handoff: c0ffee · Color Console + Site Header

## Overview
This package contains the redesigned **Color Console** (the flagship RGB/HSV color
instrument) and the new **site header** for **c0ffee cafe** — an educational tool
that teaches how RGB and hex color work on computer displays, doubling as a
precise color picker for devs/designers.

The design goal throughout: **a beautiful instrument that reveals how color works**.
Faithful, un-stylized channel colors; the additive mix shown literally; hex
place-value made visible. Clean and focused — the color does the talking.

This is **mobile-first** and responsive (matches ADR-0005).

---

## About the Design Files
The files in this bundle are **design references created in HTML/React** —
prototypes showing the intended look and behavior. They are **not** production
code to copy verbatim.

Your repo (`ccqw/c0ffee`) is built as **TypeScript Web Components** with a
functional-core / imperative-shell split (ADR-0003) and `--c0ffee-*` design
tokens in `tokens.css` as the single source of design truth (ADR-0002). The task
is to **recreate these designs in that existing architecture** — port the visuals
and interactions into `elements/console.ts`, `elements/banner.ts`, etc., reusing
your established patterns. The prototype's own color math (`c0ffee/color.js`) was
ported *from* your `lib/color.ts`, so it should map back cleanly.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, slider styling, and
interactions are all specified below to exact values. Recreate pixel-faithfully.

---

## Screens / Views

### 1. Site Header (`c0ffee/banner.js` → port to `elements/banner.ts`)
A full-width bar. **Not a lockup** — wordmark on the left, logo badge in the right
corner.

- **Layout:** `display:flex; align-items:center; justify-content:space-between;
  gap:16px; padding:16px 20px;`
- **Left — wordmark:** the text `#C0FFEE cafe`
  - Font: **DM Mono**, weight **400**, size **26px**, `letter-spacing:.01em`,
    `white-space:nowrap`.
  - `#` — muted: `color-mix(in srgb, var(--c0ffee-fg) 52%, transparent)`.
  - `C0FFEE` — `var(--c0ffee-fg)` (#ededed), **except the `0`** which is
    `var(--c0ffee-accent)` (#C0FFEE mint). This is the hex-pun: the zero is the
    brand color.
  - `cafe` — `var(--c0ffee-fg)`, with `margin-left:.5ch`.
- **Right — logo badge:** circular pixel-cup mark.
  - `width:60px; height:60px; border-radius:50%; background:#000; overflow:hidden;`
    `box-shadow:0 0 0 1px rgba(255,255,255,.06);` centered flex.
  - Image: `pixie-badge.png`, `width:100%; height:100%; object-fit:contain;
    image-rendering:pixelated;` (the badge PNG is pre-cropped square around the
    cup so it centers in the circle with no dead corners).

### 2. Color Console (`studio/parts.jsx` + `studio/layouts.jsx` → `elements/console.ts`)
One card holding a single Color value. Every sub-part redraws from that value.
Two presentations the user toggles between (mirrors your `presentation`
full/companion concept):

- **Hero (default):** large additive Venn on top, solid swatch beneath.
- **Corner (compact):** swatch large with a small Venn tucked beside it.

A small **view toggle** (two icon buttons: Venn-hero / compact) sits top-right of
the card.

**Card:** `background:#0a0a0b; border-radius:18px; padding:clamp(18px,4vw,26px);
box-shadow: inset 0 0 0 1px rgba(255,255,255,.06), 0 30px 70px -30px rgba(0,0,0,.8);`
In the mocks the card is capped at **max-width 440px** (mobile-first column).

Top-to-bottom in hero view:
1. **View toggle** (top-right)
2. **Additive Venn** (the hero) — see Components
3. **Swatch** — the rendered color, flat
4. **Hex readout** — `#C0FFEE`, channel-demarcated, click-to-expand math
5. **RGB faders** — Red / Green / Blue
6. Hairline divider — `rgba(255,255,255,.08)`
7. **HSV faders** — Hue / Sat / Val

---

## Components

### Additive Venn (`Venn` in parts.jsx) — the centerpiece
Three overlapping circles, one per channel, **`mix-blend-mode:screen`** over a
**pure black** container with **`isolation:isolate`** and `border-radius:50%`.

- **Critical:** the black backdrop + isolated stacking context make screen-blend
  equal *true additive light*, so the central tri-overlap equals the rendered
  color **exactly**. Without isolation+black it blends against the card and the
  sum drifts (this was a real bug we fixed — don't skip it).
- Heavy overlap so the **center tri-intersection is the largest region** (it's the
  actual result — make it the hero, not a sliver). Circles are **70%** of the
  container; centers at `(50%,0%)`, `(37%,23%)`, `(63%,23%)` with
  `translateX(-50%)`.
- Each circle's color is the **pure channel** at the current value:
  `rgb(v,0,0)` / `rgb(0,v,0)` / `rgb(0,0,v)`.
- **Channel isolation:** clicking a channel name (see RGB faders) hides the other
  two circles (`opacity:0`, `transition:opacity .25s`) — you see one channel's
  contribution alone.

### Swatch (`SwatchPanel` in layouts.jsx)
- Just the color, **no gradient/sheen**. `border-radius:12px;
  background:#<hex>;` with a thin hairline so dark colors separate from the
  background: `box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.55);`
- Hero height `clamp(92px,18vw,116px)`; compact min 120–140px.
- Optional CSS named-color label, bottom-right, colored by best-contrast
  (`#000`/`#fff` via WCAG luminance — see `bestTextColor` in color.js).

### Hex Readout (`HexReadout` / `HexPair` in parts.jsx)
The big `#C0FFEE`. Font **DM Mono**, weight **300**, size
`clamp(34px,8vw,50px)`, `letter-spacing:.12em`, baseline-aligned flex.
- `#` is `opacity:.3; font-weight:100`.
- Each **two-digit pair is demarcated in its pure channel color** so learners see
  which digits map to which channel (positional, non-obvious otherwise). The
  selected demarcation style is **`dot`**: a small channel-colored dot centered
  above each pair (`width/height .22em`, `border-radius:50%`, soft glow
  `box-shadow:0 0 6px <color>`). *(parts.jsx also contains four alternates —
  `underline`, `bracket`, `chip`, `tint` — behind a `demarc` prop, in case you
  want them; dot is the chosen one.)*
- **Click a pair → "Cyclops" popover** showing the 16s+1s place-value math, e.g.
  for `C0`: `C × 16 = 192`, `0 × 1 = 0`, `= 192 / 255`. Popover:
  `background:rgba(18,18,20,.97); border-radius:14px; padding:14px 20px;` with a
  small rotated-square arrow beneath. The big pair repeats at 40px in the
  channel color.

### Faders (RGB + HSV) — `Fader` / `FaderRow` in parts.jsx
**One** `FaderRow` component is used by **both** RGB and HSV so they share an
identical label gutter, track width, and value typography. Separation between the
two groups is by **spacing + the divider only**, never by distinct styling.
- Row: `display:flex; align-items:center; gap:14px`. Label gutter **64px**, value
  column **78px** (`text-align:left`, font DM Mono 16px/500). Fader flexes to fill.
- **Track:** `height:20px; border-radius:6px;` filled with a gradient (see each
  channel). Bounded by a bright outline so the min/max ends are unmistakable:
  `box-shadow: inset 0 0 0 2px rgba(255,255,255,.82), inset 0 2px 5px rgba(0,0,0,.5);`
  (No numeric end-caps — the outline does the job.)
- **Thumb (knurled):** `width:18px; height:26px; border-radius:5px;`
  `background:linear-gradient(180deg,#8a8b93,#34353a);`
  `background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.34) 0 1px,transparent 1px 3px);`
  `box-shadow:0 4px 9px rgba(0,0,0,.7), inset 0 0 0 1px rgba(255,255,255,.5),
  inset 0 1px 0 rgba(255,255,255,.85), 0 0 0 1.5px rgba(255,255,255,.18);` plus a
  1px dark center seam (`::after`). It should read as a physical, high-contrast
  knurled grip lifting off the track.
- **Drag** via pointer events with `setPointerCapture`; value =
  `clamp(0,1,(clientX-left)/width) * max`.

**RGB rows:**
- Track gradient `linear-gradient(90deg, #000, <pure channel>)`.
- **Pure channel colors are faithful and never stylized:** Red `#FF0000`,
  Green `#00FF00`, Blue `#0000FF`. (As jarring as `#00FF00` is — keep it. The
  honesty is the teaching.)
- Label is a **button** (Red/Green/Blue, 13px/600, `#d6d6da`) — clicking it
  **isolates** that channel in the Venn and dims the other two rows
  (`opacity:.4`). When active the label turns its pure channel color.
- Value column: decimal in `--c0ffee-fg`, then the **hex pair** 12px to the right
  in muted `#8c8c90` (e.g. `192  C0`). Decimal numbers of RGB and HSV align in the
  same left-aligned column.

**HSV rows (Hue/Sat/Val):**
- Hue track is the full rainbow:
  `linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)` (range 0–360).
- Sat track: `linear-gradient(90deg, <hue at s=0>, <hue at s=1>)` at current V.
- Val track: `linear-gradient(90deg, #000, <hue at v=1>)` at current S.
- Value column is **one contiguous unit** — `164°`, `25%`, `100%` — in a single
  color (no separate gray for the unit; HSV is one semantic, unlike RGB's
  decimal+hex).

### View Toggle (`ViewToggle` in layouts.jsx)
Two 30×24 icon buttons in a pill (`background:rgba(255,255,255,.06)`); active =
`background:rgba(255,255,255,.16)`. Icons: a 3-circle Venn glyph and a
swatch+dot "compact" glyph.

---

## Interactions & Behavior
- **Drag a fader** → updates the single Color value; Venn, swatch, hex, and the
  *other* model's faders all redraw live.
- **RGB vs HSV authority (from console.ts, keep faithful):**
  - RGB edit → value authoritative; re-derive HSV with **sticky hue** so hue holds
    at the gray/black edges (`stickyHsv`).
  - HSV edit → HSV authoritative; value follows (no lossy round-trip → no slider
    jitter).
- **Click a channel name** → solo that channel (Venn shows one circle; other rows
  dim). Click again to clear.
- **Click a hex pair** → toggle the place-value Cyclops popover.
- **Click the view toggle** → switch hero ↔ compact.
- Transitions: swatch background `.08s`; channel dim `.25s`; Venn circle
  isolation `opacity .25s`; theme/token changes `.45s ease`.

## State Management
A single source of truth — see `useC0Color` in `instrument/engine.jsx` (the React
port of `console.ts`'s model):
- `rgb {r,g,b}` is state; `hsv` is held in a ref with **sticky-hue caching**.
- Derived: `hex` (`formatHex`), per-channel `placeValue` (16s+1s), `namedColor`.
- Setters: `setChannel(k,v)`, `setHex(k,clean)`, `setHsv(k,v)`, `setFromRgb(next)`.
- In your TS web component this maps onto the existing `Color` value + the
  functional-core helpers in `lib/color.ts` — the prototype's `color.js` mirrors
  them 1:1 (`parseHex`, `rgbToHsv`, `hsvToRgb`, `stickyHsv`, `bestTextColor`,
  `formatHex`, `sanitizeHexInput`).

---

## Design Tokens

**Colors**
| Token | Value | Use |
|---|---|---|
| `--c0ffee-bg` | `#0a0a0b` | app / card background |
| `--c0ffee-fg` | `#ededed` | primary text |
| `--c0ffee-accent` | `#C0FFEE` | the mint zero, accents |
| panel popover | `rgba(18,18,20,.97)` | Cyclops |
| muted text | `#8c8c90` / `#d6d6da` | hex pair / labels |
| Red channel | `#FF0000` | pure, never stylized |
| Green channel | `#00FF00` | pure, never stylized |
| Blue channel | `#0000FF` | pure, never stylized |
| hairline | `rgba(255,255,255,.06–.08)` | dividers, edges |

**Typography**
- **DM Mono** everywhere in the instrument + header. It has a **slashed (barred)
  zero** — important for distinguishing `0` from `O` in hex. Enable
  `font-feature-settings:"zero" 1, "calt" 1;`.
- Weights used: 300 (hex readout, light), 400 (header), 500 (fader values),
  600 (labels). Header 26px; hex readout `clamp(34px,8vw,50px)`; fader values
  16px; labels 13px.

**Radii:** card 18px; swatch/track-group 12px; fader track 6px; thumb 5px;
popover 14px; badge 50%.

**Spacing:** card padding `clamp(18px,4vw,26px)`; fader row gap 14px; fader stack
gap 16px; label gutter 64px; value column 78px.

**Shadows:** card `inset 0 0 0 1px rgba(255,255,255,.06), 0 30px 70px -30px
rgba(0,0,0,.8)`; thumb (see Faders); popover `0 20px 44px -14px rgba(0,0,0,.9),
inset 0 0 0 1px rgba(255,255,255,.10)`.

---

## Assets
- **`c0ffee/pixie.png`** — the original pixel-art cup (1254×1254, on black). The
  additive-RGB Venn floats in the coffee; teal mug; three steam wisps. User's
  artwork. Black background is intended to be dropped (header badge masks it with
  a circle; elsewhere a `mix-blend-mode:lighten` also works on dark surfaces).
- **`c0ffee/pixie-badge.png`** — `pixie.png` cropped square (739×739) around the
  cup+steam so it centers cleanly in the circular header badge. Use this one in
  the header.
- For favicon/app-icon, the badge crop works down to ~18px (it's pixel art —
  keep `image-rendering:pixelated`).

---

## Files in this bundle
| File | What it is |
|---|---|
| `Console Studio.html` | The reference mock. Open it to see everything live (desktop hero, desktop corner, mobile compact). |
| `studio/parts.jsx` | Faders, FaderRow, RgbFaders, HsvPanel, HexReadout/HexPair/Cyclops, Venn, pure-channel constants, all CSS. **The core of the console design.** |
| `studio/layouts.jsx` | The console card, SwatchPanel, ViewToggle, hero/corner assembly. |
| `instrument/engine.jsx` | `useC0Color` model + `placeValue` + `namedColor` (port of console.ts logic). |
| `c0ffee/color.js` | Functional color core, ported from your `lib/color.ts`. |
| `c0ffee/banner.js` | The site header web component (vanilla — closest to your `banner.ts`). |
| `c0ffee/pixie.png`, `pixie-badge.png` | Logo assets. |
| `design-canvas.jsx` | **Presentation shell only** (pan/zoom canvas for showing the frames side-by-side). NOT part of the product — ignore for implementation. |

**To view:** open `Console Studio.html` in a browser. It loads React + Babel from
CDN and renders the frames on a pan/zoom canvas. The `<c0ffee-banner>` header is a
real Web Component; the console frames are the React prototype.

## Notes
- The instrument prototype is React (for fast iteration); your repo is TS Web
  Components. The **design** is framework-agnostic — every value you need is above.
- Still to come (designed next, not in this bundle): an **additive-mix animation**
  module (channels climbing, Venn lobes swelling as light is added).
