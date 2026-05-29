# 0002 — Toys render into Shadow DOM; styling is shared only through design tokens

Each Toy renders its internals into a Shadow DOM (encapsulated). The site shares look-and-feel through **design tokens** — `--c0ffee-*` CSS custom properties defined once in `tokens.css` — which both pages and Toys consume. Ordinary CSS rules are never shared across the shadow boundary.

## Why

We author both the Toys and the pages, so the goal isn't defending against hostile CSS — it's "unify the look from one place" *and* "never accidentally break a Toy's internals." Two facts about the shadow boundary make both true at once:

- **Custom properties inherit through** the boundary → tokens are the shared theming channel.
- **Selectors stop at** the boundary → a stray rule in a Lesson stylesheet cannot reach a Toy's guts.

So we deliberately share the small vocabulary (tokens) and keep the large surface (actual rules) isolated. Change `tokens.css` once and the whole site — pages and every Toy — restyles together.

## Considered options

- **Light DOM (toys render into the page):** toys inherit page styles for free, but a careless rule can restyle a toy's internals — rejected; the collision risk grows with every Lesson.
- **Shadow DOM, no token channel:** bulletproof isolation but toys can't be themed site-wide — rejected; we want one-file rebranding.

## Consequences

- A Toy does NOT automatically inherit the page font; it reads `--c0ffee-font`. The page must define the tokens (via `tokens.css`).
- The set of `--c0ffee-*` tokens is a public Theming contract — additions are cheap, renames are costly.
