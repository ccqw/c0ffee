// <c0ffee-console> — the flagship interactive, the Color console (imperative
// shell, ADR-0001/0002/0003). Formerly <c0ffee-mirror>; renamed in C0FFEE-20.
//
// Holds ONE Color value as the single source of truth. Every input handler
// mutates `this._value` then calls `_render()`, which redraws every view from
// that value. Views never update each other directly — they all read the value.
//
// Swatch + RGB panel (C0FFEE-2), Additive Venn (C0FFEE-3), HSV panel (C0FFEE-4).
//
// RGB (`this._value`) is the canonical Color value. The HSV panel adds one bit
// of legitimately-stateful caching (`this.hsv`): RGB->HSV is lossy at grays
// (no hue) and black (no hue/sat), so we keep the last meaningful hue/sat via
// stickyHsv. Editing RGB recomputes hsv stickily; editing HSV is authoritative
// and writes value = hsvToRgb(hsv) directly, which is what stops hue jitter.

import { parseHex, formatHex, rgbToHsv, hsvToRgb, stickyHsv, sanitizeHexInput, parseColorLink, formatColorLink } from '../lib/color.ts';
import type { Rgb, Hsv, Hex, ColorInterface, ColorChangeDetail } from '../lib/color.ts';

const DEFAULT: Rgb = { r: 192, g: 255, b: 238 }; // #C0FFEE — the namesake mint, when no/invalid hex given

type RgbKey = keyof Rgb; // 'r' | 'g' | 'b'
type HsvKey = keyof Hsv; // 'h' | 's' | 'v'

// A presentation is a named preset of which parts the one console renders and how
// (ADR-0002: never a separate element). `full` shows everything (the solo view);
// `companion` is the minimal compact layout a Lesson pins (C0FFEE-23) — fewer
// parts, no reveal-drawer (that's deferred to C0FFEE-18). Unknown values → full.
type Presentation = 'full' | 'companion';

interface Channel {
  key: RgbKey;
  label: string;
  token: string;
  pure: (v: number) => string;
}

const CHANNELS: Channel[] = [
  { key: 'r', label: 'R', token: '--c0ffee-r', pure: (v) => `rgb(${v},0,0)` },
  { key: 'g', label: 'G', token: '--c0ffee-g', pure: (v) => `rgb(0,${v},0)` },
  { key: 'b', label: 'B', token: '--c0ffee-b', pure: (v) => `rgb(0,0,${v})` },
];

const hexPair = (n: number): string => n.toString(16).toUpperCase().padStart(2, '0');

class C0ffeeConsole extends HTMLElement implements ColorInterface {
  static observedAttributes = ['hex', 'presentation'];

  // Source of truth. Seeded from the `hex` attribute in connectedCallback.
  // Private + exposed read-only via the `value` getter so views (and outside
  // consumers) read it but can't mutate it behind the setters' backs.
  private _value: Rgb = { ...DEFAULT };
  private hsv: Hsv = rgbToHsv(this._value); // cached HSV view, kept stable via stickyHsv
  private root: ShadowRoot = this.attachShadow({ mode: 'open' });
  private _anim: number | null = null;

  connectedCallback(): void {
    // Opt-in URL reflection (ADR-0001 point 4, as amended 2026-05-31): hash-only,
    // live, and a property of THIS interactive's contract — never auto-enabled, so
    // multiple interactives on one page never contend for the address bar. The solo
    // play page sets `reflect`; a Lesson's Companion console deliberately does not.
    // (The ADR-0001 prose amendment already landed in C0FFEE-17; this is its behavior.)
    // Local, not a field: reflection is wired once here and never toggled post-connect.
    if (this.hasAttribute('reflect')) {
      this._seedFromHash();
      window.addEventListener('hashchange', this._onHashChange);
      // Arm the writer BEFORE _render(): the initial render's colorchange is what
      // canonicalizes the just-seeded hash in the URL (#f60 -> #FF6600). Registering
      // after _render() would silently drop connect-time canonicalization.
      this.addEventListener('colorchange', this._reflectToUrl);
    } else {
      this._seedFromAttribute();
    }
    this._build();
    this._applyPresentation(); // show/hide parts for the chosen presentation
    this._render();
  }

  disconnectedCallback(): void {
    // The colorchange listener sits on `this` (GC'd with the element); the
    // hashchange listener lives on window, so it must be detached explicitly.
    window.removeEventListener('hashchange', this._onHashChange);
  }

  attributeChangedCallback(name: string): void {
    // Guard on a built shadow root: pre-connect setAttribute fires this before
    // _build(), and connectedCallback applies both seed and presentation itself.
    if (!this.root.childElementCount) return;
    if (name === 'hex') {
      this._seedFromAttribute();
      this._render();
    } else if (name === 'presentation') {
      // Re-layout only: show/hide parts, never re-seed. The Color value and the
      // sticky hsv are state, not layout, so a presentation switch leaves both
      // untouched (no reset, no jitter — ADR-0005's compact-presentation promise).
      this._applyPresentation();
    }
  }

  // --- public interface (ADR-0001) ---
  get value(): Readonly<Rgb> {
    return this._value;
  }

  get hex(): Hex {
    return formatHex(this._value);
  }

  // animateTo({r,g,b}) — tween the Color value from current to target (~300ms)
  // so a click-to-load shows the journey (channels climbing), not just the
  // destination. Each frame writes value + hsv (stickily) and re-renders, so
  // every view animates together. Used by the Lesson runtime.
  animateTo(target: Rgb, ms = 320): void {
    if (this._anim) cancelAnimationFrame(this._anim);
    const from = { ...this._value };
    const start = performance.now();
    const ease = (t: number): number => 1 - (1 - t) * (1 - t); // easeOutQuad
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / ms);
      const k = ease(t);
      this._value = {
        r: Math.round(from.r + (target.r - from.r) * k),
        g: Math.round(from.g + (target.g - from.g) * k),
        b: Math.round(from.b + (target.b - from.b) * k),
      };
      this.hsv = stickyHsv(this._value, this.hsv);
      this._render();
      if (t < 1) this._anim = requestAnimationFrame(step);
      else this._anim = null;
    };
    this._anim = requestAnimationFrame(step);
  }

  // --- seed (attribute in; graceful fallback so an interactive never breaks) ---
  private _seedFromAttribute(): void {
    const parsed = parseHex(this.getAttribute('hex'));
    this._value = parsed || { ...DEFAULT };
    this.hsv = rgbToHsv(this._value);
  }

  // --- reflection: seed from the URL hash, re-seed on change, write on change ---
  // Only wired when `reflect` is set. The hash is the sole URL form (the legacy
  // `?hex=` query is retired — read nowhere, written nowhere).

  // Seed from location.hash; empty/malformed -> the #C0FFEE default, never a broken
  // render. Mirrors _seedFromAttribute's fresh-HSV reset.
  private _seedFromHash(): void {
    this._value = parseColorLink(location.hash) || { ...DEFAULT };
    this.hsv = rgbToHsv(this._value);
  }

  // hashchange = the address bar changed (the paste-and-enter the old page-level
  // reflection silently ignored). Re-seed live.
  private _onHashChange = (): void => {
    this._seedFromHash();
    this._render();
  };

  // Write the live Color link back to the hash. replaceState (not `location.hash =`)
  // keeps history clean AND fires no hashchange, so there's no seed/echo loop; the
  // equality guard skips redundant writes and canonicalizes case/shorthand for free.
  private _reflectToUrl = (): void => {
    const next = formatColorLink(this._value);
    if (location.hash !== next) history.replaceState(null, '', next);
  };

  // --- presentation (ADR-0002 / ADR-0005): which parts this one element shows ---

  // Read the presentation off the attribute; only 'companion' opts out of full,
  // so a missing/unknown value is always the safe `full` default (never a broken,
  // half-hidden layout from a typo).
  private get _presentation(): Presentation {
    return this.getAttribute('presentation') === 'companion' ? 'companion' : 'full';
  }

  // Apply the current presentation by toggling part visibility only. `companion`
  // drops the HSV panel (the secondary color model) for a compact band; `full`
  // shows it. Uses `hidden` (not removal) so the panel's state stays live and
  // correct underneath — switching back to full reveals the right HSV instantly,
  // and the Color value is never disturbed. The narrower card width is pure CSS
  // (`:host([presentation="companion"])`).
  private _applyPresentation(): void {
    this._el('hsv-panel').hidden = this._presentation === 'companion';
  }

  // --- one-time DOM construction ---
  private _build(): void {
    this.root.innerHTML = `
      <style>
        :host {
          display: inline-block;
          font-family: var(--c0ffee-font, monospace);
          color: var(--c0ffee-fg, #eee);
        }
        /* Card surface (frugal-surfaces): the page bg dressed with an inset
           hairline + drop shadow — NOT a lighter panel fill. --c0ffee-panel
           stays the Menu-tile/Swatch surface; the console no longer reads it. */
        .card {
          width: 440px; max-width: 100%;
          background: var(--c0ffee-bg, #0a0a0b);
          border-radius: 18px;
          padding: clamp(18px, 4vw, 26px);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.06), 0 30px 70px -30px rgba(0,0,0,.8);
        }
        /* Hero head: the Additive Venn on top (the headline), Swatch beneath.
           DOM order is swatch-then-venn; column-reverse stacks the venn first
           so the companion presentation keeps its row with no markup change. */
        .stage { display: flex; flex-direction: column-reverse; }
        .swatch {
          height: clamp(92px, 18vw, 116px);
          border-radius: 12px;
          /* hairline so a dark Color value still separates from the card */
          box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.55);
          transition: background .08s;
        }
        .venn { display: flex; justify-content: center; padding: 6px 0 20px; }
        /* ── Blend correctness — load-bearing, not a style choice ──
           Each circle is one Channel's light, combined with mix-blend-mode:
           screen (1-(1-a)(1-b)). Over PURE BLACK the backdrop contributes 0,
           so screen collapses to exact addition: overlaps compute their own
           secondaries and the center tri-overlap equals the rendered Color
           value EXACTLY — the console doesn't lie. Two invariants make it true:
           - background #000: an inline constant, never a token — it's the
             screen-blend identity (physics), not theme;
           - isolation: isolate: walls the blend into its own stacking context
             so the circles can never screen against the card behind them
             (without it the sum drifts brighter by the card color).
           CONTEXT.md (Additive Venn) records this as an implementation invariant. */
        .venn-box {
          position: relative;
          width: clamp(232px, 60vw, 310px);
          aspect-ratio: 1;
          background: #000;
          isolation: isolate;
          border-radius: 50%;
        }
        /* Hero geometry: 70% circles on heavy-overlap centers, so the central
           tri-intersection is the LARGEST region — the mixed color is the
           headline, the primaries the supporting cast. "left" is each circle's
           center-x (translateX(-50%)); "top" is its top edge. */
        .circle {
          position: absolute; width: 70%; height: 70%; border-radius: 50%;
          mix-blend-mode: screen;
          transform: translateX(-50%);
        }
        #c-r { left: 50%; top: 0; }
        #c-g { left: 37%; top: 23%; }
        #c-b { left: 63%; top: 23%; }
        .boxes {
          display: flex; gap: 10px; justify-content: center;
          align-items: flex-end; padding: 16px 0 4px;
        }
        .hash { font-size: 26px; color: #888; align-self: center; padding-top: 28px; }
        .col { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .mini { width: 64px; height: 22px; border-radius: 6px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }
        .digit {
          width: 64px; box-sizing: border-box; font: 600 24px/1 var(--c0ffee-font, monospace);
          text-align: center; text-transform: uppercase; padding: 6px 0;
          border-radius: 7px; border: 2px solid; background: #0d0d0d; color: #eee;
        }
        .sliders { padding: 8px 0 20px; display: flex; flex-direction: column; gap: 13px; }
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
        /* companion presentation (C0FFEE-23): a compact band for a Lesson's pinned
           Companion console. The HSV panel is dropped in JS (#hsv-panel[hidden]);
           the card narrows and the swatch shrinks so it reads as compact, not just
           shorter. Minimal by design — the rich reveal-drawer is C0FFEE-18. */
        :host([presentation="companion"]) .card { width: 240px; }
        :host([presentation="companion"]) .stage { flex-direction: row; gap: 12px; }
        :host([presentation="companion"]) .swatch { flex: 1; height: auto; min-height: 110px; }
        :host([presentation="companion"]) .venn { padding: 0; align-items: center; }
        :host([presentation="companion"]) .venn-box { width: 104px; }
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
        <div class="hsv-panel" id="hsv-panel">
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
        </div>
      </div>`;

    // Wire inputs. Each handler does the same two steps: write value, re-render.
    for (const c of CHANNELS) {
      this._input(`sl-${c.key}`)
        .addEventListener('input', (e) => this._setChannel(c.key, +this._target(e).value));
      this._input(`hex-${c.key}`)
        .addEventListener('input', (e) => this._setChannelHex(c.key, this._target(e).value));
    }
    // HSV sliders: HSV is authoritative for these edits (no lossy round-trip).
    this._input('sl-h').addEventListener('input', (e) => this._setHsv('h', +this._target(e).value));
    this._input('sl-s').addEventListener('input', (e) => this._setHsv('s', +this._target(e).value / 100));
    this._input('sl-v').addEventListener('input', (e) => this._setHsv('v', +this._target(e).value / 100));
  }

  // RGB edits: value is authoritative; re-derive hsv stickily so hue holds at edges.
  private _setChannel(key: RgbKey, n: number): void {
    this._value[key] = Math.max(0, Math.min(255, n));
    this.hsv = stickyHsv(this._value, this.hsv);
    this._render();
  }

  // Hex box edit. Filter the raw input to valid hex digits first, then write
  // the *filtered* string straight back into the box so it can never show a
  // character the value silently dropped (the old `if`-no-`else` bug). Two hex
  // digits cap at FF = 255, so the filter alone keeps the channel in range —
  // no separate bounds check, no lenient parseInt prefix-parse.
  private _setChannelHex(key: RgbKey, raw: string): void {
    const clean = sanitizeHexInput(raw, 2);
    // Correct the box in place — but only when the filter actually changed the
    // characters, not just their case. The box is displayed uppercase via CSS
    // (text-transform), so a valid lowercase keystroke needs no rewrite; writing
    // box.value would just jump the caret to the end and fight mid-string edits.
    const box = this._input(`hex-${key}`);
    if (box.value.toUpperCase() !== clean) box.value = clean;
    this._value[key] = clean === '' ? 0 : parseInt(clean, 16);
    this.hsv = stickyHsv(this._value, this.hsv);
    this._render(key); // don't stomp the box the user is typing in
  }

  // HSV edits: hsv is authoritative; value follows directly.
  private _setHsv(key: HsvKey, n: number): void {
    const next = { ...this.hsv };
    next[key] = n;
    this.hsv = next;
    this._value = hsvToRgb(this.hsv);
    this._render();
  }

  // --- redraw every view from the single value ---
  private _render(activeHexKey?: RgbKey): void {
    this._el('swatch').style.background = '#' + formatHex(this._value);
    for (const c of CHANNELS) {
      const v = this._value[c.key];
      this._el(`mini-${c.key}`).style.background = c.pure(v);
      // Venn circle = this channel in isolation; screen-blend does the addition.
      this._el(`c-${c.key}`).style.background = c.pure(v);
      this._input(`sl-${c.key}`).value = String(v);
      this._el(`dec-${c.key}`).textContent = String(v);
      if (activeHexKey !== c.key) this._input(`hex-${c.key}`).value = hexPair(v);
    }
    this._renderHsv();
    this._emitChange();
  }

  // Notify-out half of the interface (ADR-0001). composed:true so the event
  // escapes the Shadow DOM; a page that opts in listens to reflect state to the URL.
  private _emitChange(): void {
    const detail: ColorChangeDetail = { ...this._value, hex: formatHex(this._value) };
    this.dispatchEvent(new CustomEvent<ColorChangeDetail>('colorchange', {
      bubbles: true,
      composed: true,
      detail,
    }));
  }

  // HSV sliders + self-coloring tracks (sat/val previewed at the current hue).
  private _renderHsv(): void {
    const { h, s, v } = this.hsv;
    this._input('sl-h').value = String(Math.round(h));
    this._input('sl-s').value = String(Math.round(s * 100));
    this._input('sl-v').value = String(Math.round(v * 100));
    this._el('dec-h').textContent = Math.round(h) + '°';
    this._el('dec-s').textContent = Math.round(s * 100) + '%';
    this._el('dec-v').textContent = Math.round(v * 100) + '%';
    // tracks: sat goes gray->pure-hue; val goes black->pure-hue.
    const pureHue = '#' + formatHex(hsvToRgb({ h, s: 1, v: 1 }));
    this._input('sl-s').style.background = `linear-gradient(to right, #888, ${pureHue})`;
    this._input('sl-v').style.background = `linear-gradient(to right, #000, ${pureHue})`;
  }

  // --- shadow-DOM lookup helpers; ids are build-time invariants, so a miss is a bug ---
  private _el(id: string): HTMLElement {
    const node = this.root.getElementById(id);
    if (!node) throw new Error(`c0ffee-console: missing #${id}`);
    return node;
  }

  private _input(id: string): HTMLInputElement {
    return this._el(id) as HTMLInputElement;
  }

  private _target(e: Event): HTMLInputElement {
    return e.target as HTMLInputElement;
  }
}

customElements.define('c0ffee-console', C0ffeeConsole);
