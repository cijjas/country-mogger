"use client";

import * as React from "react";
import { useState } from "react";
import * as d3 from "d3";
import { ChevronDown, GripVertical } from "lucide-react";

import { Flag } from "@/components/flag";
import { ScrollArea } from "@/components/ui/scroll-area";
import { METRICS, flagUrl, type MetricKey } from "@/lib/metrics";
import type { CountryEntry, FillResult, GeoData } from "@/lib/types";
import { cn } from "@/lib/utils";

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

interface ComparisonPanelProps {
  metric: MetricKey;
  selected: CountryEntry;
  result: FillResult;
  geo: GeoData;
  onHandlePointerDown: (e: React.PointerEvent) => void;
  onHoverCountry: (i: number | null) => void;
}

/** The analysis card: headline number, flag donut, contributor list, source line. */
export function ComparisonPanel({ metric, selected, result, geo, onHandlePointerDown, onHoverCountry }: ComparisonPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [hoverSlice, setHoverSlice] = useState<number | null>(null);
  const fmt = (v: number | null) => METRICS[metric].fmt(v as number);
  const mlabel = METRICS[metric].label;

  const handle = (
    <div onPointerDown={onHandlePointerDown} className="flex shrink-0 cursor-move touch-none select-none items-center gap-2 border-b px-4 py-2.5">
      <GripVertical className="size-4 shrink-0 text-muted-foreground/50" />
      <Flag num={selected.num} className="h-4 w-6" />
      <span className="truncate font-serif text-[22px] leading-none tracking-tight" style={{ color: "var(--sel)" }}>{selected.name}</span>
    </div>
  );

  if (result.noData) {
    return (<>{handle}<p className="p-4 text-sm text-muted-foreground">has no <span className="text-foreground">{mlabel}</span> data in this snapshot. Try another metric.</p></>);
  }
  if (result.seededOnOcean || !result.items.length) {
    return (<>{handle}<p className="p-4 text-sm text-muted-foreground">{fmt(result.budget)} of {mlabel} to match. Drop the pin on land to start filling.</p></>);
  }

  const budget = result.budget as number;
  const items = result.items;
  const pct = Math.min(100, (result.total / budget) * 100);
  const full = pct >= 99.95;
  const water = items.some((d) => d.water);
  const rows = items
    .map((d) => ({ d, name: geo.names[d.idx], num: geo.nums[d.idx], value: d.area * d.frac, share: (d.area * d.frac) / budget * 100 }))
    .sort((a, b) => b.value - a.value);
  const biggest = rows[0];
  const soloPartial = items.length === 1 && items[0].kind === "partial";
  const hasPartial = items.some((d) => d.kind === "partial");
  const pieArcs = d3.pie<(typeof rows)[number]>().value((r) => r.value).sort(null)(rows);
  const arcGen = d3.arc<d3.PieArcDatum<(typeof rows)[number]>>().innerRadius(40).outerRadius(68);
  const hoverRow = (i: number | null) => { setHoverSlice(i); onHoverCountry(i == null ? null : rows[i].d.idx); };

  return (
    <>
      {handle}
      <div className="min-h-0 overflow-y-auto p-4">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {mlabel} of {selected.name}
        </div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums" title={budget.toLocaleString("en-US")}>{fmt(budget)}</span>
          {!full && <span className="text-xs text-muted-foreground">{pct.toFixed(0)}% reached</span>}
        </div>

        {/* donut of flags: each slice is that country's flag clipped to its wedge */}
        <div className="mt-3 flex justify-center">
          <svg width={156} height={156} viewBox="0 0 156 156">
            <defs>
              {pieArcs.map((a, i) => (
                <clipPath key={i} id={`arc-${i}`}>
                  <path d={arcGen(a) ?? undefined} transform="translate(78,78)" />
                </clipPath>
              ))}
            </defs>
            {pieArcs.map((a, i) => {
              const u = flagUrl(a.data.num, "w320");
              const op = hoverSlice == null || hoverSlice === i ? 1 : 0.35;
              const evts = { onMouseEnter: () => hoverRow(i), onMouseLeave: () => hoverRow(null) };
              return u ? (
                <image key={i} href={u} x={10} y={10} width={136} height={136} preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#arc-${i})`} style={{ cursor: "pointer", opacity: op, transition: "opacity .12s" }} {...evts} />
              ) : (
                <path key={i} d={arcGen(a) ?? undefined} transform="translate(78,78)" fill="#3a424e"
                  style={{ cursor: "pointer", opacity: op }} {...evts} />
              );
            })}
            {pieArcs.map((a, i) => (
              <path key={`sep-${i}`} d={arcGen(a) ?? undefined} transform="translate(78,78)" fill="none"
                stroke="rgba(255,255,255,0.45)" strokeWidth={0.75} pointerEvents="none" />
            ))}
            <circle cx={78} cy={78} r={38} fill="var(--card)" />
            {hoverSlice == null ? (
              <>
                <text x={78} y={73} textAnchor="middle" className="fill-foreground" style={{ fontSize: 26, fontWeight: 600 }}>{items.length}</text>
                <text x={78} y={90} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>countr{items.length === 1 ? "y" : "ies"}</text>
              </>
            ) : (
              <>
                {flagUrl(rows[hoverSlice].num, "w320") && (
                  <image href={flagUrl(rows[hoverSlice].num, "w320")!} x={66} y={58} width={24} height={16} preserveAspectRatio="xMidYMid slice" />
                )}
                <text x={78} y={86} textAnchor="middle" className="fill-foreground" style={{ fontSize: 9.5, fontWeight: 600 }}>{truncate(rows[hoverSlice].name, 16)}</text>
                <text x={78} y={98} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>{rows[hoverSlice].share.toFixed(1)}%</text>
              </>
            )}
          </svg>
        </div>

        {(water || hasPartial) && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block size-2" style={{ background: "var(--fill-land)" }} /> counted</span>
            {water && <span className="flex items-center gap-1"><span className="inline-block size-2" style={{ background: "var(--fill-water)" }} /> across water</span>}
            {hasPartial && <span className="flex items-center gap-1"><span className="inline-block size-2" style={{ background: "#313a47" }} /> left over</span>}
          </div>
        )}

        {soloPartial ? (
          <p className="mt-3 text-xs leading-snug text-muted-foreground">
            <span className="text-foreground">{selected.name}</span> is only{" "}
            <span className="text-foreground">{(items[0].frac * 100).toFixed(1)}%</span> of{" "}
            <Flag num={biggest.num} className="mx-0.5 inline-block h-2.5 w-4 align-[-1px]" />
            <span className="text-foreground">{biggest.name}</span> on this metric.
          </p>
        ) : (
          <p className="mt-3 text-xs leading-snug text-muted-foreground">
            After <span className="text-foreground">{selected.name}</span>, the biggest here is{" "}
            <Flag num={biggest.num} className="mx-0.5 inline-block h-2.5 w-4 align-[-1px]" />
            <span className="text-foreground">{biggest.name}</span> ({biggest.share.toFixed(1)}%){water ? ", some reached across water" : ""}.
          </p>
        )}

        <div className="mt-3">
          <span onClick={() => setExpanded((v) => !v)}
            className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
            {expanded ? "Show less" : `Show more, all ${items.length} contributor${items.length === 1 ? "" : "s"}`}
            <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
          </span>
        </div>

        {expanded && (
          <ScrollArea className="mt-2 h-[200px] pr-2">
            <div className="flex flex-col gap-0.5">
              {rows.map(({ d, name, num, value, share }, i) => (
                <div key={d.idx} className="rounded-md px-1.5 py-1.5 hover:bg-accent"
                  onMouseEnter={() => hoverRow(i)} onMouseLeave={() => hoverRow(null)}>
                  <div className="flex items-center gap-2 text-sm">
                    <Flag num={num} className="h-3.5 w-5" />
                    <span className="flex-1 truncate">
                      {name}
                      {d.kind === "partial" && <span className="ml-1 text-xs text-muted-foreground">{Math.round(d.frac * 100)}% used</span>}
                      {d.water && d.kind !== "partial" && <span className="ml-1 text-[10px] text-muted-foreground">across water</span>}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums">{fmt(value)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 pl-7">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(share, 1.5)}%`, background: "var(--sel)" }} />
                    </div>
                    <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{share.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="mt-3 border-t pt-2 text-[10px] leading-snug text-muted-foreground/70">
          Source: {METRICS[metric].source}
        </div>
      </div>
    </>
  );
}
