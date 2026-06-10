// Content guard for tokens.css — the single source of design truth (ADR-0002).
//
// tokens.css is pure declaration (no logic), but its values ARE the deliverable
// of the redesign-tokens slice (C0FFEE-45) and two of them are load-bearing
// teaching decisions:
//   - the Channel colors must be the faithful pure primaries (ADR-0007) — a
//     future "tasteful" desaturation would silently break the lesson,
//   - DM Mono is self-hosted from public/fonts/ (no third-party font request),
//     chosen for its slashed zero — which is the font's DEFAULT glyph, so no
//     font-feature-settings may be added (the features don't exist in the font).
// These assertions pin those decisions the same way index.test.ts pins the
// home page's content contract.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const here = (p: string) => resolve(import.meta.dirname, p);
const css = readFileSync(here('./tokens.css'), 'utf8');

describe('tokens.css — redesign tokens (C0FFEE-45)', () => {
  it('labels the channels with the faithful pure primaries (ADR-0007)', () => {
    expect(css).toContain('--c0ffee-r: #FF0000');
    expect(css).toContain('--c0ffee-g: #00FF00');
    expect(css).toContain('--c0ffee-b: #0000FF');
  });

  it('nudges the background while leaving the panel surface untouched', () => {
    expect(css).toContain('--c0ffee-bg: #0a0a0b');
    // Menu tiles and the Swatch read --c0ffee-panel; the frugal-surfaces
    // decision (grill Q10) keeps it exactly where it was.
    expect(css).toContain('--c0ffee-panel: #161616');
  });

  it('self-hosts DM Mono at weights 300, 400, 500 with font-display swap', () => {
    for (const weight of [300, 400, 500]) {
      const face = new RegExp(
        '@font-face\\s*\\{[^}]*' +
          `font-family:\\s*["']DM Mono["'];[^}]*` +
          `font-weight:\\s*${weight}\\b[^}]*` +
          `src:\\s*url\\(["']?/fonts/dm-mono-${weight}\\.woff2["']?\\)\\s*format\\(["']woff2["']\\)[^}]*` +
          'font-display:\\s*swap',
        's'
      );
      expect(css).toMatch(face);
    }
  });

  it('puts DM Mono first in the site typeface token, with the mono stack as fallback', () => {
    expect(css).toContain(
      '--c0ffee-font: "DM Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace'
    );
  });

  it('records the slashed-zero rationale at the @font-face (the no-ADR font decision)', () => {
    // Grill Q8: the "why DM Mono = the slashed zero" rationale lives here, not
    // in an ADR. The comment also carries the verified finding that the
    // slashed zero is the default glyph (the font has no zero/calt features).
    expect(css).toMatch(/slashed zero/i);
    expect(css).toMatch(/default glyph/i);
  });

  it('ships the woff2 files and the OFL license alongside them', () => {
    for (const file of [
      'public/fonts/dm-mono-300.woff2',
      'public/fonts/dm-mono-400.woff2',
      'public/fonts/dm-mono-500.woff2',
      'public/fonts/OFL.txt',
    ]) {
      expect(existsSync(here(file)), `${file} should exist`).toBe(true);
    }
  });
});
