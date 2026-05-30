# 0003 — Functional core / imperative shell, with Node's built-in test runner

> **Partially superseded by [ADR-0006](0006-typescript-build.md) (C0FFEE-19).** The **functional-core / imperative-shell** decision below still stands. Only the **zero-build / no-npm / `node --test`** half is superseded: the codebase is now TypeScript built with Vite and tested with Vitest + happy-dom. Read the "why functional core" reasoning as current; read "`node --test` keeps the site zero-build" as historical — the shell is now unit-testable too.

The color math lives in `lib/color.js` as **pure functions** (hex parse/format, rgb↔hsv) — the functional core. Each Toy is a **class** (a Web Component) that owns its own Color value as instance state and calls the pure core — the imperative shell. Automated tests cover the core via Node's built-in runner (`node --test`).

## Why

- **Functional core, imperative shell.** The pure functions know nothing about the DOM, events, or time — they're just math, so they're trivially unit-testable (input → output, no mocks). The class holds the unavoidable messiness (DOM wiring, slider listeners, the sticky-hue memory) quarantined in the shell. This matches an FP-leaning preference while using the platform's class-based custom elements as the thin shell.
- **One brain, no duplicated bugs.** Every Toy imports the same `lib/color.js`, so a conversion fix happens once.
- **Sticky hue is the one real piece of state.** RGB→HSV is lossy at grays (undefined hue) and black (undefined hue+sat). Rather than smear this across converters, it lives in one explicit, named helper in the shell; the lossy edges are explicit tested cases, not mystery jitter.
- **`node --test` keeps the site zero-build.** It's built into Node — no `npm install`, no deps, no config. It returns a real exit code, so tests can be automated (CI on push, pre-commit) and gate mistakes instead of relying on eyeballing a `tests.html`. The *site* stays pure files for GitHub Pages; only the *tests* use a command, which is the right home for one.

## Consequences

- Contributors need Node installed to run tests (not to run or deploy the site).
- Pure functions are the tested surface; Toys are checked manually via their Playgrounds for v1 (no DOM test harness yet).
