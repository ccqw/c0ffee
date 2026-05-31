// <c0ffee-banner> — the Site banner (CONTEXT.md): the site's quiet chrome strip
// at the top of every page. A small coffee logo + the `c0ffee` wordmark with a
// touch of `#C0FFEE` accent.
//
// Unlike the swatch and console, this element is presentational: it holds NO
// Color value and is deliberately NOT bound by the ADR-0001 Color value
// interface (no `hex`/`.value`/`colorchange`). It still follows ADR-0002 —
// Shadow DOM internals, themed only through `--c0ffee-*` design tokens.
//
// Two design constraints it must never violate:
//   - Reads as chrome, never as a Swatch. It is styled quiet and blends into the
//     neutral/dark background so the console's Swatch stays the page's only large
//     painted patch. The `#C0FFEE` accent is a small touch, not a filled area.
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
        a.wordmark {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 14px 6vw;
          color: var(--c0ffee-fg, #ededed);
          text-decoration: none;
          /* Quiet chrome: small, dimmed, blends into the dark background so it
             can never be mistaken for the console's Swatch. */
          font-size: 15px; font-weight: 700; letter-spacing: 1px;
          opacity: .72;
          transition: opacity .12s;
        }
        a.wordmark:hover,
        a.wordmark:focus-visible { opacity: 1; }
        /* The "touch of #C0FFEE": a small accent on the leading zero only — a hint
           of the namesake color, not a painted patch. */
        .accent { color: var(--c0ffee-accent, #C0FFEE); }
        /* The coffee logo: a cup with rising steam (the canonical Lucide "coffee"
           glyph), drawn in the current (dimmed) text color so it reads as quiet
           chrome too. */
        .logo { width: 1.15em; height: 1.15em; flex: none; }
      </style>
      <a class="wordmark" href="/" aria-label="c0ffee — home">
        <svg class="logo" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <path d="M17 8h1a4 4 0 1 1 0 8h-1"/>
          <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>
          <line x1="6" x2="6" y1="2" y2="4"/>
          <line x1="10" x2="10" y1="2" y2="4"/>
          <line x1="14" x2="14" y1="2" y2="4"/>
        </svg>
        <span>c<span class="accent">0</span>ffee</span>
      </a>`;
  }
}

customElements.define('c0ffee-banner', C0ffeeBanner);
