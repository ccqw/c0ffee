// Content guard for the Menu page (/menu.html, CONTEXT.md term).
//
// The Menu has no JS logic of its own — it's a hand-authored page that relocates
// the grid of links off the site root and wears the <c0ffee-banner>. So there's
// no pure function to unit-test; what IS load-bearing is its *content contract*:
//   - it wears the Site banner and loads the element module,
//   - it still links to every destination the old root grid did,
//   - the de-Toy work sticks — no retired user-facing vocabulary creeps back in,
//   - and home stays unlinked from the Menu (CONTEXT: unlinked until there's
//     more than one thing worth showing).
// These assertions pin the slice's actual deliverable and guard the vocabulary
// against regression.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(import.meta.dirname, p), 'utf8');

describe('Menu page (/menu.html)', () => {
  const html = read('./menu.html');

  it('wears the Site banner and loads its element module', () => {
    expect(html).toContain('<c0ffee-banner>');
    expect(html).toMatch(/elements\/banner\.ts/);
  });

  it('carries the grid linking to the console (now at /) and the lesson', () => {
    // The standalone play/console.html was removed (C0FFEE-31): the solo Color
    // console lives at the root now, so the console card points home.
    expect(html).toMatch(/href=["']\/["']/);
    expect(html).not.toContain('play/console.html');
    expect(html).toContain('lessons/colors-are-made-of-light.html');
  });

  it('names the flagship the Color console', () => {
    expect(html).toMatch(/color console/i);
  });

  it('does not resurrect retired Toy-era vocabulary', () => {
    // The relocated copy is exactly where the deferred de-Toy fix landed. After
    // C0FFEE-24 the element module lives under `elements/`, so the script path no
    // longer collides with the bare "toy(s)" guard — the raw HTML is checked directly.
    for (const retired of [/\btoys?\b/i, /toybox/i, /playground/i, /\bmirror\b/i, /\bgallery\b/i]) {
      expect(html).not.toMatch(retired);
    }
  });
});

describe('Home page (index.html)', () => {
  it('does not link to the Menu (unlinked until there is more to show)', () => {
    // Guard the intent — home points at no Menu — independent of URL shape:
    // catch any href to the menu, with or without the .html extension.
    expect(read('./index.html')).not.toMatch(/href=["'][^"']*menu/i);
  });
});
