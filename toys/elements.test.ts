// Shell tests (ADR-0006): with happy-dom we can now mount the Web Components and
// assert their rendered DOM + the ADR-0001 contract (seed-in, read-out, notify-out)
// — the thing node --test could never reach. Real paint/layout still gets a
// browser-MCP pass; this covers behavior. This file is the proof-of-pattern the
// v2 console slices (C0FFEE-14/15/16) copy forward, so it deliberately exercises
// the edit path + composed event, not just seeding.
import { test, expect, beforeAll } from 'vitest';
import type { ColorInterface, ColorChangeDetail } from '../lib/color.ts';

// Registering the custom elements is a module side effect (customElements.define).
beforeAll(async () => {
  await import('./swatch.ts');
  await import('./console.ts');
});

// Mount a registered element and return it typed as the ADR-0001 contract, so
// tests read .value/.hex without ad-hoc casts. Inserting runs connectedCallback.
function mount(tag: 'c0ffee-console' | 'c0ffee-swatch', hex?: string): HTMLElement & ColorInterface {
  const el = document.createElement(tag);
  if (hex !== undefined) el.setAttribute('hex', hex);
  document.body.appendChild(el);
  return el as HTMLElement & ColorInterface;
}

test('<c0ffee-swatch> seeds from hex, renders it, and exposes .hex (ADR-0001 read-out)', () => {
  const el = mount('c0ffee-swatch', 'FF6600');
  expect(el.shadowRoot?.textContent).toContain('FF6600');
  expect(el.hex).toBe('FF6600');
});

test('<c0ffee-swatch> emits a typed colorchange on click (ADR-0001 notify-out)', () => {
  const el = mount('c0ffee-swatch', 'FF6600');

  let detail: ColorChangeDetail | null = null;
  el.addEventListener('colorchange', (e) => {
    detail = (e as CustomEvent<ColorChangeDetail>).detail;
  });
  el.click();

  expect(detail).toEqual({ r: 255, g: 102, b: 0, hex: 'FF6600' });
});

test('<c0ffee-swatch> with junk hex falls back to the default, never a broken render', () => {
  const el = mount('c0ffee-swatch', 'not-a-color');
  expect(el.hex).toBe('3A7BD5'); // default blue
});

test('<c0ffee-console> seeds value + hex from the hex attribute', () => {
  const el = mount('c0ffee-console', '3A7BD5');
  expect(el.hex).toBe('3A7BD5');
  expect(el.value).toEqual({ r: 58, g: 123, b: 213 });
});

test('<c0ffee-console> with no hex defaults to the namesake #C0FFEE', () => {
  const el = mount('c0ffee-console');
  expect(el.hex).toBe('C0FFEE');
});

test('<c0ffee-console> reseeds when its hex attribute changes after mount', () => {
  // The lesson runtime drives this path (setAttribute('hex', …) as an animateTo
  // fallback); the attributeChangedCallback guard distinguishes it from the
  // pre-connect seed.
  const el = mount('c0ffee-console', '000000');
  el.setAttribute('hex', 'FF6600');
  expect(el.value).toEqual({ r: 255, g: 102, b: 0 });
  expect(el.hex).toBe('FF6600');
});

test('<c0ffee-console> RGB slider edit updates the value and emits a composed colorchange', () => {
  // Proves the happy-dom harness can reach a wired shadow-DOM <input> listener —
  // the single biggest unknown the v2 slices inherit. Listening on document.body
  // (outside the shadow root) also proves the event is composed + bubbles.
  const el = mount('c0ffee-console', '000000');

  let detail: ColorChangeDetail | null = null;
  document.body.addEventListener('colorchange', (e) => {
    detail = (e as CustomEvent<ColorChangeDetail>).detail;
  });

  const slider = el.shadowRoot?.getElementById('sl-r') as HTMLInputElement;
  slider.value = '255';
  slider.dispatchEvent(new Event('input', { bubbles: true }));

  expect(el.value.r).toBe(255); // edit applied to the source of truth
  expect(detail).not.toBeNull(); // event escaped the shadow root (composed)
  expect(detail!).toMatchObject({ r: 255, g: 0, b: 0, hex: 'FF0000' });
});

// C0FFEE-21 — the per-Channel hex box can never lie about what the color
// accepted. After each edit the box shows exactly the sanitized value and the
// Color value matches it; the silent-swallow and parseInt-leniency bugs are gone.
function typeHex(el: HTMLElement & ColorInterface, key: 'r' | 'g' | 'b', raw: string): HTMLInputElement {
  const box = el.shadowRoot?.getElementById(`hex-${key}`) as HTMLInputElement;
  box.value = raw;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  return box;
}

test('<c0ffee-console> hex box strips the trailing junk parseInt used to swallow', () => {
  const el = mount('c0ffee-console', '000000');
  const box = typeHex(el, 'r', '1g'); // old: parseInt('1g',16)===1, box kept '1g'
  expect(box.value).toBe('1');        // box shows only what survived the filter
  expect(el.value.r).toBe(1);         // and the value agrees with the box
});

test('<c0ffee-console> hex box drops a fully-invalid keystroke instead of silently swallowing it', () => {
  const el = mount('c0ffee-console', '000000');
  const box = typeHex(el, 'r', 'g'); // old: box was left showing 'g', value untouched -> disagreement
  expect(box.value).toBe('');        // rejected char never shows
  expect(el.value.r).toBe(0);        // color unchanged — box and value still agree
});

test('<c0ffee-console> hex box clamps an over-long paste to two digits', () => {
  const el = mount('c0ffee-console', '000000');
  const box = typeHex(el, 'r', 'FFA'); // a paste can exceed maxlength=2
  expect(box.value).toBe('FF');
  expect(el.value.r).toBe(255);
});

test('<c0ffee-console> typing a two-digit hex value is not stomped mid-keystroke', () => {
  const el = mount('c0ffee-console', '000000');
  typeHex(el, 'r', 'c');             // first keystroke (lowercase)
  const box = typeHex(el, 'r', 'c0'); // second keystroke completes the pair
  // A valid keystroke isn't rewritten (no caret jump); the box keeps the user's
  // own characters and CSS shows them uppercase. The value reads them either way.
  expect(box.value).toBe('c0');
  expect(el.value.r).toBe(192);       // parseInt is case-insensitive: c0 -> 192
});

test('<c0ffee-console> a valid lowercase keystroke is left untouched (no caret-jumping rewrite)', () => {
  const el = mount('c0ffee-console', '000000');
  const box = typeHex(el, 'r', 'ab'); // already valid hex, just lowercase
  expect(box.value).toBe('ab');       // not rewritten to 'AB' — caret stays put
  expect(el.value.r).toBe(171);       // 0xAB
});
