# c0ffee ☕

A front-end-only, zero-build website of interactive color **toys** (and lessons woven from them) that teach how color works in computer graphics — with a special love for hex intuition.

The name is itself a valid hex color: `#C0FFEE`, a pale mint.

Live at **[c0ffee.cafe](https://c0ffee.cafe)** (GitHub Pages).

## How it's built

- **No build step.** Plain HTML/CSS/JS served as static files. Open any file in a browser; GitHub Pages serves it verbatim (`.nojekyll`).
- **Toys are Web Components.** Each toy (e.g. `<c0ffee-mirror>`) is a self-contained custom element. A page just imports it and drops in the tag.
- **One color brain.** `lib/color.js` holds the pure color math (hex parse/format, RGB↔HSV, legibility); see the architecture below.

## Architecture

The design language lives in [`CONTEXT.md`](./CONTEXT.md). Key decisions are recorded as ADRs in [`docs/adr/`](./docs/adr/):

- **0001** — uniform Toy color interface (attribute/URL in, property + event out)
- **0002** — Shadow DOM isolation + shared design tokens (`tokens.css`)
- **0003** — functional core / imperative shell, tested with `node --test`
- **0004** — scroll-driven lesson beats with a pinned companion mirror

What's deferred is parked in [`ROADMAP.md`](./ROADMAP.md).

## Develop

Just open the HTML files in a browser — there's nothing to install or build.

Run the color-math tests (needs Node, no `npm install`):

```sh
node --test
```

## Deploy

Pushing to the default branch publishes via GitHub Pages (served from the repo root). The custom domain is configured by the committed `CNAME` file.
