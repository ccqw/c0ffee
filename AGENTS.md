# c0ffee

Static color-education site (c0ffee.cafe). Small interactive color elements, with a love for hex intuition. TypeScript + Vite, no backend, deployed to GitHub Pages.

## Commands

- `npm run dev` — Vite dev server
- `npm test` — Vitest (happy-dom), single run; `npm run test:watch` to watch
- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — production build to `dist/`

## Map

- `lib/` — functional core (pure color math; `color.ts`)
- `elements/` — imperative shell: custom elements (`console.ts`, `swatch.ts`, `banner.ts`)
- `lessons/` — Lesson pages + scroll-driven beat runtime
- `tokens.css` — design tokens (`--c0ffee-*`)
- `docs/adr/` — accepted decisions; read before changing anything architectural
- `CONTEXT.md` — the domain language. **Read it before writing user-facing copy or naming anything new**; it defines the controlled vocabulary, including per-term Avoid lists (e.g. never "Toy" or "widget").

## Invariants

- Core/shell split (ADR-0003): color logic goes in `lib/` as pure functions with tests; elements only wire DOM to it.
- The URL hash carries a color and nothing else; non-color dev flags use query params.
- Style through `--c0ffee-*` tokens, not hard-coded values; elements use shadow DOM (ADR-0002).
- Tests assert content positively (what IS there), not absence of banned words.
- happy-dom can't see rendering — visual changes also need a human eyeball on `npm run dev`.
- Issue tracker is Linear (`C0FFEE-*`), not GitHub Issues. PRs squash-merge to `main`.
