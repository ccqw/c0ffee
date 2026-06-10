// Shell test for <c0ffee-banner> — the Site banner (CONTEXT.md).
//
// The banner is presentational chrome: it holds no Color value and is NOT bound
// by the ADR-0001 Color value interface. So unlike the swatch/console shell
// tests, there's no value/hex/colorchange contract to assert. What IS load-
// bearing — and what these tests pin — is its *behavioral* promise: a single
// home affordance (the wordmark links to /), no nav affordance yet (deferred),
// and that it reads as quiet chrome, never sticky.
//
// C0FFEE-46: the banner grows a `variant` attribute — `classic` (the default,
// today's look) and `cup` (the redesign lockup) — flipped live via a
// `?banner=cup` QUERY param (never the hash; the hash is the console's Color
// link). Both variants are pinned positively here: what each one renders.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import './banner.ts';

const NEXT = () => new Promise((r) => setTimeout(r, 0));
const mount = async (markup = '<c0ffee-banner></c0ffee-banner>') => {
  document.body.innerHTML = markup;
  await NEXT();
  return document.querySelector('c0ffee-banner')!.shadowRoot!;
};

describe('<c0ffee-banner> (the Site banner)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    // restore a clean URL — variant tests navigate to ?banner=cup
    window.history.pushState({}, '', '/');
  });

  describe('classic (the default — the live site unchanged)', () => {
    it('renders the c0ffee wordmark in a shadow root', async () => {
      const root = await mount();
      expect(root.textContent).toContain('c0ffee');
    });

    it('renders exactly the classic wordmark text — `c0ffee`, nothing more', async () => {
      const root = await mount();
      const link = root.querySelector('a')!;
      // exact text pins "with no flag, the live site does not change"
      expect(link.textContent!.trim()).toBe('c0ffee');
    });

    it('makes the wordmark the home link (brand-only — no nav yet)', async () => {
      const root = await mount();
      const links = root.querySelectorAll('a');
      // exactly one link, pointing home — no Menu/nav links yet (deferred)
      expect(links.length).toBe(1);
      expect(links[0].getAttribute('href')).toBe('/');
      expect(links[0].textContent).toContain('c0ffee');
    });

    it('has no nav affordance yet (deferred until the Menu earns surfacing)', async () => {
      const root = await mount();
      expect(root.querySelector('nav')).toBeNull();
    });

    it('renders a coffee logo (svg)', async () => {
      const root = await mount();
      expect(root.querySelector('svg')).not.toBeNull();
    });
  });

  describe('cup variant (the redesign lockup, via the variant attribute)', () => {
    const mountCup = () => mount('<c0ffee-banner variant="cup"></c0ffee-banner>');

    it('renders the #C0FFEE cafe wordmark', async () => {
      const root = await mountCup();
      expect(root.textContent).toContain('#C0FFEE');
      expect(root.textContent).toContain('cafe');
    });

    it('puts the mint accent on the zero', async () => {
      const root = await mountCup();
      const zero = root.querySelector('.zero');
      expect(zero).not.toBeNull();
      expect(zero!.textContent).toBe('0');
    });

    it('renders the pixel-cup badge image from public/', async () => {
      const root = await mountCup();
      const img = root.querySelector('img');
      expect(img).not.toBeNull();
      // absolute path: resolves from every page (/, /menu, /lessons/*) on the
      // built site, not just the dev server
      expect(img!.getAttribute('src')).toBe('/pixie-badge.png');
    });

    it('keeps the wordmark as the single home link', async () => {
      const root = await mountCup();
      const links = root.querySelectorAll('a');
      expect(links.length).toBe(1);
      expect(links[0].getAttribute('href')).toBe('/');
      expect(links[0].textContent).toContain('#C0FFEE');
    });
  });

  describe('?banner=cup query flag (temporary eval scaffolding)', () => {
    it('a plain <c0ffee-banner> renders the cup lockup when the page URL says ?banner=cup', async () => {
      window.history.pushState({}, '', '/?banner=cup');
      const root = await mount();
      expect(root.textContent).toContain('#C0FFEE');
      expect(root.querySelector('img')).not.toBeNull();
    });

    it('reads the QUERY, so a Color link in the hash still rides along untouched', async () => {
      window.history.pushState({}, '', '/?banner=cup#3A7BD5');
      const root = await mount();
      // the flag still applies…
      expect(root.textContent).toContain('#C0FFEE');
      // …and the hash — the console's Color link — is still there for the console
      expect(window.location.hash).toBe('#3A7BD5');
    });
  });

  it('is not sticky in either variant — it scrolls away with the page', async () => {
    for (const markup of [
      '<c0ffee-banner></c0ffee-banner>',
      '<c0ffee-banner variant="cup"></c0ffee-banner>',
    ]) {
      const root = await mount(markup);
      const style = root.querySelector('style')!.textContent ?? '';
      // the banner must never pin: no sticky/fixed positioning in its styles
      expect(style).not.toMatch(/position\s*:\s*(sticky|fixed)/i);
    }
  });
});
