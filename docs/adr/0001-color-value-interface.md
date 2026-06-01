# 0001 — Every single-color interactive exposes its Color value through a uniform native-style interface

Every single-color interactive presents the same contract for its live Color value, modeled on native form elements (`<input>`): seed in via attribute/URL, read out via property, notify out via event. This keeps interactives composable and lets Lessons wire one interactive's output to another's input without bespoke glue. Elsewhere this contract is named **the ADR-0001 Color value interface**; only single-color interactives satisfy it (a guess game or palette need not).

## The contract

1. **Seed in** — a `hex` attribute (and the URL hash `#hex` on a page that opts in) sets the initial Color value. Malformed/missing → default, never a broken render. *(Amended 2026-05-31 — hash-only, and seeding is now live rather than initial-only; see Amendment.)*
2. **Read out (pull)** — a `.value` property exposes the current Color value as a `{r,g,b}` object; a `.hex` getter returns the Hex color address string. Readable at any time.
3. **Notify out (push)** — a `colorchange` `CustomEvent` fires whenever the Color value changes, with the new value in `event.detail`.
4. **Reflect (opt-in)** — an interactive may reflect its live Color link to `location.hash` so the address bar is always shareable. *(Amended 2026-05-31 — reflection is a property of the interactive's contract, opt-in, not a property of the page type; see Amendment.)*

## Why

- **Events + property are the native idiom.** `<input>` fires `input` *and* exposes `.value`; consumers react via the event or poll via the property. Supporting both covers wire-it-up and read-on-demand without forcing listeners.
- **Composability is the whole point.** A Lesson can connect interactives; a uniform event/property contract makes that ~3 lines, not custom integration per pair.
- **URL reflection is delightful but ambiguous with many interactives.** Making auto-reflection opt-in (never automatic) avoids "which interactive owns the URL?" on a page with more than one.

## Consequences

- Consumers depend on the names `hex` (attr), `.value`/`.hex` (props), `colorchange` (event) — these are now public API and costly to rename. Establish them once, keep them stable across all interactives that expose a Color value.
- Future notations (RGB/HSV Color links) extend the seed/reflect layer without changing the value or event shape.

## Amendment — 2026-05-31 (C0FFEE-17; flagged by C0FFEE-14, ships in C0FFEE-22)

**URL ownership is a property of the interactive's Color value interface, not of the page type.**

The original points 1 and 4 framed URL seeding/reflection as a "Playground-only, page-level" concern (back when the solo-interactive page was called the *Playground*). Revised:

- **Opt-in on the contract.** Whether an interactive round-trips its Color value through the URL is a capability of *that interactive*, enabled explicitly — not something the page type confers. A Color console can reflect its hex address; a guess game has no single address to reflect. Nothing auto-reflects, so multiple interactives on one page never contend for the URL.
- **Hash-only.** The canonical Color address in the URL is the fragment (`#C0FFEE`). The `?hex=` query form is **dropped** — read nowhere, written nowhere. One format keeps it simple; the only thing a query bought (server-side link previews) a static site can't use.
- **Live, not initial-only.** Seeding re-runs on `hashchange` (and on cold load), so pasting a new hex into the address bar updates the color live. This extends point 1's "seed in" from initial-only.

This supersedes point 4's page-type framing and narrows point 1 to hash-only.
