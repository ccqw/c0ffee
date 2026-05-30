# c0ffee v2 — grill-with-docs handoff (continue from here)

**Purpose:** This is a mid-stream handoff for a fresh agent to **continue a `grill-with-docs` session** on the remaining open branches of the c0ffee v2 design. The first half of the grill (the heavy naming + the slider-locking design) is **done and committed to the docs**. Three branches were explicitly deferred to a fresh session; that's what you're picking up.

## How to run this

1. Invoke the **`grill-with-docs`** skill.
2. Read `CONTEXT.md` (the glossary — heavily updated this session) and `docs/adr/` (esp. ADR-0001, 0002, 0004, **0005**) before grilling, so you challenge against the *current* language.
3. Grill **one question at a time**, give a recommended answer each time, and **update `CONTEXT.md` / write ADRs inline** as terms resolve — same discipline as the first half.
4. The user is **Caitlin** (warm, playful, fast, hex-fluent). Her stated design principle this session: **"simple, direct, invisible — good design disappears."** She rejects metaphor-for-its-own-sake and formal/clever words; she likes plain, literal, concrete language (console, lesson, swatch, component). Match that bar when proposing terms.
5. After the grill completes, the pipeline is **`to-prd` → `to-issues` (write issues to Linear, team `c0ffee`, NOT GitHub issues)**. Per project workflow: one issue = one branch = one slice; **never batch external actions** (Linear writes / PR create+merge) in the same turn as the work — do each as its own turn after a plain verifying read (auto-mode safety-classifier gotcha).

## What's already SETTLED (in `CONTEXT.md` + ADR-0005 — do not re-litigate)

- **Home = the flagship console's Playground at `/`.** The old Toybox grid is shelved/relocated and unlinked from home until there's more to show.
- **Renames:** Toybox → **Menu**; `<c0ffee-mirror>` → **`<c0ffee-console>`** ("Color console"); "Companion mirror" → **Companion console**.
- **"Toy" dissolved** as a category (it was a false kind — the ADR-0001 single-Color-value contract doesn't even cover games/palettes). Call interactives by their real names; the contract is "the ADR-0001 Color value interface"; lowercase **"interactive"** is the internal-only collective.
- **Color model / Component:** added. **Channel** is now RGB-specific (R/G/B, 0–255, wedded to channel swatches + Venn); **Component** is the model-agnostic axis word (RGB components = Channels; HSV components = hue 0–360°, sat/val 0–100%; units differ).
- **Named color address:** the CSS keyword for a value *when one exists* — a **partial** notation (most values have none). The "144 = 90" reveal is reframed as **Hex address alongside RGB address**, not a new feature.
- **Presentation:** a named preset of the console (which parts render + layout: spacing, drawer, sticky). One console, many presentations — never a second element (ADR-0002).
- **Mobile-first** (ADR-0005): responsive pin axis (console pinned **top** on narrow → **beside prose** on wide); compact presentation + controls in a **pull-up drawer** on mobile. Supersedes ADR-0004's left-pin.
- **Lock** (slider locking, roadmap item `l`): ties **2+ Components of the same color model** (pair or triple). Modes **Equal** (same value) / **Offset** (constant gap). **Squish-and-restore** at the rails (Offset only). **Shared-scale rule:** RGB any combo; HSV only S↔V; **Hue unlockable** (own unit + wraps). Framed as rung 1 of the l→m relationship ladder (Equal = Offset-of-zero).
- **URL + share** (`c`/`k`): **hash-only** — emit `#hash` as the canonical address and read **only** the hash back (a `?hex=` query is deliberately *not* accepted; one format keeps it simple). **Live re-seed** on URL change on Playgrounds is the bug fix — a `hashchange`/`popstate` listener plus the cold-load parse. Pure `parseColorLink(string)` to be `node --test`ed; share = `navigator.share` on mobile, copy-link fallback. (Extends ADR-0001's "seed in" from initial-only; noted on the Color link term. Query was considered and rejected: only real upside is server-side link previews, which a static site can't do — revisit then if ever.)

## OPEN branches to grill (this session)

Original user brain-dump letters are referenced for traceability.

### #2 — Input validation (`g`) + the channel reveal (`h`, `i`)
Settled **in principle**, needs the visual/interaction specifics nailed:
- **(g)** Bad per-channel hex input must enter a visible **error/rejected state** with feedback on what's invalid — never silently ignored / dropped from render.
- **(h + i + the "144=90" reveal)** consolidated into **one "expanded channel" interaction**: a **global** toggle (default off; calm at rest) that blooms each channel to show **name · decimal · hex** together — e.g. `Red · 144 · 1E` — with decimal shown **alongside** hex (the bridge), editable. (Decimal entry = the RGB address per channel; HSV units differ — degrees/percent.)
- **Copy (`d`):** a copy button backed by an **invisible-but-real unified hex field** (per-channel hex stays visible; button yields the joined `#1E90FF`); wants a "copied!" flash.
- **Open to grill:** exact error-state visuals & validation rules (per-digit? on blur? on every keystroke?); the expanded-channel layout (must co-locate hex+dec per row per earlier decision); whether the global toggle lives in a header vs corner; how the reveal behaves for HSV (hue degrees, S/V percent); does the reveal tie to the `reading-a-hex-code` lesson.

### #3 — The banner (`e`)
- The top `#c0ffee` banner currently reads as if it's the console's displayed color ("wait, that's not my color"). Make the **site banner/menu read as chrome/nav**, clearly distinct from the console's Swatch.
- **Open to grill:** what the banner *is* now that home = the console (is it nav? brand mark? a thin top bar?); how it visually separates from the full-bleed console; interaction with mobile-first top-pinned layout (banner vs sticky console band competing for top space — real estate conflict to resolve).

### #4 — Web-color *picker* (`f`, the input half)
- Readout half (show the Named color address when present) is settled. **This** is the **input** half: let people **choose from web colors to load** one into the console.
- **Open to grill:** is this a picker UI (list/grid of the ~148 CSS names), a Named **Color link** notation (`?name=dodgerblue` — extends the link layer per ADR-0001), or both? Where does it live (console drawer? a separate interactive?)? Scope vs defer.

## PARKED (do NOT grill in detail yet — roadmap-level)

### #5 — Color space (`n`) + relationship graph (`m`)
- **(n)** Visualize the **RGB cube** / **HSV hexcone**, plot the current color as a point, explode the cube into slices. Thesis: **RGB ≈ implementation, HSV ≈ perception — two functions, different inputs, same output type (a color).** Carries its own **lesson series**.
- **(m)** Generalize **Lock** into arbitrary **functional relationships** between components, graphed. NOT lesson-gated (per Caitlin); ships independently when built.
- **Terminology already seeded:** `CONTEXT.md`'s **Color model** entry distinguishes *model* (the scheme) from **color space** (the geometric volume — this epic). Keep that line clean.
- **Why parked:** big, research-y, its own future epic; premature to grill its terms before it's scoped. Grill it as its own session when the user is ready.

## Ticket ledger (for `to-issues` → Linear, team c0ffee)

1. **Rename `<c0ffee-mirror>` → `<c0ffee-console>`** — 9 files, 3 file renames (`toys/mirror.js`, `toys/mirror-demo.html`, `play/mirror.html`), 12 tag-use sites, `customElements.define`, the lesson-runtime test, ADR-0004 wording. Pure rename, zero behavior change → do **first**, before new work builds on the name.
2. **Copy: "toybox" → "menu"** in `index.html` (title + tagline) and the lesson back-link (`lessons/colors-are-made-of-light.html:146`).
3. **Home = console Playground at `/`** + relocate the Menu grid to its own path (the real mobile-first/IA work; pairs with ADR-0005).
4. **De-Toy ADR-0001 + ROADMAP** wording (docs-only) — and note ADR-0001's "seed in" now includes live re-seed on Playgrounds **and is narrowed to hash-only URLs** (the `?hex=` query form is dropped).
5. **URL round-trip fix + tests** (`c`): pure `parseColorLink`, cold-load parse + live `hashchange` listener, `node --test` the parser, browser-verify wiring.
6. (Everything from the open branches above, once grilled.)
