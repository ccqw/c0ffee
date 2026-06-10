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

// C0FFEE-51 — closeout: the Menu tiles converge to the console's surface
// language (grill Q10), and the console tile catches up with the redesigned
// console (faithful channel art per ADR-0007, Hex-field anatomy per CONTEXT.md).
// happy-dom does no paint, so these pin the *mechanism* in the page CSS the same
// way elements.test.ts pins the console card; the look is browser-verified.
describe('Menu tiles — console surface language (C0FFEE-51)', () => {
  const html = read('./menu.html');
  // Pull one rule block out of the page stylesheet by selector.
  const cssBlock = (selector: string): string =>
    html.match(new RegExp(selector.replace(/[.#[\]]/g, '\\$&') + '\\s*{[^}]*}'))?.[0] ?? '';

  it('tiles are the page bg dressed with a hairline + drop shadow, not a panel fill', () => {
    const card = cssBlock('.card');
    expect(card).toContain('background: var(--c0ffee-bg');
    expect(card).toContain('border: 1px solid rgba(255,255,255,.06)');
    expect(card).toMatch(/box-shadow:[^;]*rgba\(0,0,0,/);
  });

  it('tile hover brightens the hairline', () => {
    expect(cssBlock('.card:hover')).toContain('border-color: rgba(255,255,255,');
  });

  it('console-tile art shows the faithful channel colors (ADR-0007 tokens)', () => {
    const art = cssBlock('.art.console');
    expect(art).toContain('var(--c0ffee-r');
    expect(art).toContain('var(--c0ffee-g');
    expect(art).toContain('var(--c0ffee-b');
  });

  it('console-tile copy names the redesigned anatomy — Swatch, Additive Venn, editable hex field', () => {
    // The flagship anatomy (CONTEXT.md): the hex field is the part the
    // pre-redesign copy could not have named — its presence dates the copy.
    expect(html).toMatch(/swatch/i);
    expect(html).toMatch(/additive venn/i);
    expect(html).toMatch(/editable hex field/i);
  });
});

describe('Home page (index.html)', () => {
  it('does not link to the Menu (unlinked until there is more to show)', () => {
    // Guard the intent — home points at no Menu — independent of URL shape:
    // catch any href to the menu, with or without the .html extension.
    expect(read('./index.html')).not.toMatch(/href=["'][^"']*menu/i);
  });
});
