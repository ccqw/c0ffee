# 0006 — Adopt a TypeScript build (Vite + Vitest), superseding ADR-0003's no-build constraint

**Status:** Accepted (this migration, C0FFEE-19).

The color math and the interactives move from zero-build/no-npm JavaScript to **TypeScript**, compiled and bundled by **Vite**, tested with **Vitest + happy-dom**. The **functional core / imperative shell** discipline from [ADR-0003](0003-functional-core-imperative-shell-and-node-tests.md) is kept; only its *no-npm / no-build* half is superseded.

## Context

- ADR-0003 chose functional-core/imperative-shell, `node --test`, and **zero-build / no-npm**. The no-build half bought view-source pedagogy but cost two things: (a) no automated testing of the Web Component **shell** (no DOM in `node --test` without jsdom/npm), and (b) no static types on a fundamentally type-shaped codebase — `lib/color.js` is pure `{r,g,b}` / hex math, and ADR-0001 is literally a typed contract (`hex` in, `{r,g,b}` out, `colorchange` event).
- The view-source / "shipped files are the real source" pedagogy is judged **nice-to-have, not load-bearing.**

## Decision

- Adopt **TypeScript**, compiled/bundled by **Vite**; test with **Vitest + happy-dom**.
- **Keep** the functional-core / imperative-shell discipline; only ADR-0003's no-npm/no-build constraint is superseded.
- Model the domain in types: an `Rgb` (`{r,g,b}`), `Hsv`, and a distinct branded `Hex` type so the ADR-0001 contract is a TS `interface` (`ColorInterface`) and ambiguities like `#C0FFEE` vs `C0FFEE` are unrepresentable.
- Ship **static output** (Vite build) to GitHub Pages; still a static site (CNAME + custom domain + HTTPS preserved).
- Pages remain **hand-authored HTML** for now; **no SSG / component framework** — deferred until the lesson-authoring model is known.

## Consequences

- Source ≠ deployed artifact (bundled/compiled) — accepted loss of pure view-source.
- `node_modules` + lockfile + supply-chain surface enter the repo.
- `lib/color.js` (+ its `node --test` cases) ported to `lib/color.ts` + Vitest; the `<c0ffee-mirror>`, `<c0ffee-swatch>`, and lesson-runtime modules ported to TS; `node --test` retired.
- The console **shell** becomes unit-testable (happy-dom) → the "no jsdom, browser-verify the body" testing decisions in C0FFEE-14 / 15 / 16 get revised: the shell gets DOM tests; a browser-MCP pass still covers real paint/layout. The reducer extraction in C0FFEE-14 stays valuable (pure logic is still cleanest to test) but is no longer the *only* way to test console logic.
- GitHub Pages deploy gains a **build step** (GitHub Action: build → publish `dist/`), replacing root-served raw files. The `CNAME` and `.nojekyll` ride along in `public/` so the custom domain and HTTPS are unchanged.

## Commands

```
npm install     # once
npm run dev      # local dev server
npm test         # Vitest (functional core + happy-dom shell tests)
npm run typecheck # tsc --noEmit
npm run build    # Vite -> dist/ (what GitHub Pages publishes)
```
