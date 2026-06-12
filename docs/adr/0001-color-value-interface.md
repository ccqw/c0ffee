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

## Amendment — 2026-06-10 (C0FFEE-25)

**On the live re-seed path, a malformed Color link is rejected — it never moves the value.**

Point 1's "Malformed/missing → default" was written for seed-in, where there is no current value to keep, and it still holds there: on initial load a malformed or missing fragment renders the default, never a broken render. The live re-seed path (previous amendment) now diverges:

- **Live `hashchange`, malformed (non-empty) fragment:** the edit is **rejected** — the Color value stays put, exactly like the Hex field dropping a filtered keystroke. No `colorchange` fires (nothing changed). The console then **heals the URL** (a `replaceState` of the displayed color's canonical link — no `hashchange` echo) and shows a **transient hint** at the Hex field saying why. A malformed fragment never leaves the address bar disagreeing with the render.
- **Initial load, malformed:** default as before (nothing to keep), then the same heal + hint.
- **Empty hash, load or live:** stays silent *and stays clean* — the default value is never written into an empty hash. An empty fragment showing the default color is the honest resting state, so a plain URL is left untouched until the user actually moves the color. (Previously connect-time canonicalization appended the default link to a plain URL; a *non-empty* hash still canonicalizes on connect, `#f60` → `#FF6600`.)

`parseColorLink` is untouched — total, `null` on malformed. The reject/heal/hint policy lives in the console's reflection wiring, not the codec.

## Amendment — 2026-06-11 (C0FFEE-56)

**Reflection tracks the Color value within ~500ms, and URL writes are fallible — guarded and retried, never assumed.**

Point 4's reflection was written as if every change could write the URL immediately. WebKit (the engine under every iOS browser) rate-limits the history API — ~100 calls per 10s in current builds, 100/30s in older ones — and **throws** `SecurityError` past quota, where Blink silently drops excess calls. A 60Hz slider drag exhausted the quota in under two seconds and every later frame threw an uncaught error (the iOS "Script error." flood RUM caught the day it went live). Revised:

- **Throttled, trailing-edge.** All URL writes funnel through one throttled method (500ms interval ≈ 2 writes/s — safe under both observed quota windows). The first write in a quiet period lands immediately, so connect-time canonicalization, single edits, and the C0FFEE-25 heal stay live; a burst coalesces into one deferred write that reads the value — and re-runs the equality/empty-hash guards — **when the timer fires**, so the URL always settles on the final color and a value that circled back writes nothing.
- **Writes are fallible.** The `replaceState` call is wrapped in try/catch — the quota is undocumented engine policy and has already changed once, so the interval math is load-shedding, not the correctness argument. On catch, the write self-reschedules on a ~2s backoff until one lands: the URL must eventually stop lying even if the user walks away mid-drag. Failures warn per attempt (numbered); after 5 consecutive failures, ONE `console.error` fires — that's the escalation RUM collects, so a recurrence of the flood stays visible in production as a single event per pathological session.
- **Lifecycle.** A pending write (trailing or retry) is cleared on disconnect — a disconnected element never writes the URL. Caveat for any future runtime that *reparents* a reflecting console (today nothing does — disconnect means page teardown): reconnect re-seeds from the hash, and if a failed write was pending at disconnect, that hash is the stale link — the re-seed would quietly roll the value back to it.

The shareable-address promise is unchanged in substance: the address bar now tracks the live Color value *within about half a second* instead of within a frame — imperceptible against how URLs are read and shared, and the difference between a working address bar and an error flood on iOS.
