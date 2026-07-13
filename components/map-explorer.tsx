"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as d3 from "d3";
import { Check, ChevronsUpDown, Dices, Maximize2, Minus, Plus, RotateCcw, Search } from "lucide-react";

import { ComparisonPanel } from "@/components/comparison-panel";
import { Flag } from "@/components/flag";
import { LogoMark } from "@/components/logo-mark";
import { createMapRenderer } from "@/components/map/renderer";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { metricValue } from "@/lib/geo/fill-engine";
import { loadWorld } from "@/lib/geo/load-world";
import { METRICS, METRIC_DATA, METRIC_GROUPS, type MetricKey } from "@/lib/metrics";
import type { CountryEntry, FillResult, GeoData, MapRenderer, RendererCallbacks } from "@/lib/types";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Russia", "United States of America", "China", "Brazil", "India", "Canada",
  "Australia", "France", "Japan", "Nigeria", "Indonesia", "Argentina",
];
/** Metrics that make good random matchups. */
const SURPRISE_METRICS: MetricKey[] = ["area", "gdp", "pop", "homicides", "milspend", "tourists", "co2", "internet", "airpax", "forest"];

/** Random matchup: an interesting metric, a heavyweight country for it, and a far-away pin seed. */
function pickSurprise(data: GeoData): { m: MetricKey; sel: number; seed: number } {
  const m = SURPRISE_METRICS[Math.floor(Math.random() * SURPRISE_METRICS.length)];
  const withData = data.features.map((f) => f.__i).filter((i) => (metricValue(data, m, i) ?? 0) > 0);
  const byValue = [...withData].sort((a, b) => (metricValue(data, m, b) ?? 0) - (metricValue(data, m, a) ?? 0)).slice(0, 60);
  const sel = byValue[Math.floor(Math.random() * byValue.length)];
  const far = withData.filter((i) => i !== sel && d3.geoDistance(data.centroidOf[i], data.centroidOf[sel]) > 0.9);
  const seedPool = far.sort((a, b) => data.areaOf[b] - data.areaOf[a]).slice(0, 40);
  const seed = seedPool.length ? seedPool[Math.floor(Math.random() * seedPool.length)] : sel;
  return { m, sel, seed };
}

export default function MapExplorer() {
  const mapRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<GeoData | null>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const metricRef = useRef<MetricKey>("area");
  const selectedRef = useRef<number | null>(null);
  const urlInitRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [metric, setMetricState] = useState<MetricKey>("area");
  const [selected, setSelected] = useState<CountryEntry | null>(null);
  const [result, setResult] = useState<FillResult | null>(null);
  const [countries, setCountries] = useState<CountryEntry[]>([]);
  const [metricOpen, setMetricOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);

  const syncURL = (num: string | null, m: MetricKey) => {
    const u = new URL(window.location.href);
    if (num) u.searchParams.set("c", num); else u.searchParams.delete("c");
    if (m !== "area") u.searchParams.set("m", m); else u.searchParams.delete("m");
    window.history.replaceState(null, "", u);
  };

  const handleSelect = (i: number, fly = false) => {
    const f = dataRef.current!.features[i];
    selectedRef.current = i;
    setSelected({ i, name: f.properties.name, num: f.__num });
    rendererRef.current?.onSelected(i, fly);
    syncURL(f.__num, metricRef.current);
  };
  const handleClear = () => {
    selectedRef.current = null;
    setSelected(null); setResult(null);
    rendererRef.current?.clearVisuals();
    syncURL(null, metricRef.current);
  };
  const handleMetric = (m: MetricKey) => {
    metricRef.current = m; setMetricState(m); setMetricOpen(false);
    rendererRef.current?.refresh();
    syncURL(selected?.num ?? null, m);
  };
  const surprise = () => {
    const data = dataRef.current; if (!data) return;
    const { m, sel, seed } = pickSurprise(data);
    metricRef.current = m; setMetricState(m);
    handleSelect(sel, false);
    rendererRef.current?.refresh();
    rendererRef.current?.dropPinAt(data.centroidOf[seed]);
    rendererRef.current?.zoomReset();
    syncURL(data.features[sel].__num, m);
  };

  // load world data once; the metric in the URL is restored here too
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const { data, countries: list } = await loadWorld();
        if (disposed) return;
        dataRef.current = data;
        setGeo(data);
        if (!urlInitRef.current) {
          urlInitRef.current = true;
          const m = new URLSearchParams(window.location.search).get("m") as MetricKey | null;
          if (m && METRICS[m]) { metricRef.current = m; setMetricState(m); }
        }
        setCountries(list);
        setReady(true);
      } catch {
        if (!disposed) setLoadError(true);
      }
    })();
    return () => { disposed = true; };
  }, []);

  // mount the renderer once data is ready; the selection in the URL is restored here
  useEffect(() => {
    if (!ready || !dataRef.current || !mapRef.current) return;
    const cb: RendererCallbacks = {
      onSelect: (i) => handleSelect(i),
      onResult: (r) => setResult(r),
      getMetric: () => metricRef.current,
      getSelected: () => selectedRef.current,
    };
    const renderer = createMapRenderer(mapRef.current, dataRef.current, cb);
    rendererRef.current = renderer;
    const c = new URLSearchParams(window.location.search).get("c");
    if (selectedRef.current != null) renderer.onSelected(selectedRef.current);
    else if (c) {
      const idx = dataRef.current.features.findIndex((f) => f.__num === c);
      if (idx >= 0) setTimeout(() => handleSelect(idx, true), 60);
    }
    const el = mapRef.current;
    return () => { renderer.destroy(); rendererRef.current = null; if (el) el.innerHTML = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers only touch refs and setState
  }, [ready]);

  // keyboard: "/" opens country search, Esc clears the selection
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing && !metricOpen && !countryOpen) { e.preventDefault(); setCountryOpen(true); }
      else if (e.key === "Escape" && !metricOpen && !countryOpen) handleClear();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleClear only touches refs and setState
  }, [metricOpen, countryOpen]);

  const startDrag = (e: React.PointerEvent) => {
    const card = (e.currentTarget as HTMLElement).closest("[data-card]") as HTMLElement | null;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
    const move = (ev: PointerEvent) => setPanelPos({
      x: Math.min(Math.max(ev.clientX - dx, 0), window.innerWidth - rect.width),
      y: Math.min(Math.max(ev.clientY - dy, 0), window.innerHeight - 56),
    });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const suggestionEntries = SUGGESTIONS
    .map((n) => countries.find((c) => c.name.toLowerCase() === n.toLowerCase()))
    .filter(Boolean) as CountryEntry[];

  const hasData = (num: string) => metric === "area" || (METRIC_DATA[num]?.[metric] ?? null) != null;

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <div ref={mapRef} className="absolute inset-0" />
      {!ready && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          <span className="animate-pulse">Loading world…</span>
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <span>Could not load the world map.</span>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Retry</Button>
        </div>
      )}

      {/* header card: title, metric picker, country search, quick start */}
      <div className="absolute left-0 top-0 z-20 w-[360px] border-b border-r bg-card/95 p-4 shadow-xl backdrop-blur-md">
        <h1 className="font-serif text-[28px] leading-none tracking-tight">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark className="size-7" />
            Country Mogger
          </Link>
        </h1>
        <p className="mb-3 mt-1.5 text-xs text-muted-foreground">
          Pick a country, then click anywhere on the map. Countries around that point light up until they add up to it.
        </p>

        <div className="flex flex-col gap-2.5">
          <Popover open={metricOpen} onOpenChange={setMetricOpen}>
            <PopoverTrigger disabled={!ready}
              className={cn("flex h-9 w-full items-center justify-between rounded-md border border-input bg-input/30 px-3 text-sm",
                "hover:bg-input/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50")}>
              <span className="text-muted-foreground">Metric:&nbsp;</span>
              <span className="flex-1 text-left font-medium">{METRICS[metric].label}</span>
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-60" />
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search metric…" />
                <CommandList>
                  <CommandEmpty>No metric found.</CommandEmpty>
                  {METRIC_GROUPS.map(([group, keys]) => (
                    <CommandGroup key={group} heading={group}>
                      {keys.map((k) => (
                        <CommandItem key={k} value={`${METRICS[k].label} ${METRICS[k].source}`} onSelect={() => handleMetric(k)}>
                          <Check className={cn("mr-2 size-4 shrink-0", metric === k ? "opacity-100" : "opacity-0")} />
                          <span className="flex min-w-0 flex-col">
                            <span>{METRICS[k].label}</span>
                            <span className="truncate text-[10px] text-muted-foreground">{METRICS[k].source}</span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <div className="flex gap-2">
            <Popover open={countryOpen} onOpenChange={setCountryOpen}>
              <PopoverTrigger disabled={!ready}
                className={cn("flex h-9 flex-1 items-center gap-2 rounded-md border border-input bg-input/30 px-3 text-sm text-muted-foreground",
                  "hover:bg-input/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50")}>
                <Search className="size-4 shrink-0 opacity-70" />
                {selected
                  ? <span className="flex min-w-0 items-center gap-1.5 truncate"><Flag num={selected.num} className="h-3 w-[18px]" /> {selected.name}</span>
                  : <span className="truncate">Search a country…</span>}
                <kbd className="ml-auto shrink-0 border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">/</kbd>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search a country…" />
                  <CommandList>
                    <CommandEmpty>No country found.</CommandEmpty>
                    <CommandGroup>
                      {countries.map((c) => {
                        const ok = hasData(c.num);
                        return (
                          <CommandItem key={c.i} value={c.name} disabled={!ok}
                            onSelect={() => { if (ok) { handleSelect(c.i, true); setCountryOpen(false); } }}
                            className={cn(!ok && "opacity-40")}>
                            <Flag num={c.num} className="mr-2 h-3 w-[18px]" />{c.name}
                            {!ok && <span className="ml-auto text-[10px] text-muted-foreground">no data</span>}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" onClick={surprise} disabled={!ready} title="Surprise me: random matchup">
              <Dices className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleClear} disabled={!selected} title="Reset (Esc)">
              <RotateCcw className="size-4" />
            </Button>
          </div>

          {!selected && (
            <div className="mt-1">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Quick start</div>
              <div className="flex max-h-[40vh] flex-col divide-y divide-border overflow-y-auto">
                {suggestionEntries.map((c) => {
                  const ok = hasData(c.num);
                  return (
                    <button key={c.i} disabled={!ok} onClick={() => ok && handleSelect(c.i, true)}
                      className={cn("group flex items-center gap-2 py-2 text-left text-sm",
                        ok ? "text-muted-foreground hover:text-foreground" : "cursor-not-allowed text-muted-foreground/35")}>
                      <Flag num={c.num} className="h-3.5 w-5" />
                      <span className={cn("truncate", ok && "group-hover:underline")}>{c.name.replace(" of America", "")}</span>
                      {!ok && <span className="ml-auto text-[10px]">no data</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* analysis card: draggable via its handle */}
      {selected && result && geo && (
        <div data-card
          className="absolute z-20 flex w-[360px] flex-col overflow-hidden border bg-card/95 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{ ...(panelPos ? { left: panelPos.x, top: panelPos.y } : { left: 0, bottom: 0 }), maxHeight: "calc(100vh - 12px)" }}>
          <ComparisonPanel metric={metric} selected={selected} result={result} geo={geo}
            onHandlePointerDown={startDrag}
            onHoverCountry={(i) => rendererRef.current?.highlight(i)} />
        </div>
      )}

      {ready && !selected && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border bg-card/90 px-3.5 py-1.5 text-xs text-muted-foreground">
          Click a country to start. Scroll to zoom, drag to pan
        </div>
      )}
      {ready && selected && !result && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border bg-card/90 px-3.5 py-1.5 text-xs text-muted-foreground">
          Now click anywhere on the map, or drag the gold pin
        </div>
      )}

      {ready && (
        <div className="absolute bottom-4 right-4 z-20 flex flex-col divide-y border bg-card/95 shadow-lg backdrop-blur-md">
          <button onClick={() => rendererRef.current?.zoomIn()} title="Zoom in" className="flex size-9 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"><Plus className="size-4" /></button>
          <button onClick={() => rendererRef.current?.zoomOut()} title="Zoom out" className="flex size-9 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"><Minus className="size-4" /></button>
          <button onClick={() => rendererRef.current?.zoomReset()} title="Reset view" className="flex size-9 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"><Maximize2 className="size-4" /></button>
        </div>
      )}
    </div>
  );
}
