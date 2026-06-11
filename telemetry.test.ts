// Content guard for Telemetry wiring (C0FFEE-55).
//
// The posture itself is pinned in lib/telemetry.test.ts; the init shell is a
// thin vendor call left untested (shell discipline, ADR-0008). What IS
// load-bearing at the page layer is the content contract:
//   - every page (home console, Menu, Lesson) imports the ONE shared init
//     module, so the config can never drift between documents,
//   - the SDK is the replay-less rum-slim package, as a runtime dependency —
//     Session Replay is excluded by package choice, not just config.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(import.meta.dirname, p), 'utf8');

describe('Telemetry wiring (every page imports the shared init module)', () => {
  it('home (index.html) loads ./telemetry.ts', () => {
    expect(read('./index.html')).toMatch(
      /<script type="module" src="\.\/telemetry\.ts"><\/script>/,
    );
  });

  it('menu (menu.html) loads ./telemetry.ts', () => {
    expect(read('./menu.html')).toMatch(
      /<script type="module" src="\.\/telemetry\.ts"><\/script>/,
    );
  });

  it('the Lesson loads ../telemetry.ts from its module script', () => {
    expect(read('./lessons/colors-are-made-of-light.html')).toMatch(
      /import '\.\.\/telemetry\.ts';/,
    );
  });
});

describe('Telemetry SDK (package.json)', () => {
  it('ships @datadog/browser-rum-slim as a runtime dependency', () => {
    const pkg = JSON.parse(read('./package.json'));
    expect(pkg.dependencies['@datadog/browser-rum-slim']).toBeDefined();
  });
});
