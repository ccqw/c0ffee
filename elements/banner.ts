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
//
// TEMPORARY EVAL SCAFFOLDING (C0FFEE-46): the banner has two variants while the
// redesign lockup is evaluated against the live site — `classic` (the default;
// with no flag the live site does not change) and `cup` (the redesign:
// `#C0FFEE cafe` wordmark + pixel-cup badge). Flip via the `?banner=cup` QUERY
// param — never the hash, which is the console's Color link. C0FFEE-51 picks
// the winner and deletes the loser, the flag read, and this comment.

class C0ffeeBanner extends HTMLElement {
  private root: ShadowRoot = this.attachShadow({ mode: 'open' });

  connectedCallback(): void {
    // Eval-flag read (C0FFEE-46): a page can pin a variant via the attribute;
    // otherwise `?banner=cup` flips a plain <c0ffee-banner> at view time.
    const flagged = new URLSearchParams(window.location.search).get('banner');
    const variant = this.getAttribute('variant') ?? flagged;
    if (variant === 'cup') {
      this.renderCup();
    } else {
      this.renderClassic();
    }
  }

  private renderClassic(): void {
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

  // The redesign lockup (handoff, grill Q9): `#C0FFEE cafe` wordmark on the
  // left, circular pixel-cup badge on the right. Same behavioral promises as
  // classic — the wordmark is the single home link, quiet chrome, never sticky.
  private renderCup(): void {
    this.root.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: var(--c0ffee-font, monospace);
        }
        .bar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 16px;
          /* the site's content gutter (6vw), not the handoff mock's 20px — the
             eval should compare lockups, not misalignments */
          padding: 14px 6vw;
        }
        a.wordmark {
          font-weight: 400; font-size: 26px; letter-spacing: .01em;
          color: var(--c0ffee-fg, #ededed);
          text-decoration: none; white-space: nowrap;
        }
        /* quiet leading hash — present but receded, like an unfocused prompt */
        .hash { color: color-mix(in srgb, var(--c0ffee-fg, #ededed) 52%, transparent); }
        /* the "touch of #C0FFEE" lives on the zero, same as classic */
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
