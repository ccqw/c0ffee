// Content guard for the home page (/, index.html) — the solo Color console.
//
// Home (the site root) has no JS logic of its own (CONTEXT.md: the root *is* the
// flagship Color console shown **solo** — full presentation, full-bleed, no
// prose). It's a thin host of the already-tested <c0ffee-console> plus the Site
// banner, so there's no pure function to unit-test; what IS load-bearing is its
// *content contract*:
//   - it hosts the flagship console solo, in the `full` presentation, reflecting
//     the URL (the C0FFEE-22 hash round-trip + C0FFEE-23 presentation already
//     shipped inside the element — home just opts in),
//   - it wears the Site banner and loads both element modules,
//   - it is prose-free: the old hero/tagline and the relocated grid of links are
//     gone (the grid moved to /menu.html in C0FFEE-27),
//   - the de-Toy work sticks — no retired user-facing vocabulary creeps back in.
// These assertions pin the slice's deliverable and guard the vocabulary against
// regression. (The cross-page "home stays unlinked from the Menu" invariant is
// guarded from the Menu's side in menu.test.ts.)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(import.meta.dirname, p), 'utf8');

describe('Home page (/, index.html) — the solo Color console', () => {
  const html = read('./index.html');

  it('hosts the flagship console solo: full presentation, reflecting the URL', () => {
    expect(html).toMatch(/<c0ffee-console\b[^>]*\bpresentation=["']full["'][^>]*>/i);
    expect(html).toMatch(/<c0ffee-console\b[^>]*\breflect\b[^>]*>/i);
  });

  it('wears the Site banner and loads both element modules', () => {
    expect(html).toContain('<c0ffee-banner>');
    expect(html).toMatch(/elements\/banner\.ts/);
    expect(html).toMatch(/elements\/console\.ts/);
  });

  it('is prose-free: the relocated grid of links is gone', () => {
    // The grid of cards moved to /menu.html (C0FFEE-27); home no longer carries
    // it. Guard both the layout container and the destinations it linked to.
    expect(html).not.toContain('class="grid"');
    expect(html).not.toContain('play/console.html');
    expect(html).not.toContain('lessons/colors-are-made-of-light.html');
  });

  it('is prose-free: carries no headings or paragraphs of its own', () => {
    // The solo interactive frames exactly one interactive with NO prose
    // (CONTEXT.md). The console and banner render their own content inside
    // shadow roots, so the host document itself must hold no prose tags — this
    // pins the "no prose" contract positively, so a future tagline/hero can't
    // creep back while every negative grid/vocab guard stays green.
    for (const prose of [/<p\b/i, /<h1\b/i, /<h2\b/i, /<h3\b/i]) {
      expect(html).not.toMatch(prose);
    }
  });

  it('does not resurrect retired Toy-era vocabulary', () => {
    // After C0FFEE-24 the element modules live under `elements/`, so no script
    // path collides with the bare "toy(s)" guard — the raw HTML is checked directly.
    for (const retired of [/\btoys?\b/i, /toybox/i, /playground/i, /\bmirror\b/i, /\bgallery\b/i]) {
      expect(html).not.toMatch(retired);
    }
  });
});
