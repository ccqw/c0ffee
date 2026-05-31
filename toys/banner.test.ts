// Shell test for <c0ffee-banner> — the Site banner (CONTEXT.md).
//
// The banner is presentational chrome: it holds no Color value and is NOT bound
// by the ADR-0001 Color value interface. So unlike the swatch/console shell
// tests, there's no value/hex/colorchange contract to assert. What IS load-
// bearing — and what these tests pin — is its *behavioral* promise: a single
// home affordance (the wordmark links to /), no nav affordance yet (deferred),
// and that it reads as quiet chrome, never sticky.

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

  it('renders the c0ffee wordmark in a shadow root', async () => {
    const root = await mount();
    expect(root.textContent).toContain('c0ffee');
  });

  it('makes the wordmark the home link (the only nav affordance)', async () => {
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

  it('is not sticky — it scrolls away with the page', async () => {
    const root = await mount();
    const style = root.querySelector('style')!.textContent ?? '';
    // the banner must never pin: no sticky/fixed positioning in its styles
    expect(style).not.toMatch(/position\s*:\s*(sticky|fixed)/i);
  });
});
