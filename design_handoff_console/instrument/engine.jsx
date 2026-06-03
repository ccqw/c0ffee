/* engine.jsx — shared brain for the console instruments. Wraps the c0ffee
   functional core (window.C0) in a React hook that holds ONE Color value with
   sticky-hue HSV caching (faithful to console.ts), plus the teaching helpers:
   hex place-value decomposition and CSS named-color lookup. Presentation-free —
   every instrument shell reads from this so the math is identical across them. */

const { useState, useRef, useCallback } = React;

const HEXD = '0123456789ABCDEF';
const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(n)));

// placeValue(255) -> { hi:'F', lo:'F', hiVal:15, loVal:15, hiContrib:240, loContrib:15 }
// The 16s-and-1s decomposition: a hex pair is hi*16 + lo.
function placeValue(v) {
  const hi = Math.floor(v / 16);
  const lo = v % 16;
  return { hi: HEXD[hi], lo: HEXD[lo], hiVal: hi, loVal: lo, hiContrib: hi * 16, loContrib: lo };
}

// A compact CSS named-color map (the common ones). A Named color address is
// present-or-absent (CONTEXT.md): we only surface it on an exact match.
const NAMED = {
  '000000': 'black', 'FFFFFF': 'white', 'FF0000': 'red', '00FF00': 'lime', '0000FF': 'blue',
  'FFFF00': 'yellow', '00FFFF': 'cyan', 'FF00FF': 'magenta', '808080': 'gray', 'C0C0C0': 'silver',
  '800000': 'maroon', '808000': 'olive', '008000': 'green', '800080': 'purple', '008080': 'teal',
  '000080': 'navy', 'FFA500': 'orange', 'FFC0CB': 'pink', 'A52A2A': 'brown', 'FFD700': 'gold',
  'F0E68C': 'khaki', 'ADD8E6': 'lightblue', '90EE90': 'lightgreen', 'FF6347': 'tomato',
  '40E0D0': 'turquoise', 'EE82EE': 'violet', '4B0082': 'indigo', 'F5F5DC': 'beige',
  '1E90FF': 'dodgerblue', '32CD32': 'limegreen', 'FF1493': 'deeppink', '00CED1': 'darkturquoise',
  '7FFF00': 'chartreuse', 'DC143C': 'crimson', 'FF7F50': 'coral', '6A5ACD': 'slateblue',
  '2E8B57': 'seagreen', 'DAA520': 'goldenrod', 'CD853F': 'peru', '708090': 'slategray',
  'C0FFEE': null, // the namesake mint has no CSS name — deliberately absent
};
function namedColor(hex) { return NAMED[hex.toUpperCase()] || null; }

// useC0Color(initialHex) — the instrument's single source of truth.
function useC0Color(initialHex = 'C0FFEE') {
  const C0 = window.C0;
  const [rgb, setRgb] = useState(() => C0.parseHex(initialHex) || { r: 192, g: 255, b: 238 });
  const hsvRef = useRef(C0.rgbToHsv(rgb));

  // RGB edits: value authoritative, re-derive HSV stickily so hue holds at edges.
  const setChannel = useCallback((k, v) => {
    setRgb((cur) => {
      const next = { ...cur, [k]: clamp255(v) };
      hsvRef.current = C0.stickyHsv(next, hsvRef.current);
      return next;
    });
  }, [C0]);

  // Hex digit-box edit (already-sanitized 2-char string).
  const setHex = useCallback((k, clean) => {
    setRgb((cur) => {
      const next = { ...cur, [k]: clean === '' ? 0 : parseInt(clean, 16) };
      hsvRef.current = C0.stickyHsv(next, hsvRef.current);
      return next;
    });
  }, [C0]);

  // HSV edits: hsv authoritative, value follows (no lossy round-trip → no jitter).
  const setHsv = useCallback((k, v) => {
    const next = { ...hsvRef.current, [k]: v };
    hsvRef.current = next;
    setRgb(C0.hsvToRgb(next));
  }, [C0]);

  const setFromRgb = useCallback((next) => {
    setRgb(() => {
      hsvRef.current = C0.stickyHsv(next, hsvRef.current);
      return { ...next };
    });
  }, [C0]);

  return {
    rgb, hsv: hsvRef.current, hex: C0.formatHex(rgb),
    setChannel, setHex, setHsv, setFromRgb,
  };
}

Object.assign(window, { useC0Color, placeValue, namedColor, clamp255, HEXD });
