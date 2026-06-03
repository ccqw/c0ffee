/* layouts.jsx — the console instrument with a user-facing VIEW TOGGLE between
   two presentations of the Venn: "hero" (big, centered, the favored default)
   and "corner" (compact — Venn tucked beside the swatch). One engine, one set of
   parts; the toggle just swaps the head layout + scale. This mirrors the repo's
   "presentation" concept (full vs companion). Banner stays mint (page frame). */

const { useState: useStateLo } = React;

const studioCard = {
  fontFamily: "'DM Mono',ui-monospace,monospace", color: '#e8e8ea', background: '#0a0a0b',
  borderRadius: 18, padding: 'clamp(18px,4vw,26px)', position: 'relative',
  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06), 0 30px 70px -30px rgba(0,0,0,.8)',
};
const panelBox = { background: '#070708', borderRadius: 12, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.05)' };

function useConsole(initialHex) {
  const c = window.useC0Color(initialHex);
  const [solo, setSolo] = useStateLo(null);
  const C0 = window.C0;
  const shown = solo ? { r: 0, g: 0, b: 0, [solo]: c.rgb[solo] } : c.rgb;
  return { c, solo, setSolo, shown, shownHex: C0.formatHex(shown), name: window.namedColor(c.hex), C0 };
}

function SwatchPanel({ shown, shownHex, name, solo, C0, minH = 'clamp(92px,18vw,116px)' }) {
  return (
    <div style={{ height: minH, borderRadius: 12, background: `#${shownHex}`, position: 'relative',
      boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.55)', transition: 'background .15s' }}>
      {name && <span style={{ position: 'absolute', right: 12, bottom: 10, fontSize: 12, color: C0.bestTextColor(shown), opacity: .72 }}>{name}</span>}
      {solo && <span style={{ position: 'absolute', left: 12, top: 10, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', color: C0.bestTextColor(shown), opacity: .75 }}>{solo} only</span>}
    </div>
  );
}

// View toggle — two small icon buttons (Venn-hero / compact-corner).
function ViewToggle({ view, setView }) {
  const btn = (id, title, icon) => (
    <button onClick={() => setView(id)} title={title} aria-pressed={view === id}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 24, border: 'none', cursor: 'pointer',
        borderRadius: 999, background: view === id ? 'rgba(255,255,255,.16)' : 'transparent',
        color: view === id ? '#fff' : '#7e7e84', transition: 'background .18s, color .18s' }}>
      {icon}
    </button>
  );
  const venn = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="6.4" cy="6.4" r="3.4" /><circle cx="9.6" cy="6.4" r="3.4" /><circle cx="8" cy="9.4" r="3.4" />
    </svg>
  );
  const corner = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="2.3" y="4" width="7.4" height="8" rx="1.3" /><circle cx="12.4" cy="5" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
  return (
    <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 999, background: 'rgba(255,255,255,.06)' }}>
      {btn('hero', 'Venn hero', venn)}
      {btn('corner', 'Compact', corner)}
    </div>
  );
}

function Console({ initialHex = 'C0FFEE', venn = 'hero', demarc = 'dot', compact = false }) {
  const s = useConsole(initialHex);
  const [view, setView] = useStateLo(venn);
  const V = (size) => <window.Venn rgb={s.shown} solo={s.solo} size={size} />;
  const gapTop = compact ? 14 : 22;
  const swMin = compact ? 'clamp(64px,14vw,82px)' : 'clamp(92px,18vw,116px)';

  let head;
  if (view === 'hero') {
    head = (
      <React.Fragment>
        <div style={{ display: 'flex', justifyContent: 'center', padding: compact ? '2px 0 14px' : '6px 0 20px' }}>
          {V(compact ? 'clamp(150px,44vw,190px)' : 'clamp(232px,60vw,310px)')}
        </div>
        <SwatchPanel {...s} minH={swMin} />
      </React.Fragment>
    );
  } else {
    head = (
      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
        <div style={{ flex: 1 }}><SwatchPanel {...s} minH={compact ? 120 : 140} /></div>
        <div style={{ flex: 'none', width: compact ? 120 : 140, ...panelBox, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{V(compact ? 96 : 112)}</div>
      </div>
    );
  }

  return (
    <div className="studio" style={studioCard}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: compact ? 8 : 12 }}>
        <ViewToggle view={view} setView={setView} />
      </div>
      {head}
      <div style={{ marginTop: compact ? 22 : 34 }}><window.HexReadout c={s.c} demarc={demarc} /></div>
      <div style={{ marginTop: gapTop + 2 }}><window.RgbFaders c={s.c} solo={s.solo} setSolo={s.setSolo} /></div>
      <div style={{ height: 1, background: 'rgba(255,255,255,.08)', margin: (compact ? 16 : 22) + 'px 0' }} />
      <window.HsvPanel c={s.c} />
    </div>
  );
}

Object.assign(window, { Console });
