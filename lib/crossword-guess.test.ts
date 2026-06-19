import { test, expect } from 'vitest';
import { gradeGuess } from './crossword-guess.ts';

// The grading rule for a committed Guess (CONTEXT.md: Guess). Feedback is per
// Channel, never per digit: each Channel's two hex digits read as one 00-FF
// value, and that whole value reads higher / lower / correct. The verdict
// reports where the TRUE (target) value sits relative to the guess — so a guess
// below the target reads 'higher' (aim up), above it reads 'lower' (aim down).

test('PRD case: guess C0 vs target C5 reads the red Channel higher', () => {
  // target 0xC5 (197) sits above guess 0xC0 (192) -> aim up.
  const { red } = gradeGuess('C50000', 'C00000');
  expect(red).toBe('higher');
});

test('an exact Channel match reads correct (FF vs FF)', () => {
  const { red } = gradeGuess('FF0000', 'FF0000');
  expect(red).toBe('correct');
});

test('an exact six-digit match reads all three Channels correct', () => {
  expect(gradeGuess('1A2B3C', '1A2B3C')).toEqual({
    red: 'correct',
    green: 'correct',
    blue: 'correct',
  });
});

test('a guess above the target reads lower (aim down)', () => {
  // target green 0x10 (16) sits below guess green 0x80 (128).
  const { green } = gradeGuess('001000', '008000');
  expect(green).toBe('lower');
});

test('each Channel is graded independently', () => {
  // target R high, G equal, B low relative to the guess.
  expect(gradeGuess('FF8000', '008080')).toEqual({
    red: 'higher', // target FF(255) > guess 00(0)
    green: 'correct', // target 80(128) == guess 80(128)
    blue: 'lower', // target 00(0) < guess 80(128)
  });
});

// The load-bearing case: per-digit and per-Channel reasoning DISAGREE here, so
// this pins "feedback is per Channel, never per digit" (CONTEXT.md: Guess).
test('compares each Channel as one byte, not digit-by-digit', () => {
  // guess 0x0F (15), target 0x10 (16): high nibble 0<1 says "higher" but low
  // nibble F>0 says "lower". As one byte, 16 > 15 -> a single clean 'higher'.
  expect(gradeGuess('100000', '0F0000').red).toBe('higher');
  // and the mirror: guess 0x10 (16) vs target 0x0F (15) -> 'lower'.
  expect(gradeGuess('0F0000', '100000').red).toBe('lower');
});

test('grades the full byte range at the extremes (00 vs FF)', () => {
  expect(gradeGuess('0000FF', '000000').blue).toBe('higher');
  expect(gradeGuess('000000', '0000FF').blue).toBe('lower');
});

test('accepts a leading # and shorthand hex via lib/color parsing', () => {
  // '#f00' expands to ff0000; grading against ff0000 is all-correct.
  expect(gradeGuess('#ff0000', '#f00')).toEqual({
    red: 'correct',
    green: 'correct',
    blue: 'correct',
  });
});

test('throws loudly on a malformed target or guess (authoring/commit bug)', () => {
  expect(() => gradeGuess('xyz', '000000')).toThrow();
  expect(() => gradeGuess('000000', 'nothex')).toThrow();
});
