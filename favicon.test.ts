// Content guard for the favicon (C0FFEE-11).
//
// The favicon is the brand mark at its smallest: a flat #C0FFEE swatch — the
// site's namesake Color value as a tab/bookmark icon. There's no logic to
// unit-test; what IS load-bearing is the content contract:
//   - the assets exist in public/ (Vite copies them verbatim to the dist
//     root, so /favicon.svg resolves in dev and on c0ffee.cafe alike),
//   - the SVG paints #C0FFEE and the rasters are real, right-sized images
//     (ICO magic for legacy fallback; 180×180 PNG for home-screen/bookmark),
//   - every page links them root-relative, so the lesson's subdirectory
//     resolves the same files as the root pages.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(import.meta.dirname, p), 'utf8');
const readBytes = (p: string) => readFileSync(resolve(import.meta.dirname, p));

const PAGES = ['./index.html', './menu.html', './lessons/colors-are-made-of-light.html'];

describe('Favicon assets (public/)', () => {
  it('favicon.svg paints the namesake #C0FFEE swatch', () => {
    const svg = read('./public/favicon.svg');
    expect(svg).toContain('<svg');
    expect(svg).toMatch(/#C0FFEE/i);
  });

  it('favicon.ico is a real ICO (legacy fallback)', () => {
    const ico = readBytes('./public/favicon.ico');
    // ICONDIR header: reserved 0x0000, type 0x0001 (icon), count >= 1.
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBeGreaterThanOrEqual(1);
  });

  it('apple-touch-icon.png is a 180×180 PNG', () => {
    const png = readBytes('./public/apple-touch-icon.png');
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    // IHDR is the first chunk: width at byte 16, height at 20 (big-endian).
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
  });
});

describe('Favicon links (every page)', () => {
  for (const page of PAGES) {
    describe(page, () => {
      const html = read(page);

      it('links the SVG icon root-relative', () => {
        expect(html).toMatch(
          /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg">/,
        );
      });

      it('links the ICO fallback root-relative', () => {
        expect(html).toMatch(/<link rel="icon" sizes="any" href="\/favicon\.ico">/);
      });

      it('links the apple-touch-icon root-relative', () => {
        expect(html).toMatch(
          /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png">/,
        );
      });
    });
  }
});
