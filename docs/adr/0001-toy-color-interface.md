# 0001 — Every Toy exposes its Color value through a uniform native-style interface

Every Toy presents the same contract for its live Color value, modeled on native form elements (`<input>`): seed in via attribute/URL, read out via property, notify out via event. This keeps Toys composable and lets Lessons wire one Toy's output to another's input without bespoke glue.

## The contract

1. **Seed in** — a `hex` attribute (and the URL `?hex=` / `#hex` on Playgrounds) sets the initial Color value. Malformed/missing → default, never a broken render.
2. **Read out (pull)** — a `.value` property exposes the current Color value as a `{r,g,b}` object; a `.hex` getter returns the Hex color address string. Readable at any time.
3. **Notify out (push)** — a `colorchange` `CustomEvent` fires whenever the Color value changes, with the new value in `event.detail`.
4. **Reflect (Playground only)** — Playgrounds reflect the live Color link to `location.hash` so the address bar is always shareable. NOT auto-enabled inside Lessons, where multiple Toys would contend for one URL; a Lesson may opt one Toy in explicitly.

## Why

- **Events + property are the native idiom.** `<input>` fires `input` *and* exposes `.value`; consumers react via the event or poll via the property. Supporting both covers wire-it-up and read-on-demand without forcing listeners.
- **Composability is the whole point.** "Toys as backbone" means a Lesson can connect Toys; a uniform event/property contract makes that ~3 lines, not custom integration per pair.
- **URL reflection is delightful but ambiguous with many Toys.** Restricting auto-reflection to single-Toy Playgrounds avoids "which Toy owns the URL?" on Lesson pages.

## Consequences

- Consumers depend on the names `hex` (attr), `.value`/`.hex` (props), `colorchange` (event) — these are now public API and costly to rename. Establish them once, keep them stable across all Toys.
- Future notations (RGB/HSV Color links) extend the seed/reflect layer without changing the value or event shape.
