# c0ffee

A front-end-only website of small color interactives (and, later, lessons woven from them) that teach how color works in computer graphics, with a special love for hex intuition. Built with TypeScript + Vite (ADR-0006). The name is itself a valid hex color (`#C0FFEE`, a pale mint).

## Language

**interactive** (internal shorthand, lowercase — not user-facing):
A self-contained interactive element on the site (the console, a swatch, a future game or palette). Used **only in planning/specs** when a collective word is genuinely needed; users never see it, and it is **not a real category** — its members share only that they're interactive elements. When you mean the *contract* (one Color value, hex in, `.value`/`.hex` out, `colorchange` event), name *that* instead — the **ADR-0001 Color value interface** — which only the single-color ones satisfy.
_Avoid_: Toy, widget, gadget, component (component is a color-model axis)

**solo interactive** (a page type — internal, not user-facing):
A page that frames exactly one interactive, full-bleed, with no prose — the "just let me mess with it" view. The **thinnest page type**: the interactive owns the whole page. The site root (`/`) is the flagship console shown solo. One of the site's **page types** alongside **Lesson** and **Menu**. (The first **game**, the **Hex Color crossword**, is served this way too: a self-contained game element is just a **solo interactive**, not a new page type — a distinct game page type waits until a game needs genuinely page-level chrome.) Like lowercase **interactive**, this is a planning/spec word users never see — they refer to the bare page by *the interactive's own name* ("the Color console"), never by the category, because you don't name an absence-of-prose. (Of the page types, **Menu** and **Lesson** are user-facing labels; **solo interactive** is not.) Whether such a page round-trips a Color link in the URL is a property of *the interactive's* ADR-0001 Color value interface — **not of the page type**: a console reflects its hex address, a guess game has no single hex address to reflect.
_Avoid_: playground, sandbox, bench, demo

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

**Site banner**:
The site's chrome strip at the **top of the document** on every page — a small mint **chip** (an 18px rounded square in the namesake `#C0FFEE`) beside the `c0ffee` wordmark on the left, kept minimal so it reads as **brand, not as a Swatch**. (The chip lockup adopted from the crossword-face handoff in C0FFEE-76, 2026-06-29, superseding the C0FFEE-46/52 `#C0FFEE cafe` + pixel-cup lockup.) It exists specifically to never be mistaken for the console's displayed color: the Swatch is the only **large** painted patch on a page; the banner is quiet chrome that blends into the neutral/dark background. The chip is the one place the banner carries a mint **fill** — small enough to read as a glyph, not a patch — so the never-a-Swatch promise holds. **Brand + optional section, no nav:** the `[chip] c0ffee` cluster acts as the home link, and a page may supply a **section label** (a non-clickable context word after a `·`, e.g. `Crosshatch` on the crossword route) — but there is still no nav; a nav affordance (dropdown/menu, language TBD) is deferred until the **Menu** is worth surfacing — the same "more than one thing to show" trigger that un-hides the Menu. (Accepted consequence: until then, home has no in-page path to the Lesson/Menu — they're reached by direct URL.) **Not sticky:** it scrolls away as the page scrolls (so the top-pinned Companion console, ADR-0005, owns the top while reading); on a short page with nothing to scroll, it simply stays visible.
_Avoid_: header bar, masthead, top swatch, the color bar, sticky header

**Menu**:
The page that lists everything playable — a grid linking to solo interactives and Lessons. **Not** the landing page: the flagship console is served solo at the site root (`/`), and the Menu lives at its own address, unlinked from home until there's more than one thing worth showing.
_Avoid_: toybox, home, landing page, index, gallery

### Flagship anatomy — the Color console

**Color console** (the flagship):
The flagship interactive (`<c0ffee-console>`): one Color value shown every way at once — the **Swatch**, the **Additive Venn**, the editable **Hex field** — and editable from any representation via the **RGB panel** and **HSV panel**, all kept in sync. The site root (`/`) shows it solo; a Lesson pins one as its **Companion console**. Renders in a chosen **presentation**.
_Avoid_: mirror, swatch panel, color picker, editor (informally)

**Presentation**:
A named preset of the Color console: which parts it renders and how they're laid out (spacing, what sits in a pull-up drawer, what stays sticky). One console, many presentations — e.g. a compact **companion presentation** (Swatch + the beat-relevant view in a sticky band, controls in a drawer) vs. a **full presentation** (all parts visible) used when the console is shown solo. Because parts live inside the shadow root (ADR-0002), only the console can show or hide its own parts, so a presentation is an attribute on the console — never a separate element.
_Avoid_: mode, variant, layout (informally), skin

**Channel**:
One of the R, G, B **Components** of a Color value (0–255) — the RGB model's components specifically. Channel carries an RGB-light identity here: the **Additive Venn** is built on isolating one channel's *light* (and can show that channel alone via **channel-solo**), so it does not extend to HSV. For the model-agnostic notion, see **Component**.
_Avoid_: band; component (Channel is the RGB-specific kind)

**Swatch**:
The main rendered patch showing the full Color value. Carries the **Named color address** in a corner when one exists (contrast-colored for legibility), and the active channel's tag while **channel-solo** is on.
_Avoid_: preview, main color

**Channel-solo** (was: Channel swatch):
Showing a single Channel's light in isolation. In the redesigned console this is a **state of the Additive Venn** — click a channel name and the other two circles fade, leaving one channel's light alone — **not** a discrete mini-swatch. (The three standalone Channel-swatch minis were dropped; see Flagged ambiguities.)
_Avoid_: channel swatch, mini, isolated swatch

**Additive Venn**:
The three-overlapping-circles diagram where each circle is one Channel's light and overlaps mix additively (R+G=yellow, G+B=cyan, R+B=magenta, center = the full Color value). The name states the phenomenon directly — additive mixing of *light*, not pigment. Clicking a channel name isolates it (**channel-solo**): the other two circles fade so you see one channel's light alone. The center tri-overlap renders the full Color value **exactly** — which requires the circles screen-blend over pure black in an isolated stacking context (an implementation invariant, not a style choice).
_Avoid_: Venn palette, light venn, color wheel, mixing circles

**Color model**:
A way of describing a Color value by a set of components — **RGB** (red, green, blue light, 0–255) or **HSV** (hue 0–360°, saturation & value 0–100%). The same Color value can be written in either. The console exposes one control group per model, each **labeled in the interface by its model** (e.g. red·green·blue / hue·saturation·value). Distinct from a **color space** (the geometric volume those components span — the roadmap "cube/hexcone" idea).
_Avoid_: color space (that's the volume, not the scheme), mode, format

**Component**:
One axis of a **color model**. RGB's components are its three **Channels** (red/green/blue, 0–255); HSV's components are **hue** (0–360°), **saturation** and **value** (0–100%). The model-agnostic word — use it for "a slider" or "two components of the same model" without assuming RGB. Note the units differ by component (0–255 vs degrees vs percent), so there is no single uniform numeric scale.
_Avoid_: channel (that's RGB-specific here), axis, dimension (informally)

**RGB panel**:
The control group for editing a Color value via the RGB **color model** — the **Hex field** + RGB sliders. Labeled in the interface by its model (red·green·blue); the "recipe" framing is lesson-level, never interface text.
_Avoid_: rgb controls, channel panel, fader (the sliders are sliders)

**Hex field**:
The editable **Hex color address** as the console's typographic centerpiece: a single field that *looks* segmented into three channel-demarcated pairs (each pair carries a small channel-colored dot) but is **one** field — so paste/copy/select-all act on the whole address. Tapping a pair's **dot** opens the **place-value popover** (the 16s-and-1s decomposition, e.g. `C×16 + 0×1`). Editing it filters input so the field can never show a character the Color value dropped.
_Avoid_: hex boxes, hex readout, cyclops (the popover is the place-value popover)

**HSV panel**:
The control group for editing a Color value via the HSV **color model** — hue/saturation/value sliders. Labeled in the interface by its model (hue·saturation·value); the "perception" framing is lesson-level, never interface text.
_Avoid_: hsv controls, hsb panel

**Lock**:
A constraint tying **two or more Components of the same color model** so they move together — on **any 2–3 components, not just pairs**. Two modes: an **Equal lock** holds the locked components at the same value (move one, the rest match); an **Offset lock** holds a constant difference between them (move one, the rest slide to keep the gap). Requires a **shared linear scale**: RGB's R/G/B all share 0–255, so any combination locks; in HSV only **Saturation and Value** (both 0–100%) qualify, and **Hue is unlockable** (its own unit — degrees — and it wraps). At a rail, an Offset lock is **squish-and-restore**: the trailing component clamps, the gap squishes, and the intended gap restores once there's room (Equal locks never squish — equal components reach the rail together). The first rung of the relationship ladder (roadmap l→m): **Equal is Offset-of-zero**, and Offset is the simplest fixed relationship between components.
_Avoid_: link, tie, group, constraint (informally)

### Hex Color crossword

**Hex Color crossword** (`<c0ffee-crossword>`):
The site's first **game** interactive — an interlocking crossword whose **Slots** each hold one color's **Hex color address**, each **Clue**d by a **Swatch** of the target color. The solver types hex into a Slot's **Cells** and commits a **Guess**; per-**Channel** feedback (each channel's `00`-`FF` value reads *higher*, *lower*, or *correct*, a correct channel **locks** its two Cells and propagates to crossing Slots) homes them in. The **first interactive that holds many Color values**, so — unlike the **Color console** — it does **not** satisfy the **ADR-0001 Color value interface** and reflects no **Color link** (it has no single Color value to put in the URL). The concrete case foreseen when "**Toy**" was dissolved (a game has targets + guesses, not one value). Served at its own URL as a **solo interactive**; fits the **Color X** naming family. Its **public name** — the proper noun shown to players, e.g. in the **Site banner**'s section label — is **Crosshatch** (adopted from the crossword-face handoff, C0FFEE-76); "Hex Color crossword" remains the descriptive glossary term we use when naming the mechanic.
_Avoid_: hex game, color puzzle, "color crossword" (it is the *Hex Color* crossword / **Crosshatch**).

**Slot**:
A straight run of **Cells** (across or down) that holds one color's **Hex color address**, named by position and direction (`1-Across`, `2-Down`). The crossword-constructor's word for an answer's place in the grid. A Slot has a target **Color value** — shown by its **Clue**'s **Swatch** — and the solver's current **Guess**. One word does both jobs (the run *and* its `1-Across` handle); we do not separately name the filled answer an "entry".
_Avoid_: entry, word, grid address; **light** (reserved — a **Channel** is light).

**Clue**:
A **Slot**'s prompt: the Slot's `1-Across` identifier together with a **Swatch** of the target color (small, click-to-enlarge). The Swatch is **an element of** the Clue, not the Clue itself.
_Avoid_: hint (that names the per-digit feedback).

**Cell**:
One grid square holding a single hex digit (`0–F`). A Cell shared by a crossing pair of **Slots** is **dual-role**: both Slots require the same digit *value*, but it plays a different **Channel** and place-value in each direction (the across Slot's green-16s may be the down Slot's red-1s). Same value, two meanings — which is also what lets solving one color's channel hand you a digit in another color's *different* channel. The crossword therefore works at two sizes: it binds **Cells** (single digits) at its intersections, but its unit of feedback and meaning is the **Channel** (two digits) — intersection is per-digit, semantics per-Channel.
_Avoid_: square, box; **Slot** (a Slot is the whole run, a Cell is one square).

**Guess**:
A committed six-digit attempt to fill a **Slot**. Feedback is **per Channel** — the two digits of red, of green, and of blue are each read as one value (`00`–`FF`, i.e. 0–255), and that whole value reads *higher*, *lower*, or *correct*, never digit-by-digit. The status glyphs are **achromatic** (they never read as color content — the same quiet-chrome posture as the **Site banner**). When a Channel reads *correct* its two **Cells** **lock**; a locked Cell that is shared carries over to the crossing **Slot**, where (dual-role) it is a single known digit of a *different* Channel. Guesses are unlimited and unscored.
_Avoid_: try, attempt (informally), submission; "per-digit feedback" (feedback is per Channel, even though crossings still bind single digits).

**Puzzle link**:
A URL that reproduces a specific Hex Color crossword puzzle for another solver. It carries the puzzle's identity - its authored shape plus the generator seed - as a token in the URL hash fragment on the crossword route (`/crossword#<token>`). Parallel to the **Color link** in mechanism (both are state carried in the hash, never a query, so it never leaves the browser - ADR-0009), but distinct from it: a Color link is one **Hex color address** on a console route (ADR-0001); a Puzzle link is a seed token on the crossword route, and the puzzle's target colors stay **latent** (the answers are not in the URL - you must actually solve it). Shared from the quiet completion state via the native share sheet.
_Avoid_: share link (too generic); seed (that is the payload the link carries, not the link itself); Color link (a different contract, on a different route).

**Solve time**:
The elapsed time from the solver's first **Cell** entry to the final **Slot** solved, paused while the tab is hidden. The crossword is otherwise **unscored**, so the Solve time is its only score-like signal - and because binary-search costs wall-clock seconds, the clock gently rewards hex intuition without needing guess-limits. Optional and opt-in: it rides in the shared message ("solved in 4:15 - can you beat me?") only if the solver includes it, and whether the running clock is shown during play is a **remembered preference** (a timer-less, zen solve is a first-class choice).
_Avoid_: timer (that is the on-screen widget, not the measured value); score; par.

### Styling

**Design tokens**:
The shared design vocabulary — CSS custom properties (`--c0ffee-*`: font, accent, radius, background, channel colors) defined once in `tokens.css`. The single source of design truth, consumed by both pages and interactives. Editing it restyles the whole site.
_Avoid_: theme variables, css vars (informally), settings

**Theming contract**:
The specific set of `--c0ffee-*` tokens an interactive reads from inside its shadow root. Custom properties cross the shadow boundary, so tokens unify the look; ordinary CSS rules do not cross it, so an interactive's internals can never be collided with.
_Avoid_: style API, css api

### Telemetry

**Telemetry**:
Anonymous Datadog RUM (`@datadog/browser-rum-slim`) on the production hostname only — out-of-box page views, Core Web Vitals, JS errors, and interaction tracking, tagged with the release version; no Session Replay, no user identity, no consent UI, and dev/preview/fork hostnames send nothing (ADR-0008).
_Avoid_: analytics, tracking (when meaning this posture)

### Color representation

These three layers separate the abstract color from how it is written and transported. The layering is what makes future notations (RGB, HSV) cheap to add.

**Swatch**:
A visual rendered patch of a Color value on screen (the big swatch and the Additive Venn regions).
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
A Color address carried in a URL **hash** or an HTML attribute (`#3A7BD5` in the URL; `hex="3A7BD5"` on an element). The **Hex color link** ships first; RGB, HSV, and **Named** (`#dodgerblue`) links are future notations of the same mechanism. The leading `#` is the **URL fragment delimiter**, not a hex sigil — it only *coincides* with CSS's hex `#` for hex addresses (which is why `#C0FFEE` reads so cleanly); the fragment carries a **bare address** the parser sniffs by shape (all hex digits → hex; a CSS keyword → name — the two are character-disjoint, so no extra prefix is needed). A Named link spends a little of the hash-only simplicity (a second notation in the one fragment) and is **deferred** until a real use case wants it. This is the backbone that lets a Lesson deep-link into an interactive at a precise Color.

When an interactive that satisfies the ADR-0001 Color value interface owns the page's URL (e.g. the console shown **solo** at `/`), the link round-trips **live**: the **hash is the only URL form** — emitted as the canonical address *and* the only one read back, on initial load *and* whenever it changes (paste-and-enter re-seeds the Color value). One rule, one format (`c0ffee.cafe/#C0FFEE`). A `?hex=` **query is deliberately not accepted**: we emit only hash so query links never arise, and a single format keeps the parser and tests honest. (Revisit only if server-side link **previews/unfurls** are ever wanted — fragments are invisible to unfurlers, queries are not — but that needs hosting infra a static site lacks, so it's a separate future decision.) This live re-seed extends ADR-0001's "seed in" from initial-only; per ADR-0001, Lessons still do not auto-reflect. A malformed fragment (`#potato`) is **rejected** like a filtered keystroke — the Color value stays put (initial load still defaults, having nothing to keep), the URL **heals** to the displayed color's canonical link, and a transient **hint** at the Hex field says why; an empty hash stays silent and is never rewritten (ADR-0001 amendment 2026-06-10). The link tracks the live Color value **within ~500ms**, not per frame — URL writes are throttled and retried because WebKit rate-limits the history API (ADR-0001 amendment 2026-06-11).
_Avoid_: deep link, seed, permalink, hexlink

## Relationships

- An **interactive** is a self-contained element (the console, a swatch, a future game); a **solo interactive** page and a **Lesson** are pages that embed interactives.
- A **solo interactive** page embeds exactly one interactive and no prose.
- A **Lesson** embeds one or more interactives interleaved with prose.
- The site root (`/`) **is** the flagship console shown **solo** (the landing page).
- The **Menu** links to **solo interactives** and **Lessons**; it is not the landing page and stays unlinked from home until it has more than one thing to show.
- A single-color interactive (the console, a swatch) holds one **Color value** as its single source of truth, and every **Swatch** renders it; some interactives (a game, a palette) carry more than one, or none.
- A **Color value** is written as a **Color address** (hex primary); a **Color address** placed in a URL/attribute is a **Color link**.
- A **Color link** seeds an interactive's **Color value** on load.
- The flagship **console** renders one **Color value** as the **Swatch** and the **Additive Venn** (which can isolate one channel via **channel-solo**); it is edited via the **Hex field**, the **RGB panel** and the **HSV panel**, which stay in sync.
- A mode-C **Inline swatch**'s label text color is chosen automatically for legibility against its background (by relative luminance) — a pure helper in the color core, and the same science as the future gamma/luminance lesson.
- A **Lesson** is a sequence of **Beats**; scrolling the prose changes the **Active beat**, which owns the **Companion console**. Beats also invite direct interaction with the console (hands-on prompts), not only swatch clicks.
- The **Hex Color crossword** is an **interactive** that holds **many Color values** — one target per **Slot** — so, unlike the **Color console**, it does **not** satisfy the **ADR-0001 Color value interface** and reflects no **Color link**.
- A **Slot**'s target **Color value** is shown by its **Clue**'s **Swatch**; the solver's **Guess** fills the Slot's **Cells** with a **Hex color address**, with per-**Channel** *higher/lower/correct* feedback (a correct channel locks its two Cells), and crossing Slots share **dual-role** Cells.

## Example dialogue

> **Dev:** "When someone clicks the flagship from the Menu, do they land on a Lesson?"
> **Designer:** "No — that's the console shown **solo**: just `<c0ffee-console>` full-bleed, no prose. A Lesson is when I wrap prose around it."
> **Dev:** "So the same element appears in both?"
> **Designer:** "Exactly. The interactive is the reusable atom; a solo-interactive page and a Lesson are just two ways to frame it."

## Flagged ambiguities

- "page" was used for both the single-interactive view and the prose-and-interactives view — resolved into **page types**: a **solo interactive** page (single interactive, no prose) vs a **Lesson** (prose + interactives), built by the same mechanism. ("Playground" was the earlier name for the solo-interactive page; retired because URL-ownership — the only thing it load-bore — turned out to be a property of the *interactive's* ADR-0001 contract, not the page, leaving only a thin internal page-type that users never see by name.)
- "the color" / "state" / "code" were used interchangeably — resolved into three layers: **Color value** (abstract), **Color address** (a notation of it; hex primary), **Color link** (an address in a URL/attribute).
- "mirror" named the flagship by its internal binding (every surface *mirrors* one value) — an implementer's truth, not a user's. Renamed to **Color console** (`<c0ffee-console>`); "Companion mirror" → **Companion console**. The element tag, files, and ADR-0004 wording were renamed in the C0FFEE-20 pass (done 2026-05-31).
- The flagship's "compact vs full" forms are resolved as **presentations** (named presets of parts + layout on the one console), not separate elements — forced by shadow-DOM encapsulation (ADR-0002).
- "**Toy**" was a false category: it conflated "a custom element on this site" with "a thing satisfying the ADR-0001 Color value contract" — and the contract doesn't even hold for the known zoo (a guess game has a target + a guess; a palette has many). **Dissolved**, not renamed: call interactives by their real names (console, swatch, guess, blender); when the *contract* is meant, name the **ADR-0001 Color value interface**; when a collective is genuinely needed in planning/specs, use lowercase **"interactive"** (internal, never user-facing). ADR-0001 + ROADMAP were de-Toy'd in the C0FFEE-17 docs pass (done 2026-05-31); user-facing copy on the home/play pages is deferred to the home-IA work (C0FFEE-15).
- "**Venn palette**" → "**Additive Venn**" (renamed in the 2026-06-02 console-redesign grill). The original name carried a painter's-palette→light subversion pun; it was dropped for a term that states the phenomenon directly (additive light mixing). The rename sweep is **done**: the phrase was retired from prose and comments (`index.html`, `menu.html`, `tokens.css`, `ROADMAP.md`, `elements/console.ts` header, the ship-slice glossary). The new term *keeps* "Venn", so the `.venn*` shadow-DOM classes were left as-is — only the punning "palette" was retired, and the classes never said it.
- The three **Channel-swatch** minis (discrete per-channel boxes) were **dropped** in the console redesign; isolating one channel's light is now the **Additive Venn**'s **channel-solo** state. "Channel swatch" is retired as a part name.
- The redesigned **Hex field** is one editable field shown as three channel pairs (OTP-style segmented appearance), replacing the old separate hex digit boxes — *not* a second, display-only readout alongside them. One representation: read, edit, and (later) copy in the same place.
