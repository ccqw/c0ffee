// crossword-guess.ts — the Hex Color crossword's grading rule (ADR-0003:
// functional core / imperative shell). Pure, no DOM and no state: a target Hex
// color address and a committed Guess in, per-Channel feedback out. The state
// reducer (C0FFEE-61) consumes this to decide which Cells lock and propagate.
//
// Domain (CONTEXT.md: Guess, Channel): feedback is per CHANNEL, never per digit.
// Each Channel's two hex digits read as one 00-FF value (0-255), and that whole
// value reads 'higher', 'lower', or 'correct' — never digit-by-digit. The
// verdict reports where the TRUE (target) value sits relative to the guess, so
// a guess below the target reads 'higher' (aim up) and above it 'lower'.

import { parseHex } from './color.ts';

/** Where a Channel's true value sits relative to the guessed value: the target
 *  is 'higher' (aim up), 'lower' (aim down), or 'correct' (the byte matches). */
export type ChannelVerdict = 'lower' | 'correct' | 'higher';

/** Per-Channel feedback for one committed Guess — one verdict per RGB Channel.
 *  There is no per-digit feedback by construction (CONTEXT.md: Guess). */
export interface GuessResult {
  red: ChannelVerdict;
  green: ChannelVerdict;
  blue: ChannelVerdict;
}

// gradeGuess(targetHex, guessHex) -> GuessResult
// Grades a committed Guess against the Slot's target color, one verdict per
// Channel. Both addresses are parsed with lib/color's parseHex (so a leading #
// and 3-digit shorthand are accepted); a value that doesn't parse to a six-digit
// color throws — a malformed target or guess is an authoring/commit bug, not a
// solver state, and is surfaced loudly rather than graded as if it were 00.
export function gradeGuess(targetHex: string, guessHex: string): GuessResult {
  const target = parseHex(targetHex);
  if (!target) throw new Error(`crossword-guess: target is not a Hex color address: ${targetHex}`);
  const guess = parseHex(guessHex);
  if (!guess) throw new Error(`crossword-guess: guess is not a Hex color address: ${guessHex}`);
  return {
    red: verdict(target.r, guess.r),
    green: verdict(target.g, guess.g),
    blue: verdict(target.b, guess.b),
  };
}

// One Channel's verdict: compare the target's byte to the guessed byte. parseHex
// has already collapsed each Channel's two digits into a single 0-255 value, so
// this is one numeric comparison — the per-Channel (never per-digit) rule.
function verdict(trueValue: number, guessValue: number): ChannelVerdict {
  if (trueValue === guessValue) return 'correct';
  return trueValue > guessValue ? 'higher' : 'lower';
}
