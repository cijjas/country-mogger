/* eslint-disable @typescript-eslint/no-explicit-any -- d3 selection/geo generics fight
   TypeScript at most call sites; our own data structures stay typed via lib/types */
import * as d3 from "d3";
import { merge as topoMerge } from "topojson-client";

import { computeFill, countryAt, metricValue } from "@/lib/geo/fill-engine";
import {
  organicCut, projectedRings, ringArea, shapeBBox, shapeCentroid, shapeToPath, shapeUnion, simplifyShape,
  type ScreenPoint, type ScreenRing, type Shape,
} from "@/lib/geo/polygon";
import { METRICS, flagUrl } from "@/lib/metrics";
import type { FillItem, FillResult, GeoData, LngLat, MapRenderer, RendererCallbacks } from "@/lib/types";

const PIN_GOLD = "#f2c14e";
const ZOOM_EXTENT: [number, number] = [1, 18];
const INITIAL_ZOOM = 1.35;

/**
 * Builds the imperative D3 map inside `container` and returns its control surface.
 *
 * The renderer owns the SVG (base countries, fills, merged outline, labels, pin,
 * tooltip, pan/zoom); React owns selection and metric state and reaches in through
 * {@link MapRenderer}. Fill results are memoised per (metric, selection, seed country),
 * so dragging the pin inside one country costs nothing.
 */
export function createMapRenderer(container: HTMLDivElement, data: GeoData, cb: RendererCallbacks): MapRenderer {
  const { features, geoms, centroidOf, areaOf, topo } = data;
  let dragTarget: LngLat | null = null;
  let engaged = false;               // true after the first pin drop or drag
  let transform: d3.ZoomTransform = d3.zoomIdentity;
  let panned = false;
  let rafId = 0;
  let pendingResult: FillResult | null = null;
  let lastKey: string | null = null;
  let lastResult: FillResult | null = null;
  let hlIdx: number | null = null;
  const fillCache = new Map<string, FillResult>();

  const svg = d3.select(container).append("svg").attr("class", "map-svg");
  const gRoot = svg.append("g");
  const gBase = gRoot.append("g");
  const gFill = gRoot.append("g");
  const gMerge = gRoot.append("g");
  const gSocket = gRoot.append("g");
  const gLabel = gRoot.append("g");
  const gFloat = gRoot.append("g");  // pin layer, appended last so it stays on top
  const projection = d3.geoMercator();
  const path = d3.geoPath(projection);

  /* ---------- tooltip ---------- */

  const tip = d3.select(container).append("div").attr("class", "map-tip").style("display", "none");
  function hideTip() { tip.style("display", "none"); }
  function showTip(e: PointerEvent, f: any) {
    const metric = cb.getMetric();
    const v = metricValue(data, metric, f.__i);
    const selIdx = cb.getSelected();
    const u = flagUrl(f.__num, "w20");
    let html = `<div class="t-name">${u ? `<img src="${u}" alt="">` : ""}${f.properties.name}${f.__i === selIdx ? ` <span class="t-sub">(selected)</span>` : ""}</div>`;
    html += v != null
      ? `<div class="t-sub">${METRICS[metric].label}: ${METRICS[metric].fmt(v)}</div>`
      : `<div class="t-sub">No ${METRICS[metric].label} data</div>`;
    const item = lastResult?.items.find((d) => d.idx === f.__i);
    if (item && lastResult?.budget) {
      const share = (item.area * item.frac) / lastResult.budget * 100;
      html += `<div class="t-gold">${share.toFixed(1)}% of ${data.names[lastResult.selIdx]}${item.kind === "partial" ? ` (${Math.round(item.frac * 100)}% counted)` : ""}</div>`;
    }
    tip.html(html).style("display", "block");
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const node = tip.node() as HTMLElement;
    tip.style("left", Math.min(x + 14, rect.width - node.offsetWidth - 8) + "px")
       .style("top", Math.min(y + 14, rect.height - node.offsetHeight - 8) + "px");
  }

  /* ---------- projection, zoom, base layer ---------- */

  const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent(ZOOM_EXTENT)
    .on("start", () => { panned = false; hideTip(); })
    .on("zoom", (e: any) => {
      if (e.sourceEvent && (e.sourceEvent.type === "mousemove" || e.sourceEvent.type === "touchmove")) panned = true;
      transform = e.transform;
      gRoot.attr("transform", e.transform);
      sizeLabels(e.transform.k);
      placePin();
    });

  let initialTransform: d3.ZoomTransform = d3.zoomIdentity;
  function sizeProjection() {
    const w = container.clientWidth, h = container.clientHeight;
    svg.attr("viewBox", `0 0 ${w} ${h}`);
    projection.fitExtent([[2, 2], [w - 2, h - 2]], { type: "Sphere" } as any);
    // pan bounds = map extent plus a margin, so edge countries can be dragged to
    // the centre while the map itself can never fully leave the screen
    const b = path.bounds({ type: "Sphere" } as any);
    const mx = w * 0.5, my = h * 0.4;
    zoom.translateExtent([[b[0][0] - mx, b[0][1] - my], [b[1][0] + mx, b[1][1] + my]]);
    const s = INITIAL_ZOOM;
    initialTransform = d3.zoomIdentity.translate(-w * (s - 1) / 2, -h * 0.1 * s).scale(s);
  }
  sizeProjection();

  function screenToLngLat(e: Event): LngLat | null {
    const [px, py] = d3.pointer(e, svg.node());
    const [mx, my] = transform.invert([px, py]);
    const ll = projection.invert!([mx, my]);
    return ll && isFinite(ll[0]) && isFinite(ll[1]) ? (ll as LngLat) : null;
  }

  const basePaths = gBase.selectAll<SVGPathElement, any>("path").data(features).join("path")
    .attr("d", path as any)
    .on("pointermove", (e: PointerEvent, f: any) => showTip(e, f))
    .on("pointerleave", hideTip)
    .on("click", (e: Event, f: any) => {
      if (panned) return;
      const sel = cb.getSelected();
      if (sel == null) {
        if (metricValue(data, cb.getMetric(), f.__i) != null) cb.onSelect(f.__i);
      } else {
        const ll = screenToLngLat(e);
        if (ll) dropPin(ll);
      }
    });

  function updateBase() {
    basePaths.attr("class", (f: any) => "country " + (metricValue(data, cb.getMetric(), f.__i) != null ? "clickable" : "nodata"));
  }
  updateBase();

  // ocean click: with a selection, the pin goes there too (deselect is Esc or Reset)
  svg.on("click", (e: any) => {
    if (e.target !== svg.node() || panned || cb.getSelected() == null) return;
    const ll = screenToLngLat(e);
    if (ll) dropPin(ll);
  });
  svg.call(zoom as any).on("dblclick.zoom", null);
  svg.call(zoom.transform as any, initialTransform);

  /* ---------- pin ---------- */

  const dragBehavior = d3.drag<SVGGElement, unknown>()
    .on("start", function (e: any) { e.sourceEvent?.stopPropagation(); hideTip(); gFloat.select("g.pin").classed("dragging", true); })
    .on("drag", (e: any) => {
      const ll = screenToLngLat(e.sourceEvent);
      if (ll) { dragTarget = ll; engaged = true; redraw(); }
    })
    .on("end", function () { gFloat.select("g.pin").classed("dragging", false); });

  function placePin() {
    if (cb.getSelected() == null || !dragTarget) return;
    const p = projection(dragTarget as any)!;
    let g: any = gFloat.select("g.pin");
    if (g.empty()) {
      g = gFloat.append("g").attr("class", "pin");
      g.append("circle").attr("class", "pin-pulse").attr("r", 8);
      g.append("circle").attr("class", "pin-core").attr("r", 7).attr("fill", PIN_GOLD).attr("stroke", "#0b0d11").attr("stroke-width", 1.5);
      g.append("circle").attr("r", 16).attr("fill", "rgba(0,0,0,0)");  // generous hit target
      g.call(dragBehavior as any);
    }
    g.select(".pin-pulse").style("display", engaged ? "none" : null);
    g.attr("transform", `translate(${p[0]},${p[1]}) scale(${1 / (transform.k || 1)})`);
  }

  function dropPin(ll: LngLat) {
    dragTarget = ll;
    engaged = true;
    redraw();
  }

  /* ---------- labels ---------- */

  function labelText(d: FillItem) {
    return features[d.idx].properties.name + (d.kind === "partial" ? ` ${Math.round(d.frac * 100)}%` : "");
  }
  // labels fit inside their country's on-screen box and hold a constant screen size
  // under zoom; countries too small for readable text get no label at all
  function sizeLabels(k: number) {
    gLabel.selectAll<SVGTextElement, any>("text").each(function (d: any) {
      const s = d3.select(this);
      const bb = d.__bbox;
      const txt = labelText(d);
      const c: any = d.__labelPos || path.centroid(features[d.idx] as any);
      const screenFs = bb ? Math.min(11, (bb.width * k) / (txt.length * 0.56), (bb.height * k) * 0.62) : 0;
      if (!c || !isFinite(c[0]) || !(screenFs >= 5)) { s.style("display", "none"); return; }
      s.style("display", null).style("font-size", (screenFs / k).toFixed(2) + "px").attr("x", c[0]).attr("y", c[1]).text(txt);
    });
  }

  /* ---------- fill rendering ---------- */

  // weighted centre of the fully counted blob; biases where the partial gets cut
  function blobSeed(items: FillItem[]): ScreenPoint {
    let x = 0, y = 0, w = 0;
    for (const d of items) {
      const c = projection(centroidOf[d.idx] as any);
      if (!c) continue;
      const a = Math.max(areaOf[d.idx], 1);
      x += c[0] * a; y += c[1] * a; w += a;
    }
    return w > 0 ? [x / w, y / w] : [0, 0];
  }

  function applyHighlight() {
    gFill.selectAll<any, any>("path.cf, path.cut")
      .classed("dim", (d: any) => hlIdx != null && d?.idx !== hlIdx)
      .classed("hot", (d: any) => hlIdx != null && d?.idx === hlIdx);
  }

  function renderFill(result: FillResult) {
    const items = result.items;
    const solid = items.filter((d) => d.kind !== "partial");
    const partial: any = items.find((d) => d.kind === "partial");

    const sel = gFill.selectAll<SVGPathElement, FillItem>("path.cf").data(solid, (d: any) => d.idx);
    sel.exit().remove();
    const all = sel.enter().append("path").merge(sel as any)
      .attr("class", (d: any) => "cf fill " + d.kind)
      .attr("d", (d: any) => path(features[d.idx] as any) as any);
    all.each(function (d: any) { d.__bbox = (this as SVGGraphicsElement).getBBox(); d.__labelPos = null; });

    // partial country: greyish whole country underneath, organic cut piece carved on top
    gFill.selectAll("path.remainder, path.cut").remove();
    let cut: Shape | null = null;
    if (partial) {
      gFill.append("path").attr("class", "remainder fill").attr("d", path(features[partial.idx] as any) as any);
      const rings = projectedRings(features[partial.idx], projection);
      let main: ScreenRing | null = null, mainA = 0, fullA = 0;
      for (const r of rings) { const a = Math.abs(ringArea(r)); fullA += a; if (a > mainA) { mainA = a; main = r; } }
      if (main && mainA > 1) {
        const fracMain = Math.min(1, Math.max(0, (partial.frac * fullA) / mainA));
        const mainShape = simplifyShape([[main]], 120);
        const seedPt: ScreenPoint = solid.length
          ? blobSeed(solid)
          : ((projection(dragTarget as any) as ScreenPoint) || shapeCentroid(mainShape));
        const res = organicCut(mainShape, fracMain, seedPt, partial.idx);
        if (res && res.cut.length) {
          cut = res.cut;
          gFill.append("path").datum({ idx: partial.idx }).attr("class", "cut fill").attr("d", shapeToPath(res.cut));
          partial.__labelPos = shapeCentroid(res.cut);
          partial.__bbox = shapeBBox(res.cut);
        }
      }
    }

    // gold outline around the unit: fully counted blob plus the cut piece
    gMerge.selectAll("*").remove();
    const mergedGeo = solid.length ? topoMerge(topo as any, solid.map((d) => geoms[d.idx]) as any) : null;
    if (mergedGeo && cut) {
      const blobShape: Shape = projectedRings(mergedGeo, projection).map((r) => [r]);
      const unit = shapeUnion(blobShape, cut);
      if (unit.length) gMerge.append("path").attr("class", "merged").attr("d", shapeToPath(unit));
      else {
        gMerge.append("path").attr("class", "merged").attr("d", path(mergedGeo as any) as any);
        gMerge.append("path").attr("class", "merged").attr("d", shapeToPath(cut));
      }
    } else if (mergedGeo) {
      gMerge.append("path").attr("class", "merged").attr("d", path(mergedGeo as any) as any);
    } else if (cut) {
      gMerge.append("path").attr("class", "merged").attr("d", shapeToPath(cut));
    }

    const labelData = partial && cut ? solid.concat([partial]) : solid;
    const labs = gLabel.selectAll<SVGTextElement, FillItem>("text").data(labelData, (d: any) => d.idx);
    labs.exit().remove();
    labs.enter().append("text").attr("class", "clabel");
    sizeLabels(transform.k || 1);
    applyHighlight();
  }

  /* ---------- main loop ---------- */

  function pushResult(r: FillResult) {
    pendingResult = r;
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; if (pendingResult) cb.onResult(pendingResult); });
  }
  function clearLayers() {
    gFill.selectAll("*").remove(); gMerge.selectAll("*").remove();
    gSocket.selectAll("*").remove(); gFloat.selectAll("*").remove(); gLabel.selectAll("*").remove();
  }

  function redraw() {
    const sel = cb.getSelected();
    if (sel == null || !dragTarget) { clearLayers(); return; }
    gSocket.selectAll("path").data([features[sel]]).join("path").attr("class", "socket").attr("d", path as any);
    placePin();

    if (!engaged) {
      gFill.selectAll("*").remove(); gMerge.selectAll("*").remove(); gLabel.selectAll("*").remove();
      lastKey = null; lastResult = null;
      cb.onResult(null);
      return;
    }
    const seed = countryAt(data, dragTarget);
    const key = `${cb.getMetric()}|${sel}|${seed ?? "ocean"}`;
    if (key === lastKey) return;   // same seed country, nothing to recompute
    lastKey = key;
    let r = fillCache.get(key);
    if (!r) { r = computeFill(data, cb.getMetric(), sel, seed); fillCache.set(key, r); }
    lastResult = r;
    renderFill(r);
    pushResult(r);
  }

  function flyTo(i: number) {
    const w = container.clientWidth, h = container.clientHeight;
    const b = path.bounds(features[i] as any);
    const dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1];
    const cx = (b[0][0] + b[1][0]) / 2, cy = (b[0][1] + b[1][1]) / 2;
    const k = Math.max(1, Math.min(9, 0.8 / Math.max(dx / w, dy / h)));
    const t = d3.zoomIdentity.translate(w / 2 - k * cx, h / 2 - k * cy).scale(k);
    svg.transition().duration(750).call(zoom.transform as any, t);
  }

  function onResize() {
    sizeProjection();
    gBase.selectAll("path").attr("d", path as any);
    lastKey = null;
    redraw();
  }
  window.addEventListener("resize", onResize);

  return {
    onSelected(i, fly) {
      dragTarget = (centroidOf[i] as number[]).slice() as LngLat;
      engaged = false; lastKey = null; lastResult = null;
      hideTip();
      svg.classed("picking", true);
      redraw();
      if (fly) flyTo(i);
    },
    clearVisuals() {
      dragTarget = null; engaged = false; lastKey = null; lastResult = null; hlIdx = null;
      hideTip();
      svg.classed("picking", false);
      clearLayers();
    },
    refresh() { updateBase(); lastKey = null; redraw(); },
    dropPinAt(ll) { dropPin(ll); },
    flyTo,
    highlight(i) { hlIdx = i; applyHighlight(); },
    zoomIn() { svg.transition().duration(200).call(zoom.scaleBy as any, 1.6); },
    zoomOut() { svg.transition().duration(200).call(zoom.scaleBy as any, 1 / 1.6); },
    zoomReset() { svg.transition().duration(300).call(zoom.transform as any, initialTransform); },
    destroy() {
      window.removeEventListener("resize", onResize);
      if (rafId) cancelAnimationFrame(rafId);
      tip.remove();
      svg.remove();
    },
  };
}
