// Content guard for the Lesson page (/lessons/colors-are-made-of-light.html).
//
// The Lesson's interactive behavior (scroll-driven Active beat, swatch-click
// loading) is exercised in lesson-runtime.test.ts. This file guards the page's
// *content contract* — the parts C0FFEE-29 makes load-bearing:
//   - it wears the Site banner and loads the element module; the banner sits in
//     normal flow above the pinned Companion console (ADR-0005) and scrolls away,
//   - the pinned Companion console (data-companion) is untouched by the chrome,
//   - the footer no longer points "back to the toybox" (retired vocab, and the
//     root is the solo console now, not a toybox) — it browses the Menu instead,
//   - no retired user-facing vocabulary survives anywhere in the prose.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(import.meta.dirname, p), 'utf8');

describe('Lesson page (colors-are-made-of-light.html)', () => {
  const html = read('./colors-are-made-of-light.html');

  it('wears the Site banner and loads its element module', () => {
    expect(html).toContain('<c0ffee-banner>');
    expect(html).toMatch(/elements\/banner\.ts/);
  });

  it('keeps the pinned Companion console intact', () => {
    expect(html).toMatch(/<c0ffee-console\b[^>]*\bdata-companion\b[^>]*>/i);
  });

  it('footer browses the Menu instead of the retired "toybox"', () => {
    expect(html).toContain('menu.html');
    expect(html).not.toMatch(/toybox/i);
  });

  it('does not resurrect retired Toy-era vocabulary', () => {
    // After C0FFEE-24 the element modules live under `elements/`, so no script
    // path collides with the bare "toy(s)" guard — the raw HTML is checked directly.
    for (const retired of [/\btoys?\b/i, /toybox/i, /playground/i, /\bmirror\b/i, /\bgallery\b/i]) {
      expect(html).not.toMatch(retired);
    }
  });
});
