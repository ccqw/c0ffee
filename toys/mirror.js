// <c0ffee-mirror> — the flagship Toy (imperative shell, ADR-0001/0002/0003).
//
// Holds ONE Color value as the single source of truth. Every input handler
// mutates `this.value` then calls `_render()`, which redraws every view from
// that value. Views never update each other directly — they all read the value.
//
// This slice (C0FFEE-2): Swatch + RGB panel (sliders, hex boxes, Channel
// swatches). The Venn palette (C0FFEE-3) and HSV panel (C0FFEE-4) are added
// later as additional views/handlers over the same value.

import { parseHex, formatHex } from '../lib/color.js';

const DEFAULT = { r: 58, g: 123, b: 213 }; // a calm blue when no/invalid hex given

const CHANNELS = [
  { key: 'r', label: 'R', token: '--c0ffee-r', pure: (v) => `rgb(${v},0,0)` },
  { key: 'g', label: 'G', token: '--c0ffee-g', pure: (v) => `rgb(0,${v},0)` },
  { key: 'b', label: 'B', token: '--c0ffee-b', pure: (v) => `rgb(0,0,${v})` },
];

const hexPair = (n) => n.toString(16).toUpperCase().padStart(2, '0');

class C0ffeeMirror extends HTMLElement {
  static observedAttributes = ['hex'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    // Source of truth. Seeded from the `hex` attribute in connectedCallback.
    this.value = { ...DEFAULT };
  }

  connectedCallback() {
    this._seedFromAttribute();
    this._build();
    this._render();
  }

  attributeChangedCallback(name, _old, _new) {
    if (name === 'hex' && this.shadowRoot.childElementCount) {
      this._seedFromAttribute();
      this._render();
    }
  }

  // --- public interface (ADR-0001) ---
  get hex() {
    return formatHex(this.value);
  }

  // --- seed (attribute in; graceful fallback so a toy never breaks) ---
  _seedFromAttribute() {
    const parsed = parseHex(this.getAttribute('hex') || '');
    this.value = parsed || { ...DEFAULT };
  }

  // --- one-time DOM construction ---
  _build() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
          font-family: var(--c0ffee-font, monospace);
          color: var(--c0ffee-fg, #eee);
          --radius: var(--c0ffee-radius, 10px);
        }
        .card {
          width: 320px;
          background: var(--c0ffee-panel, #161616);
          border-radius: var(--radius);
          overflow: hidden;
        }
        .swatch { height: 150px; transition: background .08s; }
        .boxes {
          display: flex; gap: 10px; justify-content: center;
          align-items: flex-end; padding: 16px 16px 4px;
        }
        .hash { font-size: 26px; color: #888; align-self: center; padding-top: 28px; }
        .col { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .mini { width: 64px; height: 22px; border-radius: 6px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }
        .digit {
          width: 64px; box-sizing: border-box; font: 600 24px/1 var(--c0ffee-font, monospace);
          text-align: center; text-transform: uppercase; padding: 6px 0;
          border-radius: 7px; border: 2px solid; background: #0d0d0d; color: #eee;
        }
        .sliders { padding: 8px 18px 20px; display: flex; flex-direction: column; gap: 13px; }
        .row { display: flex; align-items: center; gap: 12px; }
        .lbl { width: 16px; font-weight: 700; }
        input[type=range] {
          flex: 1; -webkit-appearance: none; appearance: none;
          height: 14px; border-radius: 7px;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
          background: #fff; border: 2px solid #222; cursor: pointer;
        }
        .dec { width: 30px; text-align: right; color: #999; font-size: 13px; }
      </style>
      <div class="card">
        <div class="swatch" id="swatch"></div>
        <div class="boxes">
          <span class="hash">#</span>
          ${CHANNELS.map((c) => `
            <div class="col">
              <div class="mini" id="mini-${c.key}"></div>
              <input class="digit" id="hex-${c.key}" maxlength="2"
                     style="border-color: var(${c.token});">
            </div>`).join('')}
        </div>
        <div class="sliders">
          ${CHANNELS.map((c) => `
            <label class="row">
              <span class="lbl" style="color: var(${c.token});">${c.label}</span>
              <input type="range" min="0" max="255" id="sl-${c.key}"
                     style="background: linear-gradient(to right, #000, ${c.pure(255)});">
              <code class="dec" id="dec-${c.key}"></code>
            </label>`).join('')}
        </div>
      </div>`;

    // Wire inputs. Each handler does the same two steps: write value, re-render.
    for (const c of CHANNELS) {
      this.shadowRoot.getElementById(`sl-${c.key}`)
        .addEventListener('input', (e) => this._setChannel(c.key, +e.target.value));
      this.shadowRoot.getElementById(`hex-${c.key}`)
        .addEventListener('input', (e) => this._setChannelHex(c.key, e.target.value));
    }
  }

  _setChannel(key, n) {
    this.value[key] = Math.max(0, Math.min(255, n));
    this._render();
  }

  _setChannelHex(key, str) {
    const n = parseInt(str, 16);
    if (!Number.isNaN(n) && n >= 0 && n <= 255) {
      this.value[key] = n;
      this._render(key); // don't stomp the box the user is typing in
    }
  }

  // --- redraw every view from the single value ---
  _render(activeHexKey) {
    const $ = (id) => this.shadowRoot.getElementById(id);
    $('swatch').style.background = '#' + formatHex(this.value);
    for (const c of CHANNELS) {
      const v = this.value[c.key];
      $(`mini-${c.key}`).style.background = c.pure(v);
      $(`sl-${c.key}`).value = v;
      $(`dec-${c.key}`).textContent = v;
      if (activeHexKey !== c.key) $(`hex-${c.key}`).value = hexPair(v);
    }
  }
}

customElements.define('c0ffee-mirror', C0ffeeMirror);
