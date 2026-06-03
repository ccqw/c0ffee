/* parts.jsx — shared building blocks for the console instrument.
   - Faithful pure channel colors (#FF0000/#00FF00/#0000FF).
   - One Fader, and ONE FaderRow used by both RGB and HSV so they stack with
     identical widths and identical value typography (separation is by grouping
     + spacing, never by distinct styling).
   - HexReadout with a selectable demarcation style + lighter weight + wider
     letter-spacing, click-to-expand 16s+1s math.
   - The additive Venn, with heavy overlap so the central tri-intersection (the
     rendered color) is the largest region. */

const { useState: useStateSt, useRef: useRefSt } = React;

const PURE = { r: '#FF0000', g: '#00FF00', b: '#0000FF' };
const pureCh = { r: (v) => `rgb(${v},0,0)`, g: (v) => `rgb(0,${v},0)`, b: (v) => `rgb(0,0,${v})` };
const CH = [
{ k: 'r', label: 'Red' },
{ k: 'g', label: 'Green' },
{ k: 'b', label: 'Blue' }];


// Shared row metrics — RGB and HSV rows use these so faders line up exactly.
const LABEL_W = 64;
const VALUE_W = 78;

if (!document.getElementById('st-css')) {
  const s = document.createElement('style');
  s.id = 'st-css';
  s.textContent = `
    .studio { --num:'DM Mono',ui-monospace,monospace; --ui:'DM Mono',ui-monospace,monospace;
      font-feature-settings:"zero" 1, "calt" 1; }
    .st-fader { position:relative; height:20px; cursor:pointer; touch-action:none; }
    .st-track { position:absolute; inset:0; border-radius:6px;
      box-shadow: inset 0 0 0 2px rgba(255,255,255,.82), inset 0 2px 5px rgba(0,0,0,.5), 0 1px 0 rgba(255,255,255,.05); }
    .st-thumb { position:absolute; top:50%; width:18px; height:26px; border-radius:5px; transform:translate(-50%,-50%); z-index:3; pointer-events:none;
      background:linear-gradient(180deg,#8a8b93,#34353a); box-shadow:0 4px 9px rgba(0,0,0,.7), inset 0 0 0 1px rgba(255,255,255,.5), inset 0 1px 0 rgba(255,255,255,.85), 0 0 0 1.5px rgba(255,255,255,.18);
      background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.34) 0 1px,transparent 1px 3px); }
    .st-thumb::after { content:''; position:absolute; left:50%; top:4px; bottom:4px; width:1px; transform:translateX(-50%); background:rgba(0,0,0,.55); }
    .st-pair { cursor:pointer; position:relative; border-radius:6px; transition:background .15s; }
    .st-iso { background:none; border:none; cursor:pointer; padding:0; font-family:var(--ui); text-align:left; }
  `;
  document.head.appendChild(s);
}

function Fader({ value, max, trackBg, onChange }) {
  const ref = useRefSt(null);
  const set = (clientX) => {
    const r = ref.current.getBoundingClientRect();
    let f = (clientX - r.left) / r.width;
    onChange(Math.round(Math.max(0, Math.min(1, f)) * max));
  };
  const down = (e) => {e.preventDefault();ref.current.setPointerCapture(e.pointerId);set(e.clientX);};
  const move = (e) => {if (e.buttons) set(e.clientX);};
  const frac = value / max;
  return (
    <div ref={ref} className="st-fader" onPointerDown={down} onPointerMove={move}>
      <div className="st-track" style={{ background: trackBg }} />
      <div className="st-thumb" style={{ left: `${frac * 100}%` }} />
    </div>);

}

// ONE row, used by both models — identical label gutter, fader, and value column.
// `label` is a node (channel button, or H/S/V word); `num`+`sec` are the readout.
function FaderRow({ label, trackBg, value, max, onChange, valueNode, dim }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: dim ? .4 : 1, transition: 'opacity .25s' }}>
      <div style={{ flex: 'none', width: LABEL_W }}>{label}</div>
      <div style={{ flex: 1 }}>
        <Fader value={value} max={max} trackBg={trackBg} onChange={onChange} />
      </div>
      <div style={{ flex: 'none', width: VALUE_W, textAlign: 'left', fontFamily: 'var(--num)', fontSize: 16, fontWeight: 500, whiteSpace: 'nowrap' }}>
        {valueNode}
      </div>
    </div>);

}

function RgbFaders({ c, solo, setSolo }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {CH.map((ch) => {
        const pv = window.placeValue(c.rgb[ch.k]);
        const on = solo === ch.k;
        const label =
        <button className="st-iso" onClick={() => setSolo(on ? null : ch.k)} title={`isolate ${ch.label}`}
        style={{ width: '100%', fontSize: 13, fontWeight: 600, color: on ? PURE[ch.k] : '#d6d6da' }}>
            {ch.label}
          </button>;

        return (
          <FaderRow key={ch.k} label={label} value={c.rgb[ch.k]} max={255}
          trackBg={`linear-gradient(90deg, #000, ${PURE[ch.k]})`} onChange={(v) => c.setChannel(ch.k, v)}
          valueNode={<span>{c.rgb[ch.k]}<span style={{ marginLeft: 12, color: '#8c8c90' }}>{pv.hi}{pv.lo}</span></span>}
          dim={solo && !on} />);

      })}
    </div>);

}

function HsvPanel({ c }) {
  const C0 = window.C0;
  const { h, s, v } = c.hsv;
  const hueOnly = (sat, val) => '#' + C0.formatHex(C0.hsvToRgb({ h, s: sat, v: val }));
  const rows = [
  { k: 'h', label: 'Hue', val: Math.round(h), max: 360, sec: '°', track: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' },
  { k: 's', label: 'Sat', val: Math.round(s * 100), max: 100, sec: '%', track: `linear-gradient(90deg, ${hueOnly(0, v)}, ${hueOnly(1, v)})` },
  { k: 'v', label: 'Val', val: Math.round(v * 100), max: 100, sec: '%', track: `linear-gradient(90deg, #000, ${hueOnly(s, 1)})` }];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {rows.map((r) => {
        const label = <span style={{ fontSize: 13, fontWeight: 600, color: '#d6d6da' }}>{r.label}</span>;
        return (
          <FaderRow key={r.k} label={label} value={r.val} max={r.max} trackBg={r.track}
          onChange={(val) => c.setHsv(r.k, r.k === 'h' ? val : val / 100)}
          valueNode={<span>{r.val}{r.sec}</span>} />);

      })}
    </div>);

}

// ── Hex readout — selectable demarcation, lighter weight, wider spacing ──
function HexReadout({ c, size = 'clamp(34px,8vw,50px)', weight = 300, demarc = 'underline', align = 'center' }) {
  const [lens, setLens] = useStateSt(null);
  const pv = lens ? window.placeValue(c.rgb[lens]) : null;
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
      <div style={{ fontFamily: 'var(--num)', fontWeight: weight, fontSize: size, letterSpacing: '.12em',
        display: 'flex', alignItems: 'baseline', gap: '.04em' }}>
        <span style={{ opacity: .3, marginRight: '.14em', fontWeight: "100" }}>#</span>
        {CH.map((ch) =>
        <HexPair key={ch.k} ch={ch.k} pair={window.placeValue(c.rgb[ch.k])} demarc={demarc}
        on={lens === ch.k} onClick={() => setLens(lens === ch.k ? null : ch.k)} />
        )}
      </div>
      {pv && <Cyclops lens={lens} pv={pv} value={c.rgb[lens]} />}
    </div>);

}

function HexPair({ ch, pair, demarc, on, onClick }) {
  const color = PURE[ch];
  const digits = `${pair.hi}${pair.lo}`;
  const base = { padding: '0 .12em', margin: '0 .04em' };
  if (demarc === 'chip') {
    return <span className="st-pair" onClick={onClick} title="click for the math"
    style={{ ...base, padding: '.02em .22em', boxShadow: `inset 0 0 0 2px ${color}`, opacity: on ? 1 : .92 }}>{digits}</span>;
  }
  if (demarc === 'tint') {
    return <span className="st-pair" onClick={onClick} title="click for the math"
    style={{ ...base, padding: '.02em .22em', background: `${color}30`, boxShadow: on ? `inset 0 0 0 1.5px ${color}` : 'none' }}>{digits}</span>;
  }
  if (demarc === 'dot') {
    return <span className="st-pair" onClick={onClick} title="click for the math"
    style={{ ...base, position: 'relative', paddingTop: '.2em', fontWeight: "100" }}>
      <span style={{ position: 'absolute', top: '-.14em', left: '50%', transform: 'translateX(-50%)', width: '.22em', height: '.22em', borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}, 0 0 0 1px rgba(255,255,255,.2)`, opacity: on ? 1 : .95 }} />
      {digits}
    </span>;
  }
  if (demarc === 'bracket') {
    return <span className="st-pair" onClick={onClick} title="click for the math" style={{ ...base, position: 'relative', padding: '.04em .1em' }}>
      <span style={{ position: 'absolute', left: 2, right: 2, top: '.02em', height: 3, borderRadius: 2, background: color, opacity: on ? 1 : .8 }} />
      {digits}
      <span style={{ position: 'absolute', left: 2, right: 2, bottom: '-.02em', height: 3, borderRadius: 2, background: color, opacity: on ? 1 : .8 }} />
    </span>;
  }
  // underline (default)
  return <span className="st-pair" onClick={onClick} title="click for the math" style={{ ...base, position: 'relative' }}>
    {digits}
    <span style={{ position: 'absolute', left: 2, right: 2, bottom: '-.16em', height: 4, borderRadius: 2,
      background: color, opacity: on ? 1 : .82, boxShadow: on ? `0 0 10px ${color}` : 'none' }} />
  </span>;
}

function Cyclops({ lens, pv, value }) {
  return (
    <div style={{
      position: 'absolute', bottom: 'calc(100% + 12px)', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(18,18,20,.97)', borderRadius: 14, padding: '14px 20px', minWidth: 196, zIndex: 6,
      boxShadow: '0 20px 44px -14px rgba(0,0,0,.9), inset 0 0 0 1px rgba(255,255,255,.10), inset 0 1px 0 rgba(255,255,255,.2)', textAlign: 'center'
    }}>
      <div style={{ fontFamily: 'var(--num)', fontWeight: 600, fontSize: 40, color: PURE[lens], lineHeight: 1, letterSpacing: '.06em' }}>{pv.hi}{pv.lo}</div>
      <div style={{ fontFamily: 'var(--num)', fontSize: 13.5, opacity: .85, marginTop: 10, lineHeight: 1.55 }}>
        <div><span style={{ color: PURE[lens] }}>{pv.hi}</span> × 16 = {pv.hiContrib}</div>
        <div><span style={{ color: PURE[lens] }}>{pv.lo}</span> × 1 &nbsp;= {pv.loContrib}</div>
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,.13)', margin: '9px 0' }} />
      <div style={{ fontFamily: 'var(--num)', fontSize: 15, fontWeight: 500 }}>= {value} <span style={{ opacity: .5 }}>/ 255</span></div>
      <div style={{ position: 'absolute', bottom: -7, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 14, height: 14, background: 'rgba(18,18,20,.97)', boxShadow: 'inset -1px -1px 0 rgba(255,255,255,.08)' }} />
    </div>);

}

// Heavy-overlap additive Venn — three pure channel lights, screen-blended in an
// ISOLATED stacking context over pure black, so the central tri-intersection
// equals the rendered Color value EXACTLY (screen over #000 is true addition).
// Without isolation+black, screen blends against the card and the sum drifts.
function Venn({ rgb, size = 150, solo = null }) {
  const positions = [{ left: '50%', top: '0%' }, { left: '37%', top: '23%' }, { left: '63%', top: '23%' }];
  const dim = typeof size === 'number' ? size + 'px' : size;
  return (
    <div style={{ position: 'relative', width: dim, height: dim, background: '#000', isolation: 'isolate', borderRadius: '50%' }}>
      {CH.map((ch, i) => {
        const p = positions[i];
        const hide = solo && solo !== ch.k;
        return (
          <div key={ch.k} style={{ position: 'absolute', width: '70%', height: '70%', borderRadius: '50%', mixBlendMode: 'screen',
            left: p.left, top: p.top, transform: 'translateX(-50%)', background: pureCh[ch.k](rgb[ch.k]),
            opacity: hide ? 0 : 1, transition: 'opacity .25s, background .08s' }} />);

      })}
    </div>);

}

Object.assign(window, { StFader: Fader, FaderRow, RgbFaders, HsvPanel, HexReadout, Venn, PURE, pureCh, CH_LIST: CH });