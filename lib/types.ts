import type { Geometry } from "geojson";
import type { MetricKey } from "@/lib/metrics";

export type LngLat = [number, number];

/** A world-atlas country feature, augmented at load time with a stable index and ISO numeric code. */
export interface CountryFeature {
  type: "Feature";
  id?: string | number;
  properties: { name: string };
  geometry: Geometry;
  /** index into every parallel array in {@link GeoData} */
  __i: number;
  /** zero-padded ISO 3166-1 numeric code, the join key for METRIC_DATA and flags */
  __num: string;
}

/** Everything derived from the world topology once, at load time. */
export interface GeoData {
  features: CountryFeature[];
  /** raw TopoJSON geometries, kept for topojson.merge */
  geoms: unknown[];
  /** adjacency by shared border, from topojson.neighbors */
  neighbors: number[][];
  /** true area in km2 */
  areaOf: number[];
  centroidOf: LngLat[];
  /** sparse boundary samples, used for across-water distance */
  samplesOf: LngLat[][];
  /** geographic bounds, used as a fast prefilter for point-in-country tests */
  boundsOf: [LngLat, LngLat][];
  names: string[];
  nums: string[];
  topo: unknown;
}

export type Kind = "land" | "water" | "partial";

export interface FillItem {
  /** feature index of the contributing country */
  idx: number;
  /** the country's full metric value */
  area: number;
  /** fraction counted toward the budget (1 except for the final partial country) */
  frac: number;
  kind: Kind;
  /** reached via a water jump rather than a shared land border */
  water: boolean;
}

export interface FillResult {
  items: FillItem[];
  total: number;
  /** the selected country's metric value; null when it has no data */
  budget: number | null;
  noData?: boolean;
  seededOnOcean?: boolean;
  /** feature index of the selected country */
  selIdx: number;
}

export interface CountryEntry {
  i: number;
  name: string;
  num: string;
}

/** How the imperative D3 renderer reaches back into React state. */
export interface RendererCallbacks {
  onSelect: (i: number) => void;
  onResult: (r: FillResult | null) => void;
  getMetric: () => MetricKey;
  getSelected: () => number | null;
}

/** Imperative surface of the map renderer, owned by the React orchestrator. */
export interface MapRenderer {
  onSelected: (i: number, fly?: boolean) => void;
  clearVisuals: () => void;
  refresh: () => void;
  dropPinAt: (ll: LngLat) => void;
  flyTo: (i: number) => void;
  highlight: (i: number | null) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  destroy: () => void;
}
