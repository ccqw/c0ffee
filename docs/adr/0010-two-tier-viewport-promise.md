# 0010 — Two-tier viewport promise for the crossword (amends C0FFEE-73's one-viewport layout)

The Hex Color crossword's one-viewport promise (C0FFEE-73, Option A: `.screen` bounded to `<main>`, only the pane flexes) is restated as **two tiers by viewport height**:

- **Tall tier (viewport height ≥ ~740px, the 844-class and up):** strict one-viewport — board, dock, and a visible checked receipt all fit with **no page scroll during play**.
- **Short tier (below ~740px, the 667-class):** the game is **fully playable**; the non-sticky Site banner scrolls off on the first flick, and a **modest residual page scroll** remains. No strict fit is promised.

## Why

Flexing only absorbs slack: the dock's fixed minima (keypad + bar + cluenav + chrome) plus board and topbar form a hard content floor. Measured 2026-07 on main (v0.37.0) at 375×667: 846px of content without a receipt, 895px with one — so the 667 class scrolls ~179–228px, and even the 390×844 reference device scrolls ~5px (54px once a receipt shows). C0FFEE-72 (+45.5px, specced) and C0FFEE-71 (+49px, specced) each followed the handoff and still jointly overspent the budget — the promise was unwritten, so nothing forced the accounting.

Strict fit at 667 is arithmetically out of reach without reopening decided territory: the sanctioned levers total ~70–80px against 179+ needed. Keeping a false promise there helps nobody; the tall tier is where the promise is real and enforceable.

## Levers spent (and their floors)

- **Board cells scale fluidly with viewport height** on short screens: the board's width cap derives from available height, cells shrink from 38px toward a **32px floor** (glyphs scale with them).
- **Compare bar spends its decided 52–110 window downward** fluidly (`clamp`), floor **52px** — the height knob handoff 2 §6 explicitly reserved.
- **Stepped chrome trims** at the ~740px max-height breakpoint: dock vertical padding 14→10, `.screen` gaps 11→8.

## Held (not spent)

44px keys and keypad structure (handoff 2 §3a), the topbar's 52px, the dock panel's own padding/surface recipe, and the banner's non-sticky behavior (CONTEXT.md — scrolling it off is what makes the short tier livable).

## Considered options

- **Strict fit everywhere** — rejected; requires reopening the 44px-key decision or a structural dock redesign (overlay keypad) for a device class that shrinks every year.
- **Wontfix below 700px** — rejected; the receipt regression means even the reference 844 device scrolls mid-play, so height work was needed regardless, and the short class deserves the cheap levers' benefit.
- **Sticky banner (never scrolls off)** — rejected; contradicts the banner's documented non-sticky posture, and its 48px is the single cheapest give on short screens.

## Consequences

- **The height budget is now a written invariant.** Any slice adding height to the crossword's `.screen` stack must state its spend against this ADR in its spec, and re-verify the tall tier (receipt visible) before merge.
- Layout can't be asserted in happy-dom: verification is **numeric browser rect checks at 375×667, ~×740, and 390×844** (receipt visible and absent) plus the human eyeball pass.
- The width-axis chrome collapse (page padding + dock margin no longer stack below the 430px clamp) ships alongside in C0FFEE-87 but is a bug fix, not part of this promise.
