// <c0ffee-banner> — the Site banner (CONTEXT.md): the site's quiet chrome strip
// at the top of every page. The `#C0FFEE cafe` wordmark (receded hash, mint
// zero) on the left, the circular pixel-cup badge on the right — the lockup
// picked as THE banner after the C0FFEE-46 live eval (C0FFEE-52).
//
// Unlike the swatch and console, this element is presentational: it holds NO
// Color value and is deliberately NOT bound by the ADR-0001 Color value
// interface (no `hex`/`.value`/`colorchange`). It still follows ADR-0002 —
// Shadow DOM internals, themed only through `--c0ffee-*` design tokens.
//
// Two design constraints it must never violate:
//   - Reads as chrome, never as a Swatch. It is styled quiet and blends into the
//     neutral/dark background so the console's Swatch stays the page's only large
//     painted patch. The `#C0FFEE` accent is a small touch on the zero, and the
//     badge is a small circular emblem — neither is a filled area.
//   - Not sticky. It sits in normal flow at the top of the document and scrolls
//     away with the page (so a Lesson's top-pinned Companion console, ADR-0005,
//     owns the top while reading). On a short page it simply stays visible.
//
// Brand-only for now: the wordmark is the home link and there is NO nav
// affordance — deferred until the Menu earns surfacing (the same "more than one
// thing to show" trigger that un-hides the Menu).

class C0ffeeBanner extends HTMLElement {
  private root: ShadowRoot = this.attachShadow({ mode: 'open' });

  connectedCallback(): void {
    this.root.innerHTML = `
      <style>
        :host {
          /* Normal-flow block at the top of the document — explicitly NOT sticky
             or fixed, so it scrolls away with the page. */
          display: block;
          font-family: var(--c0ffee-font, monospace);
        }
        .bar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 16px;
          /* horizontal padding matches the site's content gutter (6vw) */
          padding: 14px 6vw;
        }
        a.wordmark {
          font-weight: 400; font-size: 26px; letter-spacing: .01em;
          color: var(--c0ffee-fg, #ededed);
          text-decoration: none; white-space: nowrap;
        }
        /* quiet leading hash — present but receded, like an unfocused prompt */
        .hash { color: color-mix(in srgb, var(--c0ffee-fg, #ededed) 52%, transparent); }
        /* the "touch of #C0FFEE": the namesake color lives on the zero */
        .zero { color: var(--c0ffee-accent, #C0FFEE); }
        .cafe { margin-left: .5ch; }
        .badge {
          width: 60px; height: 60px; flex: none; border-radius: 50%;
          background: #000; overflow: hidden;
          box-shadow: 0 0 0 1px rgba(255, 255, 255, .06);
        }
        .badge img {
          width: 100%; height: 100%; object-fit: contain;
          image-rendering: pixelated;
        }
      </style>
      <div class="bar">
        <a class="wordmark" href="/" aria-label="c0ffee — home"
          ><span class="hash">#</span>C<span class="zero">0</span>FFEE<span class="cafe">cafe</span></a>
        <span class="badge"><img src="/pixie-badge.png" alt=""></span>
      </div>`;
  }
}

customElements.define('c0ffee-banner', C0ffeeBanner);
