// Shell test for <c0ffee-banner> — the Site banner (CONTEXT.md).
//
// The banner is presentational chrome: it holds no Color value and is NOT bound
// by the ADR-0001 Color value interface. So unlike the swatch/console shell
// tests, there's no value/hex/colorchange contract to assert. What IS load-
// bearing — and what these tests pin — is its *behavioral* promise: a single
// home affordance (the brand links to /), an optional per-page section label
// that is context, NOT nav, and that it reads as quiet chrome, never sticky.
//
// C0FFEE-76: adopts the crossword-face handoff's chip lockup — an 18px mint
// chip + the `c0ffee` wordmark, with a per-page `section=` suffix (e.g.
// "Crosshatch" on the crossword route). Supersedes the C0FFEE-46/52 cup-badge
// lockup; the namesake mint now lives in the chip, not on the zero glyph.

import { describe, it, expect, beforeEach } from 'vitest';
import './banner.ts';

const NEXT = () => new Promise((r) => setTimeout(r, 0));
const mount = async (attrs = '') => {
  document.body.innerHTML = `<c0ffee-banner ${attrs}></c0ffee-banner>`;
  await NEXT();
  return document.querySelector('c0ffee-banner')!.shadowRoot!;
};

describe('<c0ffee-banner> (the Site banner)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the c0ffee brand wordmark in a shadow root', async () => {
    const root = await mount();
    expect(root.querySelector('.wordmark')!.textContent).toBe('c0ffee');
  });

  it('carries the namesake mint in a chip mark fed by the accent token', async () => {
    const root = await mount();
    expect(root.querySelector('.chip')).not.toBeNull();
    const style = root.querySelector('style')!.textContent ?? '';
    // the chip is the banner's mint mark — the namesake color lives here now
    expect(style).toMatch(/\.chip[^}]*--c0ffee-accent/);
  });

  it('makes [chip] c0ffee the sole home link (brand-only — no nav yet)', async () => {
    const root = await mount();
    const links = root.querySelectorAll('a');
    // exactly one link, pointing home — no Menu/nav links yet (deferred)
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toBe('/');
    expect(links[0].textContent).toContain('c0ffee');
    // the chip rides inside the home link
    expect(links[0].querySelector('.chip')).not.toBeNull();
  });

  it('shows no section label when section= is absent (home / menu)', async () => {
    const root = await mount();
    expect(root.querySelector('.section')).toBeNull();
  });

  it('renders a per-page section label when section= is set (crossword route)', async () => {
    const root = await mount('section="Crosshatch"');
    const label = root.querySelector('.section');
    expect(label).not.toBeNull();
    expect(label!.textContent).toContain('Crosshatch');
  });

  it('keeps the section label out of the home link — it is context, not nav', async () => {
    const root = await mount('section="Crosshatch"');
    // still exactly one link (the brand); the section is a label, not an affordance
    expect(root.querySelectorAll('a').length).toBe(1);
    expect(root.querySelector('a')!.textContent).not.toContain('Crosshatch');
  });

  it('has no nav affordance yet (deferred until the Menu earns surfacing)', async () => {
    const root = await mount('section="Crosshatch"');
    expect(root.querySelector('nav')).toBeNull();
  });

  it('is not sticky — it scrolls away with the page', async () => {
    const root = await mount();
    const style = root.querySelector('style')!.textContent ?? '';
    // the banner must never pin: no sticky/fixed positioning in its styles
    expect(style).not.toMatch(/position\s*:\s*(sticky|fixed)/i);
  });
});
