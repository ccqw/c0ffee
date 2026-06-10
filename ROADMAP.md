# c0ffee — Roadmap

Ideas deferred past v1, kept here so they're remembered without bloating the v1 build. Nothing here is committed; it's a parking lot for "later."

## v1 (the thin slice — what we ARE building)

The thinnest slice that exercises every architectural layer end-to-end:

- **`<c0ffee-console>`** — the flagship Color console: Swatch, three Channel swatches, Additive Venn, RGB panel + HSV panel, two-way bound through one Color value, seeded by Hex color link.
- **`<c0ffee-swatch>`** — inline swatch (chip): mode A (swatch + hex) / mode C (painted label), uniform `{hex} · click to load` tooltip, click loads the Companion console.
- **One Lesson** — "Colors are made of light" (adding R/G/B light → primaries, white, black), pinned Companion console on the left, prose scrolling on the right.
- **Menu** — the grid linking to interactives and Lessons (its own address, not the landing page).
- **`lib/color.ts`** — functional core (hex parse/format, rgb↔hsv, sticky-hue helper, `bestTextColor`), tested with Vitest.
- **`tokens.css`** — design tokens.

## v2 — the other launch interactives

These were scoped then shelved to protect the thin slice. Bring back next.

- **`<c0ffee-guess>` — guess-the-hex game.** Random target Swatch → player types a 6-digit guess → reveal target vs guess with per-channel closeness, + "new color" button. *Later polish:* streaks/score, difficulty modes (grayscale-only, primaries-only), nearest-CSS-name hints ("ooh, close to teal").
- **`<c0ffee-blender>` — two-color blender.** Two endpoint Color values (attribute-seeded + user-adjustable) with an interpolation slider + gradient strip. v2 = RGB interpolation. *Later:* **HSV-path blending** — the contrast between RGB blend (`FF0000`→`00FF00` through muddy `808000`) and HSV-around-the-wheel (through vivid `FFFF00`) is its own great lesson.

## Interactive backlog (unscoped)

- **Hexword gallery/finder** — browse/validate real hexwords (C0FFEE, FACADE, 0FF1CE…). On-brand with the name; pure delight. Could double as a generator (find words within an edit-distance of a target hue).
- **HSV picker square** — the "Photoshop picker": 2D saturation×value square + hue strip. A more tactile way to drive the console.
- **Channel decomposition viewer** — a color split into its R/G/B contributions as stacked light, emphasizing the "16s and 1s" of each hex pair.
- **Color-space viz (cube / hexcone)** — render the geometric *volume* the components span: the RGB cube, the HSV hexcone. Makes the model-vs-space distinction (CONTEXT glossary) tangible — the console drives the components; this shows where they live. (C0FFEE-38)

## Lesson backlog

- **Reading a hex code** — the digit structure: two digits per channel, left = 16s, right = 1s; building the by-eye intuition (the user's superpower, made teachable).
- **Grayscale & gamma / luminance** — why `#808080` isn't perceptual middle-gray; sRGB gamma; relative luminance. (Shares its engine with `bestTextColor`.)
- **Why red + green = yellow (light vs paint)** — the Additive Venn's payoff: additive light vs subtractive pigment, and the everyday paint-mixing intuition it overturns.
- **Secondary & complementary colors** — cyan/magenta/yellow; opposites on the wheel.

## Notation / feature backlog

- **RGB and HSV Color links** — alternate notations of the Color link (RGB triples, HSV) carried in the hash and sniffed by shape, extending the seed/reflect layer without touching the value or event shape (per ADR-0001; hash-only per its 2026-05-31 amendment).
- **Live URL reflection inside Lessons** — let a Lesson opt one interactive (likely the Companion console) in as the URL owner so its state is shareable. Now an opt-in property of the ADR-0001 Color value interface (see the 2026-05-31 amendment), not a page-type default.
- **Custom styled tooltip** — replace native `title=` with a styled tooltip that also works on touch (tap-to-reveal), so mode-C chips reveal their hex on mobile.
- **Site-wide theming demo** — show off `tokens.css` by offering a couple of alternate palettes (the design-token "rebrand from one file" trick, made visible).

## Infrastructure backlog

- **DOM/interaction tests** — a lightweight harness for interactive behavior (beyond the pure-core unit tests), if/when interactives get complex enough to warrant it. (happy-dom shell tests, ADR-0006, already cover the basics.)

(Shipped and gone from this list: custom domain — `c0ffee.cafe` CNAME + HTTPS; CI — `ci.yml` gates every PR with typecheck + tests + build, and `deploy.yml` re-runs the same gate on `main` before publishing `dist/`. C0FFEE-10.)
