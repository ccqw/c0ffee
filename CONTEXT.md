# c0ffee

A front-end-only, zero-build website of interactive color toys (and, later, lessons woven from them) that teach how color works in computer graphics, with a special love for hex intuition. The name is itself a valid hex color (`#C0FFEE`, a pale mint).

## Language

**Toy**:
A reusable, self-contained interactive widget, implemented as a Web Component (custom element, e.g. `<c0ffee-mirror>`). Always an element, never a page.
_Avoid_: widget, component (when referring to the user-facing thing), gadget

**Playground**:
A page showing a single Toy full-bleed with no prose — the "just let me mess with it" view.
_Avoid_: sandbox, bench, demo

**Lesson**:
A page of prose interleaved with one or more Toy tags — teaching woven around the toys. Default layout: a pinned **Companion mirror** on the left, lesson prose scrolling on the right (a flipped-Codecademy split).
_Avoid_: article, tutorial, chapter

**Companion mirror**:
The one mirror Toy a Lesson pins (left side, always visible) as its shared canvas. Inline Swatches in the prose drive it on click; loads animate (the Color value tweens from its current state to the target).
_Avoid_: pinned toy, main toy, sidebar

**Beat**:
An authored chunk of a Lesson — one teaching step. The author marks beat boundaries. Exactly one beat is **active** at a time; the active beat owns the Companion mirror (its Inline swatches and its hands-on prompt drive it).
_Avoid_: step, section, slide, chunk (informally)

**Active beat**:
The currently-emphasized Beat. Activation is scroll-driven (the beat in the scroll focus zone becomes active); inactive beats are dimmed.
_Avoid_: current step, focus

**Inline swatch**:
A word-sized, read-only Swatch designed to sit inside prose (a "sparkline swatch"), rendered as a rounded **chip**. The `hex` is always its identity. Has two render modes: **mode A** (no `label`) shows a tiny swatch box + the hex; **mode C** (`label` present) paints the author-supplied word and hides the hex at rest. Hover/tap shows a uniform tooltip `{hex} · click to load`; clicking loads its Color value into the Lesson's Companion mirror.
_Avoid_: chip (that's the visual style of an inline swatch), sample, sparkline (informal)

**Toybox**:
The landing page: a grid linking to the Playgrounds and Lessons.
_Avoid_: home, index, gallery

### Flagship (mirror) anatomy

**Channel**:
One of the R, G, B components of a Color value (0–255).
_Avoid_: component, band

**Swatch**:
The main rendered patch showing the full Color value. (See also Channel swatch.)
_Avoid_: preview, main color

**Channel swatch**:
A mini-swatch showing a single Channel in isolation, other channels at zero (e.g. the red channel swatch renders `CC0000`). Referred to per-channel: "the red channel swatch."
_Avoid_: isolated swatch, mini

**Venn palette**:
The three-overlapping-circles diagram where each circle is one Channel's light and overlaps mix additively (R+G=yellow, G+B=cyan, R+B=magenta, center = the full Color value). Named to borrow the painter's-palette model so the toy can subvert it — this palette mixes *light*, not pigment.
_Avoid_: additive venn, light venn, color wheel, mixing circles

**RGB panel**:
The control group for editing a Color value by Channel — hex digit boxes + RGB sliders. "The recipe."
_Avoid_: rgb controls, channel panel

**HSV panel**:
The control group for editing a Color value by hue/saturation/value. "The perception."
_Avoid_: hsv controls, hsb panel

### Styling

**Design tokens**:
The shared design vocabulary — CSS custom properties (`--c0ffee-*`: font, accent, radius, background, channel colors) defined once in `tokens.css`. The single source of design truth, consumed by both pages and Toys. Editing it restyles the whole site.
_Avoid_: theme variables, css vars (informally), settings

**Theming contract**:
The specific set of `--c0ffee-*` tokens a Toy reads from inside its shadow root. Custom properties cross the shadow boundary, so tokens unify the look; ordinary CSS rules do not cross it, so Toy internals can never be collided with.
_Avoid_: style API, css api

### Color representation

These three layers separate the abstract color from how it is written and transported. The layering is what makes future notations (RGB, HSV) cheap to add.

**Swatch**:
A visual rendered patch of a Color value on screen (the big swatch, the per-channel minis, the Venn regions).
_Avoid_: tile, chip, sample

**Color value**:
The abstract color — the live R/G/B triple that is a Toy's single source of truth. Notation-independent.
_Avoid_: state, the color, rgb (when meaning the abstract value)

**Color address**:
A Color value written in a specific notation. The **Hex color address** (`3A7BD5`) is primary; future notations include an RGB address (`0,200,133`) and an HSV address.
_Avoid_: code, format, encoding

**Color link**:
A Color address carried in a URL or attribute (`hex="3A7BD5"`, `?hex=3A7BD5`, `#3A7BD5`). The **Hex color link** ships first; RGB and HSV links are future notations of the same mechanism. This is the backbone that lets a Lesson deep-link into a Toy at a precise Color.
_Avoid_: deep link, seed, permalink, hexlink

## Relationships

- A **Toy** is an element; a **Playground** and a **Lesson** are pages that embed **Toys**.
- A **Playground** embeds exactly one **Toy** and no prose.
- A **Lesson** embeds one or more **Toys** interleaved with prose.
- The **Toybox** links to **Playgrounds** and **Lessons**.
- A **Toy** holds one **Color value** as its single source of truth; every **Swatch** renders it.
- A **Color value** is written as a **Color address** (hex primary); a **Color address** placed in a URL/attribute is a **Color link**.
- A **Color link** seeds a **Toy**'s **Color value** on load.
- The flagship Toy renders one **Color value** as the **Swatch**, three **Channel swatches**, and the **Venn palette**; it is edited via the **RGB panel** and **HSV panel**, which stay in sync.
- A mode-C **Inline swatch**'s label text color is chosen automatically for legibility against its background (by relative luminance) — a pure helper in the color core, and the same science as the future gamma/luminance lesson.
- A **Lesson** is a sequence of **Beats**; scrolling the prose changes the **Active beat**, which owns the **Companion mirror**. Beats also invite direct interaction with the mirror (hands-on prompts), not only swatch clicks.

## Example dialogue

> **Dev:** "When someone clicks the flagship from the Toybox, do they land on a Lesson?"
> **Designer:** "No — that's a Playground: just `<c0ffee-mirror>` full-bleed, no prose. A Lesson is when I wrap prose around it."
> **Dev:** "So the same Toy element appears in both?"
> **Designer:** "Exactly. The Toy is the reusable atom; Playgrounds and Lessons are just two ways to frame it."

## Flagged ambiguities

- "page" was used for both the single-toy view and the prose-and-toys view — resolved: **Playground** (single toy, no prose) vs **Lesson** (prose + toys) are distinct flavors built by the same mechanism.
- "the color" / "state" / "code" were used interchangeably — resolved into three layers: **Color value** (abstract), **Color address** (a notation of it; hex primary), **Color link** (an address in a URL/attribute).
