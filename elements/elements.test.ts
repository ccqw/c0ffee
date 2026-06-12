// Shell tests (ADR-0006): with happy-dom we can now mount the Web Components and
// assert their rendered DOM + the ADR-0001 contract (seed-in, read-out, notify-out)
// — the thing node --test could never reach. Real paint/layout still gets a
// browser-MCP pass; this covers behavior. This file is the proof-of-pattern the
// v2 console slices (C0FFEE-14/15/16) copy forward, so it deliberately exercises
// the edit path + composed event, not just seeding.
import { test, expect, beforeAll, vi } from 'vitest';
import { formatColorLink } from '../lib/color.ts';
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

// C0FFEE-21's invariant — the hex surface can never lie about what the color
// accepted — now holds at FIELD scope (C0FFEE-49 replaced the per-Channel boxes
// with the one Hex field; its tests live at the end of this file).

// C0FFEE-22 — opt-in URL reflection. With the `reflect` attribute the console owns
// location.hash: it seeds from the hash on connect, RE-SEEDS on hashchange (the
// paste-and-enter fix), and writes the canonical Color link on colorchange. Without
// `reflect` it never touches the URL. (ADR-0001 amendment 2026-05-31: reflection is
// a property of the interactive's contract, opt-in, hash-only, live.)

// location.hash is window-global and survives across tests in this file, and a
// reflecting console keeps a window 'hashchange' listener until it disconnects — so
// each test clears the hash up front and removes its element afterward (which fires
// disconnectedCallback → drops the listener) to keep tests from bleeding into each other.
function clearUrl(): void {
  history.replaceState(null, '', location.pathname);
}

// reflect must be present BEFORE connectedCallback runs (i.e. before append), so this
// can't reuse mount() which only seeds `hex`.
function mountReflect(): HTMLElement & ColorInterface {
  const el = document.createElement('c0ffee-console');
  el.setAttribute('reflect', '');
  document.body.appendChild(el);
  return el as HTMLElement & ColorInterface;
}

test('<c0ffee-console reflect> seeds its value from location.hash on connect', () => {
  clearUrl();
  history.replaceState(null, '', '#FF6600');
  const el = mountReflect();
  expect(el.value).toEqual({ r: 255, g: 102, b: 0 });
  expect(el.hex).toBe('FF6600');
  el.remove();
});

test('<c0ffee-console reflect> with an empty hash defaults to the namesake #C0FFEE', () => {
  clearUrl();
  const el = mountReflect();
  expect(el.hex).toBe('C0FFEE');
  el.remove();
});

test('<c0ffee-console reflect> with a malformed hash falls back to #C0FFEE, never a broken render', () => {
  clearUrl();
  history.replaceState(null, '', '#zzz');
  const el = mountReflect();
  expect(el.hex).toBe('C0FFEE');
  el.remove();
});

test('<c0ffee-console reflect> re-seeds on hashchange — the paste-and-enter fix', () => {
  clearUrl();
  history.replaceState(null, '', '#000000');
  const el = mountReflect();
  expect(el.value).toEqual({ r: 0, g: 0, b: 0 });

  // Simulate pasting a new hex into the address bar and pressing Enter.
  history.replaceState(null, '', '#FF6600');
  window.dispatchEvent(new Event('hashchange'));

  expect(el.value).toEqual({ r: 255, g: 102, b: 0 }); // adopted the new URL live
  el.remove();
});

test('<c0ffee-console reflect> writes the canonical Color link to the hash when the color moves', () => {
  clearUrl();
  history.replaceState(null, '', '#000000');
  const el = mountReflect();

  const slider = el.shadowRoot?.getElementById('sl-r') as HTMLInputElement;
  slider.value = '255';
  slider.dispatchEvent(new Event('input', { bubbles: true }));

  expect(el.value).toEqual({ r: 255, g: 0, b: 0 });
  expect(location.hash).toBe('#FF0000'); // address bar tracks the live color
  el.remove();
});

test('<c0ffee-console reflect> canonicalizes a shorthand/lowercase hash to uppercase on connect', () => {
  clearUrl();
  history.replaceState(null, '', '#f60');
  const el = mountReflect();
  expect(el.hex).toBe('FF6600');
  expect(location.hash).toBe('#FF6600'); // URL rewritten to the canonical form
  el.remove();
});

test('<c0ffee-console reflect> stops responding to hashchange once disconnected (no listener leak)', () => {
  clearUrl();
  history.replaceState(null, '', '#000000');
  const el = mountReflect();
  expect(el.value).toEqual({ r: 0, g: 0, b: 0 });

  el.remove(); // disconnectedCallback must detach the window 'hashchange' listener

  // A hashchange after disconnect must NOT re-seed the detached element — if the
  // listener leaked, this would still mutate el.value (and on a real page, every
  // removed console would keep reacting to the address bar).
  history.replaceState(null, '', '#FF6600');
  window.dispatchEvent(new Event('hashchange'));
  expect(el.value).toEqual({ r: 0, g: 0, b: 0 }); // frozen at its last value
});

test('<c0ffee-console> WITHOUT reflect never touches the URL', () => {
  clearUrl();
  history.replaceState(null, '', '#123456');
  const el = mount('c0ffee-console', '000000'); // seeds from the hex attr, ignores the hash
  expect(el.value).toEqual({ r: 0, g: 0, b: 0 });

  // A hashchange must not re-seed a non-reflecting console.
  window.dispatchEvent(new Event('hashchange'));
  expect(el.value).toEqual({ r: 0, g: 0, b: 0 });

  // An edit must not write to the URL.
  const slider = el.shadowRoot?.getElementById('sl-r') as HTMLInputElement;
  slider.value = '255';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  expect(location.hash).toBe('#123456'); // untouched by the element

  el.remove();
});

// C0FFEE-23 — the `presentation` attribute (full / companion). One element, two
// layouts (ADR-0002: a presentation is an attribute on the one console, never a
// second element). `full` (default) shows all parts; `companion` is the minimal
// compact layout — fewer parts on screen, no rich reveal-drawer (that's C0FFEE-18).
// The HSV panel (the secondary color model) is the part `companion` drops, so its
// visibility is the testable shadow-DOM difference. The Color value + sticky-hue
// are state, not layout, so switching presentation must never disturb them.

// presentation must be present BEFORE connectedCallback runs, like `reflect`, so
// this can't reuse mount() (which only seeds `hex`).
function mountPresentation(presentation: string, hex?: string): HTMLElement & ColorInterface {
  const el = document.createElement('c0ffee-console');
  el.setAttribute('presentation', presentation);
  if (hex !== undefined) el.setAttribute('hex', hex);
  document.body.appendChild(el);
  return el as HTMLElement & ColorInterface;
}

const hsvPanel = (el: HTMLElement): HTMLElement =>
  el.shadowRoot?.getElementById('hsv-panel') as HTMLElement;

test('<c0ffee-console> defaults to the full presentation — the HSV panel is visible', () => {
  const el = mount('c0ffee-console', 'C0FFEE'); // no presentation attribute
  expect(hsvPanel(el).hidden).toBe(false);
});

test('<c0ffee-console presentation="companion"> renders the compact layout — HSV panel hidden', () => {
  const el = mountPresentation('companion', 'C0FFEE');
  expect(hsvPanel(el).hidden).toBe(true);
  el.remove();
});

test('<c0ffee-console> an unknown presentation value falls back to full', () => {
  const el = mountPresentation('bogus', 'C0FFEE');
  expect(hsvPanel(el).hidden).toBe(false); // unknown ≠ companion → full
  el.remove();
});

test('<c0ffee-console> switching presentation at runtime preserves the Color value and sticky hue', () => {
  // Seed a gray (no hue) and drive an HSV hue edit: the value stays gray but the
  // sticky hue parks at 200° (the exact jitter-prone case ADR-0005 warns about).
  const el = mount('c0ffee-console', '808080');
  const h = el.shadowRoot?.getElementById('sl-h') as HTMLInputElement;
  h.value = '200';
  h.dispatchEvent(new Event('input', { bubbles: true }));
  const valueBefore = { ...el.value };
  const hueBefore = (el.shadowRoot?.getElementById('dec-h') as HTMLElement).textContent;

  el.setAttribute('presentation', 'companion'); // observed attribute → re-layout
  expect(hsvPanel(el).hidden).toBe(true);
  el.setAttribute('presentation', 'full');
  expect(hsvPanel(el).hidden).toBe(false);

  expect(el.value).toEqual(valueBefore); // value untouched by the layout switch
  expect((el.shadowRoot?.getElementById('dec-h') as HTMLElement).textContent)
    .toBe(hueBefore); // sticky hue held — no reset, no jitter
});

test('<c0ffee-console> keeps companion-specific styling so "compact" can never silently revert to full', () => {
  // happy-dom does no layout, so the narrowing itself is browser-verified, not
  // asserted here. This anchors the *mechanism*: if the :host([presentation=...])
  // selector is renamed or dropped, companion silently reverts to full-width while
  // every other test stays green — the one way a downstream Companion console could
  // regress invisibly. Assert the selector exists, not an exact pixel width.
  const el = mount('c0ffee-console', 'C0FFEE');
  const css = el.shadowRoot?.querySelector('style')?.textContent ?? '';
  expect(css).toContain(':host([presentation="companion"])');
});

// C0FFEE-47 — Additive Venn blend correctness + hero geometry + card surface.
// happy-dom does no paint/layout, so these anchor the *mechanism* in the shadow
// CSS (the C0FFEE-23 precedent above): if a rule is renamed or dropped, the blend
// silently drifts or the hero silently reverts while every other test stays green.
// The composited result (center tri-overlap === the Color value) is browser-verified.

// Pull one rule block out of the console's shadow stylesheet by selector.
function cssBlock(el: HTMLElement, selector: string): string {
  const css = el.shadowRoot?.querySelector('style')?.textContent ?? '';
  const match = css.match(new RegExp(selector.replace(/[.#[\]]/g, '\\$&') + '\\s*{[^}]*}'));
  return match?.[0] ?? '';
}

test('<c0ffee-console> Additive Venn screen-blends over pure black in an isolated stacking context', () => {
  // The two invariants that make the center tri-overlap EQUAL the Color value
  // (screen over #000 is exact additive light; isolation walls the blend off
  // from the card). CONTEXT.md records this as an implementation invariant.
  const el = mount('c0ffee-console', 'C0FFEE');
  const vennBox = cssBlock(el, '.venn-box');
  expect(vennBox).toContain('background: #000');
  expect(vennBox).toContain('isolation: isolate');
});

test('<c0ffee-console> Venn circles use the hero geometry — 70% of the box, heavy-overlap centers', () => {
  // 70% circles at these three centers make the central tri-intersection the
  // LARGEST region — the mixed color is the headline, not a sliver.
  const el = mount('c0ffee-console', 'C0FFEE');
  const circle = cssBlock(el, '.circle');
  expect(circle).toContain('width: 70%');
  expect(circle).toContain('height: 70%');
  expect(cssBlock(el, '#c-r')).toContain('left: 50%');
  expect(cssBlock(el, '#c-g')).toContain('left: 37%');
  expect(cssBlock(el, '#c-b')).toContain('left: 63%');
});

test('<c0ffee-console> card surface is the page bg + inset hairline + drop shadow', () => {
  // Frugal-surfaces decision (grill Q10): the card is --c0ffee-bg dressed with
  // a hairline and shadow — not a lighter panel fill. (The Menu tiles and the
  // Swatch pill converged to the same language in C0FFEE-51; --c0ffee-panel
  // retired with them.)
  const el = mount('c0ffee-console', 'C0FFEE');
  const card = cssBlock(el, '.card');
  expect(card).toContain('background: var(--c0ffee-bg');
  expect(card).toContain('inset 0 0 0 1px rgba(255,255,255,.06)');
  expect(card).toContain('0 30px 70px -30px rgba(0,0,0,.8)');
});

// C0FFEE-50 — channel-solo on the Additive Venn + the Named color address on the
// Swatch. Channel-solo (grill Q2) is a state of the VENN, not of the Color value:
// clicking a Channel name fades the other two circles so one channel's light
// stands alone; the value, the Swatch paint, and the ADR-0001 contract are
// untouched. The Swatch corner slot carries the active channel's tag while solo
// is on, else the Named color address when one exists (present-only).

const circle = (el: HTMLElement, k: string): HTMLElement =>
  el.shadowRoot?.getElementById(`c-${k}`) as HTMLElement;
const channelBtn = (el: HTMLElement, k: string): HTMLElement =>
  el.shadowRoot?.getElementById(`ch-${k}`) as HTMLElement;
const swatchTag = (el: HTMLElement): HTMLElement =>
  el.shadowRoot?.getElementById('swatch-tag') as HTMLElement;

test('<c0ffee-console> clicking a Channel name solos it — the other two circles fade', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  channelBtn(el, 'r').click();
  expect(circle(el, 'r').style.opacity).toBe('1');
  expect(circle(el, 'g').style.opacity).toBe('0');
  expect(circle(el, 'b').style.opacity).toBe('0');
  expect(channelBtn(el, 'r').getAttribute('aria-pressed')).toBe('true');
});

test('<c0ffee-console> clicking the soloed Channel again releases it', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  channelBtn(el, 'g').click();
  channelBtn(el, 'g').click();
  for (const k of ['r', 'g', 'b']) {
    expect(circle(el, k).style.opacity).toBe('1');
    expect(channelBtn(el, k).getAttribute('aria-pressed')).toBe('false');
  }
});

test('<c0ffee-console> clicking another Channel switches the solo directly', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  channelBtn(el, 'r').click();
  channelBtn(el, 'b').click(); // switch, not release-then-solo
  expect(circle(el, 'b').style.opacity).toBe('1');
  expect(circle(el, 'r').style.opacity).toBe('0');
  expect(circle(el, 'g').style.opacity).toBe('0');
});

test('<c0ffee-console> the active-solo name takes the pure channel color; resting names stay neutral', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  channelBtn(el, 'r').click();
  expect(channelBtn(el, 'r').style.color).toBe('var(--c0ffee-r)');
  expect(channelBtn(el, 'g').style.color).toBe(''); // neutral resting color comes from CSS
});

test('<c0ffee-console> solo never touches the Color value and never emits colorchange', () => {
  // Solo is view state. A colorchange here would ripple into the URL reflector
  // and the Lesson runtime for a color that did not move.
  const el = mount('c0ffee-console', '3A7BD5');
  let fired = 0;
  el.addEventListener('colorchange', () => { fired++; });
  channelBtn(el, 'r').click();
  channelBtn(el, 'r').click();
  expect(el.hex).toBe('3A7BD5');
  expect(fired).toBe(0);
});

test('<c0ffee-console> while solo is on, the Swatch carries the active channel tag', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  channelBtn(el, 'r').click();
  expect(swatchTag(el).hidden).toBe(false);
  expect(swatchTag(el).textContent).toBe('Red only');
});

test('<c0ffee-console> an RGB edit while soloed keeps the solo state (no jitter)', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  channelBtn(el, 'r').click();
  const slider = el.shadowRoot?.getElementById('sl-g') as HTMLInputElement;
  slider.value = '10';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  expect(circle(el, 'g').style.opacity).toBe('0'); // still faded
  expect(swatchTag(el).textContent).toBe('Red only'); // tag survives the re-render
});

test('<c0ffee-console> Swatch shows the Named color address when one exists', () => {
  const el = mount('c0ffee-console', '1E90FF');
  expect(swatchTag(el).hidden).toBe(false);
  expect(swatchTag(el).textContent).toBe('dodgerblue');
  expect(swatchTag(el).style.color).toBe('#000'); // bestTextColor over dodgerblue
});

test('<c0ffee-console> a nameless Color value shows no label — present-only, never a closest match', () => {
  const el = mount('c0ffee-console'); // #C0FFEE, the deliberately nameless namesake
  expect(swatchTag(el).hidden).toBe(true);
});

test('<c0ffee-console> the name tracks the live Color value', () => {
  const el = mount('c0ffee-console', '000000');
  expect(swatchTag(el).textContent).toBe('black');
  const slider = el.shadowRoot?.getElementById('sl-r') as HTMLInputElement;
  slider.value = '255';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  expect(swatchTag(el).textContent).toBe('red'); // FF0000 has a name too
});

test('<c0ffee-console> the corner slot is shared: the solo tag takes it, the name returns on release', () => {
  const el = mount('c0ffee-console', 'FF0000'); // named 'red'
  expect(swatchTag(el).textContent).toBe('red');
  channelBtn(el, 'r').click();
  expect(swatchTag(el).textContent).toBe('Red only'); // solo wins the slot while on
  channelBtn(el, 'r').click();
  expect(swatchTag(el).textContent).toBe('red'); // the Named address returns
});

test('<c0ffee-console> the console has exactly ONE text input — the Hex field is the whole hex surface', () => {
  // C0FFEE-49 replaced the three per-Channel digit boxes with the one Hex field
  // (grill Q3: one representation — read, edit, copy in the same place).
  // Asserting the exact input census (not an absence) pins it: every non-range
  // input in the shadow root is the field.
  const el = mount('c0ffee-console', 'C0FFEE');
  const textInputs = el.shadowRoot?.querySelectorAll('input:not([type=range])') ?? [];
  expect(textInputs.length).toBe(1);
  expect(textInputs[0].id).toBe('hex-input');
});

test('<c0ffee-console presentation="companion"> still honours the full ADR-0001 contract', () => {
  const el = mountPresentation('companion', '3A7BD5');

  // read-out (pull) is identical in companion
  expect(el.hex).toBe('3A7BD5');
  expect(el.value).toEqual({ r: 58, g: 123, b: 213 });

  // notify-out (push): an RGB edit still mutates the value and emits a composed event
  let detail: ColorChangeDetail | null = null;
  document.body.addEventListener('colorchange', (e) => {
    detail = (e as CustomEvent<ColorChangeDetail>).detail;
  });
  const slider = el.shadowRoot?.getElementById('sl-r') as HTMLInputElement;
  slider.value = '255';
  slider.dispatchEvent(new Event('input', { bubbles: true }));

  expect(el.value.r).toBe(255);
  expect(detail).not.toBeNull();
  expect(detail!).toMatchObject({ r: 255, g: 123, b: 213, hex: 'FF7BD5' });
  el.remove();
});

// C0FFEE-49 — the Hex field: one editable input as the typographic centerpiece
// (grill Q3, prototype variant C). A transparent real <input maxlength=6> sits
// over a presentational mirror of six slots grouped into three channel pairs,
// a channel dot above each pair; one measured caret element stands in for the
// hidden native one. The input owns editing: the whole-field path is
// sanitizeHexInput(raw, 6) + parseHex, so C0FFEE-21's "can't lie" invariant
// holds at field scope. Partial input means implied trailing zeros — the Color
// value stays total, the mirror dims what wasn't typed. Caret/selection
// geometry is rect-measured, so it's browser-verified, not asserted here.

const hexField = (el: HTMLElement): HTMLInputElement =>
  el.shadowRoot?.getElementById('hex-input') as HTMLInputElement;

function typeHexField(el: HTMLElement & ColorInterface, raw: string): HTMLInputElement {
  const field = hexField(el);
  field.value = raw;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  return field;
}

const slotChars = (el: HTMLElement): string[] =>
  [...(el.shadowRoot?.querySelectorAll('.hex-slot') ?? [])].map((s) => s.textContent ?? '');

test('<c0ffee-console> renders one editable Hex field seeded with the Color address', () => {
  const el = mount('c0ffee-console', '3A7BD5');
  const field = hexField(el);
  expect(field.value).toBe('3A7BD5');
  expect(field.getAttribute('maxlength')).toBe('6');
});

test('<c0ffee-console> the mirror shows six slots in three channel pairs, a dot above each', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  const pairs = el.shadowRoot?.querySelectorAll('.hex-pair') ?? [];
  expect(pairs.length).toBe(3);
  for (const pair of pairs) {
    expect(pair.querySelectorAll('.hex-slot').length).toBe(2);
    expect(pair.querySelectorAll('button.hex-dot').length).toBe(1);
  }
  expect(slotChars(el)).toEqual(['C', '0', 'F', 'F', 'E', 'E']);
});

test('<c0ffee-console> editing the Hex field updates the views and emits a composed colorchange', () => {
  const el = mount('c0ffee-console', '000000');
  let detail: ColorChangeDetail | null = null;
  document.body.addEventListener('colorchange', (e) => {
    detail = (e as CustomEvent<ColorChangeDetail>).detail;
  });
  typeHexField(el, 'FF6600');
  expect(el.value).toEqual({ r: 255, g: 102, b: 0 });
  // the other views read the same value on the same render pass
  expect((el.shadowRoot?.getElementById('sl-r') as HTMLInputElement).value).toBe('255');
  expect((el.shadowRoot?.getElementById('dec-g') as HTMLElement).textContent).toBe('102');
  expect(detail!).toMatchObject({ r: 255, g: 102, b: 0, hex: 'FF6600' });
});

test('<c0ffee-console> Hex field strips junk the value dropped — the field never lies', () => {
  const el = mount('c0ffee-console', '000000');
  const field = typeHexField(el, '1g'); // 'g' is not a hex digit
  expect(field.value).toBe('1');        // the field shows only what survived the filter
  expect(el.value).toEqual({ r: 16, g: 0, b: 0 }); // '1' is R's 16s digit; the rest implied zeros
});

test('<c0ffee-console> Hex field drops a fully-invalid keystroke instead of silently swallowing it', () => {
  const el = mount('c0ffee-console', '000000');
  const field = typeHexField(el, 'g');
  expect(field.value).toBe('');
  expect(el.value).toEqual({ r: 0, g: 0, b: 0 });
});

test('<c0ffee-console> Hex field clamps an over-long paste to six digits', () => {
  const el = mount('c0ffee-console', '000000');
  const field = typeHexField(el, 'C0FFEE12');
  expect(field.value).toBe('C0FFEE');
  expect(el.hex).toBe('C0FFEE');
});

test('<c0ffee-console> pasting #00ccff lands clean — the # strips, the case folds', () => {
  const el = mount('c0ffee-console', '000000');
  const field = typeHexField(el, '#00ccff');
  expect(field.value).toBe('00CCFF');
  expect(el.value).toEqual({ r: 0, g: 204, b: 255 });
});

test('<c0ffee-console> a real paste sanitizes BEFORE the length clamp — the # never costs a digit', () => {
  // Browser-found bug: a native paste honors maxlength on the RAW clipboard
  // text, so 8-char '#00ccff' was clamped to '#00ccf' before sanitize ever ran
  // and the last digit was lost. The paste handler must sanitize first.
  const el = mount('c0ffee-console', 'C0FFEE');
  const field = hexField(el);
  field.setSelectionRange(0, field.value.length); // select-all, the common paste gesture
  const paste = new Event('paste', { bubbles: true, cancelable: true }) as Event & {
    clipboardData: { getData: (type: string) => string };
  };
  paste.clipboardData = { getData: () => '#00ccff' };
  field.dispatchEvent(paste);
  expect(field.value).toBe('00CCFF');
  expect(el.value).toEqual({ r: 0, g: 204, b: 255 });
});

test('<c0ffee-console> a valid lowercase entry is left untouched (no caret-jumping rewrite)', () => {
  const el = mount('c0ffee-console', '000000');
  const field = typeHexField(el, 'c0ffee');
  expect(field.value).toBe('c0ffee'); // the mirror shows it uppercase; the input keeps the user's chars
  expect(el.hex).toBe('C0FFEE');
});

test('<c0ffee-console> partial input means implied zeros — the value stays total, empty slots dim', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  const field = typeHexField(el, '1A2B');
  expect(field.value).toBe('1A2B'); // not stomped to the padded form mid-edit
  expect(el.value).toEqual({ r: 26, g: 43, b: 0 });
  expect(slotChars(el)).toEqual(['1', 'A', '2', 'B', '0', '0']);
  const slots = [...(el.shadowRoot?.querySelectorAll('.hex-slot') ?? [])];
  expect(slots.map((s) => s.classList.contains('empty')))
    .toEqual([false, false, false, false, true, true]);
});

test('<c0ffee-console> an edit from elsewhere re-syncs the Hex field to the canonical address', () => {
  const el = mount('c0ffee-console', '000000');
  const slider = el.shadowRoot?.getElementById('sl-r') as HTMLInputElement;
  slider.value = '255';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  expect(hexField(el).value).toBe('FF0000');
  expect(slotChars(el)).toEqual(['F', 'F', '0', '0', '0', '0']);
});

test('<c0ffee-console reflect> editing the Hex field writes the Color link to the URL', () => {
  clearUrl();
  history.replaceState(null, '', '#000000');
  const el = mountReflect();
  typeHexField(el, '3A7BD5');
  expect(location.hash).toBe('#3A7BD5');
  el.remove();
});

test('<c0ffee-console> tapping a channel dot opens the place-value popover for that pair', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  (el.shadowRoot?.getElementById('dot-r') as HTMLElement).click();
  const pop = el.shadowRoot?.querySelector('.popover');
  expect(pop).not.toBeNull();
  expect(pop?.textContent).toContain('Red');
  expect(pop?.textContent).toContain('C×16 + 0×1 = 192'); // the 16s-and-1s decomposition
});

test('<c0ffee-console> the popover tracks the pair: G of #C0FFEE decomposes F×16 + F×1 = 255', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  (el.shadowRoot?.getElementById('dot-g') as HTMLElement).click();
  expect(el.shadowRoot?.querySelector('.popover')?.textContent).toContain('F×16 + F×1 = 255');
});

test('<c0ffee-console> only one popover is ever open; an outside pointerdown closes it', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  (el.shadowRoot?.getElementById('dot-r') as HTMLElement).click();
  (el.shadowRoot?.getElementById('dot-g') as HTMLElement).click();
  expect(el.shadowRoot?.querySelectorAll('.popover').length).toBe(1);
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(el.shadowRoot?.querySelector('.popover')).toBeNull();
});

test('<c0ffee-console> a dot tap hands focus back to the input — the input owns editing', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  const field = hexField(el);
  field.focus();
  (el.shadowRoot?.getElementById('dot-r') as HTMLElement).click();
  expect(el.shadowRoot?.activeElement).toBe(field);
});

test('<c0ffee-console> the Hex field carries the hero typography mechanism', () => {
  // happy-dom does no layout; anchor the mechanism (the C0FFEE-23/47 precedent):
  // if the hero type block is renamed or dropped, the centerpiece silently
  // reverts to body scale while every other test stays green.
  const el = mount('c0ffee-console', 'C0FFEE');
  const block = cssBlock(el, '.hexfield');
  expect(block).toContain('clamp(34px, 8vw, 50px)');
  expect(block).toContain('letter-spacing');
});

// C0FFEE-48 — knurled styling on the native RGB/HSV sliders (grill Q5). The
// decision under guard: the sliders STAY native <input type="range"> — keyboard
// arrows, focus, and ARIA come free — and the knurled look is pure CSS. happy-dom
// does no paint, so these anchor the mechanism (the C0FFEE-47 precedent); the
// physical look is browser-verified at the dev-serve gate.

test('<c0ffee-console> every slider is still a native range input — no custom widget', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  expect(el.shadowRoot?.querySelectorAll('input[type=range]').length).toBe(6); // 3 Channels + H/S/V
  const red = el.shadowRoot?.getElementById('sl-r') as HTMLInputElement;
  expect(red.min).toBe('0');
  expect(red.max).toBe('255');
});

test('<c0ffee-console> the track is a bounded 20px bar — bright outline marks the min/max ends', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  const track = cssBlock(el, 'input[type=range]');
  expect(track).toContain('height: 20px');
  expect(track).toContain('inset 0 0 0 2px rgba(255,255,255,.82)');
});

test('<c0ffee-console> the thumb carries the knurled-grip gradient stack — seam, ridges, metal body', () => {
  // The seam is the top gradient layer because ::after cannot attach to a thumb
  // pseudo-element — the exact constraint that made grill Q5 pick style-native.
  const el = mount('c0ffee-console', 'C0FFEE');
  const thumb = cssBlock(el, 'input[type=range]::-webkit-slider-thumb');
  expect(thumb).toContain('width: 18px');
  expect(thumb).toContain('height: 26px');
  expect(thumb).toContain('calc(50% - .5px)'); // the 1px dark center seam
  expect(thumb).toContain('repeating-linear-gradient(90deg'); // the knurl ridges
  expect(thumb).toContain('rgba(235,240,248,.34)'); // the translucent frosted body
  // Firefox gets the same grip via its own pseudo-element
  expect(cssBlock(el, 'input[type=range]::-moz-range-thumb')).toContain('height: 26px');
});

test('<c0ffee-console> the value column reads in DM Mono 500/16 — one type voice with the Hex field', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  const dec = cssBlock(el, '.dec');
  expect(dec).toContain('500 16px');
  expect(dec).toContain('var(--c0ffee-font');
});

// C0FFEE-51 — closeout: the standalone Swatch pill converges to the console's
// surface language (grill Q10): the page bg dressed with an inset hairline,
// not the retired --c0ffee-panel fill. The pill keeps its small drop shadow
// (it floats over Lesson prose); the hairline rides along on hover.

test('<c0ffee-swatch> pill is the page bg + inset hairline, not a panel fill', () => {
  const el = mount('c0ffee-swatch', 'C0FFEE');
  const pill = cssBlock(el, '.chip.a');
  expect(pill).toContain('background: var(--c0ffee-bg');
  expect(pill).toContain('inset 0 0 0 1px rgba(255,255,255,.12)');
});

test('<c0ffee-console> slider rows pin the label gutter and value column — only the range absorbs a squeeze', () => {
  // In the companion's narrow card the row overflows, and flex-shrink would
  // otherwise eat the 52px gutter UNEVENLY — min-width:auto floors "Green" at
  // its own text width while "Red"/"Blue" shrink further, drifting the sliders
  // out of column (Caitlin spotted it on the lesson page). Both fixed columns
  // are flex:none; the range is the one item allowed to shrink (min-width:0),
  // and it shrinks the same in every row.
  const el = mount('c0ffee-console', 'C0FFEE');
  expect(cssBlock(el, '.lbl')).toContain('flex: none');
  expect(cssBlock(el, '.dec')).toContain('flex: none');
  expect(cssBlock(el, 'input[type=range]')).toContain('min-width: 0');
});

// C0FFEE-54 — the copy button: one tap puts the canonical Hex color address on
// the clipboard (the SAME codec the URL hash uses — formatColorLink — so the
// address bar, the share link, and the copied value can never disagree), then
// flashes confirmation. A rejected clipboard write flashes a distinct failed
// state, never the success check (the console doesn't lie). The flash *look*
// is browser-verified; these pin the payload + the state machine.

const copyBtn = (el: HTMLElement): HTMLButtonElement =>
  el.shadowRoot?.getElementById('hex-copy') as HTMLButtonElement;
const copyStatus = (el: HTMLElement): HTMLElement =>
  el.shadowRoot?.getElementById('copy-status') as HTMLElement;

// navigator.clipboard is read-only and absent in insecure contexts; tests
// install their own, recording payloads and resolving (or rejecting) on demand.
function stubClipboard(fail = false): string[] {
  const calls: string[] = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string): Promise<void> => {
        calls.push(text);
        return fail ? Promise.reject(new Error('denied')) : Promise.resolve();
      },
    },
  });
  return calls;
}

// The write + flash settle in microtasks after the click; flush them.
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

test('<c0ffee-console> a copy button sits beside the Hex field, quiet and labeled', () => {
  const el = mount('c0ffee-console', 'C0FFEE');
  const btn = copyBtn(el);
  expect(btn.getAttribute('type')).toBe('button');
  expect(btn.getAttribute('aria-label')).toBe('Copy hex color address');
  expect(btn.closest('.hexfield')).not.toBeNull(); // beside the field, in its row
});

test('<c0ffee-console presentation="companion"> keeps the copy button — it rides the Hex field', () => {
  const el = mountPresentation('companion', 'C0FFEE');
  const btn = copyBtn(el);
  expect(btn).not.toBeNull();
  expect(btn.hidden).toBe(false);
  el.remove();
});

test('<c0ffee-console> clicking copy puts the canonical #RRGGBB Hex color address on the clipboard', async () => {
  const calls = stubClipboard();
  const el = mount('c0ffee-console'); // the namesake default
  copyBtn(el).click();
  await settle();
  expect(calls).toEqual(['#C0FFEE']);
});

test('<c0ffee-console> the copied address tracks the live Color value via the hash codec', async () => {
  const calls = stubClipboard();
  const el = mount('c0ffee-console', '3A7BD5');
  copyBtn(el).click();
  await settle();
  expect(calls).toEqual([formatColorLink(el.value)]); // byte-identical to the URL-hash form

  const slider = el.shadowRoot?.getElementById('sl-r') as HTMLInputElement;
  slider.value = '255';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  copyBtn(el).click();
  await settle();
  expect(calls[1]).toBe('#FF7BD5'); // the edit is what gets copied, live
});

test('<c0ffee-console> a successful copy flashes confirmation, announces it, then returns to rest', async () => {
  vi.useFakeTimers();
  try {
    stubClipboard();
    const el = mount('c0ffee-console', 'C0FFEE');
    const btn = copyBtn(el);
    btn.click();
    await settle();
    expect(btn.classList.contains('copied')).toBe(true);
    expect(copyStatus(el).textContent).toBe('Copied'); // the aria-live announcement
    vi.advanceTimersByTime(2000);
    expect(btn.classList.contains('copied')).toBe(false); // back to quiet rest
    expect(copyStatus(el).textContent).toBe('');
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-console> a rejected clipboard write flashes the failed state, never the success check', async () => {
  vi.useFakeTimers();
  try {
    stubClipboard(true);
    const el = mount('c0ffee-console', 'C0FFEE');
    const btn = copyBtn(el);
    btn.click();
    await settle();
    expect(btn.classList.contains('copied')).toBe(false); // no false "it worked"
    expect(btn.classList.contains('copy-failed')).toBe(true);
    expect(copyStatus(el).textContent).toBe('Copy failed');
    vi.advanceTimersByTime(2000);
    expect(btn.classList.contains('copy-failed')).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

// C0FFEE-25 — a malformed Color link never moves the Color value, never leaves a
// lying URL, and always says why (ADR-0001 amendment 2026-06-10). Live re-seed
// rejects like a filtered keystroke; initial load still defaults (nothing to
// keep); an empty hash stays silent AND clean. One test per row of the ticket's
// behavior table, plus the C0FFEE-54 disconnect lesson for the hint timer.

const hexHint = (el: HTMLElement): HTMLElement =>
  el.shadowRoot?.getElementById('hex-hint') as HTMLElement;

test('<c0ffee-console reflect> live malformed hashchange is rejected — value stays, URL heals, hint shows then fades', () => {
  vi.useFakeTimers();
  try {
    clearUrl();
    history.replaceState(null, '', '#FF6600');
    const el = mountReflect();
    let changes = 0;
    el.addEventListener('colorchange', () => changes++);

    // Simulate pasting junk into the address bar and pressing Enter.
    history.replaceState(null, '', '#potato');
    window.dispatchEvent(new Event('hashchange'));

    expect(el.hex).toBe('FF6600'); // the edit was rejected — the value stayed put
    expect(location.hash).toBe('#FF6600'); // the URL healed to the DISPLAYED color
    expect(changes).toBe(0); // a rejected edit is not a colorchange
    const hint = hexHint(el);
    expect(hint.classList.contains('show')).toBe(true);
    // The echo names the rejected fragment, so the message can't be misread as
    // describing the (valid) address sitting in the Hex field right above it.
    expect(hint.textContent).toBe('“potato” isn’t a color address — try 6 hex digits (0–9, A–F)');
    expect(hint.getAttribute('aria-live')).toBe('polite'); // heard, not just seen

    vi.advanceTimersByTime(6000);
    expect(hint.classList.contains('show')).toBe(false); // transient — auto-fades
    expect(hint.textContent).toBe('');
    el.remove();
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-console reflect> initial load of a malformed share link: mint default, URL healed, hint shown', () => {
  clearUrl();
  history.replaceState(null, '', '#potato');
  const el = mountReflect();
  expect(el.hex).toBe('C0FFEE'); // nothing to keep on first paint — the default
  expect(location.hash).toBe('#C0FFEE'); // healed to the displayed color's link
  expect(hexHint(el).classList.contains('show')).toBe(true);
  // The URL heals BEFORE the hint fires on this path — the echo must carry the
  // fragment captured at seed time, not a re-read of the already-healed hash.
  expect(hexHint(el).textContent).toBe('“potato” isn’t a color address — try 6 hex digits (0–9, A–F)');
  el.remove();
});

test('<c0ffee-console reflect> the echo clamps a long fragment to hex-address length — six characters and an ellipsis', () => {
  clearUrl();
  history.replaceState(null, '', '#FF6600');
  const el = mountReflect();

  history.replaceState(null, '', '#definitely-not-a-color');
  window.dispatchEvent(new Event('hashchange'));

  expect(el.hex).toBe('FF6600');
  expect(hexHint(el).textContent).toBe('“defini…” isn’t a color address — try 6 hex digits (0–9, A–F)');
  el.remove();
});

test('<c0ffee-console reflect> an empty hash stays silent AND clean — the default is never written into it', () => {
  clearUrl();
  const el = mountReflect();
  expect(el.hex).toBe('C0FFEE');
  expect(location.hash).toBe(''); // a plain URL is left untouched
  expect(hexHint(el).classList.contains('show')).toBe(false);
  expect(hexHint(el).textContent).toBe(''); // nothing was typed, nothing to say
  el.remove();
});

test('<c0ffee-console reflect> live hashchange to an empty hash: default, URL untouched, no hint', () => {
  clearUrl();
  history.replaceState(null, '', '#FF6600');
  const el = mountReflect();

  history.replaceState(null, '', location.pathname); // the user erased the fragment
  window.dispatchEvent(new Event('hashchange'));

  expect(el.hex).toBe('C0FFEE'); // empty = the default, exactly as today
  expect(location.hash).toBe('');
  expect(hexHint(el).classList.contains('show')).toBe(false);
  el.remove();
});

test('<c0ffee-console reflect> a valid fragment still seeds, re-seeds and canonicalizes — and never hints (regression)', () => {
  clearUrl();
  history.replaceState(null, '', '#f60');
  const el = mountReflect();
  expect(el.hex).toBe('FF6600');
  expect(location.hash).toBe('#FF6600'); // a NON-empty hash still canonicalizes on connect

  history.replaceState(null, '', '#3A7BD5');
  window.dispatchEvent(new Event('hashchange'));
  expect(el.hex).toBe('3A7BD5'); // live re-seed unchanged
  expect(hexHint(el).textContent).toBe('');
  el.remove();
});

test('<c0ffee-console reflect> editing away from the default and back still writes #C0FFEE — the empty-hash guard only protects an EMPTY hash', () => {
  vi.useFakeTimers(); // the second edit rides the C0FFEE-56 trailing write
  try {
    clearUrl();
    const el = mountReflect(); // plain load: defaults, URL stays clean
    expect(location.hash).toBe('');

    const slider = el.shadowRoot?.getElementById('sl-r') as HTMLInputElement;
    slider.value = '255';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(location.hash).toBe('#FFFFEE'); // the first real edit writes the hash

    slider.value = '192'; // C0 — back to the namesake exactly
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(el.hex).toBe('C0FFEE');
    vi.advanceTimersByTime(500);
    expect(location.hash).toBe('#C0FFEE'); // a non-empty hash always tracks, even at the default
    el.remove();
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-console reflect> the hint timer is cleared on disconnect — no callback outlives the element', () => {
  vi.useFakeTimers();
  try {
    clearUrl();
    history.replaceState(null, '', '#FF6600');
    const el = mountReflect();
    history.replaceState(null, '', '#potato');
    window.dispatchEvent(new Event('hashchange'));
    expect(vi.getTimerCount()).toBe(1); // the fade timer is armed
    el.remove(); // disconnectedCallback must drop it
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

// C0FFEE-56 — URL writes are throttled and guarded (ADR-0001 amendment 2026-06-11).
// WebKit rate-limits the history API (~100 calls per 10s, SecurityError past quota),
// so a 60Hz slider drag exhausted it in under two seconds and every later frame threw
// — the iOS "Script error." flood. The fix funnels every writer through a trailing-edge
// throttle (first write immediate, bursts coalesce into ONE deferred write that reads
// the value when the timer fires) and wraps the replaceState itself in try/catch with
// a self-rescheduling retry — the quota is undocumented engine policy, so the catch is
// the correctness argument and the throttle is load-shedding.

// Drive a console's red slider through value(s), one input event per value — the
// 60Hz drag path, minus the 16ms waits.
function dragRed(el: HTMLElement & ColorInterface, ...values: number[]): void {
  const slider = el.shadowRoot?.getElementById('sl-r') as HTMLInputElement;
  for (const v of values) {
    slider.value = String(v);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

test('<c0ffee-console reflect> a drag burst coalesces URL writes — one immediate, one trailing carrying the FINAL value', () => {
  vi.useFakeTimers();
  try {
    clearUrl();
    history.replaceState(null, '', '#000000');
    const el = mountReflect();
    const writes = vi.spyOn(history, 'replaceState');

    dragRed(el, 10, 20, 30, 40, 250); // five frames inside one throttle window
    expect(writes).toHaveBeenCalledTimes(1); // leading edge: the first frame lands at once
    expect(location.hash).toBe('#0A0000');

    vi.advanceTimersByTime(500);
    expect(writes).toHaveBeenCalledTimes(2); // the burst collapsed into ONE trailing write
    expect(location.hash).toBe('#FA0000'); // …carrying the value AT FIRE TIME, not frame #2

    el.remove();
  } finally {
    vi.restoreAllMocks(); // the spy must die even on a failed assertion — it must not poison the next test
    vi.useRealTimers();
  }
});

test('<c0ffee-console reflect> a throwing replaceState is caught and retried — the element keeps working and the URL eventually stops lying', () => {
  vi.useFakeTimers();
  try {
    clearUrl();
    history.replaceState(null, '', '#000000');
    const el = mountReflect();

    // WebKit past quota: replaceState THROWS. Stub the quota, keep the real write.
    const realWrite = history.replaceState.bind(history);
    let quotaExhausted = true;
    vi.spyOn(history, 'replaceState').mockImplementation((data, unused, url) => {
      if (quotaExhausted) throw new DOMException('Attempt to use history.replaceState() more than 100 times per 10 seconds', 'SecurityError');
      realWrite(data, unused, url);
    });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let changes = 0;
    el.addEventListener('colorchange', () => changes++);
    dragRed(el, 255); // the immediate write throws — and must be CAUGHT
    expect(el.hex).toBe('FF0000'); // the Color value moved; the element survived the throw
    expect(changes).toBe(1); // …and kept emitting
    expect(location.hash).toBe('#000000'); // the write itself failed — URL stale for now
    // The failure is logged, not swallowed — the warn IS the failure path's content.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Color link write rejected');

    quotaExhausted = false; // the quota window refills
    vi.advanceTimersByTime(2000); // retry backoff
    expect(location.hash).toBe('#FF0000'); // the retry landed — the URL stopped lying

    el.remove();
  } finally {
    vi.restoreAllMocks(); // the throwing stub must die even on a failed assertion
    vi.useRealTimers();
  }
});

test('<c0ffee-console reflect> a pending trailing write dies with the element — disconnect clears the throttle timer', () => {
  vi.useFakeTimers();
  try {
    clearUrl();
    history.replaceState(null, '', '#000000');
    const el = mountReflect();
    dragRed(el, 10, 250); // immediate write + a trailing write armed
    expect(location.hash).toBe('#0A0000');
    expect(vi.getTimerCount()).toBe(1); // the trailing timer

    el.remove();
    expect(vi.getTimerCount()).toBe(0); // disconnectedCallback dropped it
    vi.advanceTimersByTime(5000);
    expect(location.hash).toBe('#0A0000'); // a disconnected element never writes the URL
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-console reflect> the retry timer dies with the element too — no retry outlives a disconnect', () => {
  vi.useFakeTimers();
  try {
    clearUrl();
    history.replaceState(null, '', '#000000');
    const el = mountReflect();
    vi.spyOn(history, 'replaceState').mockImplementation(() => {
      throw new DOMException('quota', 'SecurityError');
    });

    dragRed(el, 255); // immediate write throws → retry armed
    expect(vi.getTimerCount()).toBe(1);
    el.remove();
    expect(vi.getTimerCount()).toBe(0);

    vi.restoreAllMocks();
    vi.advanceTimersByTime(5000);
    expect(location.hash).toBe('#000000'); // no posthumous write
  } finally {
    vi.restoreAllMocks(); // idempotent; covers a failed assertion above
    vi.useRealTimers();
  }
});

test('<c0ffee-console reflect> a value that circles back to the current hash skips the trailing write — equality is re-checked at fire time', () => {
  vi.useFakeTimers();
  try {
    clearUrl();
    history.replaceState(null, '', '#000000');
    const el = mountReflect();
    const writes = vi.spyOn(history, 'replaceState');

    dragRed(el, 255); // immediate write: hash = #FF0000
    dragRed(el, 0, 255); // wander off and back — at fire time the value EQUALS the hash
    vi.advanceTimersByTime(500);

    expect(writes).toHaveBeenCalledTimes(1); // the trailing write was skipped, not just deduped on schedule
    expect(location.hash).toBe('#FF0000');

    el.remove();
  } finally {
    vi.restoreAllMocks(); // the spy must die even on a failed assertion
    vi.useRealTimers();
  }
});

test('<c0ffee-console reflect> the C0FFEE-25 heal rides the throttle — a malformed fragment mid-drag still hints at once and heals when the window opens', () => {
  vi.useFakeTimers();
  try {
    clearUrl();
    history.replaceState(null, '', '#000000');
    const el = mountReflect();
    dragRed(el, 255); // consume the leading-edge write: hash = #FF0000

    // Junk pasted into the address bar right after a drag frame.
    history.replaceState(null, '', '#potato');
    window.dispatchEvent(new Event('hashchange'));

    expect(el.hex).toBe('FF0000'); // rejected, value stays put
    expect(hexHint(el).classList.contains('show')).toBe(true); // the hint never waits on the throttle
    expect(location.hash).toBe('#potato'); // the heal coalesced into the trailing window…

    vi.advanceTimersByTime(500);
    expect(location.hash).toBe('#FF0000'); // …and landed when it opened

    el.remove();
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-console reflect> a malformed fragment while a trailing write is ALREADY armed — the armed write itself heals', () => {
  vi.useFakeTimers();
  try {
    clearUrl();
    history.replaceState(null, '', '#000000');
    const el = mountReflect();
    dragRed(el, 10, 250); // immediate write (#0A0000) + a trailing write armed for #FA0000

    // Junk lands mid-drag, while the trailing timer is pending. The heal's
    // _reflectToUrl call sees the armed timer and rightly does nothing new —
    // the armed write re-reads the (kept) value at fire time, so it IS the heal.
    history.replaceState(null, '', '#potato');
    window.dispatchEvent(new Event('hashchange'));

    expect(el.hex).toBe('FA0000'); // rejected — the dragged color is kept
    expect(hexHint(el).classList.contains('show')).toBe(true);

    vi.advanceTimersByTime(500);
    expect(location.hash).toBe('#FA0000'); // healed by the write armed before the junk arrived

    el.remove();
  } finally {
    vi.useRealTimers();
  }
});

test('<c0ffee-console reflect> a persistent failure keeps retrying — numbered warns, then ONE console.error so RUM sees a recurrence', () => {
  vi.useFakeTimers();
  try {
    clearUrl();
    history.replaceState(null, '', '#000000');
    const el = mountReflect();

    const realWrite = history.replaceState.bind(history);
    let quotaExhausted = true;
    vi.spyOn(history, 'replaceState').mockImplementation((data, unused, url) => {
      if (quotaExhausted) throw new DOMException('quota', 'SecurityError');
      realWrite(data, unused, url);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    dragRed(el, 255); // attempt 1 throws
    // Attempts 2–4: each retry must RE-ARM from inside the retry callback —
    // the "until a write lands" promise rests on this chain.
    for (let attempt = 2; attempt <= 4; attempt++) {
      expect(vi.getTimerCount()).toBe(1); // a retry is armed
      vi.advanceTimersByTime(2000);
    }
    expect(error).not.toHaveBeenCalled(); // still looks transient — warns only
    expect(warn).toHaveBeenCalledTimes(4);
    expect(warn.mock.calls[3][0]).toContain('attempt 4'); // numbered: transient vs stuck is readable

    vi.advanceTimersByTime(2000); // attempt 5 — stops looking transient
    expect(error).toHaveBeenCalledTimes(1); // the ONE escalation RUM collects
    expect(error.mock.calls[0][0]).toContain('still failing after 5 attempts');

    quotaExhausted = false;
    vi.advanceTimersByTime(2000); // attempt 6 lands
    expect(location.hash).toBe('#FF0000'); // unbounded-by-design converged
    expect(vi.getTimerCount()).toBe(0); // and the loop ended

    el.remove();
  } finally {
    vi.restoreAllMocks(); // stubs must die even on a failed assertion
    vi.useRealTimers();
  }
});
