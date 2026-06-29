// <c0ffee-banner> — the Site banner (CONTEXT.md): the site's quiet chrome strip
// at the top of every page. An 18px mint chip + the `c0ffee` wordmark on the
// left, with an optional per-page section label after it — the chip lockup
// adopted from the crossword-face handoff (C0FFEE-76), superseding the
// C0FFEE-46/52 `#C0FFEE cafe` + pixel-cup lockup.
//
// Unlike the swatch and console, this element is presentational: it holds NO
// Color value and is deliberately NOT bound by the ADR-0001 Color value
// interface (no `hex`/`.value`/`colorchange`). It still follows ADR-0002 —
// Shadow DOM internals, themed only through `--c0ffee-*` design tokens.
//
// Two design constraints it must never violate:
//   - Reads as chrome, never as a Swatch. C0FFEE-76 relaxed the old "never a
//     filled area" rule: the namesake mint now lives in an 18px filled chip
//     (glyph-scale, not a large painted patch), so the console's Swatch stays
//     the page's only large painted patch. The chip is the only mint fill; the
//     wordmark is plain ink.
//   - Not sticky. It sits in normal flow at the top of the document and scrolls
//     away with the page (so a Lesson's top-pinned Companion console, ADR-0005,
//     owns the top while reading). On a short page it simply stays visible.
//
// Brand + optional section, no nav: the `[chip] c0ffee` cluster is the home
// link, identical on every page. A page MAY supply `section="…"` (e.g. the
// crossword route's "Crosshatch") — a non-clickable context label, NOT a nav
// affordance. Real nav stays deferred until the Menu earns surfacing (the same
// "more than one thing to show" trigger that un-hides the Menu).

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
          display: flex; align-items: center; gap: 9px;
          /* horizontal padding matches the site's content gutter (6vw) */
          padding: 12px 6vw;
        }
        a.brand {
          display: inline-flex; align-items: center; gap: 9px;
          color: var(--c0ffee-fg, #ededed);
          text-decoration: none; white-space: nowrap;
        }
        /* the namesake mint, now a small filled chip (glyph-scale, not a Swatch) */
        .chip {
          width: 18px; height: 18px; flex: none; border-radius: 5px;
          background: var(--c0ffee-accent, #C0FFEE);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .25);
        }
        .wordmark { font-weight: 500; font-size: 18px; letter-spacing: -.01em; }
        /* per-page context label — receded so the brand reads primary; a label,
           never a link (no nav yet) */
        .section {
          color: color-mix(in srgb, var(--c0ffee-fg, #ededed) 70%, transparent);
          font-size: 18px; letter-spacing: -.01em; white-space: nowrap;
        }
        .sep { margin: 0 .5ch; color: color-mix(in srgb, var(--c0ffee-fg, #ededed) 40%, transparent); }
      </style>
      <div class="bar">
        <a class="brand" href="/" aria-label="c0ffee — home"
          ><span class="chip"></span><span class="wordmark">c0ffee</span></a>
      </div>`;

    // Optional per-page section label. Set via DOM (not innerHTML) so the
    // attribute text is never interpolated into markup.
    const section = this.getAttribute('section');
    if (section) {
      const bar = this.root.querySelector('.bar')!;
      const label = document.createElement('span');
      label.className = 'section';
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = '·';
      label.append(sep, document.createTextNode(section));
      bar.append(label);
    }
  }
}

customElements.define('c0ffee-banner', C0ffeeBanner);
