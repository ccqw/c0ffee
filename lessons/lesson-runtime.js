// lesson-runtime.js — powers a Lesson (ADR-0004).
//
// Functional core (pure, tested): pickActiveBeat, resolveTarget.
// Imperative shell (DOM, eyeballed): initLesson — wires an IntersectionObserver
// to drive the Active beat (dim the rest) and routes inline-swatch clicks to the
// pinned Companion mirror with an animated load.
//
// Importing this module has NO side effects; the page calls initLesson().

// --- functional core ---

// pickActiveBeat(beatPositions, focusLine) -> index
// beatPositions: [{top, bottom}, ...]; focusLine: a y coordinate.
// Returns the index of the beat whose span contains the focus line; if none
// does, the nearest by distance to its span; clamps past the ends. [] -> -1.
export function pickActiveBeat(beatPositions, focusLine) {
  if (!beatPositions.length) return -1;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < beatPositions.length; i++) {
    const { top, bottom } = beatPositions[i];
    if (focusLine >= top && focusLine < bottom) return i; // inside the span
    const dist = focusLine < top ? top - focusLine : focusLine - bottom;
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

// resolveTarget(swatchValue, companionRef) -> {mirror, value} | null
// Where a clicked Inline swatch's Color value should land. No companion -> null.
export function resolveTarget(swatchValue, companionRef) {
  if (!companionRef) return null;
  return { mirror: companionRef, value: swatchValue };
}

// --- imperative shell ---

// initLesson(root?) — call once after the DOM is ready.
// Conventions in the Lesson HTML:
//   - the Companion mirror is the <c0ffee-mirror data-companion>
//   - each beat is an element with class "beat"
//   - inline swatches are <c0ffee-swatch> anywhere in the prose
export function initLesson(root = document) {
  const mirror = root.querySelector('c0ffee-mirror[data-companion]');
  const beats = Array.from(root.querySelectorAll('.beat'));
  if (!beats.length) return;

  // Active-beat tracking: on scroll, pick the beat crossing the focus line
  // (40% down the viewport) and dim the others.
  const focusFraction = 0.4;
  let ticking = false;
  const update = () => {
    ticking = false;
    const focusLine = window.innerHeight * focusFraction;
    const positions = beats.map((b) => {
      const r = b.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    const active = pickActiveBeat(positions, focusLine);
    beats.forEach((b, i) => b.classList.toggle('active', i === active));
  };
  const onScroll = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // Route inline-swatch clicks to the Companion mirror with an animated load.
  root.addEventListener('colorchange', (e) => {
    if (e.target.tagName !== 'C0FFEE-SWATCH') return;
    const target = resolveTarget(e.detail, mirror);
    if (!target) return;
    if (typeof target.mirror.animateTo === 'function') {
      target.mirror.animateTo(target.value);
    } else {
      target.mirror.setAttribute('hex', e.detail.hex);
    }
  });

  update(); // set the initial active beat
}
