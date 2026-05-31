// Content guard for the standalone Color console page (/play/console.html).
//
// This page is a "solo interactive" page (CONTEXT.md): the flagship Color console
// shown on its own, owning the URL via `reflect`. Like the home and Menu pages it
// has no JS logic of its own — it's a hand-authored host — so there's no pure
// function to unit-test; what IS load-bearing is its *content contract*:
//   - it wears the Site banner and loads the element module (C0FFEE-29),
//   - it still hosts the reflecting console (the C0FFEE-22 round-trip),
//   - the deferred de-Toy fix finally lands here: the page title and heading no
//     longer use the retired "Playground / console playground" vocabulary, and no
//     other retired user-facing word creeps back in.
// These assertions pin the slice's deliverable and guard the vocabulary against
// regression.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(import.meta.dirname, p), 'utf8');

describe('Standalone console page (/play/console.html)', () => {
  const html = read('./console.html');

  it('wears the Site banner and loads its element module', () => {
    expect(html).toContain('<c0ffee-banner>');
    expect(html).toMatch(/toys\/banner\.ts/);
  });

  it('still hosts the reflecting Color console', () => {
    expect(html).toMatch(/<c0ffee-console\b[^>]*\breflect\b[^>]*>/i);
  });

  it('names the page the Color console (not the retired Playground)', () => {
    expect(html).toMatch(/color console/i);
  });

  it('does not resurrect retired Toy-era vocabulary', () => {
    // Strip the element module's <script> first: `toys/banner.ts` / `toys/console.ts`
    // are architectural paths (the dir moves to elements/ in C0FFEE-24), not
    // user-facing copy, so they must not trip the bare "toy(s)" guard.
    const copy = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    for (const retired of [/\btoys?\b/i, /toybox/i, /playground/i, /\bmirror\b/i, /\bgallery\b/i]) {
      expect(copy).not.toMatch(retired);
    }
  });
});
