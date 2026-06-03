/* color.js — the c0ffee functional core, ported from lib/color.ts (types stripped).
   Pure color math: hex parse/format, RGB<->HSV, sticky hue, best text color.
   Attached to window.C0 so the plain-script web components can read it without
   ES modules (kept off `type=module` deliberately). Faithful to the repo. */
(function () {
  function parseHex(str) {
    if (typeof str !== 'string') return null;
    let hex = str.replace(/^#/, '');
    if (hex.length === 3) hex = hex.replace(/./g, '$&$&'); // f0a -> ff00aa
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  function rgbToHsv({ r, g, b }) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn), d = mx - mn;
    let h = 0;
    if (d !== 0) {
      if (mx === rn) h = ((gn - bn) / d) % 6;
      else if (mx === gn) h = (bn - rn) / d + 2;
      else h = (rn - gn) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = mx === 0 ? 0 : d / mx;
    return { h, s, v: mx };
  }

  function hsvToRgb({ h, s, v }) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  }

  function stickyHsv(rgb, prev = { h: 0, s: 0, v: 0 }) {
    const t = rgbToHsv(rgb);
    const mx = Math.max(rgb.r, rgb.g, rgb.b);
    const d = mx - Math.min(rgb.r, rgb.g, rgb.b);
    return {
      h: d === 0 ? prev.h : t.h,
      s: mx === 0 ? prev.s : t.s,
      v: t.v,
    };
  }

  function bestTextColor({ r, g, b }) {
    const lin = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.179 ? '#000' : '#fff';
  }

  function formatHex({ r, g, b }) {
    const pair = (n) => n.toString(16).toUpperCase().padStart(2, '0');
    return pair(r) + pair(g) + pair(b);
  }

  function sanitizeHexInput(raw, maxLen) {
    return raw.replace(/[^0-9a-fA-F]/g, '').slice(0, maxLen).toUpperCase();
  }

  window.C0 = {
    parseHex, rgbToHsv, hsvToRgb, stickyHsv, bestTextColor, formatHex, sanitizeHexInput,
  };
})();
