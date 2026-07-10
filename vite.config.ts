import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// c0ffee is a multi-page site of hand-authored HTML (ADR-0006): the home (solo
// console), the menu, and the lesson are each their own document. Every page must
// be a named build entry or Vite drops it from dist/. Pages live at their existing
// paths (project root is the Vite root), so the deployed URLs are unchanged.
const root = import.meta.dirname;

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  version: string;
};

export default defineConfig({
  appType: 'mpa', // distinct documents, not a single-page app with a fallback route
  define: {
    // Threads the release version into the telemetry init shell (C0FFEE-55),
    // so RUM sessions map onto the vX.Y.Z release stream (ADR-0008).
    __C0FFEE_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        menu: resolve(root, 'menu.html'),
        crossword: resolve(root, 'crossword.html'),
        lessonLight: resolve(root, 'lessons/colors-are-made-of-light.html'),
      },
    },
  },
  test: {
    // Web Component shells get real DOM tests now (ADR-0006 supersedes ADR-0003's
    // no-build half); the pure color core needs no DOM but happy-dom is harmless.
    environment: 'happy-dom',
    // happy-dom retains DOM allocations across a FILE's tests (measured on C0FFEE-80
    // and re-measured on C0FFEE-81: ~15-25MB per test; element remove() frees nothing,
    // so it is environment retention, not element code). The crossword shell suite is
    // split into per-seam files (C0FFEE-81) so each fork worker's heap stays well under
    // V8's default ~2GB old space — worst file measured ~690MB. Keep new shell test
    // files at roughly <=20 mount-heavy tests each; if a worker OOMs again, split the
    // grown file rather than restoring the old --max-old-space-size band-aid.
  },
});
