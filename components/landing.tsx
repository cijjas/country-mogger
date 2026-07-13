"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- d3 selection generics, see renderer.ts */

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as d3 from "d3";
import { merge as topoMerge } from "topojson-client";
import { ArrowRight } from "lucide-react";

import { Flag } from "@/components/flag";
import { LogoMark } from "@/components/logo-mark";
import { computeFill } from "@/lib/geo/fill-engine";
import { loadWorld } from "@/lib/geo/load-world";
import { METRICS, type MetricKey } from "@/lib/metrics";
import type { FillResult, GeoData } from "@/lib/types";

/** Matchups the hero plays on loop. Every result is computed live by the real engine. */
const MATCHUPS: { num: string; metric: MetricKey; seedNum: string }[] = [
  { num: "840", metric: "gdp", seedNum: "276" },       // USA's GDP, measured from Germany
  { num: "643", metric: "area", seedNum: "250" },      // Russia's area, from France
  { num: "356", metric: "pop", seedNum: "250" },       // India's population, from France
  { num: "156", metric: "co2", seedNum: "276" },       // China's CO2, from Germany
  { num: "076", metric: "homicides", seedNum: "250" }, // Brazil's homicides, from France
];

interface Caption {
  name: string;
  num: string;
  metric: MetricKey;
  count: number;
  pct: number;
  done: boolean;
  partialLabel: string | null;
}

export function Landing() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [caption, setCaption] = useState<Caption | null>(null);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let cycleTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      let geo: GeoData;
      try { ({ data: geo } = await loadWorld()); } catch { return; }
      if (disposed || !mapRef.current) return;

      const container = mapRef.current;
      const W = container.clientWidth, H = container.clientHeight;
      const svg = d3.select(container).append("svg")
        .attr("class", "map-svg landing-map")
        .attr("viewBox", `0 0 ${W} ${H}`)
        .attr("preserveAspectRatio", "xMidYMid slice");
      const gRoot = svg.append("g");
      const gBase = gRoot.append("g");
      const gFill = gRoot.append("g");
      const gMerge = gRoot.append("g");
      const gSocket = gRoot.append("g");
      const gPin = gRoot.append("g");

      const projection = d3.geoMercator();
      projection.fitExtent([[2, 2], [W - 2, H - 2]], { type: "Sphere" } as any);
      const path = d3.geoPath(projection);

      gBase.selectAll("path").data(geo.features).join("path")
        .attr("class", "country").attr("d", path as any);

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const runCycle = (idx: number) => {
        if (disposed) return;
        const mu = MATCHUPS[idx % MATCHUPS.length];
        const sel = geo.nums.indexOf(mu.num);
        const seed = geo.nums.indexOf(mu.seedNum);
        const result: FillResult = computeFill(geo, mu.metric, sel, seed, 200);
        const items = result.items;
        const n = items.length;
        const budget = result.budget ?? 1;
        const partial = items.find((d) => d.kind === "partial") ?? null;
        const partialLabel = partial ? `${Math.round(partial.frac * 100)}% of ${geo.names[partial.idx]}` : null;

        // pacing (seconds): a few slow reveals, then accelerate; whole cycle ~11s
        const START = 1.0, RAMP = 6, SLOW = 0.22;
        const fast = Math.min(0.2, Math.max(0.028, (5.2 - RAMP * SLOW) / Math.max(1, n - RAMP)));
        const appearAt = (i: number) => START + (i < RAMP ? i * SLOW : RAMP * SLOW + (i - RAMP) * fast);
        const cascadeEnd = appearAt(n - 1) + 0.25;
        const HOLD = 3.2, FADE = 0.8;
        const totalT = cascadeEnd + 0.5 + HOLD + FADE;

        // build this cycle's layers
        gFill.selectAll("*").remove(); gMerge.selectAll("*").remove();
        gSocket.selectAll("*").remove(); gPin.selectAll("*").remove();
        gSocket.append("path").attr("class", "socket").attr("d", path(geo.features[sel] as any) as any).attr("opacity", 0);
        const fillPaths = items.map((d) =>
          gFill.append("path")
            .attr("class", "fill " + (d.kind === "water" ? "water" : "land"))
            .attr("d", path(geo.features[d.idx] as any) as any)
            .attr("opacity", 0),
        );
        const solid = items.filter((d) => d.kind !== "partial");
        const outline = gMerge.append("path").attr("class", "merged")
          .attr("d", solid.length ? (path(topoMerge(geo.topo as any, solid.map((d) => geo.geoms[d.idx]) as any) as any) as any) : "")
          .attr("opacity", 0);
        const pinPos = projection(geo.centroidOf[seed] as any) ?? [W / 2, H / 2];
        const pin = gPin.append("g").attr("opacity", 0);
        pin.append("circle").attr("class", "pin-halo").attr("cx", pinPos[0]).attr("cy", pinPos[1]).attr("r", 9)
          .attr("fill", "none").attr("stroke", "#f2c14e").attr("stroke-width", 1.6);
        pin.append("circle").attr("cx", pinPos[0]).attr("cy", pinPos[1]).attr("r", 6.5)
          .attr("fill", "#f2c14e").attr("stroke", "#07090c").attr("stroke-width", 2);

        const baseCaption = { name: geo.names[sel].replace(" of America", ""), num: mu.num, metric: mu.metric, partialLabel };
        let lastCount = -1;
        setCaption({ ...baseCaption, count: 0, pct: 0, done: false });

        if (reduced) {
          // no animation: show the finished state, rotate slowly between matchups
          fillPaths.forEach((p, i) => p.attr("opacity", items[i].kind === "partial" ? 0.55 : 0.96));
          outline.attr("opacity", 1);
          gSocket.select("path").attr("opacity", 0.85);
          pin.attr("opacity", 1);
          setCaption({ ...baseCaption, count: n, pct: 100, done: true });
          cycleTimer = setTimeout(() => runCycle(idx + 1), 8000);
          return;
        }

        const t0 = performance.now();
        const frame = (now: number) => {
          if (disposed) return;
          const t = (now - t0) / 1000;
          const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

          const globalFade = 1 - clamp01((t - (totalT - FADE)) / FADE);
          gRoot.attr("opacity", globalFade);
          // slow push-in across the cycle
          const z = 1.06 + 0.07 * clamp01(t / totalT);
          gRoot.attr("transform", `translate(${pinPos[0] * (1 - z)},${pinPos[1] * (1 - z)}) scale(${z})`);

          gSocket.select("path").attr("opacity", 0.85 * clamp01((t - 0.2) / 0.5));
          pin.attr("opacity", clamp01((t - 0.55) / 0.3));
          pin.select(".pin-halo").attr("r", 9 + ((t * 0.9) % 1) * 15).attr("opacity", (1 - ((t * 0.9) % 1)) * 0.7);

          let count = 0, cum = 0;
          items.forEach((d, i) => {
            const p = clamp01((t - appearAt(i)) / 0.22);
            if (p > 0.4) count++;
            cum += d.area * d.frac * p;
            fillPaths[i].attr("opacity", p * (d.kind === "partial" ? 0.55 : 0.96));
          });
          outline.attr("opacity", clamp01((t - cascadeEnd - 0.2) / 0.5));

          const done = t > cascadeEnd + 0.6;
          if (count !== lastCount || (done && lastCount !== -2)) {
            lastCount = done ? -2 : count;
            setCaption({ ...baseCaption, count, pct: Math.min(100, (cum / budget) * 100), done });
          }

          if (t < totalT) raf = requestAnimationFrame(frame);
          else { gRoot.attr("opacity", 1); runCycle(idx + 1); }
        };
        raf = requestAnimationFrame(frame);
      };

      runCycle(0);
    })();

    const el = mapRef.current;
    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (cycleTimer) clearTimeout(cycleTimer);
      if (el) el.innerHTML = "";
    };
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#07090c]">
      {/* the engine, demoing itself */}
      <div ref={mapRef} className="pointer-events-none absolute inset-0" aria-hidden />
      {/* legibility vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_25%_45%,rgba(7,9,12,0.88)_0%,rgba(7,9,12,0.55)_38%,rgba(7,9,12,0.12)_70%)]" />

      {/* top bar */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-7" />
          <span className="font-serif text-xl tracking-tight" style={{ color: "var(--sel)" }}>Country Mogger</span>
        </div>
        <a href="https://github.com/cijjas/country-mogger" target="_blank" rel="noreferrer"
          className="flex items-center gap-2 border border-border bg-card/80 px-3.5 py-2 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground">
          <svg viewBox="0 0 16 16" className="size-4 fill-current" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          GitHub
        </a>
      </header>

      {/* hero */}
      <main className="absolute inset-0 z-10 flex items-center">
        <div className="max-w-[680px] px-6 sm:px-10">
          <h1 className="font-serif text-[52px] leading-[1.02] tracking-tight text-foreground sm:text-[76px]">
            How many countries
            <br />
            fit inside <span style={{ color: "var(--sel)" }}>yours?</span>
          </h1>
          <p className="mt-6 max-w-[480px] text-base leading-relaxed text-muted-foreground sm:text-lg">
            Pick a country. Drop a pin anywhere. Real countries light up until they
            add up to yours, exactly, on 24 metrics of World Bank data.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/app"
              className="group flex items-center gap-2.5 bg-[var(--sel)] px-7 py-3.5 text-base font-semibold text-[#0b0d11] transition-transform hover:translate-x-0.5">
              Open the map
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <span className="text-sm text-muted-foreground">Free. No accounts. MIT.</span>
          </div>
        </div>
      </main>

      {/* live matchup readout, fed by the real fill running behind */}
      {caption && (
        <div className="absolute bottom-6 right-6 z-10 w-[340px] max-w-[calc(100vw-3rem)] border border-border bg-card/90 p-4 backdrop-blur-md sm:bottom-8 sm:right-8">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Live: {METRICS[caption.metric].label} of {caption.name}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <Flag num={caption.num} className="h-4 w-6 self-center" />
            {caption.done ? (
              <span className="font-serif text-2xl leading-none text-foreground">
                {caption.name} = <span style={{ color: "var(--sel)" }}>{caption.count} countries</span>
              </span>
            ) : (
              <span className="font-serif text-2xl leading-none tabular-nums text-foreground">
                {caption.count} <span className="text-muted-foreground">countries and counting</span>
              </span>
            )}
          </div>
          <div className="mt-3 h-1 overflow-hidden bg-secondary">
            <div className="h-full transition-[width] duration-150" style={{ width: `${caption.pct}%`, background: "var(--sel)" }} />
          </div>
          {caption.done && caption.partialLabel && (
            <div className="mt-2 text-xs text-muted-foreground">including {caption.partialLabel}</div>
          )}
        </div>
      )}

      {/* footer strip */}
      <footer className="absolute bottom-6 left-6 z-10 hidden text-xs text-muted-foreground sm:block sm:bottom-8 sm:left-10">
        World Bank Open Data · Natural Earth · every number sourced in the UI
      </footer>
    </div>
  );
}
