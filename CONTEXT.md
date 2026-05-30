# c0ffee

A front-end-only, zero-build website of small color interactives (and, later, lessons woven from them) that teach how color works in computer graphics, with a special love for hex intuition. The name is itself a valid hex color (`#C0FFEE`, a pale mint).

## Language

**interactive** (internal shorthand, lowercase — not user-facing):
A self-contained interactive element on the site (the console, a swatch, a future game or palette). Used **only in planning/specs** when a collective word is genuinely needed; users never see it, and it is **not a real category** — its members share only that they're interactive elements. When you mean the *contract* (one Color value, hex in, `.value`/`.hex` out, `colorchange` event), name *that* instead — the **ADR-0001 Color value interface** — which only the single-color ones satisfy.
_Avoid_: Toy, widget, gadget, component (component is a color-model axis)

**Playground**:
A page showing a single interactive full-bleed with no prose — the "just let me mess with it" view.
_Avoid_: sandbox, bench, demo

**Lesson**:
A page of prose interleaved with one or more interactives — teaching woven around them. Default layout: a pinned **Companion console** as the shared canvas, lesson prose scrolling alongside it.
_Avoid_: article, tutorial, chapter

**Companion console**:
The one Color console a Lesson pins (always visible) as its shared canvas. Inline Swatches in the prose drive it on click; loads animate (the Color value tweens from its current state to the target).
_Avoid_: companion mirror, pinned console, main console, sidebar

**Beat**:
An authored chunk of a Lesson — one teaching step. The author marks beat boundaries. Exactly one beat is **active** at a time; the active beat owns the Companion console (its Inline swatches and its hands-on prompt drive it).
_Avoid_: step, section, slide, chunk (informally)

**Active beat**:
The currently-emphasized Beat. Activation is scroll-driven (the beat in the scroll focus zone becomes active); inactive beats are dimmed.
_Avoid_: current step, focus

**Inline swatch**:
A word-sized, read-only Swatch designed to sit inside prose (a "sparkline swatch"), rendered as a rounded **chip**. The `hex` is always its identity. Has two render modes: **mode A** (no `label`) shows a tiny swatch box + the hex; **mode C** (`label` present) paints the author-supplied word and hides the hex at rest. Hover/tap shows a uniform tooltip `{hex} · click to load`; clicking loads its Color value into the Lesson's Companion console.
_Avoid_: chip (that's the visual style of an inline swatch), sample, sparkline (informal)

**Menu**:
The page that lists everything playable — a grid linking to Playgrounds and Lessons. **Not** the landing page: the flagship console's Playground is served at the site root (`/`), and the Menu lives at its own address, unlinked from home until there's more than one thing worth showing.
_Avoid_: toybox, home, landing page, index, gallery

### Flagship anatomy — the Color console

**Color console** (the flagship):
The flagship interactive (`<c0ffee-console>`): one Color value shown every way at once — the **Swatch**, three **Channel swatches**, the **Venn palette** — and editable from any representation via the **RGB panel** and **HSV panel**, all kept in sync. The site root (`/`) is its Playground; a Lesson pins one as its **Companion console**. Renders in a chosen **presentation**.
_Avoid_: mirror, swatch panel, color picker, editor (informally)

**Presentation**:
A named preset of the Color console: which parts it renders and how they're laid out (spacing, what sits in a pull-up drawer, what stays sticky). One console, many presentations — e.g. a compact **companion presentation** (Swatch + the beat-relevant view in a sticky band, controls in a drawer) vs. a fuller **playground presentation**. Because parts live inside the shadow root (ADR-0002), only the console can show or hide its own parts, so a presentation is an attribute on the console — never a separate element.
_Avoid_: mode, variant, layout (informally), skin

**Channel**:
One of the R, G, B **Components** of a Color value (0–255) — the RGB model's components specifically. Channel carries an RGB-light identity here: the Channel swatches and Venn palette are built on isolating one channel's *light*, so it does not extend to HSV. For the model-agnostic notion, see **Component**.
_Avoid_: band; component (Channel is the RGB-specific kind)

**Swatch**:
The main rendered patch showing the full Color value. (See also Channel swatch.)
_Avoid_: preview, main color

**Channel swatch**:
A mini-swatch showing a single Channel in isolation, other channels at zero (e.g. the red channel swatch renders `CC0000`). Referred to per-channel: "the red channel swatch."
_Avoid_: isolated swatch, mini

**Venn palette**:
The three-overlapping-circles diagram where each circle is one Channel's light and overlaps mix additively (R+G=yellow, G+B=cyan, R+B=magenta, center = the full Color value). Named to borrow the painter's-palette model so the console can subvert it — this palette mixes *light*, not pigment.
_Avoid_: additive venn, light venn, color wheel, mixing circles

**Color model**:
A way of describing a Color value by a set of components — **RGB** (red, green, blue light, 0–255) or **HSV** (hue 0–360°, saturation & value 0–100%). The same Color value can be written in either. The console exposes one control group per model, each **labeled in the interface by its model** (e.g. red·green·blue / hue·saturation·value). Distinct from a **color space** (the geometric volume those components span — the roadmap "cube/hexcone" idea).
_Avoid_: color space (that's the volume, not the scheme), mode, format

**Component**:
One axis of a **color model**. RGB's components are its three **Channels** (red/green/blue, 0–255); HSV's components are **hue** (0–360°), **saturation** and **value** (0–100%). The model-agnostic word — use it for "a slider" or "two components of the same model" without assuming RGB. Note the units differ by component (0–255 vs degrees vs percent), so there is no single uniform numeric scale.
_Avoid_: channel (that's RGB-specific here), axis, dimension (informally)

**RGB panel**:
The control group for editing a Color value via the RGB **color model** — hex digit boxes + RGB sliders. Labeled in the interface by its model (red·green·blue); the "recipe" framing is lesson-level, never interface text.
_Avoid_: rgb controls, channel panel

**HSV panel**:
The control group for editing a Color value via the HSV **color model** — hue/saturation/value sliders. Labeled in the interface by its model (hue·saturation·value); the "perception" framing is lesson-level, never interface text.
_Avoid_: hsv controls, hsb panel

**Lock**:
A constraint tying **two or more Components of the same color model** so they move together — on **any 2–3 components, not just pairs**. Two modes: an **Equal lock** holds the locked components at the same value (move one, the rest match); an **Offset lock** holds a constant difference between them (move one, the rest slide to keep the gap). Requires a **shared linear scale**: RGB's R/G/B all share 0–255, so any combination locks; in HSV only **Saturation and Value** (both 0–100%) qualify, and **Hue is unlockable** (its own unit — degrees — and it wraps). At a rail, an Offset lock is **squish-and-restore**: the trailing component clamps, the gap squishes, and the intended gap restores once there's room (Equal locks never squish — equal components reach the rail together). The first rung of the relationship ladder (roadmap l→m): **Equal is Offset-of-zero**, and Offset is the simplest fixed relationship between components.
_Avoid_: link, tie, group, constraint (informally)

### Styling

**Design tokens**:
The shared design vocabulary — CSS custom properties (`--c0ffee-*`: font, accent, radius, background, channel colors) defined once in `tokens.css`. The single source of design truth, consumed by both pages and interactives. Editing it restyles the whole site.
_Avoid_: theme variables, css vars (informally), settings

**Theming contract**:
The specific set of `--c0ffee-*` tokens an interactive reads from inside its shadow root. Custom properties cross the shadow boundary, so tokens unify the look; ordinary CSS rules do not cross it, so an interactive's internals can never be collided with.
_Avoid_: style API, css api

### Color representation

These three layers separate the abstract color from how it is written and transported. The layering is what makes future notations (RGB, HSV) cheap to add.

**Swatch**:
A visual rendered patch of a Color value on screen (the big swatch, the per-channel minis, the Venn regions).
_Avoid_: tile, chip, sample

**Color value**:
The abstract color — the live R/G/B triple a color-bearing interactive holds as its source of truth. Notation-independent.
_Avoid_: state, the color, rgb (when meaning the abstract value)

**Color address**:
A Color value written in a specific notation. The **Hex color address** (`3A7BD5`) is primary; further notations include an **RGB address** (`0,200,133`), an **HSV address**, and the partial **Named color address** (see below). Hex/RGB/HSV are **total** — every Color value has one.
_Avoid_: code, format, encoding

**Named color address**:
The CSS color keyword for a Color value (`dodgerblue`), when one exists. A **partial** notation: unlike Hex/RGB/HSV, most Color values have no name — only the ~148 CSS named colors do — so a Named address is **present or absent**. Surfaced in a readout only when present; code must never assume a Color value has one.
_Avoid_: color name, css name (informally), label

**Color link**:
A Color address carried in a URL **hash** or an HTML attribute (`#3A7BD5` in the URL; `hex="3A7BD5"` on an element). The **Hex color link** ships first; RGB and HSV links are future notations of the same mechanism. This is the backbone that lets a Lesson deep-link into an interactive at a precise Color.

On a **Playground** the link round-trips **live**: the **hash is the only URL form** — emitted as the canonical address *and* the only one read back, on initial load *and* whenever it changes (paste-and-enter re-seeds the Color value). One rule, one format (`c0ffee.cafe/#C0FFEE`). A `?hex=` **query is deliberately not accepted**: we emit only hash so query links never arise, and a single format keeps the parser and tests honest. (Revisit only if server-side link **previews/unfurls** are ever wanted — fragments are invisible to unfurlers, queries are not — but that needs hosting infra a static site lacks, so it's a separate future decision.) This live re-seed extends ADR-0001's "seed in" from initial-only; per ADR-0001, Lessons still do not auto-reflect.
_Avoid_: deep link, seed, permalink, hexlink

## Relationships

- An **interactive** is a self-contained element (the console, a swatch, a future game); a **Playground** and a **Lesson** are pages that embed interactives.
- A **Playground** embeds exactly one interactive and no prose.
- A **Lesson** embeds one or more interactives interleaved with prose.
- The site root (`/`) **is** the flagship console's **Playground** (the landing page).
- The **Menu** links to **Playgrounds** and **Lessons**; it is not the landing page and stays unlinked from home until it has more than one thing to show.
- A single-color interactive (the console, a swatch) holds one **Color value** as its single source of truth, and every **Swatch** renders it; some interactives (a game, a palette) carry more than one, or none.
- A **Color value** is written as a **Color address** (hex primary); a **Color address** placed in a URL/attribute is a **Color link**.
- A **Color link** seeds an interactive's **Color value** on load.
- The flagship **console** renders one **Color value** as the **Swatch**, three **Channel swatches**, and the **Venn palette**; it is edited via the **RGB panel** and **HSV panel**, which stay in sync.
- A mode-C **Inline swatch**'s label text color is chosen automatically for legibility against its background (by relative luminance) — a pure helper in the color core, and the same science as the future gamma/luminance lesson.
- A **Lesson** is a sequence of **Beats**; scrolling the prose changes the **Active beat**, which owns the **Companion console**. Beats also invite direct interaction with the console (hands-on prompts), not only swatch clicks.

## Example dialogue

> **Dev:** "When someone clicks the flagship from the Menu, do they land on a Lesson?"
> **Designer:** "No — that's a Playground: just `<c0ffee-console>` full-bleed, no prose. A Lesson is when I wrap prose around it."
> **Dev:** "So the same element appears in both?"
> **Designer:** "Exactly. The interactive is the reusable atom; Playgrounds and Lessons are just two ways to frame it."

## Flagged ambiguities

- "page" was used for both the single-interactive view and the prose-and-interactives view — resolved: **Playground** (single interactive, no prose) vs **Lesson** (prose + interactives) are distinct flavors built by the same mechanism.
- "the color" / "state" / "code" were used interchangeably — resolved into three layers: **Color value** (abstract), **Color address** (a notation of it; hex primary), **Color link** (an address in a URL/attribute).
- "mirror" named the flagship by its internal binding (every surface *mirrors* one value) — an implementer's truth, not a user's. Renamed to **Color console** (`<c0ffee-console>`); "Companion mirror" → **Companion console**. The element tag, files, and ADR-0004 still carry the old name and need a rename pass (ticketed).
- The flagship's "compact vs full" forms are resolved as **presentations** (named presets of parts + layout on the one console), not separate elements — forced by shadow-DOM encapsulation (ADR-0002).
- "**Toy**" was a false category: it conflated "a custom element on this site" with "a thing satisfying the ADR-0001 Color value contract" — and the contract doesn't even hold for the known zoo (a guess game has a target + a guess; a palette has many). **Dissolved**, not renamed: call interactives by their real names (console, swatch, guess, blender); when the *contract* is meant, name the **ADR-0001 Color value interface**; when a collective is genuinely needed in planning/specs, use lowercase **"interactive"** (internal, never user-facing). ADR-0001 + ROADMAP still say "Toy" and need the same de-Toy pass (ticketed).
