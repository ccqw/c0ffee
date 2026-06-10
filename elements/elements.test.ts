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
