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

import { parseHex, formatHex, bestTextColor } from '../lib/color.js';

const DEFAULT = { r: 58, g: 123, b: 213 };

class C0ffeeSwatch extends HTMLElement {
  static observedAttributes = ['hex', 'label'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.value = { ...DEFAULT };
  }

  connectedCallback() {
    this._seed();
    this._build();
    this._render();
    this.addEventListener('click', () => this._emit());
  }

  attributeChangedCallback(_name, _old, _new) {
    if (this.shadowRoot.childElementCount) {
      this._seed();
      this._render();
    }
  }

  // --- public interface (ADR-0001) ---
  get hex() {
    return formatHex(this.value);
  }

  _seed() {
    this.value = parseHex(this.getAttribute('hex') || '') || { ...DEFAULT };
  }

  _build() {
    this.shadowRoot.innerHTML = `
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
    this.shadowRoot.getElementById('chip').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._emit(); }
    });
  }

  _render() {
    const chip = this.shadowRoot.getElementById('chip');
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
  _emit() {
    this.dispatchEvent(new CustomEvent('colorchange', {
      bubbles: true,
      composed: true,
      detail: { ...this.value, hex: formatHex(this.value) },
    }));
  }
}

customElements.define('c0ffee-swatch', C0ffeeSwatch);
