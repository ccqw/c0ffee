# c0ffee ☕

A front-end-only website of interactive color **toys** (and lessons woven from them) that teach how color works in computer graphics — with a special love for hex intuition.

The name is itself a valid hex color: `#C0FFEE`, a pale mint.

Live at **[c0ffee.cafe](https://c0ffee.cafe)** (GitHub Pages).

## How it's built

- **TypeScript, built with Vite.** Pages are hand-authored HTML; the TypeScript modules are bundled by Vite into `dist/`, which is what GitHub Pages publishes (ADR-0006).
- **Toys are Web Components.** Each toy (e.g. `<c0ffee-mirror>`) is a self-contained custom element. A page just imports it and drops in the tag.
- **One color brain.** `lib/color.ts` holds the pure color math (hex parse/format, RGB↔HSV, legibility) and the domain types (`Rgb`, `Hsv`, the ADR-0001 `ColorInterface`); see the architecture below.

## Architecture

The design language lives in [`CONTEXT.md`](./CONTEXT.md). Key decisions are recorded as ADRs in [`docs/adr/`](./docs/adr/):

- **0001** — uniform Toy color interface (attribute/URL in, property + event out)
- **0002** — Shadow DOM isolation + shared design tokens (`tokens.css`)
- **0003** — functional core / imperative shell (the `node --test` / no-build half superseded by 0006)
- **0004** — scroll-driven lesson beats with a pinned companion mirror
- **0005** — mobile-first responsive layout
- **0006** — TypeScript build (Vite + Vitest + happy-dom), superseding ADR-0003's no-build constraint

What's deferred is parked in [`ROADMAP.md`](./ROADMAP.md).

## Develop

```sh
npm install        # once
npm run dev        # local dev server (hot reload)
npm test           # Vitest: color core + happy-dom shell tests
npm run typecheck  # tsc --noEmit
npm run build      # bundle to dist/ (what GitHub Pages publishes)
```

## Deploy

Once the repo's Pages **Source** is set to **GitHub Actions**, pushing to the default branch runs `.github/workflows/deploy.yml`: it builds with Vite and publishes `dist/` to GitHub Pages. The custom domain rides along via `public/CNAME` (copied into `dist/`), so `c0ffee.cafe` and HTTPS are unchanged. (Until that switch, Pages still serves the branch root directly — which is why the source must be flipped to Actions as part of landing this build.)
