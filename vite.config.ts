import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// c0ffee is a multi-page site of hand-authored HTML (ADR-0006): the playground,
// the lesson, and the element demos are each their own document. Every page must
// be a named build entry or Vite drops it from dist/. Pages live at their existing
// paths (project root is the Vite root), so the deployed URLs are unchanged.
const root = import.meta.dirname;

export default defineConfig({
  appType: 'mpa', // distinct documents, not a single-page app with a fallback route
  build: {
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        playMirror: resolve(root, 'play/mirror.html'),
        lessonLight: resolve(root, 'lessons/colors-are-made-of-light.html'),
        mirrorDemo: resolve(root, 'toys/mirror-demo.html'),
        swatchDemo: resolve(root, 'toys/swatch-demo.html'),
      },
    },
  },
  test: {
    // Web Component shells get real DOM tests now (ADR-0006 supersedes ADR-0003's
    // no-build half); the pure color core needs no DOM but happy-dom is harmless.
    environment: 'happy-dom',
  },
});
