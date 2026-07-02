import * as d3 from "d3";
import polygonClipping from "polygon-clipping";

/**
 * Screen-space polygon math used for the "organic cut" that carves a partial country.
 * Everything here works on projected pixel coordinates, never on lng/lat.
 */

export type ScreenPoint = [number, number];
export type ScreenRing = ScreenPoint[];
export type ScreenPolygon = ScreenRing[];
/** MultiPolygon in screen space, the shape polygon-clipping operates on. */
export type Shape = ScreenPolygon[];

/** Signed ring area via the shoelace formula. */
export function ringArea(r: ScreenRing): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}

/** Absolute shape area: outer rings minus holes. */
export function shapeArea(shape: Shape): number {
  let s = 0;
  for (const poly of shape) {
    if (!poly.length) continue;
    s += Math.abs(ringArea(poly[0]));
    for (let i = 1; i < poly.length; i++) s -= Math.abs(ringArea(poly[i]));
  }
  return s;
}

export function shapeToPath(shape: Shape): string {
  let s = "";
  for (const poly of shape) for (const ring of poly) {
    if (ring.length < 2) continue;
    s += "M" + ring.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L") + "Z";
  }
  return s;
}

export function shapeBBox(shape: Shape) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of shape) for (const ring of poly) for (const p of ring) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Centroid of the largest outer ring; robust enough for label placement. */
export function shapeCentroid(shape: Shape): ScreenPoint {
  let best: ScreenRing | null = null, bestA = 0;
  for (const poly of shape) {
    if (!poly.length) continue;
    const a = Math.abs(ringArea(poly[0]));
    if (a > bestA) { bestA = a; best = poly[0]; }
  }
  if (!best) return [0, 0];
  let cx = 0, cy = 0, A = 0;
  for (let i = 0, j = best.length - 1; i < best.length; j = i++) {
    const f = best[j][0] * best[i][1] - best[i][0] * best[j][1];
    cx += (best[j][0] + best[i][0]) * f;
    cy += (best[j][1] + best[i][1]) * f;
    A += f;
  }
  A *= 0.5;
  if (Math.abs(A) < 1e-6) return best[0];
  return [cx / (6 * A), cy / (6 * A)];
}

/** Uniform vertex decimation; boolean ops get expensive on full-resolution coastlines. */
export function simplifyShape(shape: Shape, maxPts: number): Shape {
  return shape.map((poly) => poly.map((ring) => {
    if (ring.length <= maxPts) return ring;
    const step = Math.ceil(ring.length / maxPts);
    const out: ScreenRing = [];
    for (let i = 0; i < ring.length; i += step) out.push(ring[i]);
    out.push(ring[0]);
    return out;
  }).filter((r) => r.length >= 4)).filter((p) => p.length);
}

/** polygon-clipping can throw on degenerate input; treat failures as an empty shape. */
export function tryClip(fn: () => Shape | undefined): Shape {
  try { return fn() || []; } catch { return []; }
}

export function shapeUnion(a: Shape, b: Shape): Shape {
  return tryClip(() => polygonClipping.union(a as never, b as never) as Shape);
}

export function shapeIntersection(a: Shape, b: Shape): Shape {
  return tryClip(() => polygonClipping.intersection(a as never, b as never) as Shape);
}

export function shapeDifference(a: Shape, b: Shape): Shape {
  return tryClip(() => polygonClipping.difference(a as never, b as never) as Shape);
}

/**
 * Project a GeoJSON geometry into screen-space rings through d3's path machinery.
 * d3 cuts polygons at the 180 degree meridian, so countries that wrap the seam
 * (Russia, the USA via the Aleutians, Fiji) come out as clean separate rings instead
 * of a degenerate full-width band.
 */
export function projectedRings(geom: unknown, projection: d3.GeoProjection): ScreenRing[] {
  const rings: ScreenRing[] = [];
  let cur: ScreenRing = [];
  const ctx = {
    beginPath() {},
    moveTo(x: number, y: number) { cur = [[x, y]]; },
    lineTo(x: number, y: number) { cur.push([x, y]); },
    closePath() { if (cur.length) { cur.push([cur[0][0], cur[0][1]]); rings.push(cur); cur = []; } },
    arc() {},
  };
  (d3.geoPath(projection, ctx as never) as (g: unknown) => void)(geom);
  return rings.filter((r) => r.length >= 4);
}

/**
 * Carve an organic piece out of `shape` whose area is ~`frac` of the whole,
 * biased toward `seed` so the piece sits on the side facing the filled unit.
 *
 * A wavy cut line (stacked sines, seeded by `jitterSeed` so it is stable across
 * re-renders) sweeps the shape along the seed-to-centroid axis; its position is
 * binary-searched until the clipped area matches the target.
 */
export function organicCut(
  shape: Shape, frac: number, seed: ScreenPoint, jitterSeed: number,
): { cut: Shape; remainder: Shape } | null {
  const total = shapeArea(shape);
  if (total <= 0) return null;
  const cen = shapeCentroid(shape);
  let ux = cen[0] - seed[0], uy = cen[1] - seed[1];
  const ul = Math.hypot(ux, uy);
  if (ul < 1) { ux = 1; uy = 0; } else { ux /= ul; uy /= ul; }
  const vx = -uy, vy = ux;
  let sMin = Infinity, sMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const poly of shape) for (const ring of poly) for (const p of ring) {
    const dx = p[0] - seed[0], dy = p[1] - seed[1];
    const s = dx * ux + dy * uy, vv = dx * vx + dy * vy;
    if (s < sMin) sMin = s; if (s > sMax) sMax = s;
    if (vv < vMin) vMin = vv; if (vv > vMax) vMax = vv;
  }
  const vSpan = (vMax - vMin) || 1, sSpan = (sMax - sMin) || 1;
  const amp = 0.13 * sSpan;
  const pad = Math.max(vSpan, sSpan) * 0.5 + amp + 12;
  const noise = (t: number) =>
    Math.sin(t * 1.3 + jitterSeed * 1.7) * 0.6 +
    Math.sin(t * 2.9 + jitterSeed * 3.1) * 0.3 +
    Math.sin(t * 6.7 + jitterSeed * 0.7) * 0.18;
  const toScreen = (s: number, vv: number): ScreenPoint => [seed[0] + s * ux + vv * vx, seed[1] + s * uy + vv * vy];
  const region = (T: number): ScreenPolygon => {
    const ring: ScreenRing = [toScreen(sMin - pad, vMin - pad)];
    const N = 56;
    for (let i = 0; i <= N; i++) {
      const vv = (vMin - pad) + (vMax + pad - (vMin - pad)) * (i / N);
      ring.push(toScreen(T + amp * noise(vv * 6 / vSpan), vv));
    }
    ring.push(toScreen(sMin - pad, vMax + pad));
    ring.push(ring[0]);
    return [ring];
  };
  const target = frac * total;
  let lo = sMin - amp - 2, hi = sMax + amp + 2, cut: Shape = [];
  for (let it = 0; it < 18; it++) {
    const T = (lo + hi) / 2;
    const inter = shapeIntersection(shape, [region(T)]);
    if (shapeArea(inter) < target) lo = T; else hi = T;
    cut = inter;
  }
  if (shapeArea(cut) < 1) return { cut: [], remainder: shape };
  return { cut, remainder: shapeDifference(shape, cut) };
}
