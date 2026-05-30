// Shell tests (ADR-0006): with happy-dom we can now mount the Web Components and
// assert their rendered DOM + the ADR-0001 contract (seed-in, read-out, notify-out)
// — the thing node --test could never reach. Real paint/layout still gets a
// browser-MCP pass; this covers behavior.
import { test, expect, beforeAll } from 'vitest';
import type { ColorChangeDetail } from '../lib/color.ts';

// Registering the custom elements is a module side effect (customElements.define).
beforeAll(async () => {
  await import('./swatch.ts');
  await import('./mirror.ts');
});

test('<c0ffee-swatch> seeds from hex, renders it, and exposes .hex (ADR-0001 read-out)', () => {
  const el = document.createElement('c0ffee-swatch');
  el.setAttribute('hex', 'FF6600');
  document.body.appendChild(el); // connectedCallback runs on insert

  expect(el.shadowRoot?.textContent).toContain('FF6600');
  expect((el as HTMLElement & { hex: string }).hex).toBe('FF6600');
});

test('<c0ffee-swatch> emits a typed colorchange on click (ADR-0001 notify-out)', () => {
  const el = document.createElement('c0ffee-swatch');
  el.setAttribute('hex', 'FF6600');
  document.body.appendChild(el);

  let detail: ColorChangeDetail | null = null;
  el.addEventListener('colorchange', (e) => {
    detail = (e as CustomEvent<ColorChangeDetail>).detail;
  });
  el.click();

  expect(detail).toEqual({ r: 255, g: 102, b: 0, hex: 'FF6600' });
});

test('<c0ffee-swatch> with junk hex falls back to the default, never a broken render', () => {
  const el = document.createElement('c0ffee-swatch');
  el.setAttribute('hex', 'not-a-color');
  document.body.appendChild(el);

  expect((el as HTMLElement & { hex: string }).hex).toBe('3A7BD5'); // default blue
});

test('<c0ffee-mirror> seeds value + hex from the hex attribute', () => {
  const el = document.createElement('c0ffee-mirror');
  el.setAttribute('hex', '3A7BD5');
  document.body.appendChild(el);

  expect((el as HTMLElement & { hex: string }).hex).toBe('3A7BD5');
  expect((el as HTMLElement & { value: { r: number; g: number; b: number } }).value)
    .toEqual({ r: 58, g: 123, b: 213 });
});

test('<c0ffee-mirror> with no hex defaults to the namesake #C0FFEE', () => {
  const el = document.createElement('c0ffee-mirror');
  document.body.appendChild(el);

  expect((el as HTMLElement & { hex: string }).hex).toBe('C0FFEE');
});
