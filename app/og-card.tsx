/* Shared design for the Open Graph and Twitter share cards, rendered by satori
   via next/og. Satori supports a flexbox subset and inline SVG only. */

const GOLD = "#f2c14e";
const BG = "#07090c";
const CARD = "#0d1117";
const LINE = "#262c36";
const INK = "#e8edf3";
const MUTED = "#8b95a5";
const FILL = "#3a424e";

/** Decorative donut echoing the app's contributor chart, with the gold pin. */
function Donut() {
  // precomputed wedge paths (r 150/95), biggest wedge gold like the app's ramp
  const wedges = [
    { d: "M0,-150 A150,150 0 0,1 129.9,-75 L82.3,-47.5 A95,95 0 0,0 0,-95 Z", fill: GOLD },
    { d: "M129.9,-75 A150,150 0 0,1 129.9,75 L82.3,47.5 A95,95 0 0,0 82.3,-47.5 Z", fill: "#5b6472" },
    { d: "M129.9,75 A150,150 0 0,1 0,150 L0,95 A95,95 0 0,0 82.3,47.5 Z", fill: "#4b5464" },
    { d: "M0,150 A150,150 0 0,1 -129.9,75 L-82.3,47.5 A95,95 0 0,0 0,95 Z", fill: FILL },
    { d: "M-129.9,75 A150,150 0 0,1 -129.9,-75 L-82.3,-47.5 A95,95 0 0,0 -82.3,47.5 Z", fill: "#333b48" },
    { d: "M-129.9,-75 A150,150 0 0,1 0,-150 L0,-95 A95,95 0 0,0 -82.3,-47.5 Z", fill: "#2c333d" },
  ];
  return (
    <div style={{ display: "flex", position: "relative", width: 340, height: 340 }}>
      <svg width="340" height="340" viewBox="-170 -170 340 340">
        {wedges.map((w, i) => (
          <path key={i} d={w.d} fill={w.fill} stroke={BG} strokeWidth={3} />
        ))}
        <circle r="26" cx="104" cy="-104" fill={GOLD} stroke={BG} strokeWidth={6} />
      </svg>
      <div style={{
        position: "absolute", left: 0, top: 0, width: 340, height: 340,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 600, color: INK, lineHeight: 1 }}>41</div>
        <div style={{ display: "flex", fontSize: 24, color: MUTED, marginTop: 6 }}>countries</div>
      </div>
    </div>
  );
}

export function OgCard() {
  const chips = ["Area", "GDP", "Population", "Military $", "Homicides", "+19 more"];
  return (
    <div
      style={{
        width: "100%", height: "100%", display: "flex", background: BG,
        fontFamily: "Geist, sans-serif", position: "relative",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, background: GOLD, display: "flex" }} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", width: 16, height: 16, borderRadius: 999, background: GOLD }} />
          <div style={{ display: "flex", fontSize: 30, color: GOLD, letterSpacing: 6, textTransform: "uppercase" }}>
            Country Mogger
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 28, fontFamily: "InstrumentSerif", fontSize: 92, lineHeight: 1.04, color: INK }}>
          <span>How many countries</span>
          <span style={{ display: "flex" }}>
            fit inside<span style={{ color: GOLD, marginLeft: 24 }}>yours?</span>
          </span>
        </div>
        <div style={{ display: "flex", marginTop: 30, gap: 12, flexWrap: "wrap" }}>
          {chips.map((c) => (
            <div key={c} style={{
              display: "flex", padding: "10px 22px", border: `2px solid ${LINE}`,
              background: CARD, color: MUTED, fontSize: 24, borderRadius: 999,
            }}>
              {c}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", paddingRight: 90 }}>
        <Donut />
      </div>
    </div>
  );
}
