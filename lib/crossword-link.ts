// crossword-link.ts — the Puzzle link codec (ADR-0003 functional core; ADR-0009 the
// governing decision). A Puzzle link reproduces a specific Hex Color crossword for
// another solver by carrying the puzzle's identity — its authored shape id plus the
// generator seed — as a token in the URL hash fragment on the crossword route
// (`/crossword#<token>`; CONTEXT.md: Puzzle link). The target colors stay LATENT: the
// token is a seed, never the answers.
//
// This is the crossword's twin of color.ts's Color link codec (parseColorLink /
// formatColorLink), and deliberately a SEPARATE contract (ADR-0009): a Color link is a
// run of hex digits (#C0FFEE) on a console route; a Puzzle token is a scheme-tagged,
// tilde-delimited string on the crossword route. The `cw~` tag + `~` delimiters mean a
// token always contains a non-hex character, so it can never be shaped like a bare hex
// run — and a bare hex run, having no `~`, can never decode as a token. The two hash
// conventions are structurally disjoint and can never be confused (ADR-0009 #3).
//
// Pure and total on decode (null on anything malformed, never throws), mirroring the
// malformed-to-default posture parseColorLink and the generator's hash load share: a bad
// link yields a fresh puzzle, never a broken render. `~` is RFC-3986 unreserved, so the
// token rides a real URL hash with no percent-encoding.

/** A Puzzle link's payload: the authored shape id and the generator seed that together
 *  reproduce one puzzle (ADR-0009: a puzzle is `(shapeId, seed)`). Not a full `Puzzle`
 *  (that is layout + targets, the generator's output) — just the two-value identity the
 *  link carries. The caller hands this to `generatePuzzle` to rebuild the board. */
export interface PuzzleRef {
  shapeId: string;
  seed: number;
}

// The scheme tag that marks a Puzzle token, and the field delimiter. Frozen once links
// ship (see the header for why this shape is hex-distinct, and ADR-0009 #3).
const SCHEME = 'cw';
const SEP = '~';

// A shape id is kebab-case (crossword-shapes.ts authors them as `[a-z0-9-]+`); a seed is
// a non-negative decimal integer. These bound both the encode guard and the decode parse.
const SHAPE_ID = /^[a-z0-9-]+$/;
const SEED = /^[0-9]+$/;

// encodePuzzleToken({shapeId, seed}) -> token
// Formats the canonical Puzzle token from a trusted internal ref. Fails loud on an
// un-round-trippable input (a shapeId outside the kebab grammar — e.g. one carrying the
// `~` delimiter — or a seed that is not a non-negative integer): minting a token decode
// could not reverse would be a silent contract break, so guard it the way the sibling
// cores fail loud on programmer error. The returned token is bare (no leading '#'); the
// caller prepends the '#' fragment delimiter when building the URL.
export function encodePuzzleToken({ shapeId, seed }: PuzzleRef): string {
  if (!SHAPE_ID.test(shapeId)) {
    throw new Error(`encodePuzzleToken: shapeId '${shapeId}' is not a kebab-case id`);
  }
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error(`encodePuzzleToken: seed ${seed} is not a non-negative integer`);
  }
  return `${SCHEME}${SEP}${shapeId}${SEP}${seed}`;
}

// decodePuzzleToken(hash) -> {shapeId, seed} | null
// Reads a URL hash fragment (the part after '#'; a leading '#' is tolerated since
// location.hash includes it) and returns the Puzzle ref, or null on anything malformed:
// wrong scheme tag, missing/extra fields, an off-grammar shapeId, or a seed that is not a
// plain non-negative integer. Total — never throws — so the caller can fall straight back
// to a fresh puzzle. A bare hex run (a Color link) has no `~`, so it splits to one field
// and falls out here as null.
export function decodePuzzleToken(hash: string | null | undefined): PuzzleRef | null {
  if (typeof hash !== 'string') return null;
  const parts = hash.replace(/^#/, '').split(SEP);
  if (parts.length !== 3) return null;
  const [scheme, shapeId, seedStr] = parts;
  if (scheme !== SCHEME) return null;
  if (!SHAPE_ID.test(shapeId)) return null;
  if (!SEED.test(seedStr)) return null;
  const seed = Number(seedStr);
  if (!Number.isSafeInteger(seed)) return null;
  return { shapeId, seed };
}
