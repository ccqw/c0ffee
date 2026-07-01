// crossword-share.ts — the share message composer (ADR-0003 functional core;
// C0FFEE-80, third slice of the C0FFEE-57 share PRD). Pure {elapsedMs?, puzzleUrl}
// -> the plain text the completion-state share control hands to navigator.share or
// the clipboard: the game's name with the coffee-emoji wordmark, an optional
// Solve-time boast, the emoji signature, and the Puzzle link.
//
// The signature is a CONSTANT — never derived from the solved colors — so a shared
// message is spoiler-free by construction: nothing about the answers can leak into
// it because nothing about the answers goes into it. What it draws is the anatomy
// of a Hex color address itself (the hash + the two-digit red/green/blue pairs),
// echoing the console's channel-pair Hex field. The answers stay latent in the
// Puzzle link too (ADR-0009: the token is a seed, never the targets).

/** What the message is composed from: the Puzzle link URL (built by the shell from
 *  the C0FFEE-78 codec) and, optionally, the frozen Solve time in milliseconds (the
 *  C0FFEE-79 accumulator's native unit). Elapsed rides in only when provided — the
 *  solver's opt-in is the caller's call, absence is first-class (CONTEXT.md). */
export interface ShareMessageOpts {
  puzzleUrl: string;
  elapsedMs?: number;
}

// The constant emoji signature: '#' + the six channel squares (two red, two green,
// two blue) — a Hex color address drawn in emoji. These are the only non-ASCII
// characters the site emits into a share sheet; they are the product, not decoration.
const SIGNATURE = '#\u{1F7E5}\u{1F7E5}\u{1F7E9}\u{1F7E9}\u{1F7E6}\u{1F7E6}';

// The name line: the descriptive glossary term (a recipient has never met the
// public name), signed with the coffee emoji beside the namesake color address.
const NAME_LINE = 'I solved the Hex Color crossword ☕ #C0FFEE';

// m:ss with unpadded minutes and floored seconds — the same shape the completion
// card's frozen readout shows (fmtTime in the shell), so the boast and the card
// can never disagree about the time.
function fmtSolveTime(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// composeShareMessage({puzzleUrl, elapsedMs?}) -> the shareable plain text.
// The Solve-time line rides in only when elapsed is present (CONTEXT.md's canonical
// boast); the name line, signature and link are always there. Fails loud on an
// unrenderable elapsed — the accumulator never yields a negative or non-finite
// value, so one here is a wiring bug, guarded the way the sibling cores guard
// programmer error (encodePuzzleToken's un-round-trippable input).
export function composeShareMessage({ puzzleUrl, elapsedMs }: ShareMessageOpts): string {
  if (elapsedMs !== undefined && (!Number.isFinite(elapsedMs) || elapsedMs < 0)) {
    throw new Error(`composeShareMessage: elapsedMs ${elapsedMs} is not a non-negative duration`);
  }
  // The link must be the message's intact last line (the round-trip contract): an empty
  // or newline-carrying URL would silently corrupt that shape, so it fails loud too.
  if (!puzzleUrl || puzzleUrl.includes('\n')) {
    throw new Error(`composeShareMessage: puzzleUrl ${JSON.stringify(puzzleUrl)} is not a single-line URL`);
  }
  const lines = [NAME_LINE];
  if (elapsedMs !== undefined) {
    lines.push(`Solved in ${fmtSolveTime(elapsedMs)} - can you beat me?`);
  }
  lines.push(SIGNATURE, puzzleUrl);
  return lines.join('\n');
}
