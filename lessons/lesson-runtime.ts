// lesson-runtime.ts — powers a Lesson (ADR-0004).
//
// Functional core (pure, tested): pickActiveBeat, resolveTarget.
// Imperative shell (DOM, eyeballed): initLesson — wires an IntersectionObserver
// to drive the Active beat (dim the rest) and routes inline-swatch clicks to the
// pinned Companion console with an animated load.
//
// Importing this module has NO side effects; the page calls initLesson().

import type { Rgb, ColorChangeDetail } from '../lib/color.ts';

// --- functional core ---

/** A beat's vertical span in viewport space. */
export interface BeatSpan {
  top: number;
  bottom: number;
}

// pickActiveBeat(beatPositions, focusLine) -> index
// Returns the index of the beat whose span contains the focus line; if none
// does, the nearest by distance to its span; clamps past the ends. [] -> -1.
export function pickActiveBeat(beatPositions: BeatSpan[], focusLine: number): number {
  if (!beatPositions.length) return -1;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < beatPositions.length; i++) {
    const { top, bottom } = beatPositions[i]!;
    if (focusLine >= top && focusLine < bottom) return i; // inside the span
    const dist = focusLine < top ? top - focusLine : focusLine - bottom;
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

// resolveTarget(swatchValue, companionRef) -> {companion, value} | null
// Where a clicked Inline swatch's Color value should land. No companion -> null.
// Generic over the companion + value shapes so it stays pure and testable with
// plain objects, not just live elements.
export function resolveTarget<C, V>(
  swatchValue: V,
  companionRef: C | null | undefined,
): { companion: C; value: V } | null {
  if (!companionRef) return null;
  return { companion: companionRef, value: swatchValue };
}

// --- imperative shell ---

// A Companion console exposes animateTo (the <c0ffee-console>); typed loosely so
// the runtime depends only on the capability, not the concrete element class.
interface CompanionConsole extends Element {
  animateTo?: (target: Rgb, ms?: number) => void;
}

// initLesson(root?) — call once after the DOM is ready.
// Conventions in the Lesson HTML:
//   - the Companion console is the <c0ffee-console data-companion>
//   - each beat is an element with class "beat"
//   - inline swatches are <c0ffee-swatch> anywhere in the prose
export function initLesson(root: Document | Element = document): void {
  const companion = root.querySelector('c0ffee-console[data-companion]') as CompanionConsole | null;
  const beats = Array.from(root.querySelectorAll('.beat'));
  if (!beats.length) return;

  // Active-beat tracking: on scroll, pick the beat crossing the focus line
  // (40% down the viewport) and dim the others.
  const focusFraction = 0.4;
  let ticking = false;
  const update = (): void => {
    ticking = false;
    const focusLine = window.innerHeight * focusFraction;
    const positions = beats.map((b): BeatSpan => {
      const r = b.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    const active = pickActiveBeat(positions, focusLine);
    beats.forEach((b, i) => b.classList.toggle('active', i === active));
  };
  const onScroll = (): void => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // Route inline-swatch clicks to the Companion console with an animated load.
  root.addEventListener('colorchange', (e) => {
    const ev = e as CustomEvent<ColorChangeDetail>;
    if ((ev.target as Element | null)?.tagName !== 'C0FFEE-SWATCH') return;
    const target = resolveTarget(ev.detail, companion);
    if (!target) return;
    if (typeof target.companion.animateTo === 'function') {
      target.companion.animateTo(target.value);
    } else {
      target.companion.setAttribute('hex', ev.detail.hex);
    }
  });

  update(); // set the initial active beat
}
