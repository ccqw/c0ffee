// <c0ffee-console> — the flagship interactive, the Color console (imperative
// shell, ADR-0001/0002/0003). Formerly <c0ffee-mirror>; renamed in C0FFEE-20.
//
// Holds ONE Color value as the single source of truth. Every input handler
// mutates `this._value` then calls `_render()`, which redraws every view from
// that value. Views never update each other directly — they all read the value.
//
// Swatch + RGB panel (C0FFEE-2), Additive Venn (C0FFEE-3), HSV panel (C0FFEE-4),
// channel-solo + Named color address on the Swatch corner (C0FFEE-50),
// the Hex field as the typographic centerpiece (C0FFEE-49).
//
// RGB (`this._value`) is the canonical Color value. The HSV panel adds one bit
// of legitimately-stateful caching (`this.hsv`): RGB->HSV is lossy at grays
// (no hue) and black (no hue/sat), so we keep the last meaningful hue/sat via
// stickyHsv. Editing RGB recomputes hsv stickily; editing HSV is authoritative
// and writes value = hsvToRgb(hsv) directly, which is what stops hue jitter.

import { parseHex, formatHex, rgbToHsv, hsvToRgb, stickyHsv, sanitizeHexInput, parseColorLink, formatColorLink, namedColor, bestTextColor } from '../lib/color.ts';
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
  { key: 'r', label: 'Red', token: '--c0ffee-r', pure: (v) => `rgb(${v},0,0)` },
  { key: 'g', label: 'Green', token: '--c0ffee-g', pure: (v) => `rgb(0,${v},0)` },
  { key: 'b', label: 'Blue', token: '--c0ffee-b', pure: (v) => `rgb(0,0,${v})` },
];

class C0ffeeConsole extends HTMLElement implements ColorInterface {
  static observedAttributes = ['hex', 'presentation'];

  // Source of truth. Seeded from the `hex` attribute in connectedCallback.
  // Private + exposed read-only via the `value` getter so views (and outside
  // consumers) read it but can't mutate it behind the setters' backs.
  private _value: Rgb = { ...DEFAULT };
  private hsv: Hsv = rgbToHsv(this._value); // cached HSV view, kept stable via stickyHsv
  private root: ShadowRoot = this.attachShadow({ mode: 'open' });
  private _anim: number | null = null;
  // Channel-solo (grill Q2): which channel the Additive Venn is isolating, or
  // null. VIEW state, not color state — it never touches _value and never emits.
  private _solo: RgbKey | null = null;

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
    // hashchange listener lives on window and the popover's pointerdown
    // listener on document, so both must be detached explicitly.
    window.removeEventListener('hashchange', this._onHashChange);
    this._closePop();
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
        /* Page-level box-sizing resets stop at the shadow boundary, so the
           card's width must include its own padding here or max-width:100%
           overflows a narrow viewport. */
        *, *::before, *::after { box-sizing: border-box; }
        /* Card surface (frugal-surfaces): the page bg dressed with an inset
           hairline + drop shadow — NOT a lighter panel fill. The Menu tiles
           and the Swatch pill speak the same language (C0FFEE-51). */
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
          position: relative;
          height: clamp(92px, 18vw, 116px);
          border-radius: 12px;
          /* hairline so a dark Color value still separates from the card */
          box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.55);
          transition: background .08s;
        }
        /* The Swatch corner slot: the active channel's tag while channel-solo
           is on, else the Named color address when one exists (present-only —
           a "closest match" would lie). Text color is set per-render via
           bestTextColor so it stays legible over any Color value. */
        .tag {
          position: absolute; right: 12px; bottom: 10px;
          font-size: 12px; letter-spacing: .4px; opacity: .72;
          pointer-events: none;
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
          /* channel-solo fades the other two circles in place */
          transition: opacity .25s, background .08s;
        }
        #c-r { left: 50%; top: 0; }
        #c-g { left: 37%; top: 23%; }
        #c-b { left: 63%; top: 23%; }
        /* ── Hex field (C0FFEE-49, grill Q3, prototype variant C) ──
           ONE real <input> owns editing, so paste/select-all/undo stay native.
           It is transparent and sits over a presentational mirror of six slots
           grouped into three channel pairs — a plain input lays glyphs at
           uniform advance and physically can't hold a gap inside itself, so
           the pair grouping must be structural. The native caret is hidden;
           one measured caret element stands in (exact at all 7 boundaries,
           including the two inside pair-gaps — no trailing-gap artifact). */
        .hexfield {
          display: flex; justify-content: center; align-items: baseline; gap: .14em;
          padding: 30px 0 10px;
          --hex-fs: clamp(34px, 8vw, 50px);
          --hex-ls: 0.12em;
          font: 300 var(--hex-fs)/1 var(--c0ffee-font, monospace);
          letter-spacing: var(--hex-ls);
          text-transform: uppercase;
        }
        .hashmark { color: color-mix(in srgb, var(--c0ffee-fg, #eee) 42%, transparent); }
        .hex-stack { position: relative; display: inline-block; }
        .hex-input {
          position: absolute; inset: 0; width: 100%; height: 100%;
          background: none; border: none; outline: none; padding: 0; margin: 0;
          font: inherit; letter-spacing: inherit; /* keep click-x ≈ glyph-x under the mirror */
          color: transparent; caret-color: transparent;
          z-index: 2;
        }
        /* GEOMETRY IS MEASURED: _paintHexCaret and _mapHexClick read these
           boxes via getBoundingClientRect — restructuring the mirror/slot
           layout moves the caret and click mapping with it (no type error
           will catch a drift; re-verify in a browser). */
        .hex-mirror { display: flex; gap: .42ch; align-items: baseline; position: relative; z-index: 1; }
        .hex-pair { display: flex; position: relative; }
        .hex-slot { width: calc(1ch + var(--hex-ls)); text-align: center; }
        /* an implied (untyped) trailing zero — present in the value, dimmed here */
        .hex-slot.empty { color: color-mix(in srgb, var(--c0ffee-fg, #eee) 26%, transparent); }
        .hex-dot {
          position: absolute; left: 50%; bottom: 100%; transform: translateX(-50%);
          margin-bottom: 9px; width: 9px; height: 9px; border-radius: 50%;
          border: none; padding: 0; cursor: pointer;
        }
        .hex-caret {
          position: absolute; width: 2px; background: var(--c0ffee-accent, #C0FFEE);
          transform: translateX(-1px); pointer-events: none;
          animation: hex-blink 1.06s step-end infinite;
        }
        @keyframes hex-blink { 50% { opacity: 0; } }
        /* place-value popover (grill Q11) — anchored inside its pair, so no
           geometry math; bg + hairline are deliberate one-offs (grill Q10). */
        .popover {
          position: absolute; z-index: 5; left: 50%; top: 100%;
          transform: translate(-50%, 10px);
          width: max-content; max-width: 250px;
          background: rgba(18,18,20,.97); border: 1px solid rgba(255,255,255,.12);
          border-radius: 9px; padding: 10px 12px;
          font: 400 12.5px/1.5 var(--c0ffee-font, monospace);
          letter-spacing: normal; text-transform: none;
          color: var(--c0ffee-fg, #eee);
        }
        .popover b { font-weight: 700; }
        .sliders { padding: 8px 0 20px; display: flex; flex-direction: column; gap: 13px; }
        .row { display: flex; align-items: center; gap: 12px; }
        /* One label gutter for both models so the rows stay aligned. Resting
           labels are neutral (ADR-0007: the pure channel color is reserved for
           where the light itself shows) — the active-solo name takes the pure
           color via inline style. */
        .lbl {
          width: 52px; font-weight: 700; text-align: left;
          color: color-mix(in srgb, var(--c0ffee-fg, #eee) 85%, transparent);
        }
        /* Channel names are buttons: click to solo that channel on the Venn. */
        button.lbl {
          background: none; border: none; padding: 0; cursor: pointer;
          font: inherit; font-weight: 700;
        }
        /* ── Knurled sliders (C0FFEE-48, grill Q5) ──
           The control stays a NATIVE range input — keyboard arrows, focus and
           ARIA come free — and the instrument look is CSS only. The track is a
           bounded bar: the bright inset outline marks the min/max ends, so no
           numeric end-caps are needed. */
        input[type=range] {
          flex: 1; -webkit-appearance: none; appearance: none;
          height: 20px; border-radius: 6px;
          box-shadow: inset 0 0 0 2px rgba(255,255,255,.82), inset 0 2px 5px rgba(0,0,0,.5);
        }
        /* The thumb is a knurled frosted-glass grip built from three stacked
           gradients — top-down: the 1px dark center seam (a thumb pseudo-element
           can't carry ::after, which is why the seam is a gradient layer and why
           Q5 chose styling-native over a custom widget), the knurl ridges (1px
           every 3px), the translucent body that lets the Channel's light show
           through (alpha does the frosting — backdrop-filter doesn't apply to
           thumb pseudo-elements, and the track under it is a smooth gradient
           anyway). Keep the -webkit-/-moz- blocks in sync; they can't share a
           selector list (one unknown pseudo voids the rule). */
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px; height: 26px; border-radius: 5px;
          border: none; cursor: pointer;
          background:
            linear-gradient(90deg, transparent calc(50% - .5px), rgba(0,0,0,.45) calc(50% - .5px) calc(50% + .5px), transparent calc(50% + .5px)),
            repeating-linear-gradient(90deg, rgba(255,255,255,.4) 0 1px, transparent 1px 3px),
            linear-gradient(180deg, rgba(235,240,248,.34), rgba(150,155,165,.25));
          box-shadow:
            0 4px 9px rgba(0,0,0,.7),
            inset 0 0 0 1px rgba(255,255,255,.5),
            inset 0 1px 0 rgba(255,255,255,.85),
            0 0 0 1.5px rgba(255,255,255,.18);
        }
        input[type=range]::-moz-range-thumb {
          width: 18px; height: 26px; border-radius: 5px;
          border: none; cursor: pointer;
          background:
            linear-gradient(90deg, transparent calc(50% - .5px), rgba(0,0,0,.45) calc(50% - .5px) calc(50% + .5px), transparent calc(50% + .5px)),
            repeating-linear-gradient(90deg, rgba(255,255,255,.4) 0 1px, transparent 1px 3px),
            linear-gradient(180deg, rgba(235,240,248,.34), rgba(150,155,165,.25));
          box-shadow:
            0 4px 9px rgba(0,0,0,.7),
            inset 0 0 0 1px rgba(255,255,255,.5),
            inset 0 1px 0 rgba(255,255,255,.85),
            0 0 0 1.5px rgba(255,255,255,.18);
        }
        /* Value column: one type voice with the Hex field (DM Mono), left-aligned
           so RGB and HSV decimals share an edge. 48px fits the widest value (360°). */
        .dec {
          width: 48px; text-align: left;
          font: 500 16px/1 var(--c0ffee-font, monospace);
          color: var(--c0ffee-fg, #eee);
        }
        .divider { text-align: center; color: #555; font-size: 12px; padding: 2px 0 8px; }
        .lbl.hsv { color: var(--c0ffee-accent, #C0FFEE); }
        /* companion presentation (C0FFEE-23): a compact band for a Lesson's pinned
           Companion console. The HSV panel is dropped in JS (#hsv-panel[hidden]);
           the card narrows and the swatch shrinks so it reads as compact, not just
           shorter. Minimal by design — the rich reveal-drawer is C0FFEE-18. */
        /* 292 border-box = C0FFEE-23's 240px content width + the new card padding,
           so the compact band's parts keep their proven proportions. */
        :host([presentation="companion"]) .card { width: 292px; }
        /* the hero type would outgrow the 292px band — companion keeps the
           field, at a fixed compact size */
        :host([presentation="companion"]) .hexfield { --hex-fs: 26px; padding: 22px 0 8px; }
        :host([presentation="companion"]) .stage { flex-direction: row; gap: 12px; }
        :host([presentation="companion"]) .swatch { flex: 1; height: auto; min-height: 110px; }
        :host([presentation="companion"]) .venn { padding: 0; align-items: center; }
        :host([presentation="companion"]) .venn-box { width: 104px; }
      </style>
      <div class="card">
        <div class="stage">
          <div class="swatch" id="swatch"><span class="tag" id="swatch-tag" hidden></span></div>
          <div class="venn">
            <div class="venn-box">
              <div class="circle" id="c-r"></div>
              <div class="circle" id="c-g"></div>
              <div class="circle" id="c-b"></div>
            </div>
          </div>
        </div>
        <div class="hexfield">
          <span class="hashmark">#</span>
          <span class="hex-stack">
            <span class="hex-mirror" id="hex-mirror" aria-hidden="true">
              ${CHANNELS.map((c, i) => `
                <span class="hex-pair">
                  <button type="button" class="hex-dot" id="dot-${c.key}"
                          title="${c.label} place value" aria-label="${c.label} place value"
                          style="background: var(${c.token});"></button>
                  <span class="hex-slot" id="slot-${i * 2}"></span>
                  <span class="hex-slot" id="slot-${i * 2 + 1}"></span>
                </span>`).join('')}
              <span class="hex-caret" id="hex-caret" hidden></span>
            </span>
            <input class="hex-input" id="hex-input" maxlength="6" inputmode="text"
                   autocomplete="off" autocapitalize="characters" spellcheck="false"
                   aria-label="Hex color address">
          </span>
        </div>
        <div class="sliders">
          ${CHANNELS.map((c) => `
            <div class="row">
              <button type="button" class="lbl" id="ch-${c.key}"
                      title="solo ${c.label}" aria-pressed="false">${c.label}</button>
              <input type="range" min="0" max="255" id="sl-${c.key}" aria-label="${c.label}"
                     style="background: linear-gradient(to right, #000, ${c.pure(255)});">
              <code class="dec" id="dec-${c.key}"></code>
            </div>`).join('')}
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
      this._el(`ch-${c.key}`)
        .addEventListener('click', () => this._toggleSolo(c.key));
      this._el(`dot-${c.key}`)
        .addEventListener('click', () => this._openPlaceValue(c));
    }
    // The Hex field: editing flows through _setHexField; every caret-moving
    // interaction repaints the measured caret. The click listener order matters:
    // gap-click mapping must fix the selection BEFORE the caret is painted.
    const field = this._input('hex-input');
    field.addEventListener('input', () => this._setHexField(field.value));
    field.addEventListener('paste', this._onHexPaste);
    field.addEventListener('click', this._mapHexClick);
    for (const ev of ['keyup', 'click', 'select', 'focus', 'blur']) {
      field.addEventListener(ev, () => this._paintHexCaret());
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

  // Whole-field Hex edit (C0FFEE-21's invariant at field scope). Filter the raw
  // input to valid hex digits first, then write the *filtered* string straight
  // back so the field can never show a character the value silently dropped —
  // but only when the filter changed the characters, not just their case (the
  // mirror uppercases via CSS; a case-only rewrite would just jump the caret).
  // Missing trailing digits read as implied zeros: the value stays total and
  // the mirror dims what wasn't typed.
  private _setHexField(raw: string): void {
    const clean = sanitizeHexInput(raw, 6);
    const field = this._input('hex-input');
    if (field.value.toUpperCase() !== clean) {
      // pull the caret back by however many chars the filter dropped before it
      const at = Math.max(0, (field.selectionStart ?? clean.length) - (raw.length - clean.length));
      field.value = clean;
      field.setSelectionRange(at, at);
    }
    // 6 sanitized hex chars always parse; ?? keeps the value total without `!`.
    this._value = parseHex(clean.padEnd(6, '0')) ?? { ...DEFAULT };
    this.hsv = stickyHsv(this._value, this.hsv);
    this._render(true); // don't stomp the field the user is typing in
  }

  // HSV edits: hsv is authoritative; value follows directly.
  private _setHsv(key: HsvKey, n: number): void {
    const next = { ...this.hsv };
    next[key] = n;
    this.hsv = next;
    this._value = hsvToRgb(this.hsv);
    this._render();
  }

  // Channel-solo toggle (grill Q2): same channel releases, another switches.
  // View state only — _value is untouched, so no _render() and no colorchange;
  // a spurious emit here would ripple into the URL reflector and Lesson runtime.
  private _toggleSolo(key: RgbKey): void {
    this._solo = this._solo === key ? null : key;
    this._renderSolo();
  }

  // Apply the solo state: fade the non-solo circles in place, light the active
  // channel name with its pure color (resting names stay neutral via CSS), and
  // refresh the Swatch corner slot.
  private _renderSolo(): void {
    for (const c of CHANNELS) {
      const on = this._solo === c.key;
      this._el(`c-${c.key}`).style.opacity = this._solo && !on ? '0' : '1';
      const btn = this._el(`ch-${c.key}`);
      btn.style.color = on ? `var(${c.token})` : '';
      btn.setAttribute('aria-pressed', String(on));
    }
    this._renderTag();
  }

  // The Swatch corner slot, shared by two present-only states: the active
  // channel's tag while solo is on (solo wins — it's the live inspection mode),
  // else the Named color address when one exists. No name, no label — never a
  // closest match. The Swatch itself always paints the FULL Color value; solo
  // isolates light on the Venn, not here.
  private _renderTag(): void {
    const tag = this._el('swatch-tag');
    const soloed = CHANNELS.find((c) => c.key === this._solo);
    const text = soloed ? `${soloed.label} only` : namedColor(formatHex(this._value));
    tag.hidden = text === null;
    tag.textContent = text ?? '';
    tag.style.color = bestTextColor(this._value);
  }

  // --- redraw every view from the single value ---
  private _render(hexFieldActive = false): void {
    this._el('swatch').style.background = '#' + formatHex(this._value);
    for (const c of CHANNELS) {
      const v = this._value[c.key];
      // Venn circle = this channel in isolation; screen-blend does the addition.
      this._el(`c-${c.key}`).style.background = c.pure(v);
      this._input(`sl-${c.key}`).value = String(v);
      this._el(`dec-${c.key}`).textContent = String(v);
    }
    // Sync the Hex field to the canonical address — except while the user is
    // typing in it (a partial entry like '1A2B' must not snap to '1A2B00').
    if (!hexFieldActive) this._input('hex-input').value = formatHex(this._value);
    this._renderHexMirror();
    this._renderTag(); // the Named color address tracks the live value
    this._renderHsv();
    this._emitChange();
  }

  // The mirror shows exactly the field's accepted characters, uppercased by
  // CSS; an untyped slot shows its implied zero, dimmed. aria-hidden on the
  // mirror — the real input is the accessibility surface.
  private _renderHexMirror(): void {
    const typed = sanitizeHexInput(this._input('hex-input').value, 6);
    for (let i = 0; i < 6; i++) {
      const slot = this._el(`slot-${i}`);
      slot.textContent = typed[i] ?? '0';
      slot.classList.toggle('empty', i >= typed.length);
    }
    this._paintHexCaret();
  }

  // One fake caret, positioned by MEASURING the slot boxes (prototype variant
  // C): a text caret sits at the boundary BEFORE the char at the cursor index,
  // and the structural pair-gaps mean those boundaries can't be computed from
  // glyph advances. On a range selection the native selection paint takes over.
  // happy-dom has no layout (every rect is zero) — geometry is browser-verified.
  private _paintHexCaret = (): void => {
    const field = this._input('hex-input');
    const caret = this._el('hex-caret');
    const at = field.selectionStart ?? 0;
    // Check the host first: when the field has focus the host IS the document's
    // active element, and the cheap check also short-circuits past happy-dom's
    // ShadowRoot.activeElement getter, which throws while nothing has focus.
    const focused = document.activeElement === this && this.root.activeElement === field;
    caret.hidden = !focused || field.selectionStart !== field.selectionEnd;
    if (caret.hidden) return;
    const mirror = this._el('hex-mirror').getBoundingClientRect();
    // Nothing to measure (happy-dom, or a zero-width edge like a hidden card):
    // keep the caret hidden rather than visible at stale coordinates.
    if (!mirror.width) { caret.hidden = true; return; }
    const ref = this._el(`slot-${Math.min(at, 5)}`).getBoundingClientRect();
    const x = at >= 6 ? ref.right - mirror.left : ref.left - mirror.left;
    caret.style.left = `${x}px`;
    caret.style.top = `${ref.top - mirror.top + ref.height * 0.16}px`;
    caret.style.height = `${ref.height * 0.66}px`;
  };

  // Paste must sanitize BEFORE the length clamp. Left to the browser, a native
  // paste honors maxlength on the RAW clipboard text — '#00ccff' (8 chars) gets
  // clamped to '#00ccf' before sanitize ever runs, silently costing the last
  // digit. So: intercept, filter the clipboard text, splice it over the
  // selection ourselves, and run the one edit path on the result.
  private _onHexPaste = (e: ClipboardEvent): void => {
    e.preventDefault();
    const field = this._input('hex-input');
    const text = sanitizeHexInput(e.clipboardData?.getData('text') ?? '', 6);
    const s = field.selectionStart ?? field.value.length;
    const en = field.selectionEnd ?? s;
    field.value = field.value.slice(0, s) + text + field.value.slice(en);
    field.setSelectionRange(s + text.length, s + text.length);
    this._setHexField(field.value);
  };

  // Gap-click compensation (C0FFEE-49 open item 1 — decided: compensate). The
  // mirror is wider than the transparent input (structural pair-gaps the input
  // lacks), so the input's own hit-testing drifts near the gaps. Snap a plain
  // click to the nearest MEASURED slot boundary instead; drag-selections are
  // left alone.
  private _mapHexClick = (e: MouseEvent): void => {
    const field = this._input('hex-input');
    if (field.selectionStart !== field.selectionEnd) return;
    if (!this._el('hex-mirror').getBoundingClientRect().width) return; // no layout engine
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i <= 6; i++) {
      const ref = this._el(`slot-${Math.min(i, 5)}`).getBoundingClientRect();
      const x = i >= 6 ? ref.right : ref.left;
      const d = Math.abs(e.clientX - x);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    field.setSelectionRange(best, best);
  };

  // Place-value popover (grill Q11): a pair's 16s-and-1s decomposition, e.g.
  // C×16 + 0×1 = 192. Anchored inside its pair (position: relative), so no
  // geometry math. The input owns editing — a dot tap must never strand the
  // caret, so focus (and the selection) hand straight back to the field.
  private _pop: HTMLElement | null = null;

  private _openPlaceValue(c: Channel): void {
    this._closePop();
    const i = CHANNELS.indexOf(c);
    const pair = formatHex(this._value).slice(i * 2, i * 2 + 2);
    const pop = document.createElement('div');
    pop.className = 'popover';
    pop.innerHTML =
      `<b>${c.label}</b> — the <b>${pair}</b> pair<br>` +
      `<b>${pair[0]}</b>×16 + <b>${pair[1]}</b>×1 = <b>${this._value[c.key]}</b> (0–255)`;
    this._el(`dot-${c.key}`).parentElement?.appendChild(pop);
    this._pop = pop;
    document.addEventListener('pointerdown', this._closePop);
    const field = this._input('hex-input');
    const s = field.selectionStart;
    const en = field.selectionEnd;
    field.focus();
    field.setSelectionRange(s, en);
  }

  // Close on any outside pointerdown. A pointerdown on the popover itself or on
  // one of THIS console's dots is not "outside" — the dot's click handler swaps
  // the popover itself. (Scoped to this shadow root: another console's dot on
  // the same page must read as outside.)
  private _closePop = (e?: Event): void => {
    if (!this._pop) return;
    if (e && e.composedPath().some((t) =>
      t === this._pop ||
      (t instanceof HTMLElement && t.classList.contains('hex-dot') && this.root.contains(t)))) return;
    this._pop.remove();
    this._pop = null;
    document.removeEventListener('pointerdown', this._closePop);
  };

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
