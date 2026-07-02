import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/InstrumentSerif";
import * as d3 from "d3";
import { merge as topoMerge } from "topojson-client";

import { computeFill } from "@/lib/geo/fill-engine";
import { buildGeoData, type WorldTopology } from "@/lib/geo/load-world";
import { METRICS } from "@/lib/metrics";
import topoData from "@/public/countries-50m.json";

const { fontFamily: serif } = loadFont();

export const DEMO_FPS = 30;
export const DEMO_DURATION = 320;

// palette mirrors app/globals.css
const BG = "#07090c";
const LAND = "#1b212b";
const LAND_STROKE = "#2d3540";
// brighter than the app palette so fills stay legible after GIF quantization
const FILL = "#4a5468";
const FILL_STROKE = "#5b6880";
const FILL_WATER = "#3a4356";
const REMAINDER = "#3d4756";
const GOLD = "#f2c14e";
const INK = "#e8edf3";
const MUTED = "#8b95a5";

const INTRO_FADE_IN = 6;
const INTRO_FADE_OUT: [number, number] = [22, 32];
const SOCKET_AT = 18;
const PIN_AT = 32;
const CASCADE_AT = 44;
const W = 1280;
const H = 720;

/** One precomputed scene: USA by GDP, pin dropped on France. Real engine, real data. */
function useScene() {
  return useMemo(() => {
    const geo = buildGeoData(topoData as unknown as WorldTopology);
    const usa = geo.nums.indexOf("840");
    // pin dropped on Germany: USA's GDP sweeps all of Europe and keeps going.
    // The app's per-interaction item cap is lifted so the fill completes on film.
    const seed = geo.nums.indexOf("276");
    const result = computeFill(geo, "gdp", usa, seed, 200);

    const projection = d3.geoMercator();
    const involved = { type: "FeatureCollection", features: [geo.features[usa], ...result.items.map((d) => geo.features[d.idx])] };
    projection.fitExtent([[40, 40], [W - 40, H - 60]], involved as never);
    const path = d3.geoPath(projection);

    const basePaths = geo.features.map((f) => path(f as never) ?? "");
    const itemPaths = result.items.map((d) => path(geo.features[d.idx] as never) ?? "");
    const solid = result.items.filter((d) => d.kind !== "partial");
    const partial = result.items.find((d) => d.kind === "partial") ?? null;
    const mergedPath = solid.length
      ? path(topoMerge(geo.topo as never, solid.map((d) => geo.geoms[d.idx]) as never) as never) ?? ""
      : "";
    const socketPath = path(geo.features[usa] as never) ?? "";
    const pin = projection(geo.centroidOf[seed]) ?? [W / 2, H / 2];
    const zoomOrigin = pin;

    return { geo, result, basePaths, itemPaths, mergedPath, socketPath, pin, zoomOrigin, partial };
  }, []);
}

export const Demo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scene = useScene();
  const { result, basePaths, itemPaths, mergedPath, socketPath, pin, zoomOrigin, partial, geo } = scene;

  const n = result.items.length;
  const budget = result.budget ?? 0;
  // first few countries land slowly so the eye can follow, then the cascade
  // accelerates so any cast size finishes by ~frame 188, leaving the closing
  // headline about three full seconds on screen before the loop fades
  const RAMP = 8, SLOW = 4.5;
  const fast = Math.min(5, Math.max(1.2, (188 - CASCADE_AT - RAMP * SLOW) / Math.max(1, n - RAMP)));
  const appearAt = (i: number) => CASCADE_AT + (i < RAMP ? i * SLOW : RAMP * SLOW + (i - RAMP) * fast);
  const cascadeEnd = appearAt(n - 1) + 6;
  const outlineAt = cascadeEnd + 6;
  const headlineAt = outlineAt + 8;
  const outroAt = DEMO_DURATION - 14;

  // everything fades near the end so the last frame matches the first (clean GIF loop)
  const outro = interpolate(frame, [outroAt, DEMO_DURATION - 2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const intro = interpolate(frame, [0, INTRO_FADE_IN], [0, 1], { extrapolateRight: "clamp" })
    * interpolate(frame, INTRO_FADE_OUT, [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const itemOpacity = (i: number) => {
    const at = appearAt(i);
    const max = result.items[i].kind === "partial" ? 0.55 : 0.96;
    return interpolate(frame, [at, at + 6], [0, max], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  };
  const landedCount = result.items.filter((_, i) => frame >= appearAt(i) + 3).length;
  const cumulative = result.items.reduce((acc, d, i) => {
    const at = appearAt(i);
    const p = interpolate(frame, [at, at + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return acc + d.area * d.frac * p;
  }, 0);
  const pct = budget > 0 ? Math.min(100, (cumulative / budget) * 100) : 0;

  const socketOpacity = interpolate(frame, [SOCKET_AT, SOCKET_AT + 10], [0, 0.9], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pinSpring = spring({ frame: frame - PIN_AT, fps, config: { damping: 11, mass: 0.6 } });
  const pinVisible = frame >= PIN_AT;
  const pulse = ((frame - PIN_AT) % 40) / 40;
  const outlineOpacity = interpolate(frame, [outlineAt, outlineAt + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const headline = interpolate(frame, [headlineAt, headlineAt + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const panelIn = spring({ frame: frame - (SOCKET_AT - 2), fps, config: { damping: 14 } });

  const z = interpolate(frame, [0, DEMO_DURATION], [1.04, 1.14]);
  const [ox, oy] = zoomOrigin;

  const partialLabel = partial ? `${Math.round(partial.frac * 100)}% of ${geo.names[partial.idx]}` : null;

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: "Helvetica, Arial, sans-serif" }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <g transform={`translate(${ox} ${oy}) scale(${z}) translate(${-ox} ${-oy})`}>
          {basePaths.map((d, i) => (
            <path key={i} d={d} fill={LAND} stroke={LAND_STROKE} strokeWidth={0.5} />
          ))}
          {partial && (
            <path d={itemPaths[result.items.indexOf(partial)]} fill={REMAINDER}
              opacity={itemOpacity(result.items.indexOf(partial)) * outro} />
          )}
          {result.items.map((d, i) => d.kind === "partial" ? null : (
            <path key={d.idx} d={itemPaths[i]} fill={d.kind === "water" ? FILL_WATER : FILL}
              stroke={FILL_STROKE} strokeWidth={0.4} opacity={itemOpacity(i) * outro} />
          ))}
          <path d={mergedPath} fill="none" stroke={GOLD} strokeWidth={2.4} strokeLinejoin="round"
            opacity={outlineOpacity * outro} />
          <path d={socketPath} fill="none" stroke={GOLD} strokeWidth={1.6} strokeDasharray="6 5"
            opacity={socketOpacity * outro} />
          {pinVisible && (
            <g transform={`translate(${pin[0]} ${pin[1]}) scale(${pinSpring})`} opacity={outro}>
              <circle r={10 + pulse * 16} fill="none" stroke={GOLD} strokeWidth={2} opacity={(1 - pulse) * 0.7} />
              <circle r={9} fill={GOLD} stroke={BG} strokeWidth={2.5} />
            </g>
          )}
        </g>
      </svg>

      {/* bottom-left analysis panel, styled like the app */}
      <div style={{
        position: "absolute", left: 28, bottom: 28, width: 330, padding: "18px 20px",
        background: "rgba(13,17,23,0.95)", border: "1px solid #262c36",
        opacity: Math.min(panelIn, 1) * outro, transform: `translateY(${(1 - panelIn) * 30}px)`,
      }}>
        <div style={{ fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: MUTED }}>GDP of United States</div>
        <div style={{ fontFamily: serif, fontSize: 44, color: INK, marginTop: 4, lineHeight: 1 }}>
          {METRICS.gdp.fmt(frame < CASCADE_AT ? budget : cumulative)}
        </div>
        <div style={{ height: 6, background: "#1c2330", marginTop: 14, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: GOLD }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 16, color: MUTED }}>
          <span>{landedCount} countr{landedCount === 1 ? "y" : "ies"}</span>
          <span style={{ color: pct >= 99.9 ? GOLD : MUTED }}>{pct.toFixed(0)}%</span>
        </div>
      </div>

      {/* closing headline */}
      <div style={{
        position: "absolute", left: 0, right: 0, top: 64, display: "flex", flexDirection: "column",
        alignItems: "center", opacity: headline * outro,
      }}>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          background: "rgba(7,9,12,0.82)", border: "1px solid #262c36", padding: "18px 40px 16px",
        }}>
          <div style={{ fontFamily: serif, fontSize: 54, color: INK, lineHeight: 1.1 }}>
            United States <span style={{ color: MUTED }}>=</span> <span style={{ color: GOLD }}>{n} countries</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 20, color: MUTED }}>
            by GDP{partialLabel ? `, including ${partialLabel}` : ""} · countrymogger
          </div>
        </div>
      </div>

      {/* intro title */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: `rgba(7,9,12,${0.55 * intro})`, opacity: intro }}>
        <div style={{ fontFamily: serif, fontSize: 96, color: GOLD, lineHeight: 1 }}>Country Mogger</div>
        <div style={{ marginTop: 14, fontSize: 26, color: INK }}>How many countries fit inside yours?</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
