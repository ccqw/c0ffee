// <c0ffee-swatch> — the inline swatch (a read-only "sparkline swatch" chip).
//
// `hex` is always its identity. Two render modes:
//   mode A (no `label`): a tiny swatch box + the hex.
//   mode C (`label` present): the author's word, painted; hex hidden at rest,
//                             text color auto-picked for legibility.
// Both show the uniform tooltip "{hex} · click to load". A plain click fires a
// `colorchange` event (ADR-0001) carrying the Color value, so a Lesson can
// route it to a Companion mirror. The element itself is read-only and knows
// nothing about what consumes the event.

import { parseHex, formatHex, bestTextColor } from '../lib/color.ts';
import type { Rgb, Hex, ColorInterface, ColorChangeDetail } from '../lib/color.ts';

const DEFAULT: Rgb = { r: 58, g: 123, b: 213 };

class C0ffeeSwatch extends HTMLElement implements ColorInterface {
  static observedAttributes = ['hex', 'label'];

  // The single source of truth for this chip's Color value. Seeded in connectedCallback.
  value: Rgb = { ...DEFAULT };
  // attachShadow returns the root, so we never juggle a nullable shadowRoot.
  private root: ShadowRoot = this.attachShadow({ mode: 'open' });

  connectedCallback(): void {
    this._seed();
    this._build();
    this._render();
    this.addEventListener('click', () => this._emit());
  }

  attributeChangedCallback(): void {
    if (this.root.childElementCount) {
      this._seed();
      this._render();
    }
  }

  // --- public interface (ADR-0001) ---
  get hex(): Hex {
    return formatHex(this.value);
  }

  private _seed(): void {
    this.value = parseHex(this.getAttribute('hex')) || { ...DEFAULT };
  }

  private _build(): void {
    this.root.innerHTML = `
      <style>
        :host {
          display: inline-block;
          vertical-align: middle;
          cursor: pointer;
          font-family: var(--c0ffee-font, monospace);
        }
        .chip {
          display: inline-flex; align-items: center; gap: 6px;
          border-radius: 999px;
          font: 600 0.85em/1 var(--c0ffee-font, monospace);
          transition: transform .1s, box-shadow .1s;
        }
        :host(:hover) .chip { transform: translateY(-1px); }
        /* mode A: swatch box + hex on a subtle raised pill */
        .chip.a {
          padding: 2px 9px 2px 5px;
          background: var(--c0ffee-panel, #1c1c1c);
          box-shadow: 0 1px 2px rgba(0,0,0,.3);
          color: var(--c0ffee-fg, #eee);
        }
        :host(:hover) .chip.a { box-shadow: 0 2px 6px rgba(0,0,0,.45); }
        .box {
          width: 1em; height: 1em; border-radius: 4px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.18);
        }
        /* mode C: the word, painted */
        .chip.c { padding: 2px 11px; text-shadow: 0 1px 1px rgba(0,0,0,.18); }
      </style>
      <span class="chip" id="chip" tabindex="0"></span>`;

    // keyboard affordance: Enter/Space activate like a click
    this._el('chip').addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') { e.preventDefault(); this._emit(); }
    });
  }

  private _render(): void {
    const chip = this._el('chip');
    const hex = formatHex(this.value);
    const label = this.getAttribute('label');
    chip.title = `#${hex} · click to load`; // uniform tooltip, both modes

    if (label) {
      chip.className = 'chip c';
      chip.style.background = '#' + hex;
      chip.style.color = bestTextColor(this.value);
      chip.textContent = label;
    } else {
      chip.className = 'chip a';
      chip.style.background = '';
      chip.style.color = '';
      chip.innerHTML = `<span class="box" style="background:#${hex}"></span>#${hex}`;
    }
  }

  // Announce this chip's Color value; a Lesson routes it to the Companion mirror.
  private _emit(): void {
    const detail: ColorChangeDetail = { ...this.value, hex: formatHex(this.value) };
    this.dispatchEvent(new CustomEvent<ColorChangeDetail>('colorchange', {
      bubbles: true,
      composed: true,
      detail,
    }));
  }

  // Shadow-DOM lookup; the id is a build-time invariant, so a miss is a bug.
  private _el(id: string): HTMLElement {
    const node = this.root.getElementById(id);
    if (!node) throw new Error(`c0ffee-swatch: missing #${id}`);
    return node;
  }
}

customElements.define('c0ffee-swatch', C0ffeeSwatch);
