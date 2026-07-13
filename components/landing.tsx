"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- globe.gl's fluent API is untyped-friendly */

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Flag } from "@/components/flag";
import { LogoMark } from "@/components/logo-mark";
import { computeFill } from "@/lib/geo/fill-engine";
import { loadWorld } from "@/lib/geo/load-world";
import { METRICS, type MetricKey } from "@/lib/metrics";
import type { FillResult, GeoData, LngLat } from "@/lib/types";

/** Matchups the hero plays on loop. Every result is computed live by the real engine. */
const MATCHUPS: { num: string; metric: MetricKey; seedNum: string }[] = [
  { num: "840", metric: "gdp", seedNum: "276" },       // USA's GDP, measured from Germany
  { num: "643", metric: "area", seedNum: "250" },      // Russia's area, from France
  { num: "356", metric: "pop", seedNum: "250" },       // India's population, from France
  { num: "156", metric: "co2", seedNum: "276" },       // China's CO2, from Germany
  { num: "076", metric: "homicides", seedNum: "250" }, // Brazil's homicides, from France
];

// globe palette (concrete values: WebGL cannot read CSS variables)
const OCEAN = "#0a0f16";
const CAP = "#161c26";
const CAP_SUBJECT = "#2b3444";
const STROKE = "rgba(255,255,255,0.06)";
const GOLD = "#f2c14e";
const GOLD_DIM = "rgba(242,193,78,0.45)";

type Phase = "intro" | "filling" | "done";
interface Caption {
  phase: Phase;
  name: string;
  num: string;
  metric: MetricKey;
  valueLabel: string;
  count: number;
  pct: number;
  flagNums: string[];
  partialLabel: string | null;
}

const toRad = (d: number) => (d * Math.PI) / 180;
function greatCircle(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]), dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function Landing() {
  const globeRef = useRef<HTMLDivElement>(null);
  const [caption, setCaption] = useState<Caption | null>(null);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let world: any = null;

    (async () => {
      let geo: GeoData;
      let Globe: any;
      try {
        [{ data: geo }, { default: Globe }] = await Promise.all([loadWorld(), import("globe.gl")] as any);
      } catch { return; }
      if (disposed || !globeRef.current) return;

      const container = globeRef.current;
      const landed = new Map<number, string>();   // feature idx -> cap color
      let subjectIdx = -1;

      world = new Globe(container)
        .backgroundColor("rgba(0,0,0,0)")
        .showAtmosphere(true).atmosphereColor("#33415c").atmosphereAltitude(0.16)
        .polygonsData(geo.features)
        .polygonAltitude(0.008)
        .polygonCapColor((f: any) => landed.get(f.__i) ?? (f.__i === subjectIdx ? CAP_SUBJECT : CAP))
        .polygonSideColor(() => "rgba(5,8,12,0.6)")
        .polygonStrokeColor((f: any) => (f.__i === subjectIdx ? GOLD : STROKE))
        .width(container.clientWidth).height(container.clientHeight);
      world.globeMaterial().color.set(OCEAN);
      const controls = world.controls();
      controls.enabled = false;
      controls.autoRotate = false;

      const refreshColors = () => {
        world.polygonCapColor((f: any) => landed.get(f.__i) ?? (f.__i === subjectIdx ? CAP_SUBJECT : CAP));
        world.polygonStrokeColor((f: any) => (f.__i === subjectIdx ? GOLD : STROKE));
      };
      const onResize = () => { world.width(container.clientWidth).height(container.clientHeight); };
      window.addEventListener("resize", onResize);
      (world as any).__cleanupResize = () => window.removeEventListener("resize", onResize);

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const spanOf = (idxs: number[], mid: LngLat) => {
        let m = 0;
        for (const i of idxs) m = Math.max(m, greatCircle(geo.centroidOf[i], mid));
        return m;
      };

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
        const name = geo.names[sel].replace(" of America", "");
        const base = {
          name, num: mu.num, metric: mu.metric,
          valueLabel: METRICS[mu.metric].fmt(budget),
        };

        // camera targets
        const c = geo.centroidOf[sel];
        const b = geo.boundsOf[sel];
        const subjectSpan = Math.max(Math.abs(b[1][1] - b[0][1]), 12);
        const subjectView = { lat: c[1], lng: c[0], altitude: Math.min(1.7, 0.45 + subjectSpan / 40) };
        const blob = items.reduce<LngLat>((acc, d) => [acc[0] + geo.centroidOf[d.idx][0] / n, acc[1] + geo.centroidOf[d.idx][1] / n], [0, 0]);
        const mid: LngLat = [(c[0] + blob[0]) / 2, (c[1] + blob[1]) / 2];
        const wideSpan = spanOf([sel, ...items.map((d) => d.idx)], mid);
        const wideView = { lat: mid[1], lng: mid[0], altitude: Math.max(1.5, Math.min(2.7, 0.7 + wideSpan * 1.15)) };

        // reset scene for this cycle
        landed.clear();
        subjectIdx = sel;
        refreshColors();
        setCaption({ ...base, phase: "intro", count: 0, pct: 0, flagNums: [], partialLabel });

        if (reduced) {
          items.forEach((d) => landed.set(d.idx, d.kind === "partial" ? GOLD_DIM : GOLD));
          refreshColors();
          world.pointOfView(wideView, 0);
          setCaption({ ...base, phase: "done", count: n, pct: 100, flagNums: items.slice(0, 8).map((d) => geo.nums[d.idx]), partialLabel });
          timers.push(setTimeout(() => runCycle(idx + 1), 8000));
          return;
        }

        // trailer: zoom into the subject, then pull out while the fill spreads
        world.pointOfView(subjectView, 2000);
        timers.push(setTimeout(() => { if (!disposed) world.pointOfView(wideView, 3600); }, 2600));

        const CASCADE = 3.0, RAMP = 6, SLOW = 0.2;
        const fast = Math.min(0.2, Math.max(0.03, (8.0 - CASCADE - RAMP * SLOW) / Math.max(1, n - RAMP)));
        const appearAt = (i: number) => CASCADE + (i < RAMP ? i * SLOW : RAMP * SLOW + (i - RAMP) * fast);
        const cascadeEnd = appearAt(n - 1) + 0.3;
        const HOLD = 3.4;
        const totalT = cascadeEnd + HOLD;

        const t0 = performance.now();
        let lastCount = -1;
        const frame = (now: number) => {
          if (disposed) return;
          const t = (now - t0) / 1000;
          let count = 0, cum = 0;
          items.forEach((d, i) => {
            if (t >= appearAt(i)) {
              count++;
              cum += d.area * d.frac;
              if (!landed.has(d.idx)) landed.set(d.idx, d.kind === "partial" ? GOLD_DIM : GOLD);
            }
          });
          if (count !== lastCount) {
            lastCount = count;
            refreshColors();
            const done = count >= n && t > cascadeEnd;
            setCaption({
              ...base,
              phase: t < CASCADE - 0.3 ? "intro" : done ? "done" : "filling",
              count,
              pct: Math.min(100, (cum / budget) * 100),
              flagNums: items.slice(0, Math.min(count, 8)).map((d) => geo.nums[d.idx]),
              partialLabel,
            });
          } else if (t > cascadeEnd && lastCount !== -2) {
            lastCount = -2;
            setCaption({ ...base, phase: "done", count: n, pct: 100, flagNums: items.slice(0, 8).map((d) => geo.nums[d.idx]), partialLabel });
          }
          if (t < totalT) raf = requestAnimationFrame(frame);
          else runCycle(idx + 1);
        };
        raf = requestAnimationFrame(frame);
      };

      world.pointOfView({ lat: 30, lng: -30, altitude: 2.4 }, 0);
      runCycle(0);
    })();

    const el = globeRef.current;
    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      (world as any)?.__cleanupResize?.();
      world?._destructor?.();
      if (el) el.innerHTML = "";
    };
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#07090c]">
      {/* the engine, demoing itself on a globe */}
      <div ref={globeRef} className="pointer-events-none absolute inset-y-0 left-[12%] right-[-12%]" aria-hidden />
      {/* legibility vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,9,12,0.94)_0%,rgba(7,9,12,0.72)_34%,rgba(7,9,12,0.15)_62%,rgba(7,9,12,0)_80%)]" />

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

      {/* live matchup readout, fed by the real fill running on the globe */}
      {caption && (
        <div className="absolute bottom-6 right-6 z-10 w-[350px] max-w-[calc(100vw-3rem)] border border-border bg-card/90 p-4 backdrop-blur-md sm:bottom-8 sm:right-8">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Live: {METRICS[caption.metric].label} of {caption.name}
          </div>

          {caption.phase === "intro" && (
            <div className="mt-2 flex items-center gap-3">
              <Flag num={caption.num} className="h-8 w-12" />
              <div>
                <div className="font-serif text-2xl leading-none text-foreground">{caption.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{METRICS[caption.metric].label}: {caption.valueLabel}</div>
              </div>
            </div>
          )}

          {caption.phase !== "intro" && (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                {caption.phase === "done" ? (
                  <span className="font-serif text-2xl leading-none text-foreground">
                    {caption.name} = <span style={{ color: "var(--sel)" }}>{caption.count} countries</span>
                  </span>
                ) : (
                  <span className="font-serif text-2xl leading-none tabular-nums text-foreground">
                    {caption.count} <span className="text-muted-foreground">countries and counting</span>
                  </span>
                )}
              </div>
              {caption.flagNums.length > 0 && (
                <div className="mt-2.5 flex items-center gap-1">
                  {caption.flagNums.map((num, i) => (
                    <Flag key={`${num}-${i}`} num={num} className="h-3.5 w-5 border border-black/40" />
                  ))}
                  {caption.count > 8 && <span className="ml-1 text-xs text-muted-foreground">+{caption.count - 8}</span>}
                </div>
              )}
              <div className="mt-3 h-1 overflow-hidden bg-secondary">
                <div className="h-full transition-[width] duration-150" style={{ width: `${caption.pct}%`, background: "var(--sel)" }} />
              </div>
              {caption.phase === "done" && caption.partialLabel && (
                <div className="mt-2 text-xs text-muted-foreground">including {caption.partialLabel}</div>
              )}
            </>
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
