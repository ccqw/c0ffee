// color.js — the functional core (ADR-0003). Pure functions, no DOM.

// parseHex(str) -> {r,g,b} | null
// Turns a hex Color address into a Color value.
export function parseHex(str) {
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

// formatHex({r,g,b}) -> "RRGGBB"
// Writes a Color value as an uppercase, bare (no '#') hex Color address.
export function formatHex({ r, g, b }) {
  const pair = (n) => n.toString(16).toUpperCase().padStart(2, '0');
  return pair(r) + pair(g) + pair(b);
}
