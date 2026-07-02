import * as d3 from "d3";
import { feature as topoFeature, neighbors as topoNeighbors } from "topojson-client";
import { boundarySamples } from "@/lib/geo/fill-engine";
import type { CountryEntry, CountryFeature, GeoData, LngLat } from "@/lib/types";

const EARTH_RADIUS_KM = 6371;
const STERADIAN_TO_KM2 = EARTH_RADIUS_KM * EARTH_RADIUS_KM;

const LOCAL_URL = "/countries-50m.json";
const FALLBACK_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

/**
 * Fetch the world topology (self-hosted copy first, CDN as fallback) and precompute
 * everything the fill engine and renderer need. Throws when both sources fail.
 */
export async function loadWorld(): Promise<{ data: GeoData; countries: CountryEntry[] }> {
  let topo: { objects: { countries: { geometries: unknown[] } } };
  try {
    const res = await fetch(LOCAL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    topo = await res.json();
  } catch {
    topo = await fetch(FALLBACK_URL).then((r) => r.json());
  }

  const geo = topoFeature(topo as never, (topo as never as { objects: { countries: never } }).objects.countries) as never as { features: CountryFeature[] };
  const geoms = topo.objects.countries.geometries;
  const neighbors = topoNeighbors(geoms as never);
  const features = geo.features;

  const areaOf: number[] = [];
  const centroidOf: LngLat[] = [];
  const samplesOf: LngLat[][] = [];
  const boundsOf: [LngLat, LngLat][] = [];
  const names: string[] = [];
  const nums: string[] = [];

  features.forEach((f, i) => {
    f.__i = i;
    f.__num = String(f.id).padStart(3, "0");
    f.properties.name = f.properties.name || "#" + i;
    areaOf[i] = d3.geoArea(f as never) * STERADIAN_TO_KM2;
    centroidOf[i] = d3.geoCentroid(f as never) as LngLat;
    samplesOf[i] = boundarySamples(f as never);
    boundsOf[i] = d3.geoBounds(f as never) as [LngLat, LngLat];
    names[i] = f.properties.name;
    nums[i] = f.__num;
  });

  const data: GeoData = { features, geoms, neighbors, areaOf, centroidOf, samplesOf, boundsOf, names, nums, topo };
  const countries: CountryEntry[] = features
    .map((f) => ({ i: f.__i, name: f.properties.name, num: f.__num }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { data, countries };
}
