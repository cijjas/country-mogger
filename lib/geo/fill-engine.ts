import * as d3 from "d3";
import { METRIC_DATA, type MetricKey } from "@/lib/metrics";
import type { FillItem, FillResult, GeoData, LngLat } from "@/lib/types";

/** Cap on contributors per fill; a safety net, not a tuning knob. */
const MAX_FILL = 90;
/** Keep every Nth boundary vertex when sampling outlines for across-water distance. */
const SAMPLE_STEP = 4;

/** The selected metric's value for a country, or null when the snapshot has none. */
export function metricValue(data: GeoData, metric: MetricKey, i: number): number | null {
  if (metric === "area") return data.areaOf[i];
  const row = METRIC_DATA[data.features[i].__num];
  return row ? (row[metric] ?? null) : null;
}

/** Point-in-country test with a bounding-box prefilter (bboxes may wrap the antimeridian). */
export function countryAt(data: GeoData, ll: LngLat): number | null {
  const [lng, lat] = ll;
  for (let i = 0; i < data.features.length; i++) {
    const b = data.boundsOf[i];
    if (lat < b[0][1] || lat > b[1][1]) continue;
    const inLng = b[0][0] <= b[1][0]
      ? lng >= b[0][0] && lng <= b[1][0]
      : lng >= b[0][0] || lng <= b[1][0];
    if (!inLng) continue;
    if (d3.geoContains(data.features[i] as never, ll)) return i;
  }
  return null;
}

/** Sparse outline samples used to measure edge-to-edge water gaps. */
export function boundarySamples(feature: { geometry: { type: string; coordinates: unknown } | null }): LngLat[] {
  const pts: LngLat[] = [];
  const eat = (ring: LngLat[]) => { for (let k = 0; k < ring.length; k += SAMPLE_STEP) pts.push(ring[k]); };
  const g = feature.geometry;
  if (!g) return pts;
  if (g.type === "Polygon") (g.coordinates as LngLat[][]).forEach(eat);
  else if (g.type === "MultiPolygon") (g.coordinates as LngLat[][][]).forEach((poly) => poly.forEach(eat));
  return pts;
}

/**
 * When the land frontier is exhausted, find the nearest unreached country across water.
 * Candidates are prefiltered by centroid distance, then refined edge-to-edge so a narrow
 * strait beats a large country whose centroid happens to be close.
 */
function nearestAcrossWater(data: GeoData, visited: Set<number>): number | null {
  if (visited.size === 0) return null;
  const filled = [...visited];
  const filledCentroids = filled.map((i) => data.centroidOf[i]);
  const cands: [number, number][] = [];
  for (let i = 0; i < data.features.length; i++) {
    if (visited.has(i)) continue;
    let dc = Infinity;
    for (const c of filledCentroids) { const d = d3.geoDistance(data.centroidOf[i], c); if (d < dc) dc = d; }
    cands.push([i, dc]);
  }
  cands.sort((a, b) => a[1] - b[1]);
  const short = cands.slice(0, 15).map((c) => c[0]);
  let blob: LngLat[] = [];
  for (const i of filled) blob.push(...data.samplesOf[i]);
  if (blob.length > 240) blob = blob.filter((_, k) => k % Math.ceil(blob.length / 240) === 0);
  let best: number | null = null, bestD = Infinity;
  for (const i of short) for (const p of data.samplesOf[i]) for (const q of blob) {
    const d = d3.geoDistance(p, q);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * Greedy nearest-first flood fill.
 *
 * Starting from the seed country, neighbours are consumed in order of centroid distance
 * to the seed, expanding the frontier by shared borders. When the frontier runs dry the
 * fill jumps the narrowest stretch of water and resumes. The country that would overshoot
 * the budget is included as a partial, so the total always lands exactly on the budget.
 *
 * Ordering is anchored to the seed centroid (not the exact pin position) so results are
 * deterministic per seed country and can be memoised by the renderer.
 *
 * The selected country itself is traversed but never counted, as are countries with no
 * data for the metric: geography stays connected, totals stay honest.
 */
function floodFill(data: GeoData, metric: MetricKey, seed: number, budget: number, exclude: number, maxItems: number) {
  const dropPt = data.centroidOf[seed];
  const items: FillItem[] = [];
  let total = 0;
  const frontier = new Set<number>([seed]);
  const seededViaWater = new Set<number>();
  const visited = new Set<number>();
  while (total < budget - 1e-6 && items.length < maxItems) {
    let next: number | null = null;
    if (frontier.size) {
      next = [...frontier].reduce((best: number | null, idx) =>
        best == null || d3.geoDistance(data.centroidOf[idx], dropPt) < d3.geoDistance(data.centroidOf[best], dropPt)
          ? idx : best, null);
      frontier.delete(next!);
    } else {
      next = nearestAcrossWater(data, visited);
      if (next == null) break;
      seededViaWater.add(next);
    }
    if (visited.has(next!)) continue;
    visited.add(next!);
    const a = metricValue(data, metric, next!);
    data.neighbors[next!].forEach((nb) => { if (!visited.has(nb)) frontier.add(nb); });
    if (next === exclude) continue;
    if (a == null || a <= 0) continue;
    const isWater = seededViaWater.has(next!);
    if (total + a > budget) {
      const frac = Math.max(0, (budget - total) / a);
      items.push({ idx: next!, area: a, frac, kind: "partial", water: isWater });
      total = budget;
      break;
    }
    items.push({ idx: next!, area: a, frac: 1, kind: isWater ? "water" : "land", water: isWater });
    total += a;
  }
  return { items, total, budget };
}

/** Full fill computation for a selection and a seed country (null seed = pin over ocean). */
export function computeFill(
  data: GeoData, metric: MetricKey, selIdx: number, seedIdx: number | null, maxItems: number = MAX_FILL,
): FillResult {
  const budget = metricValue(data, metric, selIdx);
  if (budget == null || budget <= 0) return { items: [], total: 0, budget, noData: true, selIdx };
  if (seedIdx == null) return { items: [], total: 0, budget, seededOnOcean: true, selIdx };
  return { ...floodFill(data, metric, seedIdx, budget, selIdx, maxItems), selIdx };
}
