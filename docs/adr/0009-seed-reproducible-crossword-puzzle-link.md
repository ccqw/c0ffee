# 0009 - Crossword puzzles are seed-reproducible and shared via a hash puzzle link, distinct from the Color link

To let a solver hand a friend the *exact* puzzle they just solved, a Hex Color crossword puzzle must be reproducible from a short token, and that token must ride in the URL. The puzzle's identity (its authored shape plus its target colors) is encoded as a **seed token in the URL hash fragment** on the crossword route - the **Puzzle link** (CONTEXT.md). This is a deliberately separate contract from the ADR-0001 **Color link**, even though both live in the hash.

This is forward-looking: it is recorded now, while the crossword (Linear C0FFEE-12) is still being built, specifically so the **generator slice is built seed-ready** and we do not pay to retrofit determinism later. The share feature itself ships *after* the crossword.

## The decision

1. **The generator is deterministic.** A puzzle is `(shape-id, seed)`. Given the same pair, the generator produces byte-identical target colors. The previously-specced "random at load" generation becomes "seed at load" - a fresh puzzle just draws a fresh seed.
2. **The puzzle is shared as a hash token.** `c0ffee.cafe/crossword#<token>`, where `<token>` packs `shape-id` + `seed`. On load, the crossword reads `location.hash`, decodes the token, and reproduces that exact puzzle. Empty/malformed hash -> a fresh random puzzle (never a broken render), mirroring the Color link's malformed-to-default posture.
3. **The token is shape-distinct from a bare hex run.** A Color link hash is a run of hex digits (`#C0FFEE`); the puzzle token must not look like one, so a future reader (and any shared codec) can never confuse the two conventions.
4. **The answers stay latent.** The link carries a seed, not colors - solving is still required. Encoding the explicit target colors in the URL is rejected.

## Why

- **No backend, so the hash is the idiom.** The site is static (GitHub Pages, ADR-0006). The fragment never leaves the browser, so seed-carried state needs no server - which is exactly why the Color link already uses the hash and never a `?query` (ADR-0001, 2026-05-31 amendment). A query string would round-trip to the CDN for nothing.
- **Distinct from the Color link, on purpose.** A Color link is one Hex color address on a console route; the crossword holds many Color values and reflects no Color link (ADR-0001). A Puzzle link is a different payload (a seed) on a different route (`/crossword`). Same mechanism (hash state), different contract - keeping them separate stops the crossword from looking like it violates "the crossword has no Color link."
- **No parser collision.** `parseColorLink` shape-sniffs the hash and only runs where `<c0ffee-console>` is mounted. The crossword is its own solo-interactive route with no console, so it owns its fragment and runs its own seed codec; the two hash readers never meet.
- **Seed in URL, not colors, defends the puzzle.** A self-describing "all targets in the URL" link would expose every answer to anyone who reads the address bar - the puzzle would be solved by curiosity. A seed keeps the targets latent.

## Consequences

- **The generator must be a pure, seeded function** - it moves fully into the functional core (ADR-0003), seed in, puzzle out, no ambient randomness. This is a constraint on the crossword's *generator slice*, which must land seed-ready even though sharing ships later.
- **The crossword gains a hash codec** (encode/decode the seed token), parallel in spirit to `parseColorLink`/`formatColorLink` but on its own route and its own token shape.
- **Reproducibility makes the Solve time meaningful.** Two people can race the *same* puzzle, so "solved in 4:15 - can you beat me?" compares like for like. The Solve time is the crossword's only score-like signal (CONTEXT.md); the game stays otherwise unscored.
- **A daily/dated puzzle is now cheap to add later** (a date-to-seed scheme on top of the deterministic generator) but is explicitly **not** adopted here - that is a content-cadence commitment, out of scope.

## Alternatives considered

- **`?p=<seed>` query string.** Off-convention (the Color link is hash-only), and it round-trips the seed to the CDN for no benefit a static site can use. Rejected for the hash.
- **Full-puzzle link (all target colors in the URL).** Self-describing but puts the answers in plain sight and makes the puzzle trivially cheatable. Rejected.
- **Daily-puzzle seed (Wordle's model).** Everyone gets the same puzzle each day. Heaviest - it needs a date-to-seed scheme and an authored/rotating cadence (a product, not a feature). Deferred; the deterministic generator leaves the door open.
