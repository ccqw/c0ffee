/* ============================================================================
 * Crosshatch — puzzle engine (single source of truth)
 * ----------------------------------------------------------------------------
 * The ONE place the puzzle is defined and all derived game logic lives. Both the
 * showcase composition and (optionally) the board read from here; in the real app
 * this file ports almost verbatim into a controller/store. The generator's only
 * job is to emit `SOLUTION` + `ENTRIES` in the shape below — everything else
 * (colour maps, crossings/locks, channel verdicts, hex mixing) is DERIVED.
 *
 * Loaded as a classic script: `<script src="./puzzle.js"></script>` exposes
 * `window.HexPuzzle`. No build step, no globals beyond that one namespace.
 * ==========================================================================*/
(function (g) {
  'use strict';

  var SIZE = 6;       // 6×6 board
  var CELL = 42;      // px per cell (board = SIZE*CELL = 252)

  // ── Canonical puzzle. The generator emits exactly this. ────────────────────
  // 6 rows × 6 cols, '.' = blank cell. A hex answer is 6 digits = #RRGGBB and
  // every across/down word is 6 cells long.
  var SOLUTION = ['3A7BD5', 'C.2.4.', '9.B.5.', 'FA8C00', '6.1.9.', 'E.F.C.'];

  var ENTRIES = {
    across: [
      { num: 1, row: 0, col: 0, answer: '3A7BD5', color: '#3A7BD5' },
      { num: 4, row: 3, col: 0, answer: 'FA8C00', color: '#FA8C00' },
    ],
    down: [
      { num: 1, row: 0, col: 0, answer: '3C9F6E', color: '#3C9F6E' },
      { num: 2, row: 0, col: 2, answer: '72B81F', color: '#72B81F' },
      { num: 3, row: 0, col: 4, answer: 'D4509C', color: '#D4509C' },
    ],
  };

  // ── Geometry / liveness ────────────────────────────────────────────────────
  function live(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE && SOLUTION[r] && SOLUTION[r][c] !== '.';
  }

  // The cells a word covers (length always SIZE).
  function cellsOf(entry, dir) {
    var out = [];
    for (var i = 0; i < SIZE; i++) {
      out.push(dir === 'down' ? { row: entry.row + i, col: entry.col } : { row: entry.row, col: entry.col + i });
    }
    return out;
  }

  // ── Derived colour maps (replaces hand-maintained ACROSS_ROW / DOWN_COL) ────
  // Colour of the across word in a given start-row / the down word in a start-col.
  function acrossRowColors() {
    var m = {};
    ENTRIES.across.forEach(function (e) { m[e.row] = e.color; });
    return m;
  }
  function downColColors() {
    var m = {};
    ENTRIES.down.forEach(function (e) { m[e.col] = e.color; });
    return m;
  }

  // ── Crossings = shared cells = the lockable cells. Derived, never hand-listed.
  // Each: { row, col, across: <num>, down: <num> }.
  function crossings() {
    var out = [];
    ENTRIES.across.forEach(function (a) {
      ENTRIES.down.forEach(function (d) {
        var r = a.row, c = d.col;
        var onAcross = (r === a.row) && (c >= a.col && c <= a.col + SIZE - 1);
        var onDown = (c === d.col) && (r >= d.row && r <= d.row + SIZE - 1);
        if (onAcross && onDown) out.push({ row: r, col: c, across: a.num, down: d.num });
      });
    });
    return out;
  }

  // ── Hex / channel logic ────────────────────────────────────────────────────
  // i: 0 = R, 1 = G, 2 = B. `hex` is a 6-char string (no '#').
  function channelOf(hex, i) { return parseInt(hex.slice(i * 2, i * 2 + 2), 16); }

  // Compare a guess against an answer, per channel → ['match'|'up'|'down', …].
  // 'up' = guess too low (go higher); 'down' = guess too high (go lower).
  function channelVerdict(guessHex, answerHex) {
    return [0, 1, 2].map(function (i) {
      var gv = channelOf(guessHex, i), av = channelOf(answerHex, i);
      return gv === av ? 'match' : (gv < av ? 'up' : 'down');
    });
  }

  // Live mix swatch colour from the digits typed so far (pads to 6).
  function mixColor(digits) { return '#' + (digits.join('') + '000000').slice(0, 6); }
  function isComplete(digits) { return digits.length === SIZE; }
  function matchesAnswer(digits, answerHex) {
    return digits.join('').toUpperCase() === String(answerHex).toUpperCase();
  }

  // ── Misc ───────────────────────────────────────────────────────────────────
  function fmtTime(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  g.HexPuzzle = {
    SIZE: SIZE, CELL: CELL, BOARD: SIZE * CELL,
    SOLUTION: SOLUTION, ENTRIES: ENTRIES,
    live: live, cellsOf: cellsOf,
    acrossRowColors: acrossRowColors, downColColors: downColColors, crossings: crossings,
    channelOf: channelOf, channelVerdict: channelVerdict,
    mixColor: mixColor, isComplete: isComplete, matchesAnswer: matchesAnswer,
    fmtTime: fmtTime,
  };
})(typeof window !== 'undefined' ? window : globalThis);
