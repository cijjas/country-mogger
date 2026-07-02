import { describe, expect, it } from "vitest";
import {
  organicCut, ringArea, shapeArea, shapeCentroid, shapeToPath, simplifyShape,
  type Shape, type ScreenRing,
} from "@/lib/geo/polygon";

const square = (x: number, y: number, size: number): ScreenRing => [
  [x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y],
];

describe("ringArea", () => {
  it("computes the signed shoelace area", () => {
    expect(Math.abs(ringArea(square(0, 0, 10)))).toBe(100);
  });
});

describe("shapeArea", () => {
  it("subtracts holes from outer rings", () => {
    const withHole: Shape = [[square(0, 0, 10), square(2, 2, 4)]];
    expect(shapeArea(withHole)).toBe(100 - 16);
  });

  it("sums disjoint polygons", () => {
    const two: Shape = [[square(0, 0, 10)], [square(20, 0, 5)]];
    expect(shapeArea(two)).toBe(125);
  });
});

describe("shapeCentroid", () => {
  it("returns the centroid of the largest ring", () => {
    const two: Shape = [[square(0, 0, 10)], [square(100, 100, 2)]];
    expect(shapeCentroid(two)).toEqual([5, 5]);
  });
});

describe("simplifyShape", () => {
  it("caps vertex count while keeping a closed ring", () => {
    const ring: ScreenRing = [];
    for (let i = 0; i < 400; i++) ring.push([Math.cos(i / 63.6) * 100, Math.sin(i / 63.6) * 100]);
    ring.push(ring[0]);
    const out = simplifyShape([[ring]], 50);
    expect(out[0][0].length).toBeLessThanOrEqual(52);
    expect(out[0][0][0]).toEqual(out[0][0][out[0][0].length - 1]);
  });
});

describe("shapeToPath", () => {
  it("emits one closed subpath per ring", () => {
    const d = shapeToPath([[square(0, 0, 10)], [square(20, 0, 5)]]);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/Z/g)).toHaveLength(2);
  });
});

describe("organicCut", () => {
  it("carves a piece whose area matches the requested fraction", () => {
    const shape: Shape = [[square(0, 0, 100)]];
    for (const frac of [0.25, 0.5, 0.75]) {
      const res = organicCut(shape, frac, [-50, 50], 7);
      expect(res).not.toBeNull();
      const cutArea = shapeArea(res!.cut);
      expect(cutArea).toBeGreaterThan(frac * 10000 * 0.95);
      expect(cutArea).toBeLessThan(frac * 10000 * 1.05);
      // cut + remainder must re-tile the original
      expect(cutArea + shapeArea(res!.remainder)).toBeCloseTo(10000, 0);
    }
  });

  it("keeps the cut on the side facing the seed", () => {
    const shape: Shape = [[square(0, 0, 100)]];
    const res = organicCut(shape, 0.3, [-50, 50], 1)!;
    // seeded from the left, so the carved piece hugs the left edge
    expect(shapeCentroid(res.cut)[0]).toBeLessThan(shapeCentroid(res.remainder)[0]);
  });
});
