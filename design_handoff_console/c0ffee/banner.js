/* banner.js — <c0ffee-banner>, the Site header. Reworked to the user's own
   Sketch design: NOT a lockup — a simple monospace wordmark on the LEFT
   ("#C0FFEE cafe", gray hash, mint zero) and a small circular pixel-cup badge in
   the RIGHT corner. Monospace matches the instrument (DM Mono). Themed via
   --c0ffee-* tokens. */
(function () {
  class C0ffeeBanner extends HTMLElement {
    constructor() { super(); this.root = this.attachShadow({ mode: 'open' }); }
    connectedCallback() {
      this.root.innerHTML = `
        <style>
          :host { display: block; }
          .bar {
            display: flex; align-items: center; justify-content: space-between;
            gap: 16px; padding: 16px 20px;
          }
          .word {
            font-family: 'DM Mono', ui-monospace, monospace;
            font-weight: 400; font-size: 26px; letter-spacing: .01em;
            color: var(--c0ffee-fg, #ededed); white-space: nowrap;
          }
          .hash { color: color-mix(in srgb, var(--c0ffee-fg, #ededed) 52%, transparent); }
          .zero { color: var(--c0ffee-accent, #C0FFEE); transition: color .45s ease; }
          .cafe { color: var(--c0ffee-fg, #ededed); margin-left: .5ch; }
          .badge {
            width: 60px; height: 60px; flex: none; border-radius: 50%;
            background: #000; overflow: hidden;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 0 0 1px rgba(255,255,255,.06);
          }
          .badge img {
            width: 100%; height: 100%; object-fit: contain;
            image-rendering: pixelated;
          }
        </style>
        <div class="bar">
          <span class="word"><span class="hash">#</span>C<span class="zero">0</span>FFEE<span class="cafe">cafe</span></span>
          <span class="badge"><img src="c0ffee/pixie-badge.png" alt="c0ffee cafe" aria-hidden="true"></span>
        </div>`;
    }
  }
  if (!customElements.get('c0ffee-banner')) customElements.define('c0ffee-banner', C0ffeeBanner);
})();
