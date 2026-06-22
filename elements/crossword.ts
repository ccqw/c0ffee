// <c0ffee-crossword> — the Hex Color crossword's face (imperative shell, ADR-0003).
//
// Slice 1 of 4 (C0FFEE-64): the element skeleton + a READ-ONLY render of a freshly
// generated puzzle — the woven board, the Across/Down clue list, and the clue-vs-
// your-mix comparison. There is no input yet (the board is a readout); later slices
// wire the keypad/cursor/clearDigit (C0FFEE-65), navigation + keyboard (C0FFEE-66),
// and the chrome/overlays/timer (C0FFEE-67) onto this same shadow tree.
//
// The functional core is shipped and untouched: generatePuzzle (C0FFEE-60) makes a
// crossing-consistent Puzzle; initCrossword/crosswordReducer (C0FFEE-61) hold the
// CrosswordState this projects. The shell only translates state -> DOM (here) and,
// later, DOM events -> the reducer's actions.
//
// It holds many Color values, so it deliberately opts OUT of ADR-0001 URL reflection:
// no `colorchange`, no hash, and it does NOT mount <c0ffee-swatch> (whose click-to-load
// would hijack the hash with a clue color). The clue chips are hand-rolled boxes.
//
// Styling obeys the ADR-0007 color contract: the only saturated color on screen is the
// literal clue/mix Swatch (contract #1) and the active-Slot channel-pair outlines in
// pure --c0ffee-r/-g/-b (contract #2). Everything else is neutral, muted by opacity off
// --c0ffee-fg, never grey tokens — and consumes tokens.css across the shadow boundary.

import { generatePuzzle } from '../lib/crossword-generator.ts';
import { initCrossword, crosswordReducer, type CrosswordState, type SlotRef } from '../lib/crossword-state.ts';
import type { Cell, Layout, Slot } from '../lib/crossword-layout.ts';

// Slice 1 opens on a fixed shape + seed, so the puzzle is deterministic: the smoke
// test asserts stable counts and the design eyeball reviews the same board every load.
// New-puzzle / the seeded Puzzle link (C0FFEE-67 / C0FFEE-57) are the future homes for
// a varying seed; this is the only place one is chosen for now.
const DEFAULT_SHAPE = 'ladder-14';
const DEFAULT_SEED = 1;

// Natural px per Cell — caps the board's max-width (cols * CELL_PX) and sets its
// aspect ratio. Every Cell is then positioned as a percentage, so the board is fluid
// and scales with its container (the prototype's geometry).
const CELL_PX = 42;

// The grid weave hairline (ADR-0007 contract #6: neutral chrome off --c0ffee-fg).
const HAIR = 'rgba(255,255,255,.22)';

// The three channel-pair outlines for the active Slot (ADR-0007 contract #2): a Slot's
// six Cells split [0,1]=red, [2,3]=green, [4,5]=blue — the same split parseHex makes of
// a six-digit address. Pure primaries via the tokens; never softened.
const PAIRS: ReadonlyArray<{ ring: string; bg: string }> = [
  { ring: 'var(--c0ffee-r, #FF0000)', bg: 'rgba(255,0,0,.08)' },
  { ring: 'var(--c0ffee-g, #00FF00)', bg: 'rgba(0,255,0,.08)' },
  { ring: 'var(--c0ffee-b, #0000FF)', bg: 'rgba(0,0,255,.10)' },
];

// A neutral padlock (lifted from the prototype): top-right, stroke off --c0ffee-fg,
// muted by opacity (contract #6 — status chrome stays achromatic). No Cell is locked
// in slice 1's read-only render, so this is dormant until a commit lands (C0FFEE-65).
const LOCK_SVG =
  '<span class="lock"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" ' +
  'stroke="var(--c0ffee-fg, #ededed)" stroke-width="2.4">' +
  '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>';

// weaveCell — the basket-weave board geometry, lifted VERBATIM from the design
// prototype (docs/design/crossword-face/prototype/CW-HexBoard.dc.html, the
// `weaveCell` method). Pure geometry off the live-Cell set: Cells pair in 2s; inset
// 2px on every closed side, 0 on open sides; corner radius 6 unless an adjacent edge
// is open; a 1px hairline on each closed side; and a 2x2px L-shaped hairline patch in
// the inner corner where two open sides meet. The only change from the prototype is
// reading liveness from a `live(r,c)` predicate (built from Layout.cells) instead of a
// `sol` string grid — the math is unchanged.
function weaveCell(live: (r: number, c: number) => boolean, r: number, c: number) {
  const openR = c % 2 === 0 && live(r, c + 1);
  const openL = c % 2 === 1 && live(r, c - 1);
  const openD = r % 2 === 0 && live(r + 1, c);
  const openU = r % 2 === 1 && live(r - 1, c);
  const inset = `${openU ? 0 : 2}px ${openR ? 0 : 2}px ${openD ? 0 : 2}px ${openL ? 0 : 2}px`;
  const tl = openU || openL ? 0 : 6,
    tr = openU || openR ? 0 : 6,
    br = openD || openR ? 0 : 6,
    bl = openD || openL ? 0 : 6;
  const radius = `${tl}px ${tr}px ${br}px ${bl}px`;
  const sh: string[] = [];
  if (!openU) sh.push(`inset 0 1px 0 ${HAIR}`);
  if (!openR) sh.push(`inset -1px 0 0 ${HAIR}`);
  if (!openD) sh.push(`inset 0 -1px 0 ${HAIR}`);
  if (!openL) sh.push(`inset 1px 0 0 ${HAIR}`);
  let corner: string | null = null;
  if (openR && openD)
    corner = `position:absolute;right:0;bottom:0;width:2px;height:2px;border-top:1px solid ${HAIR};border-left:1px solid ${HAIR};pointer-events:none;`;
  else if (openL && openD)
    corner = `position:absolute;left:0;bottom:0;width:2px;height:2px;border-top:1px solid ${HAIR};border-right:1px solid ${HAIR};pointer-events:none;`;
  else if (openR && openU)
    corner = `position:absolute;right:0;top:0;width:2px;height:2px;border-bottom:1px solid ${HAIR};border-left:1px solid ${HAIR};pointer-events:none;`;
  else if (openL && openU)
    corner = `position:absolute;left:0;top:0;width:2px;height:2px;border-bottom:1px solid ${HAIR};border-right:1px solid ${HAIR};pointer-events:none;`;
  return { inset, radius, shadow: sh.join(','), corner };
}

// The lowest-numbered Slot, across before down — the Slot slice 1 opens on, so the
// read-only render exercises BOTH saturated elements of the ADR-0007 contract for the
// design eyeball: the clue Swatch (contract #1) and the active-pair outlines (#2).
// Selecting a Slot for display is a read-surface concern, not the input this slice omits.
function firstSlot(layout: Layout): SlotRef {
  // A generated layout always has at least one Slot (generatePuzzle would have thrown
  // otherwise), so [0] is safe.
  const slot = [...layout.slots].sort(
    (a, b) => a.number - b.number || (a.direction < b.direction ? -1 : 1),
  )[0];
  return { number: slot.number, direction: slot.direction };
}

const cellKey = (cell: Cell): string => `${cell.row},${cell.col}`;
const slotKey = (ref: SlotRef): string => `${ref.number}-${ref.direction}`;
// A grid position as a percentage of an n-unit axis — the board's one geometry primitive,
// shared by every percentage-positioned overlay (cells, pair outlines, clue numbers).
const pct = (n: number, of: number): string => `${(n / of) * 100}%`;

class C0ffeeCrossword extends HTMLElement {
  // attachShadow returns the root, so we never juggle a nullable shadowRoot.
  private root: ShadowRoot = this.attachShadow({ mode: 'open' });
  // The one game state the whole face projects from (ADR-0003 functional core).
  private state!: CrosswordState;

  connectedCallback(): void {
    const puzzle = generatePuzzle(DEFAULT_SHAPE, DEFAULT_SEED);
    // Open on the first Slot via the real reducer (not a hand-built state), so the
    // read-only render shows an active Slot's outline + clue Swatch from day one.
    this.state = crosswordReducer(initCrossword(puzzle), {
      type: 'select',
      slot: firstSlot(puzzle.layout),
    });
    this._render();
  }

  private _render(): void {
    const { layout } = this.state.puzzle;
    this.root.innerHTML = `
      <style>${STYLE}</style>
      <div class="screen">
        <div class="boardwrap">${this._board(layout)}</div>
        <section class="dock panel">
          ${this._compare()}
          ${this._clueList(layout)}
        </section>
      </div>`;
  }

  // Resolve the selected SlotRef to its full Slot, or null when nothing is selected.
  // A non-null selection absent from the layout is impossible — the reducer's `select`
  // validates against this same layout and throws otherwise — so it fails loud here
  // rather than silently dropping the active-Slot outline.
  private selectedSlot(): Slot | null {
    const sel = this.state.selected;
    if (!sel) return null;
    const slot = this.state.puzzle.layout.slots.find(
      (s) => s.number === sel.number && s.direction === sel.direction,
    );
    if (!slot) throw new Error(`c0ffee-crossword: selected Slot ${slotKey(sel)} not in rendered layout`);
    return slot;
  }

  // The latent target Hex color address for a Slot, fail-loud on a miss (mirrors the
  // core's cellAt). initCrossword validates every Slot has a six-digit target, so a miss
  // means a key drift — surfaced loudly rather than painting `background:#undefined`.
  private _target(ref: SlotRef): string {
    const hex = this.state.puzzle.targets[slotKey(ref)];
    if (typeof hex !== 'string') {
      throw new Error(`c0ffee-crossword: no target Hex color address for Slot ${slotKey(ref)}`);
    }
    return hex;
  }

  // The woven board: walk Layout.cells (row-major), position each by percentage of an
  // aspect-locked square, and dress it with the lifted weave geometry. Lays the active
  // Slot's channel-pair outlines and the clue-number labels over the top.
  private _board(layout: Layout): string {
    const cols = Math.max(...layout.cells.map((c) => c.col)) + 1;
    const rows = Math.max(...layout.cells.map((c) => c.row)) + 1;
    const liveSet = new Set(layout.cells.map(cellKey));
    const live = (r: number, c: number): boolean => liveSet.has(`${r},${c}`);

    const cells = layout.cells
      .map((cell) => {
        const g = weaveCell(live, cell.row, cell.col);
        const st = this.state.cells[cellKey(cell)];
        const wrap = `position:absolute;left:${pct(cell.col, cols)};top:${pct(cell.row, rows)};width:${pct(1, cols)};height:${pct(1, rows)};`;
        const base = `position:absolute;inset:${g.inset};border-radius:${g.radius};background:var(--c0ffee-bg, #0a0a0b);box-shadow:${g.shadow};`;
        return `<div class="cell" style="${wrap}">
          <div class="base" style="${base}"></div>
          ${g.corner ? `<div style="${g.corner}"></div>` : ''}
          ${st.digit ? `<span class="glyph">${st.digit}</span>` : ''}
          ${st.locked ? LOCK_SVG : ''}
        </div>`;
      })
      .join('');

    const boardStyle = `position:relative;width:100%;max-width:${cols * CELL_PX}px;aspect-ratio:${cols} / ${rows};margin:0 auto;`;
    return `<div class="board" style="${boardStyle}">
      ${cells}
      ${this._outlines(cols, rows)}
      ${this._clueNumbers(layout, cols, rows)}
    </div>`;
  }

  // The active-Slot channel-pair outlines (ADR-0007 contract #2). Take the selected
  // Slot's six Cells in order and ring pairs [0,1]/[2,3]/[4,5], each over the two Cells'
  // bounding box (horizontal for across, vertical for down), in its pure channel primary.
  private _outlines(cols: number, rows: number): string {
    const slot = this.selectedSlot();
    if (!slot) return '';
    return PAIRS.map((pair, i) => {
      const a = slot.cells[i * 2];
      const b = slot.cells[i * 2 + 1];
      const r0 = Math.min(a.row, b.row);
      const c0 = Math.min(a.col, b.col);
      const w = Math.abs(b.col - a.col) + 1;
      const h = Math.abs(b.row - a.row) + 1;
      const style =
        `position:absolute;left:calc(${pct(c0, cols)} + 2px);top:calc(${pct(r0, rows)} + 2px);` +
        `width:calc(${pct(w, cols)} - 4px);height:calc(${pct(h, rows)} - 4px);` +
        `border-radius:7px;background:${pair.bg};box-shadow:inset 0 0 0 1.4px ${pair.ring};pointer-events:none;`;
      return `<div class="pair" style="${style}"></div>`;
    }).join('');
  }

  // Clue-number labels: one per starting Cell, in the Cell's top-left corner — the
  // standard crossword convention, and robust to the ladder shapes' multiple blocks.
  // A Cell that starts both an across and a down Slot shares one number. (The prototype
  // drew across on the left edge and down on the top edge, which assumed a single 6x6
  // block; on a multi-block ladder every down label would pile up at the board top.)
  // Neutral (contract #6).
  private _clueNumbers(layout: Layout, cols: number, rows: number): string {
    const numberAt = new Map<string, number>();
    for (const slot of layout.slots) {
      const start = cellKey(slot.cells[0]);
      // a shared start Cell keeps the lower number (the across/down pair share it)
      const existing = numberAt.get(start);
      if (existing === undefined || slot.number < existing) numberAt.set(start, slot.number);
    }
    return [...numberAt.entries()]
      .map(([key, number]) => {
        const [row, col] = key.split(',').map(Number);
        return `<span class="num" style="left:calc(${pct(col, cols)} + 3px);top:calc(${pct(row, rows)} + 2px);">${number}</span>`;
      })
      .join('');
  }

  // The clue-vs-your-mix comparison (the keeper "aha"): the selected Slot's clue Swatch
  // painted its literal target Color value (contract #1), beside the your-mix Swatch. No
  // input yet, so the mix is the empty "?" placeholder ringed in accent (the mix is
  // painted once the keypad lands in C0FFEE-65).
  private _compare(): string {
    const slot = this.selectedSlot();
    const clueStyle = slot
      ? `background:#${this._target(slot)};`
      : 'box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);';
    return `<div class="compare">
      <div class="stage clue" style="${clueStyle}"></div>
      <div class="stage mix"><span class="q">?</span></div>
    </div>`;
  }

  // The Across/Down clue list: one hand-rolled chip per Slot — its number, direction,
  // and a painted box of its clue Color value. NOT <c0ffee-swatch> (which would emit
  // colorchange and hijack the hash). The six-digit answer stays latent: only the color
  // is shown, which is the clue (you reason its hex), so nothing is leaked.
  private _clueList(layout: Layout): string {
    const group = (direction: 'across' | 'down', heading: string): string => {
      const rows = layout.slots
        .filter((s) => s.direction === direction)
        .sort((a, b) => a.number - b.number)
        .map((slot) => {
          const hex = this._target(slot);
          return `<li class="cluerow">
            <span class="cnum">${slot.number}</span>
            <span class="box" style="background:#${hex};"></span>
          </li>`;
        })
        .join('');
      return `<div class="cluegroup"><h2>${heading}</h2><ul>${rows}</ul></div>`;
    };
    return `<div class="cluelist">${group('across', 'Across')}${group('down', 'Down')}</div>`;
  }
}

// The scoped CSS. Page bg is dressed (hairline + shadow), never a lighter fill (ADR-0007
// surface recipe, shared with swatch.ts / console.ts). Only the keys slice 1 renders are
// here; later slices add the keypad / toast / topbar rules onto the same skeleton.
const STYLE = `
  :host { display:block; font-family:var(--c0ffee-font, monospace); color:var(--c0ffee-fg, #ededed); }
  *, *::before, *::after { box-sizing:border-box; }

  /* mobile-first fluid; centered, clamped column on wide viewports (ADR-0005) */
  .screen { display:flex; flex-direction:column; gap:14px; min-height:100%;
            width:100%; max-width:430px; margin:0 auto; padding:18px 0;
            background:var(--c0ffee-bg, #0a0a0b); }

  /* surface recipe — dressed page bg, never a lighter fill */
  .panel { background:var(--c0ffee-bg, #0a0a0b); border-radius:16px;
           box-shadow:inset 0 0 0 1px rgba(255,255,255,.18), 0 16px 34px -20px rgba(0,0,0,.85); }

  /* the negative-offset clue numbers need room outside the board box */
  .boardwrap { padding:20px 22px; }
  .board { position:relative; }
  .cell { position:absolute; display:flex; align-items:center; justify-content:center; }
  .cell .glyph { position:relative; z-index:3; font:400 21px/1 var(--c0ffee-font, monospace); color:var(--c0ffee-fg, #ededed); }
  .cell .lock { position:absolute; top:3px; right:4px; line-height:0; opacity:.65; z-index:5; }
  .num { position:absolute; font:400 9px/1 var(--c0ffee-font, monospace); color:rgba(255,255,255,.74); z-index:6; pointer-events:none; }

  .dock { padding:16px; display:flex; flex-direction:column; gap:16px; margin:0 14px; }

  /* the comparison: the only saturated color besides the active outline (contract #1) */
  .compare { display:flex; gap:10px; }
  .stage { flex:1; height:72px; border-radius:12px; box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); }
  .stage.mix { display:flex; align-items:center; justify-content:center; box-shadow:inset 0 0 0 2px var(--c0ffee-accent, #C0FFEE); }
  .stage.mix .q { font:400 26px/1 var(--c0ffee-font, monospace); color:var(--c0ffee-accent, #C0FFEE); opacity:.8; }

  .cluelist { display:flex; gap:18px; }
  .cluegroup { flex:1; }
  .cluegroup h2 { margin:0 0 8px; font:500 9.5px/1 var(--c0ffee-font, monospace);
                  letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,.5); }
  .cluegroup ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:7px; }
  .cluerow { display:flex; align-items:center; gap:8px; }
  .cluerow .cnum { font:400 12px/1 var(--c0ffee-font, monospace); color:rgba(255,255,255,.74); min-width:14px; }
  .cluerow .box { width:22px; height:22px; border-radius:6px; box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); }
`;

customElements.define('c0ffee-crossword', C0ffeeCrossword);
