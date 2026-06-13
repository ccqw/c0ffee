# Handoff — RGB hex pairs + HSV label parity + hairline divider

**Ticket-sized UI restore for `<c0ffee-console>`.** Four small details from the approved
console iteration that aren't in `main` yet. All changes are in a **single file**,
`elements/console.ts` — no token, color-core, or markup-page changes. Visually proven
in a browser against the real source before writing this.

---

## What & why

1. **Per-Channel hex pair.** Each RGB row gains a dimmed two-digit hex pair just past its
   0–255 value (`192 → C0`, `255 → FF`, `238 → EE`). It's the same byte that channel
   contributes to the Hex address, so the base-10 slider value and the base-16 address
   read as one fact — the site's hex-intuition thesis, stated inline on the control.
   It's an **echo, not a fourth control**: dimmed and neutral (ADR-0007 keeps the pure
   channel color for where the light shows).
2. **HSV labels spelled out.** `H / S / V` → `Hue / Sat / Val`.
3. **HSV label color parity.** The HSV labels drop the mint accent and take the RGB
   labels' neutral off-white — the two panels are peers reading one Color value, so they
   speak in one voice.
4. **Hairline divider.** The `↕ same color ↕` caption between the RGB and HSV panels
   becomes a quiet 1px rule. Same meaning (same color, other model), without the words.

A reserved (empty) hex-pair column is added to the **HSV rows** too, so all six slider
tracks keep one shared right edge. The pair is hidden in the `companion` presentation,
which already trades trailing columns for track length (C0FFEE-53).

---

## The diff — `elements/console.ts`

All hunks are inside the element. Style hunks are in the `<style>` block of `_build()`;
markup hunks are in the same method's template; the render hunk is in `_render()`.

### 1. Styles: new `.hexpair`, divider becomes a rule

Right after the `.dec { … }` rule:

```diff
         .dec {
           flex: none; width: 48px; text-align: left;
           font: 500 16px/1 var(--c0ffee-font, monospace);
           color: var(--c0ffee-fg, #eee);
         }
-        .divider { text-align: center; color: #555; font-size: 12px; padding: 2px 0 8px; }
+        /* The Channel's hex pair, sitting just past its 0–255 value: the SAME two
+           digits this channel contributes to the Hex address (192 -> C0), so the
+           base-10 slider value and the base-16 address read as one fact — the
+           site's hex-intuition thesis, stated inline. Dimmed and neutral: it
+           ECHOES the address, it is not a fourth control, and ADR-0007 reserves
+           the pure channel color for where the light itself shows. Reserved as a
+           fixed column on EVERY row (empty on the HSV rows, which have no hex
+           pair) so all six slider tracks keep one shared right edge. */
+        .hexpair {
+          flex: none; width: 28px; text-align: left;
+          font: 500 16px/1 var(--c0ffee-font, monospace);
+          color: color-mix(in srgb, var(--c0ffee-fg, #eee) 46%, transparent);
+        }
+        /* The RGB/HSV seam (was the “↕ same color ↕” caption): a quiet hairline.
+           The two panels are the same Color value in two models; the rule marks
+           the boundary without spending words on it. */
+        .divider { height: 1px; background: rgba(255,255,255,.11); margin: 2px 0 12px; }
```

### 2. Styles: HSV labels share the neutral off-white

```diff
-        .lbl.hsv { color: var(--c0ffee-accent, #C0FFEE); }
+        /* HSV labels share the RGB labels' neutral off-white (was the mint accent):
+           both panels are peers reading the same Color value, so they speak in one
+           voice. ADR-0007's pure colors stay reserved for where the light shows. */
+        .lbl.hsv { color: inherit; }
```

### 3. Styles: companion drops the pair

```diff
         :host([presentation="companion"]) .dec { width: 34px; }
+        /* The hex pair is the solo view's hex-intuition flourish; the compact
+           companion already traded trailing columns for track length (C0FFEE-53),
+           so it drops the pair and reclaims that width. */
+        :host([presentation="companion"]) .hexpair { display: none; }
```

### 4. Markup: RGB row template gains the pair

In the `CHANNELS.map(...)` slider template:

```diff
               <input type="range" min="0" max="255" id="sl-${c.key}" aria-label="${c.label}"
                      style="background: linear-gradient(to right, #000, ${c.pure(255)});">
               <code class="dec" id="dec-${c.key}"></code>
+              <code class="hexpair" id="hexpair-${c.key}" aria-hidden="true"></code>
             </div>`).join('')}
```

### 5. Markup: HSV panel — empty divider, spelled-out labels, spacer column

```diff
         <div class="hsv-panel" id="hsv-panel">
-          <div class="divider">↕ same color ↕</div>
+          <div class="divider"></div>
           <div class="sliders">
             <label class="row">
-              <span class="lbl hsv">H</span>
+              <span class="lbl hsv">Hue</span>
               <input type="range" min="0" max="360" id="sl-h"
                      style="background: linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);">
               <code class="dec" id="dec-h"></code>
+              <span class="hexpair" aria-hidden="true"></span>
             </label>
             <label class="row">
-              <span class="lbl hsv">S</span>
+              <span class="lbl hsv">Sat</span>
               <input type="range" min="0" max="100" id="sl-s">
               <code class="dec" id="dec-s"></code>
+              <span class="hexpair" aria-hidden="true"></span>
             </label>
             <label class="row">
-              <span class="lbl hsv">V</span>
+              <span class="lbl hsv">Val</span>
               <input type="range" min="0" max="100" id="sl-v">
               <code class="dec" id="dec-v"></code>
+              <span class="hexpair" aria-hidden="true"></span>
             </label>
           </div>
         </div>
```

> The HSV spacers are inert `<span>`s (no id, `aria-hidden`). They exist only to reserve
> the same trailing width as the RGB rows so the tracks align; they never hold content.

### 6. Render: derive the pair from the channel value

In the `for (const c of CHANNELS)` loop of `_render()`:

```diff
       this._input(`sl-${c.key}`).value = String(v);
       this._el(`dec-${c.key}`).textContent = String(v);
+      // The hex pair == this channel's own byte in the address (formatHex pairs
+      // each channel independently), so derive it straight from the value.
+      this._el(`hexpair-${c.key}`).textContent = v.toString(16).toUpperCase().padStart(2, '0');
     }
```

---

## Verification done (browser, real source)

- Hex pairs render `C0 / FF / EE` for `#C0FFEE` and are **live** — driving Red to 170
  updates its pair to `AA` on the same render pass.
- All six slider tracks share one right edge (Green track right === Val track right,
  to sub-pixel) — the reserved HSV column holds the alignment.
- HSV labels read `Hue / Sat / Val` in the same off-white as `Red / Green / Blue`.
- Divider renders as an empty hairline (no text node).
- No console errors.

---

## Follow-up notes

**Tests (`elements/elements.test.ts`) — no existing test fails, but please add coverage
and fix one stale comment:**

- ✅ No breakage: `input[type=range]` count stays **6**; the Hex-field counts use
  `.hex-pair` / `.hex-slot` (hyphenated), which do **not** match the new `.hexpair`
  (no hyphen). Nothing asserts the HSV label text or the old divider caption.
- ⚠️ **Stale comment**, not a failure: the test at ~L1191
  `'<c0ffee-console presentation="companion"> labels its Channels R/G/B — the HSV panel
  voice'` justifies the single-letter R/G/B by calling it "the HSV panel voice." The HSV
  panel no longer speaks in single letters (it's `Hue/Sat/Val` now), so that rationale is
  outdated. The assertion itself still holds (companion RGB → `R/G/B` via `label[0]`);
  just refresh the wording.
- ➕ **Suggested new tests:**
  - hex pair is the channel's byte and tracks edits: seed `C0FFEE` → pairs
    `['C0','FF','EE']`; drive `sl-r` to 170 → `hexpair-r` is `AA`.
  - HSV labels are `Hue` / `Sat` / `Val`.
  - HSV label color no longer uses the accent: `cssBlock(el, '.lbl.hsv')` contains
    `color: inherit` (and not `--c0ffee-accent`).
  - divider is a rule, not a caption: `.divider` textContent is empty;
    `cssBlock(el, '.divider')` contains `height: 1px`.
  - all six tracks align: assert equal `getBoundingClientRect().right` for `sl-g`/`sl-v`
    *(note: happy-dom has no layout — this one needs the browser/e2e lane, not Vitest).*

**Naming — needs a decision:**

- **CONTEXT.md** has no term for the per-Channel hex pair. It's a read-only echo of the
  Hex address scoped to one Channel. Suggest naming it (e.g. **Channel byte** or
  **Channel hex pair**) and recording it; mind the Avoid lists — not "label" (reserved),
  not a synonym already claimed by the **Hex field**'s pairs.
- The CSS class `.hexpair` sits **one hyphen away** from the Hex field's `.hex-pair`.
  They coexist fine, but for grep-safety you may want a less collidey name
  (`.channel-byte`, `.dec-hex`). If you rename, update both the markup ids
  (`hexpair-${c.key}`) and the `_render` line.

**Design intent to preserve:**

- The pair is `aria-hidden` on purpose — the slider's value and the Hex field are the
  accessibility surfaces; the pair would just be a redundant announcement.
- No new design token. The pair color is `--c0ffee-fg` via `color-mix`, and the divider's
  `rgba(255,255,255,.11)` matches the existing card/tile hairline family. If the team
  would rather these be tokenized, that's a separate token-vocabulary call.
