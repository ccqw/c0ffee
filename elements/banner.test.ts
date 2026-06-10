// Shell test for <c0ffee-banner> — the Site banner (CONTEXT.md).
//
// The banner is presentational chrome: it holds no Color value and is NOT bound
// by the ADR-0001 Color value interface. So unlike the swatch/console shell
// tests, there's no value/hex/colorchange contract to assert. What IS load-
// bearing — and what these tests pin — is its *behavioral* promise: a single
// home affordance (the wordmark links to /), no nav affordance yet (deferred),
// and that it reads as quiet chrome, never sticky.
//
// C0FFEE-52: the cup lockup won the C0FFEE-46 live eval and is now THE banner —
// `#C0FFEE cafe` wordmark with the pixel-cup badge. No variants, no flag.

import { describe, it, expect, beforeEach } from 'vitest';
import './banner.ts';

const NEXT = () => new Promise((r) => setTimeout(r, 0));
const mount = async () => {
  document.body.innerHTML = '<c0ffee-banner></c0ffee-banner>';
  await NEXT();
  return document.querySelector('c0ffee-banner')!.shadowRoot!;
};

describe('<c0ffee-banner> (the Site banner)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the #C0FFEE cafe wordmark in a shadow root', async () => {
    const root = await mount();
    expect(root.textContent).toContain('#C0FFEE');
    expect(root.textContent).toContain('cafe');
  });

  it('puts the mint accent on the zero', async () => {
    const root = await mount();
    const zero = root.querySelector('.zero');
    expect(zero).not.toBeNull();
    expect(zero!.textContent).toBe('0');
  });

  it('renders the pixel-cup badge image from public/', async () => {
    const root = await mount();
    const img = root.querySelector('img');
    expect(img).not.toBeNull();
    // absolute path: resolves from every page (/, /menu, /lessons/*) on the
    // built site, not just the dev server
    expect(img!.getAttribute('src')).toBe('/pixie-badge.png');
  });

  it('makes the wordmark the home link (brand-only — no nav yet)', async () => {
    const root = await mount();
    const links = root.querySelectorAll('a');
    // exactly one link, pointing home — no Menu/nav links yet (deferred)
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toBe('/');
    expect(links[0].textContent).toContain('#C0FFEE');
  });

  it('has no nav affordance yet (deferred until the Menu earns surfacing)', async () => {
    const root = await mount();
    expect(root.querySelector('nav')).toBeNull();
  });

  it('is not sticky — it scrolls away with the page', async () => {
    const root = await mount();
    const style = root.querySelector('style')!.textContent ?? '';
    // the banner must never pin: no sticky/fixed positioning in its styles
    expect(style).not.toMatch(/position\s*:\s*(sticky|fixed)/i);
  });
});
