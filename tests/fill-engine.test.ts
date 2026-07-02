import { describe, expect, it } from "vitest";
import { computeFill, countryAt } from "@/lib/geo/fill-engine";
import type { CountryFeature, GeoData, LngLat } from "@/lib/types";

/**
 * A synthetic 4-country world laid out in a chain along the equator:
 *
 *   index    0      1      2      3
 *   lng      0      1      2      3
 *   area km2 10     3      4      5
 *   borders  0-1, 1-2, 2-3
 *
 * With metric "area" the engine reads areaOf directly, so no METRIC_DATA rows
 * are needed and the fill logic can be tested in isolation.
 */
function syntheticWorld(): GeoData {
  const centroids: LngLat[] = [[0, 0], [1, 0], [2, 0], [3, 0]];
  const features = centroids.map((_, i) => ({
    type: "Feature",
    properties: { name: `Country ${i}` },
    geometry: { type: "Polygon", coordinates: [] },
    __i: i,
    __num: String(i).padStart(3, "0"),
  })) as unknown as CountryFeature[];
  return {
    features,
    geoms: [],
    neighbors: [[1], [0, 2], [1, 3], [2]],
    areaOf: [10, 3, 4, 5],
    centroidOf: centroids,
    samplesOf: centroids.map((c) => [c]),
    boundsOf: centroids.map((c) => [[c[0] - 0.4, -0.4], [c[0] + 0.4, 0.4]] as [LngLat, LngLat]),
    names: features.map((f) => f.properties.name),
    nums: features.map((f) => f.__num),
    topo: null,
  };
}

describe("computeFill", () => {
  it("fills nearest-first and finishes with an exact partial", () => {
    const world = syntheticWorld();
    // select country 0 (budget 10), seed the fill at country 1
    const r = computeFill(world, "area", 0, 1);
    expect(r.budget).toBe(10);
    expect(r.total).toBe(10);
    expect(r.items.map((d) => d.idx)).toEqual([1, 2, 3]);
    expect(r.items[0]).toMatchObject({ area: 3, frac: 1, kind: "land" });
    expect(r.items[1]).toMatchObject({ area: 4, frac: 1, kind: "land" });
    // 3 + 4 = 7 counted; country 3 (area 5) covers the remaining 3 -> frac 0.6
    expect(r.items[2].kind).toBe("partial");
    expect(r.items[2].frac).toBeCloseTo(0.6, 10);
  });

  it("never counts the selected country toward its own fill", () => {
    const world = syntheticWorld();
    // seeding inside the selection traverses it but does not count it
    const r = computeFill(world, "area", 0, 0);
    expect(r.items.map((d) => d.idx)).not.toContain(0);
    expect(r.total).toBe(10);
  });

  it("reports an ocean seed instead of computing", () => {
    const world = syntheticWorld();
    const r = computeFill(world, "area", 0, null);
    expect(r.seededOnOcean).toBe(true);
    expect(r.items).toHaveLength(0);
  });
});

describe("countryAt", () => {
  it("rejects points outside every bounding box without exact tests", () => {
    const world = syntheticWorld();
    expect(countryAt(world, [50, 50])).toBeNull();
  });
});
