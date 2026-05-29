// <c0ffee-mirror> — the flagship Toy (imperative shell, ADR-0001/0002/0003).
//
// Holds ONE Color value as the single source of truth. Every input handler
// mutates `this.value` then calls `_render()`, which redraws every view from
// that value. Views never update each other directly — they all read the value.
//
// Swatch + RGB panel (C0FFEE-2), Venn palette (C0FFEE-3), HSV panel (C0FFEE-4).
//
// RGB (`this.value`) is the canonical Color value. The HSV panel adds one bit
// of legitimately-stateful caching (`this.hsv`): RGB->HSV is lossy at grays
// (no hue) and black (no hue/sat), so we keep the last meaningful hue/sat via
// stickyHsv. Editing RGB recomputes hsv stickily; editing HSV is authoritative
// and writes value = hsvToRgb(hsv) directly, which is what stops hue jitter.

import { parseHex, formatHex, rgbToHsv, hsvToRgb, stickyHsv } from '../lib/color.js';

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
    this.hsv = rgbToHsv(this.value); // cached HSV view, kept stable via stickyHsv
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
    this.hsv = rgbToHsv(this.value);
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
        .stage { display: flex; }
        .swatch { flex: 1; min-height: 160px; transition: background .08s; }
        .venn {
          flex: 1; background: #0b0b0b;
          display: flex; align-items: center; justify-content: center;
        }
        .venn-box { position: relative; width: 150px; height: 150px; }
        /* Each circle is one Channel's light; screen-blend adds them, so overlaps
           compute their own secondaries and the center equals the Color value. */
        .circle {
          position: absolute; width: 95px; height: 95px; border-radius: 50%;
          mix-blend-mode: screen;
        }
        #c-r { left: 28px; top: 5px; }
        #c-g { left: 5px;  top: 50px; }
        #c-b { left: 50px; top: 50px; }
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
        .dec { width: 40px; text-align: right; color: #999; font-size: 13px; }
        .divider { text-align: center; color: #555; font-size: 12px; padding: 2px 0 8px; }
        .lbl.hsv { color: var(--c0ffee-accent, #C0FFEE); }
      </style>
      <div class="card">
        <div class="stage">
          <div class="swatch" id="swatch"></div>
          <div class="venn">
            <div class="venn-box">
              <div class="circle" id="c-r"></div>
              <div class="circle" id="c-g"></div>
              <div class="circle" id="c-b"></div>
            </div>
          </div>
        </div>
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
        <div class="divider">↕ same color ↕</div>
        <div class="sliders">
          <label class="row">
            <span class="lbl hsv">H</span>
            <input type="range" min="0" max="360" id="sl-h"
                   style="background: linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);">
            <code class="dec" id="dec-h"></code>
          </label>
          <label class="row">
            <span class="lbl hsv">S</span>
            <input type="range" min="0" max="100" id="sl-s">
            <code class="dec" id="dec-s"></code>
          </label>
          <label class="row">
            <span class="lbl hsv">V</span>
            <input type="range" min="0" max="100" id="sl-v">
            <code class="dec" id="dec-v"></code>
          </label>
        </div>
      </div>`;

    // Wire inputs. Each handler does the same two steps: write value, re-render.
    for (const c of CHANNELS) {
      this.shadowRoot.getElementById(`sl-${c.key}`)
        .addEventListener('input', (e) => this._setChannel(c.key, +e.target.value));
      this.shadowRoot.getElementById(`hex-${c.key}`)
        .addEventListener('input', (e) => this._setChannelHex(c.key, e.target.value));
    }
    // HSV sliders: HSV is authoritative for these edits (no lossy round-trip).
    this.shadowRoot.getElementById('sl-h')
      .addEventListener('input', (e) => this._setHsv('h', +e.target.value));
    this.shadowRoot.getElementById('sl-s')
      .addEventListener('input', (e) => this._setHsv('s', +e.target.value / 100));
    this.shadowRoot.getElementById('sl-v')
      .addEventListener('input', (e) => this._setHsv('v', +e.target.value / 100));
  }

  // RGB edits: value is authoritative; re-derive hsv stickily so hue holds at edges.
  _setChannel(key, n) {
    this.value[key] = Math.max(0, Math.min(255, n));
    this.hsv = stickyHsv(this.value, this.hsv);
    this._render();
  }

  _setChannelHex(key, str) {
    const n = parseInt(str, 16);
    if (!Number.isNaN(n) && n >= 0 && n <= 255) {
      this.value[key] = n;
      this.hsv = stickyHsv(this.value, this.hsv);
      this._render(key); // don't stomp the box the user is typing in
    }
  }

  // HSV edits: hsv is authoritative; value follows directly.
  _setHsv(key, n) {
    this.hsv = { ...this.hsv, [key]: n };
    this.value = hsvToRgb(this.hsv);
    this._render();
  }

  // --- redraw every view from the single value ---
  _render(activeHexKey) {
    const $ = (id) => this.shadowRoot.getElementById(id);
    $('swatch').style.background = '#' + formatHex(this.value);
    for (const c of CHANNELS) {
      const v = this.value[c.key];
      $(`mini-${c.key}`).style.background = c.pure(v);
      // Venn circle = this channel in isolation; screen-blend does the addition.
      $(`c-${c.key}`).style.background = c.pure(v);
      $(`sl-${c.key}`).value = v;
      $(`dec-${c.key}`).textContent = v;
      if (activeHexKey !== c.key) $(`hex-${c.key}`).value = hexPair(v);
    }
    this._renderHsv();
    this._emitChange();
  }

  // Notify-out half of the Toy interface (ADR-0001). composed:true so the event
  // escapes the Shadow DOM; a Playground listens to reflect state to the URL.
  _emitChange() {
    this.dispatchEvent(new CustomEvent('colorchange', {
      bubbles: true,
      composed: true,
      detail: { ...this.value, hex: formatHex(this.value) },
    }));
  }

  // HSV sliders + self-coloring tracks (sat/val previewed at the current hue).
  _renderHsv() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const { h, s, v } = this.hsv;
    $('sl-h').value = Math.round(h);
    $('sl-s').value = Math.round(s * 100);
    $('sl-v').value = Math.round(v * 100);
    $('dec-h').textContent = Math.round(h) + '°';
    $('dec-s').textContent = Math.round(s * 100) + '%';
    $('dec-v').textContent = Math.round(v * 100) + '%';
    // tracks: sat goes gray->pure-hue; val goes black->pure-hue.
    const pureHue = '#' + formatHex(hsvToRgb({ h, s: 1, v: 1 }));
    $('sl-s').style.background = `linear-gradient(to right, #888, ${pureHue})`;
    $('sl-v').style.background = `linear-gradient(to right, #000, ${pureHue})`;
  }
}

customElements.define('c0ffee-mirror', C0ffeeMirror);
